import type { Engine } from '../../shared/types';
import { qualifiedName, quoteIdent } from './sql.ts';

/** How a type takes arguments: VARCHAR(n), DECIMAL(p,s), ENUM('a','b'). */
export type TypeParams = 'length' | 'precision' | 'values' | 'fsp';

export interface ColumnTypeDef {
  name: string;
  group: 'Numeric' | 'Text' | 'Date & time' | 'Boolean' | 'Binary' | 'JSON' | 'Other';
  params?: TypeParams;
  /** Arguments filled in when the type is picked. */
  defaultParams?: string;
  /** Whether the type is an integer that can auto-increment. */
  integer?: boolean;
  /** Arguments are required for the type to be valid. */
  paramsRequired?: boolean;
}

export const COLUMN_TYPES: Record<Engine, ColumnTypeDef[]> = {
  POSTGRESQL: [
    { name: 'SMALLINT', group: 'Numeric', integer: true },
    { name: 'INTEGER', group: 'Numeric', integer: true },
    { name: 'BIGINT', group: 'Numeric', integer: true },
    { name: 'NUMERIC', group: 'Numeric', params: 'precision', defaultParams: '10,2' },
    { name: 'REAL', group: 'Numeric' },
    { name: 'DOUBLE PRECISION', group: 'Numeric' },
    { name: 'MONEY', group: 'Numeric' },
    { name: 'VARCHAR', group: 'Text', params: 'length', defaultParams: '255' },
    { name: 'CHAR', group: 'Text', params: 'length', defaultParams: '1' },
    { name: 'TEXT', group: 'Text' },
    { name: 'CITEXT', group: 'Text' },
    { name: 'TIMESTAMP', group: 'Date & time', params: 'fsp' },
    { name: 'TIMESTAMPTZ', group: 'Date & time', params: 'fsp' },
    { name: 'DATE', group: 'Date & time' },
    { name: 'TIME', group: 'Date & time', params: 'fsp' },
    { name: 'TIMETZ', group: 'Date & time', params: 'fsp' },
    { name: 'INTERVAL', group: 'Date & time' },
    { name: 'BOOLEAN', group: 'Boolean' },
    { name: 'BYTEA', group: 'Binary' },
    { name: 'JSONB', group: 'JSON' },
    { name: 'JSON', group: 'JSON' },
    { name: 'UUID', group: 'Other' },
    { name: 'INET', group: 'Other' },
    { name: 'CIDR', group: 'Other' },
    { name: 'MACADDR', group: 'Other' },
    { name: 'TEXT[]', group: 'Other' },
    { name: 'INTEGER[]', group: 'Other' },
    { name: 'TSVECTOR', group: 'Other' },
    { name: 'XML', group: 'Other' },
  ],
  MYSQL: [
    { name: 'TINYINT', group: 'Numeric', integer: true },
    { name: 'SMALLINT', group: 'Numeric', integer: true },
    { name: 'MEDIUMINT', group: 'Numeric', integer: true },
    { name: 'INT', group: 'Numeric', integer: true },
    { name: 'BIGINT', group: 'Numeric', integer: true },
    { name: 'DECIMAL', group: 'Numeric', params: 'precision', defaultParams: '10,2' },
    { name: 'FLOAT', group: 'Numeric' },
    { name: 'DOUBLE', group: 'Numeric' },
    { name: 'BIT', group: 'Numeric', params: 'length', defaultParams: '1' },
    { name: 'VARCHAR', group: 'Text', params: 'length', defaultParams: '255', paramsRequired: true },
    { name: 'CHAR', group: 'Text', params: 'length', defaultParams: '1' },
    { name: 'TINYTEXT', group: 'Text' },
    { name: 'TEXT', group: 'Text' },
    { name: 'MEDIUMTEXT', group: 'Text' },
    { name: 'LONGTEXT', group: 'Text' },
    { name: 'ENUM', group: 'Text', params: 'values', paramsRequired: true },
    { name: 'SET', group: 'Text', params: 'values', paramsRequired: true },
    { name: 'DATETIME', group: 'Date & time', params: 'fsp' },
    { name: 'TIMESTAMP', group: 'Date & time', params: 'fsp' },
    { name: 'DATE', group: 'Date & time' },
    { name: 'TIME', group: 'Date & time', params: 'fsp' },
    { name: 'YEAR', group: 'Date & time' },
    { name: 'BOOLEAN', group: 'Boolean' },
    { name: 'BINARY', group: 'Binary', params: 'length', defaultParams: '16' },
    { name: 'VARBINARY', group: 'Binary', params: 'length', defaultParams: '255', paramsRequired: true },
    { name: 'BLOB', group: 'Binary' },
    { name: 'MEDIUMBLOB', group: 'Binary' },
    { name: 'LONGBLOB', group: 'Binary' },
    { name: 'JSON', group: 'JSON' },
  ],
  // Not a SQL database: the create table designer is not offered for it.
  MONGODB: [],
};

export const REFERENTIAL_ACTIONS = ['NO ACTION', 'RESTRICT', 'CASCADE', 'SET NULL', 'SET DEFAULT'] as const;
export type ReferentialAction = (typeof REFERENTIAL_ACTIONS)[number];

export interface ColumnSpec {
  name: string;
  type: string;
  /** Text inside the type's parentheses, e.g. "255", "10,2" or "'a','b'". */
  params: string;
  primaryKey: boolean;
  notNull: boolean;
  unique: boolean;
  autoIncrement: boolean;
  /** MySQL only. */
  unsigned: boolean;
  /** Raw SQL expression, or a plain value that gets quoted. Empty for none. */
  defaultValue: string;
  /** MySQL only: ON UPDATE CURRENT_TIMESTAMP. */
  onUpdateNow: boolean;
  /** Boolean expression for a CHECK constraint. */
  check: string;
  comment: string;
}

export interface ForeignKeySpec {
  name: string;
  column: string;
  refTable: string;
  refSchema?: string;
  refColumn: string;
  onDelete: ReferentialAction;
  onUpdate: ReferentialAction;
}

export interface IndexSpec {
  name: string;
  columns: string[];
  unique: boolean;
}

export interface TableOptions {
  ifNotExists: boolean;
  comment: string;
  /** MySQL only. Empty uses the server default. */
  storageEngine: string;
  charset: string;
  collation: string;
}

export interface TableSpec {
  name: string;
  schema?: string;
  columns: ColumnSpec[];
  foreignKeys: ForeignKeySpec[];
  indexes: IndexSpec[];
  options: TableOptions;
}

export const emptyColumn = (patch: Partial<ColumnSpec> = {}): ColumnSpec => ({
  name: '',
  type: 'VARCHAR',
  params: '255',
  primaryKey: false,
  notNull: false,
  unique: false,
  autoIncrement: false,
  unsigned: false,
  defaultValue: '',
  onUpdateNow: false,
  check: '',
  comment: '',
  ...patch,
});

export const defaultOptions = (): TableOptions => ({
  ifNotExists: false,
  comment: '',
  storageEngine: '',
  charset: '',
  collation: '',
});

export function findType(engine: Engine, type: string): ColumnTypeDef | undefined {
  return COLUMN_TYPES[engine].find((t) => t.name === type.toUpperCase());
}

export function isIntegerType(engine: Engine, type: string): boolean {
  return Boolean(findType(engine, type)?.integer);
}

/** The column's full type, e.g. VARCHAR(255) or INT UNSIGNED. */
export function columnTypeSql(engine: Engine, col: ColumnSpec): string {
  const def = findType(engine, col.type);
  const params = col.params.trim();
  let sql = col.type.trim();
  if (params && (def?.params || !def)) {
    if (def?.params === 'values') {
      sql += `(${enumValues(params).map(quoteString).join(', ')})`;
    } else {
      sql += `(${params.replace(/\s+/g, '')})`;
    }
  }
  if (engine === 'MYSQL' && col.unsigned && def && (def.integer || def.group === 'Numeric') && def.name !== 'BIT') {
    sql += ' UNSIGNED';
  }
  return sql;
}

/** Splits "a, 'b c', d" into its values, accepting quoted or bare entries. */
export function enumValues(text: string): string[] {
  const values: string[] = [];
  const pattern = /\s*(?:'((?:[^']|'')*)'|"((?:[^"]|"")*)"|([^,]+))\s*(?:,|$)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const value =
      match[1] !== undefined
        ? match[1].replace(/''/g, "'")
        : match[2] !== undefined
          ? match[2].replace(/""/g, '"')
          : match[3].trim();
    if (value !== '') values.push(value);
  }
  return values;
}

const quoteString = (value: string) => `'${value.replace(/'/g, "''")}'`;

const DEFAULT_KEYWORDS =
  /^(NULL|TRUE|FALSE|CURRENT_TIMESTAMP|CURRENT_DATE|CURRENT_TIME|LOCALTIMESTAMP|LOCALTIME|CURRENT_USER|SESSION_USER)$/i;

/**
 * Turns what the user typed as a default into SQL. Numbers, keywords, function calls,
 * casts, parenthesised expressions and already-quoted strings pass through; anything
 * else is treated as a text value and quoted.
 */
export function defaultExpression(raw: string): string {
  const value = raw.trim();
  if (!value) return '';
  if (/^-?\d+(\.\d+)?$/.test(value)) return value;
  if (DEFAULT_KEYWORDS.test(value)) return value.toUpperCase();
  if (/^'(?:[^']|'')*'(::[\w\s[\]]+)?$/.test(value)) return value;
  if (/^\(.*\)$/s.test(value)) return value;
  if (/^[A-Za-z_][\w.]*\s*\(.*\)$/s.test(value)) return value;
  if (/::/.test(value)) return value;
  return quoteString(value);
}

/** Problems that would make the statement fail or behave unexpectedly. */
export function validateTable(engine: Engine, spec: TableSpec): string[] {
  const errors: string[] = [];
  if (!spec.name.trim()) errors.push('Enter a table name.');
  const columns = spec.columns.filter((c) => c.name.trim());
  if (columns.length === 0) errors.push('Add at least one column.');

  const seen = new Set<string>();
  for (const col of columns) {
    const key = col.name.trim().toLowerCase();
    if (seen.has(key)) errors.push(`Column “${col.name.trim()}” is defined more than once.`);
    seen.add(key);
    const def = findType(engine, col.type);
    if (!col.type.trim()) errors.push(`Choose a type for “${col.name.trim()}”.`);
    if (def?.paramsRequired && !col.params.trim()) {
      errors.push(
        def.params === 'values'
          ? `List the allowed values for “${col.name.trim()}”.`
          : `Enter a length for “${col.name.trim()}” (${def.name} needs one).`
      );
    }
    if (def?.params === 'length' && col.params.trim() && !/^\d+$/.test(col.params.trim())) {
      errors.push(`Length of “${col.name.trim()}” must be a whole number.`);
    }
    if (def?.params === 'precision' && col.params.trim() && !/^\d+(\s*,\s*\d+)?$/.test(col.params.trim())) {
      errors.push(`Precision of “${col.name.trim()}” must look like 10,2.`);
    }
    if (def?.params === 'fsp' && col.params.trim() && !/^[0-6]$/.test(col.params.trim())) {
      errors.push(`Fractional seconds of “${col.name.trim()}” must be 0–6.`);
    }
    if (col.autoIncrement) {
      if (!isIntegerType(engine, col.type)) errors.push(`“${col.name.trim()}” must be an integer type to auto-increment.`);
      if (col.defaultValue.trim()) errors.push(`“${col.name.trim()}” cannot have both auto-increment and a default.`);
      if (engine === 'MYSQL' && !col.primaryKey && !col.unique) {
        errors.push(`In MySQL, auto-increment column “${col.name.trim()}” must be the primary key or unique.`);
      }
    }
  }
  if (engine === 'MYSQL' && columns.filter((c) => c.autoIncrement).length > 1) {
    errors.push('MySQL allows only one auto-increment column per table.');
  }

  const names = new Set(columns.map((c) => c.name.trim().toLowerCase()));
  for (const fk of spec.foreignKeys) {
    if (!fk.column || !fk.refTable || !fk.refColumn) {
      errors.push('Each foreign key needs a column, a referenced table and a referenced column.');
      continue;
    }
    if (!names.has(fk.column.toLowerCase())) errors.push(`Foreign key column “${fk.column}” is not in this table.`);
    const col = columns.find((c) => c.name.trim().toLowerCase() === fk.column.toLowerCase());
    if (col?.notNull && (fk.onDelete === 'SET NULL' || fk.onUpdate === 'SET NULL')) {
      errors.push(`“${fk.column}” is NOT NULL, so its foreign key cannot use SET NULL.`);
    }
  }
  for (const index of spec.indexes) {
    if (index.columns.length === 0) errors.push('Each index needs at least one column.');
    for (const c of index.columns) {
      if (!names.has(c.toLowerCase())) errors.push(`Index column “${c}” is not in this table.`);
    }
  }
  return [...new Set(errors)];
}

/** MySQL types whose default must be an expression in parentheses. */
export function needsExpressionDefault(type: string): boolean {
  return /^((TINY|MEDIUM|LONG)?(TEXT|BLOB)|JSON|GEOMETRY|POINT|LINESTRING|POLYGON|MULTIPOINT|MULTILINESTRING|MULTIPOLYGON|GEOMETRYCOLLECTION)$/i.test(
    type.trim()
  );
}

function columnSql(engine: Engine, col: ColumnSpec, singlePk: boolean): string {
  const name = col.name.trim();
  const parts = [quoteIdent(engine, name), columnTypeSql(engine, col)];
  const isPg = engine === 'POSTGRESQL';

  if (col.autoIncrement && isPg) parts.push('GENERATED BY DEFAULT AS IDENTITY');
  // Primary key columns are NOT NULL anyway; saying so keeps the DDL explicit.
  if (col.notNull || col.primaryKey) parts.push('NOT NULL');
  if (col.autoIncrement && !isPg) parts.push('AUTO_INCREMENT');
  let def = col.autoIncrement ? '' : defaultExpression(col.defaultValue);
  // MySQL rejects literal defaults on TEXT, BLOB, JSON and spatial columns; since 8.0.13
  // it accepts them written as an expression in parentheses.
  if (def && !isPg && needsExpressionDefault(col.type) && !/^\(.*\)$/s.test(def) && def !== 'NULL') {
    def = `(${def})`;
  }
  if (def) parts.push(`DEFAULT ${def}`);
  if (!isPg && col.onUpdateNow) parts.push('ON UPDATE CURRENT_TIMESTAMP');
  if (col.primaryKey && singlePk) parts.push('PRIMARY KEY');
  if (col.unique && !(col.primaryKey && singlePk)) parts.push('UNIQUE');
  if (col.check.trim()) parts.push(`CHECK (${col.check.trim()})`);
  if (!isPg && col.comment.trim()) parts.push(`COMMENT ${quoteString(col.comment.trim())}`);
  return parts.join(' ');
}

const defaultIndexName = (table: string, columns: string[], unique: boolean) =>
  `${unique ? 'uq' : 'idx'}_${table}_${columns.join('_')}`.replace(/[^\w]/g, '_').slice(0, 63);

const defaultFkName = (table: string, column: string) => `fk_${table}_${column}`.replace(/[^\w]/g, '_').slice(0, 63);

/** The full CREATE TABLE script. Assumes validateTable returned no errors. */
export function buildCreateTable(engine: Engine, spec: TableSpec): string {
  const isPg = engine === 'POSTGRESQL';
  const tableName = spec.name.trim();
  const table = qualifiedName(engine, tableName, spec.schema);
  const columns = spec.columns.filter((c) => c.name.trim());
  const pkColumns = columns.filter((c) => c.primaryKey);
  const singlePk = pkColumns.length === 1;

  const lines = columns.map((c) => `  ${columnSql(engine, c, singlePk)}`);
  if (pkColumns.length > 1) {
    lines.push(`  PRIMARY KEY (${pkColumns.map((c) => quoteIdent(engine, c.name.trim())).join(', ')})`);
  }
  for (const fk of spec.foreignKeys) {
    const name = fk.name.trim() || defaultFkName(tableName, fk.column);
    let line =
      `  CONSTRAINT ${quoteIdent(engine, name)} FOREIGN KEY (${quoteIdent(engine, fk.column)})` +
      ` REFERENCES ${qualifiedName(engine, fk.refTable, fk.refSchema)} (${quoteIdent(engine, fk.refColumn)})`;
    if (fk.onDelete !== 'NO ACTION') line += ` ON DELETE ${fk.onDelete}`;
    if (fk.onUpdate !== 'NO ACTION') line += ` ON UPDATE ${fk.onUpdate}`;
    lines.push(line);
  }
  if (!isPg) {
    for (const index of spec.indexes) {
      const name = index.name.trim() || defaultIndexName(tableName, index.columns, index.unique);
      const cols = index.columns.map((c) => quoteIdent(engine, c)).join(', ');
      lines.push(`  ${index.unique ? 'UNIQUE KEY' : 'KEY'} ${quoteIdent(engine, name)} (${cols})`);
    }
  }

  const head = `CREATE TABLE ${spec.options.ifNotExists ? 'IF NOT EXISTS ' : ''}${table}`;
  let sql = `${head} (\n${lines.join(',\n')}\n)`;

  if (!isPg) {
    const opts: string[] = [];
    if (spec.options.storageEngine.trim()) opts.push(`ENGINE=${spec.options.storageEngine.trim()}`);
    if (spec.options.charset.trim()) opts.push(`DEFAULT CHARSET=${spec.options.charset.trim()}`);
    if (spec.options.collation.trim()) opts.push(`COLLATE=${spec.options.collation.trim()}`);
    if (spec.options.comment.trim()) opts.push(`COMMENT=${quoteString(spec.options.comment.trim())}`);
    if (opts.length > 0) sql += ` ${opts.join(' ')}`;
    return `${sql};`;
  }

  // PostgreSQL defines indexes and comments in separate statements. The script runs
  // as one implicit transaction, so a failure leaves nothing half-created.
  const statements = [`${sql};`];
  for (const index of spec.indexes) {
    const name = index.name.trim() || defaultIndexName(tableName, index.columns, index.unique);
    const cols = index.columns.map((c) => quoteIdent(engine, c)).join(', ');
    statements.push(
      `CREATE ${index.unique ? 'UNIQUE ' : ''}INDEX ${spec.options.ifNotExists ? 'IF NOT EXISTS ' : ''}${quoteIdent(engine, name)} ON ${table} (${cols});`
    );
  }
  if (spec.options.comment.trim()) {
    statements.push(`COMMENT ON TABLE ${table} IS ${quoteString(spec.options.comment.trim())};`);
  }
  for (const col of columns) {
    if (col.comment.trim()) {
      statements.push(
        `COMMENT ON COLUMN ${table}.${quoteIdent(engine, col.name.trim())} IS ${quoteString(col.comment.trim())};`
      );
    }
  }
  return statements.join('\n');
}
