import test from 'node:test';
import assert from 'node:assert';
import { SqlClassifier } from '../src/main/services/SqlClassifier.ts';

const readOnly = (sql) => SqlClassifier.classify(sql).isReadOnly;
const allowedForAi = (sql) => SqlClassifier.checkStrictReadOnly(sql).ok;

test('a script is read-only only if every statement is', () => {
  assert.equal(readOnly('SELECT 1;'), true);
  assert.equal(readOnly('SELECT 1; SELECT 2;'), true);
  assert.equal(readOnly('SELECT 1; DROP TABLE users;'), false);
  assert.equal(SqlClassifier.classify('SELECT 1; DROP TABLE users;').kind, 'DDL');
});

test('EXPLAIN ANALYZE is as safe as the statement it runs', () => {
  assert.equal(readOnly('EXPLAIN SELECT 1'), true);
  assert.equal(readOnly('EXPLAIN DELETE FROM users'), true);
  assert.equal(readOnly('EXPLAIN ANALYZE SELECT 1'), true);
  assert.equal(readOnly('EXPLAIN ANALYZE DELETE FROM users'), false);
  assert.equal(readOnly('EXPLAIN (ANALYZE, BUFFERS) DELETE FROM users'), false);
});

test('SELECT INTO and data-modifying CTEs need approval', () => {
  assert.equal(readOnly('SELECT * INTO backup FROM users'), false);
  assert.equal(readOnly('WITH gone AS (DELETE FROM users RETURNING id) SELECT * FROM gone'), false);
  assert.equal(readOnly('WITH a AS (SELECT 1) SELECT * FROM a'), true);
});

test('text inside strings and comments cannot change the verdict', () => {
  assert.equal(readOnly("SELECT 'a; DROP TABLE users' AS note"), true);
  assert.equal(readOnly('SELECT 1 -- ; DROP TABLE users'), true);
  assert.equal(readOnly('/* SELECT */ DROP TABLE users'), false);
  assert.equal(readOnly("SELECT $tag$; DROP TABLE users;$tag$"), true);
  assert.equal(SqlClassifier.classify("SELECT 'it''s; fine'; SELECT 2").statementCount, 2);
});

test('MySQL executable comments count as code', () => {
  assert.equal(readOnly('SELECT 1 /*! ; DROP TABLE users */'), false);
  assert.equal(allowedForAi('SELECT 1 /*! INTO OUTFILE "/tmp/x" */'), false);
});

test('the AI gate allows single read statements', () => {
  for (const sql of [
    'SELECT * FROM users',
    'WITH a AS (SELECT 1) SELECT * FROM a;',
    'SHOW TABLES',
    'DESCRIBE users',
    'EXPLAIN SELECT 1',
    'SELECT updated_at, created_by FROM users',
    "SELECT 'please delete this' AS note",
    'SELECT REPLACE(name, 1, 2) FROM users',
  ]) {
    assert.equal(allowedForAi(sql), true, sql);
  }
});

test('the AI gate refuses writes, scripts and side effects', () => {
  for (const sql of [
    '',
    'DELETE FROM users',
    'DROP TABLE users',
    'UPDATE users SET a = 1',
    'INSERT INTO users VALUES (1)',
    'SELECT 1; SELECT 2',
    'SELECT 1; DROP TABLE users',
    'SELECT * INTO copy FROM users',
    'SELECT * FROM users INTO OUTFILE "/tmp/x"',
    'WITH a AS (DELETE FROM users RETURNING *) SELECT * FROM a',
    'EXPLAIN ANALYZE DELETE FROM users',
    'SELECT * FROM users FOR UPDATE',
    'SELECT pg_terminate_backend(1)',
    'SELECT pg_sleep(100)',
    "SELECT nextval('users_id_seq')",
    "SELECT set_config('a.b', '1', false)",
    "SELECT load_file('/etc/passwd')",
    'SELECT SLEEP(100)',
    'CALL do_something()',
    'SET search_path = evil',
  ]) {
    assert.equal(allowedForAi(sql), false, sql);
  }
});
