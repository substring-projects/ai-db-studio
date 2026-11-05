import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AIMessageChunk, HumanMessage, AIMessage } from '@langchain/core/messages';
import { SqlClassifier } from '../src/main/services/SqlClassifier.ts';
import { buildSystemPrompt, describeResult, extractFencedSql, MAX_QUERIES_PER_TURN, runAgentTurn } from '../src/main/services/ai/agent.ts';
import { ChatMemoryStore } from '../src/main/services/ai/memory.ts';

const rows = { columns: ['email'], rows: [['secret@example.com']], rowCount: 1, executionTimeMs: 1 };
const toolCall = (sql) =>
  new AIMessageChunk({ content: '', tool_calls: [{ name: 'run_sql', args: { sql }, id: `call-${sql}`, type: 'tool_call' }] });
const say = (text) => new AIMessageChunk({ content: text });

/** A model that plays back a script, one reply per step, and records what it was sent. */
function scriptedModel(steps) {
  const seen = [];
  const stream = async (messages) => {
    seen.push(messages);
    const step = steps.shift() ?? say('Done.');
    if (step instanceof Error) throw step;
    return (async function* () {
      yield step;
    })();
  };
  return { seen, model: { stream, bindTools: () => ({ stream }) } };
}

function harness(steps, overrides = {}) {
  const { seen, model } = scriptedModel(steps);
  const events = [];
  const calls = { readOnly: [], approved: [], reviews: 0 };
  const deps = {
    model,
    toolsSupported: true,
    onToolsUnsupported: () => {},
    signal: new AbortController().signal,
    emit: (e) => events.push(e),
    createId: () => `q${events.length}`,
    checkSafe: (sql) => SqlClassifier.checkStrictReadOnly(sql),
    runReadOnly: async (sql) => (calls.readOnly.push(sql), rows),
    runApproved: async (sql) => (calls.approved.push(sql), { columns: ['Affected Rows'], rows: [[1]], rowCount: 1, executionTimeMs: 1, isCommand: true }),
    requestReview: async () => (calls.reviews++, overrides.approve ?? false),
    wasCancelled: () => false,
    describeTable: async () => '{}',
    ...overrides.deps,
  };
  const turn = {
    prompt: 'hello',
    history: [],
    summary: '',
    schemaContext: 'TABLE "users" (id int)',
    connectionName: 'Shop',
    engineName: 'PostgreSQL',
    canQuery: true,
    autoRun: true,
    shareResults: false,
    ...overrides.turn,
  };
  return { deps, turn, events, calls, seen };
}

test('a safe read runs automatically, with no review', async () => {
  const h = harness([toolCall('SELECT * FROM users'), say('Here you go.')]);
  await runAgentTurn(h.turn, h.deps);
  assert.deepEqual(h.calls.readOnly, ['SELECT * FROM users']);
  assert.equal(h.calls.reviews, 0);
  assert.ok(h.events.some((e) => e.type === 'query-result'));
});

test('a write waits for review, and does not run when declined', async () => {
  const h = harness([toolCall('DELETE FROM users'), say('Understood.')], { approve: false });
  await runAgentTurn(h.turn, h.deps);
  assert.equal(h.calls.reviews, 1);
  assert.deepEqual(h.calls.approved, []);
  assert.deepEqual(h.calls.readOnly, []);
  assert.ok(h.events.some((e) => e.type === 'query-declined'));
  assert.ok(JSON.stringify(h.seen.at(-1)).includes('declined'), 'the model is told');
});

test('a write runs only after approval', async () => {
  const h = harness([toolCall('DELETE FROM users WHERE id = 1'), say('Removed.')], { approve: true });
  await runAgentTurn(h.turn, h.deps);
  assert.deepEqual(h.calls.approved, ['DELETE FROM users WHERE id = 1']);
  const types = h.events.map((e) => e.type);
  assert.ok(types.indexOf('query-approved') < types.indexOf('query-result'));
});

test('nothing the model sends can skip review', async () => {
  const attempts = [
    'SELECT 1; DROP TABLE users',
    'WITH d AS (DELETE FROM users RETURNING *) SELECT * FROM d',
    'SELECT 1 /*! ; DROP TABLE users */',
    'SELECT pg_terminate_backend(1)',
    'EXPLAIN ANALYZE DELETE FROM users',
    "SELECT nextval('s')",
  ];
  for (const sql of attempts) {
    const h = harness([toolCall(sql), say('ok')], { approve: false });
    await runAgentTurn(h.turn, h.deps);
    assert.equal(h.calls.reviews, 1, sql);
    assert.deepEqual(h.calls.readOnly, [], sql);
    assert.deepEqual(h.calls.approved, [], sql);
  }
});

test('with auto-run off even a read asks first, and still runs read-only', async () => {
  const h = harness([toolCall('SELECT 1'), say('ok')], { approve: true, turn: { autoRun: false } });
  await runAgentTurn(h.turn, h.deps);
  assert.equal(h.calls.reviews, 1);
  assert.deepEqual(h.calls.readOnly, ['SELECT 1']);
  assert.deepEqual(h.calls.approved, []);
});

test('rows reach the model only when sharing is on', async () => {
  for (const shareResults of [false, true]) {
    const h = harness([toolCall('SELECT email FROM users'), say('ok')], { turn: { shareResults } });
    await runAgentTurn(h.turn, h.deps);
    const sent = JSON.stringify(h.seen.at(-1));
    assert.equal(sent.includes('secret@example.com'), shareResults, `shareResults=${shareResults}`);
    assert.ok(sent.includes('email'), 'column names are always sent');
  }
});

test('rows never enter memory, even when sharing is on', async () => {
  const h = harness([toolCall('SELECT email FROM users'), say('It is the secret one.')], { turn: { shareResults: true } });
  const { memory } = await runAgentTurn(h.turn, h.deps);
  const stored = JSON.stringify(memory.map((m) => m.content));
  assert.ok(!stored.includes('secret@example.com'));
  assert.ok(stored.includes('SELECT email FROM users'), 'it remembers what ran');
  assert.ok(stored.includes('1 row'));
});

test('the same statement is not run twice in a turn, and queries are capped', async () => {
  const same = harness([toolCall('SELECT 1'), toolCall('SELECT 1'), say('ok')]);
  await runAgentTurn(same.turn, same.deps);
  assert.equal(same.calls.readOnly.length, 1);

  const many = Array.from({ length: 12 }, (_, i) => toolCall(`SELECT ${i}`));
  const capped = harness(many);
  await runAgentTurn(capped.turn, capped.deps);
  assert.equal(capped.calls.readOnly.length, MAX_QUERIES_PER_TURN);
});

test('a failed query goes back to the model so it can correct itself', async () => {
  const h = harness([toolCall('SELECT nope FROM users'), toolCall('SELECT id FROM users'), say('Fixed.')], {
    deps: {
      runReadOnly: async (sql) => {
        if (sql.includes('nope')) throw new Error('column "nope" does not exist');
        return rows;
      },
    },
  });
  await runAgentTurn(h.turn, h.deps);
  assert.ok(h.events.some((e) => e.type === 'query-error'));
  assert.ok(JSON.stringify(h.seen[1]).includes('does not exist'));
  assert.ok(h.events.some((e) => e.type === 'query-result'));
});

test('a model without tools falls back to fenced SQL, through the same checks', async () => {
  let unsupported = 0;
  const h = harness(
    [new Error('registry.ollama.ai/library/codellama does not support tools'), say('```sql\nDELETE FROM users\n```'), say('Okay, not deleting.')],
    { approve: false, deps: { onToolsUnsupported: () => unsupported++ } }
  );
  await runAgentTurn(h.turn, h.deps);
  assert.equal(unsupported, 1);
  assert.equal(h.calls.reviews, 1);
  assert.deepEqual(h.calls.approved, []);
});

test('without a connection nothing can run', async () => {
  const h = harness([say('```sql\nSELECT 1\n```')], { turn: { canQuery: false } });
  await runAgentTurn(h.turn, h.deps);
  assert.deepEqual(h.calls.readOnly, []);
  assert.ok(buildSystemPrompt(h.turn, false).includes('No database is connected'));
});

test('earlier turns and the summary reach the model', async () => {
  const h = harness([say('Yes.')], {
    turn: { history: [new HumanMessage('Show users'), new AIMessage('Done')], summary: 'The user cares about churn.' },
  });
  await runAgentTurn(h.turn, h.deps);
  const sent = JSON.stringify(h.seen[0]);
  assert.ok(sent.includes('Show users'));
  assert.ok(sent.includes('The user cares about churn.'));
});

test('only fenced blocks count as SQL, never prose', () => {
  assert.equal(extractFencedSql('You could select something; then look.'), undefined);
  assert.equal(extractFencedSql('```sql\nSELECT 1\n```'), 'SELECT 1');
  assert.equal(extractFencedSql('```\nSELECT 1\n```'), 'SELECT 1');
  assert.equal(extractFencedSql('```python\nSELECT = 1\n```'), undefined);
  assert.equal(extractFencedSql('```\nnot sql\n```'), undefined);
});

test('shared results are capped', () => {
  const big = { columns: ['a'], rows: Array.from({ length: 500 }, (_, i) => [`v${i}`]), rowCount: 500, executionTimeMs: 1 };
  const text = describeResult(big, true);
  assert.ok(text.includes('First 50 rows'));
  assert.ok(!text.includes('v50"'));
  assert.ok(!describeResult(big, false).includes('v0'));
});

const tempStore = () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'memory-')), 'ai-memory.json');
  return { file, store: new ChatMemoryStore(file) };
};

test('memory survives a restart and stays per conversation', async () => {
  const { file, store } = tempStore();
  store.appendTurn('a', 't1', [new HumanMessage('hi'), new AIMessage('hello')]);
  store.appendTurn('b', 't1', [new HumanMessage('other')]);
  const reopened = new ChatMemoryStore(file);
  assert.deepEqual(reopened.messages('a').map((m) => m.content), ['hi', 'hello']);
  assert.deepEqual(reopened.messages('b').map((m) => m.content), ['other']);
  assert.deepEqual((await reopened.history('a').getMessages()).map((m) => m.content), ['hi', 'hello']);
});

test('regenerate forgets that turn onward; clear forgets everything', () => {
  const { store } = tempStore();
  for (const id of ['t1', 't2', 't3']) store.appendTurn('a', id, [new HumanMessage(id)]);
  store.forgetFrom('a', 't2');
  assert.deepEqual(store.messages('a').map((m) => m.content), ['t1']);
  store.clear('a');
  assert.equal(store.has('a'), false);
});

test('long conversations are summarized, and a failed summary loses nothing', async () => {
  const { store } = tempStore();
  for (let i = 0; i < 12; i += 1) store.appendTurn('a', `t${i}`, [new HumanMessage(`question ${i} ${'x'.repeat(4000)}`)]);

  await assert.rejects(store.compact('a', async () => { throw new Error('model down'); }));
  assert.equal(store.messages('a').length, 12);

  let transcript = '';
  await store.compact('a', async (_, text) => ((transcript = text), 'They asked many questions.'));
  assert.equal(store.summary('a'), 'They asked many questions.');
  assert.equal(store.messages('a').length, 6);
  assert.ok(transcript.includes('question 0'));
  assert.ok(!transcript.includes('question 11'));
});
