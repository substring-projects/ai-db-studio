import type {
  ConnectionProfile,
  DbTable,
  FilterRule,
  ForeignKey,
  QueryResult,
  StatementClassification,
  TableColumn,
  TableConstraint,
  TableIndex,
  TableMetadata,
  TableStructure,
} from '../../../../shared/types';
import { SqlClassifier } from '../../SqlClassifier';
import { DatabaseDriver, ExecuteOptions, MANUAL_ROW_CAP, ReadOnlyVerdict, TableDataRequest } from '../types';

/** What a SQL driver reads about one table; SqlDriver turns it into a TableStructure. */
export interface StructureParts {
  columns: TableColumn[];
  indexes: TableIndex[];
  foreignKeys: ForeignKey[];
  constraints: TableConstraint[];
  metadata: TableMetadata;
  /** The database's own DDL, when it can produce one. */
  exactDdl?: string;
}

/**
 * Behaviour shared by SQL databases: statement classification, filtering, paging, counting
 * and cancellation bookkeeping. Subclasses supply the dialect and the wire protocol.
 */
export abstract class SqlDriver implements DatabaseDriver {
  /** Queries in flight, keyed by the run id the renderer gave them, mapped to the server's id for that session. */
  protected activeRuns = new Map<string, number>();

  constructor(public readonly profile: ConnectionProfile) {}

  /** PostgreSQL-style dialect ($1 parameters, double-quoted identifiers, schemas). */
  protected abstract readonly isPg: boolean;

  abstract connect(password: string): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract getTables(): Promise<DbTable[]>;
  abstract getColumns(table: string, schema?: string): Promise<TableColumn[]>;
  abstract getAllColumns(): Promise<Record<string, TableColumn[]>>;
  protected abstract readStructure(table: string, schema?: string): Promise<StructureParts>;
  protected abstract rawExecute(sql: string, params: any[], options: ExecuteOptions): Promise<QueryResult>;
  protected abstract countRows(from: string, params: any[]): Promise<number>;
  protected abstract cancelBackend(backendId: number): Promise<void>;

  public classify(sql: string): StatementClassification {
    return SqlClassifier.classify(sql);
  }

  public checkStrictReadOnly(sql: string): ReadOnlyVerdict {
    return SqlClassifier.checkStrictReadOnly(sql);
  }

  public execute(sql: string, options: ExecuteOptions): Promise<QueryResult> {
    return this.rawExecute(sql, [], options);
  }

  public async explain(sql: string): Promise<QueryResult> {
    // EXPLAIN only covers the first statement; anything after it would really run.
    if (SqlClassifier.analyze(sql).statements.length !== 1) {
      throw new Error('Explain works on a single statement. Select one statement and try again.');
    }
    const explainSql = this.isPg ? `EXPLAIN (FORMAT TEXT) ${sql}` : `EXPLAIN ${sql}`;
    return this.rawExecute(explainSql, [], { maxRows: MANUAL_ROW_CAP });
  }

  public async cancel(runId?: string): Promise<void> {
    const targets = [...this.activeRuns.entries()].filter(([id]) => !runId || id === runId).map(([, backendId]) => backendId);
    for (const backendId of targets) {
      await this.cancelBackend(backendId);
    }
  }

  public async getStructure(tableName: string, schema?: string): Promise<TableStructure> {
    const { columns, indexes, foreignKeys, constraints, metadata, exactDdl } = await this.readStructure(tableName, schema);

    const ddlLines = columns.map((col) => {
      let line = `  ${col.name} ${col.typeName.toUpperCase()}`;
      if (!col.nullable) line += ' NOT NULL';
      if (col.defaultValue) line += ` DEFAULT ${col.defaultValue}`;
      return line;
    });
    const pkCols = columns.filter((c) => c.primaryKey).map((c) => c.name);
    if (pkCols.length > 0) {
      ddlLines.push(`  PRIMARY KEY (${pkCols.join(', ')})`);
    }
    for (const fk of foreignKeys) {
      ddlLines.push(`  CONSTRAINT ${fk.name} FOREIGN KEY (${fk.column}) REFERENCES ${fk.refTable} (${fk.refColumn})`);
    }
    const ddl = exactDdl || `CREATE TABLE ${tableName} (\n${ddlLines.join(',\n')}\n);`;

    return { tableName, columns, indexes, foreignKeys, ddl, constraints, metadata };
  }

  public async getTableData(request: TableDataRequest): Promise<QueryResult> {
    const { where, params } = this.buildWhere(request.rules || [], request.matchAny);
    const order = request.sortColumn ? `ORDER BY ${this.quoteIdent(request.sortColumn)} ${request.sortDesc ? 'DESC' : 'ASC'}` : '';
    const safeLimit = Math.max(1, Math.floor(Number(request.limit)) || 100);
    const safeOffset = Math.max(0, Math.floor(Number(request.offset)) || 0);

    const sql = `SELECT * FROM ${this.qualifiedTable(request.table, request.schema)} ${where} ${order} LIMIT ${safeLimit} OFFSET ${safeOffset};`;
    return this.rawExecute(sql, params, { maxRows: MANUAL_ROW_CAP });
  }

  public async getTableCount(tableName: string, rules: FilterRule[] = [], matchAny = false, schema?: string): Promise<number | null> {
    const { where, params } = this.buildWhere(rules || [], matchAny);
    const from = `${this.qualifiedTable(tableName, schema)} ${where}`;
    try {
      return await this.countRows(from, params);
    } catch {
      return null;
    }
  }

  /** Builds a WHERE clause for the dialect, with values bound as parameters. */
  protected buildWhere(rules: FilterRule[], matchAny: boolean): { where: string; params: any[] } {
    const isPg = this.isPg;
    const quote = (id: string) => this.quoteIdent(id);
    const params: any[] = [];
    const bind = () => (isPg ? `$${params.length + 1}` : '?');
    const asTextLike = (col: string) =>
      isPg ? `${col}::text ILIKE ${bind()}` : `LOWER(CAST(${col} AS CHAR)) LIKE LOWER(${bind()})`;
    const comparisons: Partial<Record<FilterRule['operator'], string>> = {
      EQUALS: '=',
      NOT_EQUALS: '<>',
      GREATER_THAN: '>',
      GREATER_OR_EQUAL: '>=',
      LESS_THAN: '<',
      LESS_OR_EQUAL: '<=',
    };

    const conditions: string[] = [];
    for (const rule of rules) {
      const col = quote(rule.column);
      const comparison = comparisons[rule.operator];
      if (comparison) {
        conditions.push(`${col} ${comparison} ${bind()}`);
        params.push(rule.value);
      } else if (rule.operator === 'CONTAINS') {
        conditions.push(asTextLike(col));
        params.push(`%${rule.value}%`);
      } else if (rule.operator === 'STARTS_WITH') {
        conditions.push(asTextLike(col));
        params.push(`${rule.value}%`);
      } else if (rule.operator === 'ENDS_WITH') {
        conditions.push(asTextLike(col));
        params.push(`%${rule.value}`);
      } else if (rule.operator === 'IS_NULL') {
        conditions.push(`${col} IS NULL`);
      } else if (rule.operator === 'IS_NOT_NULL') {
        conditions.push(`${col} IS NOT NULL`);
      }
    }
    return {
      where: conditions.length > 0 ? `WHERE ${conditions.join(matchAny ? ' OR ' : ' AND ')}` : '',
      params,
    };
  }

  protected quoteIdent(id: string): string {
    return this.isPg ? `"${id.replace(/"/g, '""')}"` : `\`${id.replace(/`/g, '``')}\``;
  }

  protected qualifiedTable(tableName: string, schema?: string): string {
    const table = this.quoteIdent(tableName);
    return this.isPg && schema ? `${this.quoteIdent(schema)}.${table}` : table;
  }

  /** Shapes a row set the way every driver returns it, applying the row cap. */
  protected toResult(columns: string[], rows: any[][], maxRows: number, elapsedMs: number): QueryResult {
    return {
      columns,
      rows: rows.length > maxRows ? rows.slice(0, maxRows) : rows,
      rowCount: Math.min(rows.length, maxRows),
      executionTimeMs: elapsedMs,
      ...(rows.length > maxRows ? { truncated: true } : {}),
    };
  }

  protected affected(count: number, elapsedMs: number): QueryResult {
    return {
      columns: ['Affected Rows'],
      rows: [[count]],
      rowCount: count,
      executionTimeMs: elapsedMs,
      isCommand: true,
    };
  }
}
