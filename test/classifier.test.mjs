import test from 'node:test';
import assert from 'node:assert';

// Inline classifier logic identical to SqlClassifier.ts for standalone verification
function classify(sql) {
  const trimmed = sql.trim();
  if (!trimmed) {
    return { isReadOnly: true, kind: 'OTHER', statementCount: 0 };
  }

  const stripped = trimmed
    .replace(/--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .trim();

  const statements = stripped
    .split(/;(?=(?:[^'"]*['"][^'"]*['"])*[^'"]*$)/)
    .map(s => s.trim())
    .filter(Boolean);

  const statementCount = statements.length;
  const firstStatement = statements[0] || stripped;
  const firstWordMatch = firstStatement.match(/^[a-zA-Z]+/);
  const firstWord = firstWordMatch ? firstWordMatch[0].toUpperCase() : '';

  if (firstWord === 'SELECT' || firstWord === 'SHOW' || firstWord === 'DESCRIBE' || firstWord === 'EXPLAIN') {
    return { isReadOnly: true, kind: 'SELECT', statementCount };
  }

  if (firstWord === 'WITH') {
    const hasMutation = /\b(INSERT|UPDATE|DELETE)\b/i.test(firstStatement);
    return {
      isReadOnly: !hasMutation,
      kind: hasMutation ? 'UPDATE' : 'SELECT',
      statementCount
    };
  }

  if (firstWord === 'INSERT') return { isReadOnly: false, kind: 'INSERT', statementCount };
  if (firstWord === 'UPDATE') return { isReadOnly: false, kind: 'UPDATE', statementCount };
  if (firstWord === 'DELETE') return { isReadOnly: false, kind: 'DELETE', statementCount };

  if (['CREATE', 'ALTER', 'DROP', 'TRUNCATE', 'RENAME'].includes(firstWord)) {
    return { isReadOnly: false, kind: 'DDL', statementCount };
  }

  return { isReadOnly: false, kind: 'OTHER', statementCount };
}

test('classifies SELECT statements as read-only', () => {
  const c = classify('SELECT * FROM users WHERE active = true;');
  assert.strictEqual(c.isReadOnly, true);
  assert.strictEqual(c.kind, 'SELECT');
  assert.strictEqual(c.statementCount, 1);
});

test('classifies EXPLAIN and SHOW statements as read-only', () => {
  const c1 = classify('EXPLAIN SELECT 1;');
  assert.strictEqual(c1.isReadOnly, true);
  const c2 = classify('SHOW TABLES;');
  assert.strictEqual(c2.isReadOnly, true);
});

test('classifies INSERT, UPDATE, DELETE as mutations requiring human approval', () => {
  const c1 = classify("INSERT INTO users (name) VALUES ('alice');");
  assert.strictEqual(c1.isReadOnly, false);
  assert.strictEqual(c1.kind, 'INSERT');

  const c2 = classify("UPDATE users SET name = 'bob' WHERE id = 1;");
  assert.strictEqual(c2.isReadOnly, false);
  assert.strictEqual(c2.kind, 'UPDATE');

  const c3 = classify('DELETE FROM users WHERE id = 1;');
  assert.strictEqual(c3.isReadOnly, false);
  assert.strictEqual(c3.kind, 'DELETE');
});

test('classifies DDL statements as mutations', () => {
  const c1 = classify('CREATE TABLE test (id INT);');
  assert.strictEqual(c1.isReadOnly, false);
  assert.strictEqual(c1.kind, 'DDL');

  const c2 = classify('DROP TABLE test;');
  assert.strictEqual(c2.isReadOnly, false);
  assert.strictEqual(c2.kind, 'DDL');
});

test('detects WITH mutation CTEs correctly', () => {
  const c1 = classify('WITH active AS (SELECT * FROM users) SELECT * FROM active;');
  assert.strictEqual(c1.isReadOnly, true);

  const c2 = classify('WITH deleted AS (DELETE FROM users RETURNING *) SELECT * FROM deleted;');
  assert.strictEqual(c2.isReadOnly, false);
});
