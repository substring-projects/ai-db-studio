import test from 'node:test';
import assert from 'node:assert';
import { AIMessageChunk } from '@langchain/core/messages';
import { buildSystemPrompt, extractFencedMongo, extractFencedSql, runAgentTurn } from '../src/main/services/ai/agent.ts';
import { checkShellStrictReadOnly } from '../src/main/services/drivers/mongo/shell.ts';

const docs = { columns: ['_id', 'name'], rows: [[{ $oid: '5f1d7f0b2a8c4e3b9c1a2b3c' }, 'Asha']], rowCount: 1, executionTimeMs: 1 };
const call = (name, args) => new AIMessageChunk({ content: '', tool_calls: [{ name, args, id: `call-${JSON.stringify(args)}`, type: 'tool_call' }] });
const say = (text) => new AIMessageChunk({ content: text });

function harness(steps, overrides = {}) {
  const seen = [];
  const stream = async (messages) => {
    seen.push(messages);
    const step = steps.shift() ?? say('Done.');
    return (async function* () {
      yield step;
    })();
  };
  const calls = { readOnly: [], approved: [], reviews: 0, described: [] };
  const events = [];
  const deps = {
    model: { stream, bindTools: (tools) => ((calls.tools = tools.map((t) => t.name)), { stream }) },
    toolsSupported: true,
    onToolsUnsupported: () => {},
    signal: new AbortController().signal,
    emit: (e) => events.push(e),
    createId: () => `q${events.length}`,
    checkSafe: (text) => checkShellStrictReadOnly(text),
    runReadOnly: async (text) => (calls.readOnly.push(text), docs),
    runApproved: async (text) => (calls.approved.push(text), { columns: ['Affected Rows'], rows: [[1]], rowCount: 1, executionTimeMs: 1, isCommand: true }),
    requestReview: async () => (calls.reviews++, overrides.approve ?? false),
    wasCancelled: () => false,
    describeTable: async (name) => (calls.described.push(name), '{}'),
    ...overrides.deps,
  };
  const turn = {
    prompt: 'how many users?',
    history: [],
    summary: '',
    schemaContext: 'COLLECTION "users" (_id objectId, name string);',
    connectionName: 'Local Mongo',
    engineName: 'MongoDB',
    canQuery: true,
    autoRun: true,
    shareResults: false,
    queryLanguage: 'mongodb',
    ...overrides.turn,
  };
  return { deps, turn, calls, events, seen };
}

test('MongoDB turns get MongoDB tools and instructions; SQL turns are unchanged', async () => {
  const mongo = harness([say('Hi')]);
  await runAgentTurn(mongo.turn, mongo.deps);
  assert.deepEqual(mongo.calls.tools, ['run_mongodb', 'describe_collection']);
  const prompt = buildSystemPrompt(mongo.turn, true);
  assert.ok(prompt.includes('run_mongodb') && prompt.includes('ObjectId("…")') && prompt.includes('$where'));
  assert.ok(!prompt.includes('Write SQL for'));

  const sqlTurn = { ...mongo.turn, queryLanguage: undefined, engineName: 'PostgreSQL' };
  const sqlPrompt = buildSystemPrompt(sqlTurn, true);
  assert.ok(sqlPrompt.includes('run_sql') && sqlPrompt.includes('Write SQL for PostgreSQL'));
  assert.equal(buildSystemPrompt({ ...sqlTurn, queryLanguage: 'sql' }, true), sqlPrompt, 'explicit sql is the default');

  const sql = harness([say('Hi')], { turn: { queryLanguage: 'sql' } });
  await runAgentTurn(sql.turn, sql.deps);
  assert.deepEqual(sql.calls.tools, ['run_sql', 'describe_table']);
});

test('a MongoDB read runs automatically; a write waits for review', async () => {
  const read = harness([call('run_mongodb', { command: 'db.users.countDocuments({})' }), say('There is 1 user.')]);
  await runAgentTurn(read.turn, read.deps);
  assert.deepEqual(read.calls.readOnly, ['db.users.countDocuments({})']);
  assert.equal(read.calls.reviews, 0);

  const write = harness([call('run_mongodb', { command: 'db.users.deleteMany({})' }), say('Okay.')], { approve: false });
  await runAgentTurn(write.turn, write.deps);
  assert.equal(write.calls.reviews, 1);
  assert.deepEqual(write.calls.approved, []);
  assert.deepEqual(write.calls.readOnly, []);

  const unsafeRead = harness([call('run_mongodb', { command: 'db.users.find({ $where: "1" })' }), say('Okay.')], { approve: true });
  await runAgentTurn(unsafeRead.turn, unsafeRead.deps);
  assert.equal(unsafeRead.calls.reviews, 1, '$where needs a person');
  assert.deepEqual(unsafeRead.calls.readOnly, []);
});

test('describe_collection reads the collection definition', async () => {
  const h = harness([call('describe_collection', { collection: 'users' }), say('It has a name.')]);
  await runAgentTurn(h.turn, h.deps);
  assert.deepEqual(h.calls.described, ['users']);
});

test('models without tools send MongoDB commands in fenced blocks', async () => {
  assert.equal(extractFencedMongo('Run:\n```mongodb\ndb.users.find({}).limit(5)\n```'), 'db.users.find({}).limit(5)');
  assert.equal(extractFencedMongo('```js\ndb.users.countDocuments()\n```'), 'db.users.countDocuments()');
  assert.equal(extractFencedMongo('```sql\nSELECT 1\n```'), undefined);
  assert.equal(extractFencedMongo('Use db.users.find() to look'), undefined, 'prose is never run');
  assert.equal(extractFencedSql('```mongodb\ndb.users.find()\n```'), undefined, 'SQL extraction is unchanged');

  const h = harness([say('```mongodb\ndb.users.find({}).limit(2)\n```'), say('Two users.')], { deps: { toolsSupported: false } });
  await runAgentTurn(h.turn, h.deps);
  assert.deepEqual(h.calls.readOnly, ['db.users.find({}).limit(2)']);
});
