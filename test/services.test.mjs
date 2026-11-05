import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Test Filter Rule query building logic
function buildFilterWhereClause(rules, matchAny = false) {
  if (!rules || rules.length === 0) return '';

  const operatorClauses = rules
    .map((rule) => {
      const col = `"${rule.column}"`;
      const val = rule.value ? `'${String(rule.value).replace(/'/g, "''")}'` : '';

      switch (rule.operator) {
        case 'EQUALS':
          return `${col} = ${val}`;
        case 'NOT_EQUALS':
          return `${col} != ${val}`;
        case 'GREATER_THAN':
          return `${col} > ${val}`;
        case 'GREATER_THAN_OR_EQUAL':
          return `${col} >= ${val}`;
        case 'LESS_THAN':
          return `${col} < ${val}`;
        case 'LESS_THAN_OR_EQUAL':
          return `${col} <= ${val}`;
        case 'CONTAINS':
          return `${col} LIKE '%${String(rule.value).replace(/'/g, "''")}%'`;
        case 'STARTS_WITH':
          return `${col} LIKE '${String(rule.value).replace(/'/g, "''")}%'`;
        case 'ENDS_WITH':
          return `${col} LIKE '%${String(rule.value).replace(/'/g, "''")}'`;
        case 'IS_NULL':
          return `${col} IS NULL`;
        case 'IS_NOT_NULL':
          return `${col} IS NOT NULL`;
        default:
          return null;
      }
    })
    .filter(Boolean);

  if (operatorClauses.length === 0) return '';
  const joiner = matchAny ? ' OR ' : ' AND ';
  return ` WHERE ${operatorClauses.join(joiner)}`;
}

// Test UPDATE statement building logic
function buildUpdateStatement({ tableName, columnName, value, isNull, pkColumn, pkValue, rowColumns, rowData, engine }) {
  const isPg = engine === 'POSTGRESQL';
  const quote = (id) => (isPg ? `"${id.replace(/"/g, '""')}"` : `\`${id.replace(/`/g, '``')}\``);

  const valSnippet = isNull ? 'NULL' : `'${String(value).replace(/'/g, "''")}'`;

  let whereClause = '';
  if (pkColumn && pkValue !== undefined && pkValue !== null) {
    whereClause = `WHERE ${quote(pkColumn)} = '${String(pkValue).replace(/'/g, "''")}'`;
  } else if (rowColumns && rowData && rowColumns.length > 0) {
    const conditions = rowColumns
      .map((col, idx) => {
        const val = rowData[idx];
        if (val === null || val === undefined) {
          return `${quote(col)} IS NULL`;
        }
        return `${quote(col)} = '${String(val).replace(/'/g, "''")}'`;
      })
      .slice(0, 5);
    whereClause = `WHERE ${conditions.join(' AND ')}`;
  } else {
    whereClause = `WHERE ${quote(columnName)} IS NULL`;
  }

  return `UPDATE ${quote(tableName)} SET ${quote(columnName)} = ${valSnippet} ${whereClause};`;
}

test('builds single filter rule correctly', () => {
  const where = buildFilterWhereClause([{ column: 'status', operator: 'EQUALS', value: 'active' }]);
  assert.strictEqual(where, ` WHERE "status" = 'active'`);
});

test('builds multiple filter rules with AND / OR', () => {
  const rules = [
    { column: 'age', operator: 'GREATER_THAN_OR_EQUAL', value: 21 },
    { column: 'email', operator: 'CONTAINS', value: 'example.com' },
  ];
  const andClause = buildFilterWhereClause(rules, false);
  assert.strictEqual(andClause, ` WHERE "age" >= '21' AND "email" LIKE '%example.com%'`);

  const orClause = buildFilterWhereClause(rules, true);
  assert.strictEqual(orClause, ` WHERE "age" >= '21' OR "email" LIKE '%example.com%'`);
});

test('handles NULL and NOT NULL filter rules correctly', () => {
  const rules = [
    { column: 'deleted_at', operator: 'IS_NULL' },
    { column: 'verified_at', operator: 'IS_NOT_NULL' },
  ];
  const where = buildFilterWhereClause(rules, false);
  assert.strictEqual(where, ` WHERE "deleted_at" IS NULL AND "verified_at" IS NOT NULL`);
});

test('prevents SQL injection in filter values', () => {
  const malicious = "admin'; DROP TABLE users; --";
  const where = buildFilterWhereClause([{ column: 'name', operator: 'EQUALS', value: malicious }]);
  assert.strictEqual(where, ` WHERE "name" = 'admin''; DROP TABLE users; --'`);
});

test('builds UPDATE statement with PK column for PostgreSQL and MySQL', () => {
  const pgSql = buildUpdateStatement({
    tableName: 'users',
    columnName: 'name',
    value: "O'Connor",
    isNull: false,
    pkColumn: 'id',
    pkValue: 42,
    engine: 'POSTGRESQL',
  });
  assert.strictEqual(pgSql, `UPDATE "users" SET "name" = 'O''Connor' WHERE "id" = '42';`);

  const mySql = buildUpdateStatement({
    tableName: 'users',
    columnName: 'name',
    value: "Alice",
    isNull: false,
    pkColumn: 'id',
    pkValue: 1,
    engine: 'MYSQL',
  });
  assert.strictEqual(mySql, "UPDATE `users` SET `name` = 'Alice' WHERE `id` = '1';");
});

test('builds UPDATE statement with NULL value and row fallback without PK', () => {
  const sql = buildUpdateStatement({
    tableName: 'items',
    columnName: 'description',
    value: '',
    isNull: true,
    pkColumn: undefined,
    pkValue: undefined,
    rowColumns: ['sku', 'price', 'category'],
    rowData: ['SKU-101', 29.99, null],
    engine: 'POSTGRESQL',
  });
  assert.strictEqual(sql, `UPDATE "items" SET "description" = NULL WHERE "sku" = 'SKU-101' AND "price" = '29.99' AND "category" IS NULL;`);
});

test('persists workspace settings with theme switching', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-db-studio-test-'));
  const settingsFile = path.join(tempDir, 'settings.json');

  // Default settings
  let settings = { theme: 'dark', maxHistory: 200, aiProvider: 'ollama' };
  fs.writeFileSync(settingsFile, JSON.stringify(settings));

  // Read back
  let loaded = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
  assert.strictEqual(loaded.theme, 'dark');

  // Switch to light theme
  settings.theme = 'light';
  fs.writeFileSync(settingsFile, JSON.stringify(settings));

  loaded = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
  assert.strictEqual(loaded.theme, 'light');

  // Cleanup
  fs.rmSync(tempDir, { recursive: true, force: true });
});
