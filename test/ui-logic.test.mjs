import test from 'node:test';
import assert from 'node:assert';
import { assessRisk, qualifiedName, quoteIdent, rowWhereClause, tokenizeSql } from '../src/renderer/lib/sql.ts';
import { compareCells, formatCell, inferColumnKind, matchesRule, toDelimited } from '../src/renderer/lib/grid.ts';
import { chooseChart, niceTicks } from '../src/renderer/lib/chart.ts';

test('identifiers are quoted for each dialect', () => {
  assert.equal(quoteIdent('POSTGRESQL', 'a"b'), '"a""b"');
  assert.equal(quoteIdent('MYSQL', 'a`b'), '`a``b`');
  assert.equal(qualifiedName('POSTGRESQL', 't', 'analytics'), '"analytics"."t"');
  assert.equal(qualifiedName('POSTGRESQL', 't', 'public'), '"t"');
  assert.equal(qualifiedName('MYSQL', 't', 'shop'), '`t`');
});

test('a row is addressed by its whole primary key', () => {
  const columns = [
    { name: 'order_id', typeName: 'int', primaryKey: true, nullable: false },
    { name: 'product_id', typeName: 'int', primaryKey: true, nullable: false },
    { name: 'qty', typeName: 'int', primaryKey: false, nullable: false },
  ];
  const { where, byPrimaryKey } = rowWhereClause('POSTGRESQL', ['order_id', 'product_id', 'qty'], [1, 2, 3], columns);
  assert.equal(where, 'WHERE "order_id" = 1 AND "product_id" = 2');
  assert.equal(byPrimaryKey, true);
});

test('without a primary key every value is matched, not just the first few', () => {
  const names = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  const { where, byPrimaryKey } = rowWhereClause('MYSQL', names, [1, null, "it's", 4, 5, 6, 7], []);
  assert.equal(byPrimaryKey, false);
  assert.ok(where.includes('`b` IS NULL'));
  assert.ok(where.includes("`c` = 'it''s'"));
  assert.ok(where.includes('`g` = 7'));
});

test('risky statements are explained; text inside strings is ignored', () => {
  assert.equal(assessRisk('DELETE FROM t').high, true);
  assert.equal(assessRisk('DELETE FROM t WHERE id = 1').high, false);
  assert.equal(assessRisk('UPDATE t SET a = 1').high, true);
  assert.equal(assessRisk('TRUNCATE TABLE t').high, true);
  assert.equal(assessRisk('DROP TABLE t').high, true);
  assert.equal(assessRisk("INSERT INTO t VALUES ('DROP TABLE x;')").high, false);
});

test('cells render driver values as text', () => {
  assert.equal(formatCell(null), 'NULL');
  assert.equal(formatCell({ a: 1 }), '{"a":1}');
  assert.equal(formatCell(new Uint8Array([1, 255])), '0x01ff');
  assert.equal(inferColumnKind([['12.5']], 0), 'number');
  assert.equal(inferColumnKind([[null], ['2026-01-02']], 0), 'date');
});

test('sorting puts NULLs last and compares numbers as numbers', () => {
  assert.deepEqual(['10', null, '9'].sort(compareCells), ['9', '10', null]);
});

test('client filters follow the server operators', () => {
  assert.equal(matchesRule('Hello', { column: 'a', operator: 'CONTAINS', value: 'ell' }), true);
  assert.equal(matchesRule(null, { column: 'a', operator: 'IS_NULL', value: '' }), true);
  assert.equal(matchesRule(null, { column: 'a', operator: 'CONTAINS', value: 'x' }), false);
  assert.equal(matchesRule('10', { column: 'a', operator: 'GREATER_THAN', value: '9' }), true);
});

test('delimited output quotes only when needed and leaves NULL empty', () => {
  assert.equal(toDelimited(['a', 'b'], [['x,y', null], ['p"q', 1]]), 'a,b\n"x,y",\n"p""q",1');
});

test('the tokenizer keeps every character', () => {
  const sql = "SELECT COUNT(*) FROM \"t\" WHERE a = 'x' -- note\n";
  assert.equal(tokenizeSql(sql).map((t) => t.text).join(''), sql);
  assert.ok(tokenizeSql(sql).some((t) => t.kind === 'function' && t.text === 'COUNT'));
});

const result = (columns, rows) => ({ columns, rows, rowCount: rows.length, executionTimeMs: 1 });

test('charts match the shape of the data, or step aside', () => {
  assert.equal(chooseChart(result(['total'], [[300]])).form, 'stat');
  assert.equal(chooseChart(result(['status', 'n'], [['a', 1], ['b', 2]])).form, 'bar');
  assert.equal(chooseChart(result(['day', 'n'], [['2026-01-01', 1], ['2026-01-02', 2], ['2026-01-03', 3]])).form, 'line');
  assert.equal(chooseChart(result(['name', 'email'], [['a', 'b']])), null);
  assert.equal(chooseChart(result(['id', 'name'], [[1, 'a'], [2, 'b']])), null, 'ids are not measures');
  assert.equal(chooseChart(result(['status', 'n'], [['a', 1], ['a', 2]])), null, 'duplicate labels');
});

test('series too small for one shared axis stay out of the chart', () => {
  const spec = chooseChart(result(['k', 'big', 'small'], [['a', 100000, 1], ['b', 200000, 2]]));
  assert.deepEqual(spec.series.map((s) => s.name), ['big']);
});

test('axis ticks are round and include zero', () => {
  assert.deepEqual(niceTicks(0, 8000), [0, 2000, 4000, 6000, 8000]);
  assert.ok(niceTicks(-5, 5).includes(0));
});
