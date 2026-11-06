import type { DbTable, Engine, TableColumn } from '../../shared/types';

export function quoteIdent(engine: Engine | undefined, name: string): string {
  return engine === 'MYSQL' ? `\`${name.replace(/`/g, '``')}\`` : `"${name.replace(/"/g, '""')}"`;
}

/** Schema-qualifies PostgreSQL names. MySQL connections are already scoped to one database. */
export function qualifiedName(engine: Engine | undefined, table: string, schema?: string): string {
  const quoted = quoteIdent(engine, table);
  return engine !== 'MYSQL' && schema && schema !== 'public' ? `${quoteIdent(engine, schema)}.${quoted}` : quoted;
}

/** Key of a table in the column map returned by getAllColumns. */
export function columnKey(table: string, schema?: string): string {
  return schema && schema !== 'public' ? `${schema}.${table}` : table;
}

export function engineLabel(engine: Engine | undefined): string {
  return engine === 'MYSQL' ? 'MySQL' : 'PostgreSQL';
}

/**
 * Tries to extract the primary source table from a query.
 * For example:
 *   "SELECT * FROM users" -> { table: "users" }
 *   "SELECT id, name FROM public.users WHERE active = true" -> { table: "users", schema: "public" }
 */
export function extractTableNameFromSql(sql: string): { table: string; schema?: string } | null {
  if (!sql) return null;
  // Match FROM clause with optional schema qualification and quotes
  const match = sql.match(/\bFROM\s+([`"'\w]+(?:\.[`"'\w]+)?)(?:\s+(?:AS\s+)?([`"'\w]+))?(?:[\s;,\)]|$)/i);
  if (!match || !match[1]) return null;
  const raw = match[1].replace(/[`"']/g, '').trim();
  if (!raw || raw.startsWith('(')) return null;
  if (raw.includes('.')) {
    const parts = raw.split('.');
    return { schema: parts[0], table: parts[1] };
  }
  return { table: raw };
}

export function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  const text = value instanceof Date ? value.toISOString() : typeof value === 'object' ? JSON.stringify(value) : String(value);
  return `'${text.replace(/'/g, "''")}'`;
}

/**
 * Builds a WHERE clause addressing one row: every primary key column when the table has
 * them, otherwise all of its values. Using part of a key could change other rows too.
 */
export function rowWhereClause(
  engine: Engine | undefined,
  resultColumns: string[],
  row: unknown[],
  tableColumns: TableColumn[]
): { where: string; byPrimaryKey: boolean } {
  const find = (name: string) => resultColumns.findIndex((c) => c.toLowerCase() === name.toLowerCase());
  const condition = (name: string, value: unknown) =>
    value === null || value === undefined
      ? `${quoteIdent(engine, name)} IS NULL`
      : `${quoteIdent(engine, name)} = ${sqlLiteral(value)}`;

  const pkColumns = tableColumns.filter((c) => c.primaryKey);
  if (pkColumns.length > 0 && pkColumns.every((c) => find(c.name) >= 0)) {
    return {
      where: `WHERE ${pkColumns.map((c) => condition(c.name, row[find(c.name)])).join(' AND ')}`,
      byPrimaryKey: true,
    };
  }
  return {
    where: `WHERE ${resultColumns.map((name, i) => condition(name, row[i])).join(' AND ')}`,
    byPrimaryKey: false,
  };
}

/** Removes comments and string contents, leaving only code that keyword checks can trust. */
function codeOnly(sql: string): string {
  return sql
    .replace(/'(?:[^'\\]|\\.|'')*'/g, "''")
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');
}

export interface SqlRisk {
  /** Hard or impossible to undo, and easy to do by accident. */
  high: boolean;
  reasons: string[];
}

/** Explains why a statement deserves extra care. The backend still enforces approval. */
export function assessRisk(sql: string): SqlRisk {
  const reasons: string[] = [];
  for (const statement of codeOnly(sql).split(';')) {
    const code = statement.trim();
    if (!code) continue;
    if (/^DROP\s+(TABLE|DATABASE|SCHEMA)\b/i.test(code)) reasons.push('Permanently removes the object and its data.');
    else if (/^DROP\b/i.test(code)) reasons.push('Permanently removes this object.');
    if (/^TRUNCATE\b/i.test(code)) reasons.push('Removes every row in the table.');
    if (/^DELETE\b/i.test(code) && !/\bWHERE\b/i.test(code)) reasons.push('DELETE has no WHERE clause: every row will be removed.');
    if (/^UPDATE\b/i.test(code) && !/\bWHERE\b/i.test(code)) reasons.push('UPDATE has no WHERE clause: every row will be changed.');
    if (/^ALTER\b[\s\S]*\bDROP\b/i.test(code)) reasons.push('Removes part of the table definition.');
  }
  return { high: reasons.length > 0, reasons: [...new Set(reasons)] };
}

const KEYWORDS = new Set(
  `SELECT FROM WHERE AND OR NOT IN IS NULL AS ON JOIN LEFT RIGHT INNER OUTER FULL CROSS GROUP BY ORDER HAVING LIMIT OFFSET
  DISTINCT CASE WHEN THEN ELSE END UNION ALL INSERT INTO VALUES UPDATE SET DELETE CREATE TABLE VIEW INDEX DROP ALTER ADD
  COLUMN PRIMARY FOREIGN KEY REFERENCES WITH RECURSIVE ASC DESC LIKE ILIKE BETWEEN EXISTS TRUE FALSE TRUNCATE EXPLAIN
  ANALYZE SHOW DESCRIBE DEFAULT CONSTRAINT UNIQUE CHECK USING OVER PARTITION WINDOW RETURNING CAST FILTER NULLS FIRST LAST
  INTERVAL DATE TIMESTAMP`
    .split(/\s+/)
    .filter(Boolean)
);

export type SqlTokenKind = 'keyword' | 'string' | 'number' | 'comment' | 'function' | 'operator' | 'plain';

/** Lightweight tokenizer for read-only SQL snippets, which do not justify a Monaco instance. */
export function tokenizeSql(sql: string): { kind: SqlTokenKind; text: string }[] {
  const pattern =
    /(--[^\n]*|\/\*[\s\S]*?\*\/)|('(?:[^'\\]|\\.|'')*')|("(?:[^"]|"")*"|`(?:[^`]|``)*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z0-9_$]*)|([=<>!+\-*/%|]+)/g;
  const tokens: { kind: SqlTokenKind; text: string }[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(sql)) !== null) {
    if (match.index > last) tokens.push({ kind: 'plain', text: sql.slice(last, match.index) });
    const [text, comment, string, quoted, number, word, operator] = match;
    let kind: SqlTokenKind = 'plain';
    if (comment) kind = 'comment';
    else if (string) kind = 'string';
    else if (quoted) kind = 'plain';
    else if (number) kind = 'number';
    else if (operator) kind = 'operator';
    else if (word) {
      if (KEYWORDS.has(word.toUpperCase())) kind = 'keyword';
      else if (/^\s*\(/.test(sql.slice(pattern.lastIndex))) kind = 'function';
    }
    tokens.push({ kind, text });
    last = pattern.lastIndex;
  }
  if (last < sql.length) tokens.push({ kind: 'plain', text: sql.slice(last) });
  return tokens;
}

export async function formatSql(sql: string, engine: Engine | undefined): Promise<string> {
  const { format } = await import('sql-formatter');
  return format(sql, {
    language: engine === 'MYSQL' ? 'mysql' : 'postgresql',
    keywordCase: 'upper',
    tabWidth: 2,
  });
}

/** Schema description sent to the AI model: names and types only, never row data. */
export function buildSchemaContext(
  engine: Engine | undefined,
  tables: DbTable[],
  columns: Record<string, TableColumn[]>
): string {
  if (tables.length === 0) return '';
  const lines = tables.map((t) => {
    const cols = columns[columnKey(t.name, t.schema)] || [];
    const defs =
      cols.length > 0
        ? cols
            .map((c) => `${c.name} ${c.typeName}${c.primaryKey ? ' (PRIMARY KEY)' : ''}${c.nullable ? '' : ' NOT NULL'}`)
            .join(', ')
        : 'columns unknown';
    const name = t.schema && t.schema !== 'public' ? `"${t.schema}"."${t.name}"` : `"${t.name}"`;
    return `TABLE ${name} (${defs});`;
  });
  return [`-- SQL dialect: ${engineLabel(engine)}`, ...lines].join('\n');
}
