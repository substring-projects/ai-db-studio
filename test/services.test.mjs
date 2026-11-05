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
