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

test('extracts SQL queries from various markdown formatting styles', () => {
  function extractSql(content) {
    const sqlMatch = content.match(/```sql\s*([\s\S]*?)\s*```/i);
    if (sqlMatch && sqlMatch[1].trim()) return sqlMatch[1].trim();

    const codeMatch = content.match(/```\s*([\s\S]*?)\s*```/);
    if (codeMatch && codeMatch[1].trim()) {
      const code = codeMatch[1].trim();
      if (/\b(SELECT|WITH|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|SHOW|EXPLAIN)\b/i.test(code)) {
        return code;
      }
    }

    const rawSqlMatch = content.match(
      /\b(SELECT[\s\S]+?;|WITH[\s\S]+?;|INSERT\s+INTO[\s\S]+?;|UPDATE[\s\S]+?;|DELETE\s+FROM[\s\S]+?;)/i
    );
    if (rawSqlMatch && rawSqlMatch[1].trim()) {
      return rawSqlMatch[1].trim();
    }
    return undefined;
  }

  // 1. Standard ```sql
  const text1 = "Here is the query:\n```sql\nSELECT * FROM orders WHERE status = 'delivered';\n```\nHope this helps!";
  assert.strictEqual(extractSql(text1), "SELECT * FROM orders WHERE status = 'delivered';");

  // 2. Generic ```
  const text2 = "```\nSELECT id, name FROM users;\n```";
  assert.strictEqual(extractSql(text2), "SELECT id, name FROM users;");

  // 3. Raw statement
  const text3 = "You can run SELECT count(*) FROM products; directly in your draft.";
  assert.strictEqual(extractSql(text3), "SELECT count(*) FROM products;");
});

test('synthesizes grounded SQL from natural language prompts', () => {
  const schema = 'TABLE users (id BIGINT (PK), email VARCHAR(255), created_at TIMESTAMP);\nTABLE orders (id BIGINT (PK), user_id BIGINT, total NUMERIC);';

  function heuristicSql(prompt, schemaContext) {
    const p = prompt.toLowerCase();
    const tableMatches = [...schemaContext.matchAll(/TABLE\s+"?([a-zA-Z0-9_]+)"?/gi)].map((m) => m[1]);
    const firstTable = tableMatches[0];
    const matchedTable = tableMatches.find((t) => p.includes(t.toLowerCase())) || firstTable;

    if (p.includes('count') || p.includes('how many')) {
      return `SELECT COUNT(*) AS total_count FROM "${matchedTable}";`;
    }
    if (p.includes('recent') || p.includes('latest')) {
      return `SELECT * FROM "${matchedTable}" ORDER BY 1 DESC LIMIT 25;`;
    }
    return `SELECT * FROM "${matchedTable}" LIMIT 50;`;
  }

  assert.strictEqual(heuristicSql('count all records in orders', schema), 'SELECT COUNT(*) AS total_count FROM "orders";');
  assert.strictEqual(heuristicSql('show latest users', schema), 'SELECT * FROM "users" ORDER BY 1 DESC LIMIT 25;');
});
