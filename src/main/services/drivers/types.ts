import type {
  ConnectionProfile,
  DbTable,
  FilterRule,
  QueryResult,
  StatementClassification,
  TableColumn,
  TableStructure,
} from '../../../shared/types';

export interface ReadOnlyVerdict {
  ok: boolean;
  reason?: string;
}

export interface ExecuteOptions {
  /** Id the renderer gave this run, used to cancel it. */
  runId?: string;
  /** Rows returned to the UI at most. */
  maxRows: number;
  /**
   * The statement already passed the driver's strict read-only check. Drivers add their
   * own database-level protection where the database offers one (a read-only transaction).
   */
  readOnly?: boolean;
  /** Time limit for read-only runs, in milliseconds. */
  timeoutMs?: number;
}

export interface TableDataRequest {
  table: string;
  schema?: string;
  limit: number;
  offset: number;
  sortColumn?: string;
  sortDesc: boolean;
  rules: FilterRule[];
  matchAny: boolean;
}

/**
 * One open connection to one database. Each supported database implements this; the
 * ConnectionManager owns the sessions and the approval rules shared by all of them.
 *
 * To add a database: implement this interface, register it in drivers/index.ts and add
 * the engine to shared/engines.ts.
 */
export interface DatabaseDriver {
  readonly profile: ConnectionProfile;

  /** Opens the connection and proves it works, or throws. */
  connect(password: string): Promise<void>;
  disconnect(): Promise<void>;

  getTables(): Promise<DbTable[]>;
  getColumns(table: string, schema?: string): Promise<TableColumn[]>;
  /** Columns of every table, keyed by `table` or `schema.table` outside the default schema. */
  getAllColumns(): Promise<Record<string, TableColumn[]>>;
  getStructure(table: string, schema?: string): Promise<TableStructure>;
  getTableData(request: TableDataRequest): Promise<QueryResult>;
  /** Exact count, or null when it could not be computed in time. */
  getTableCount(table: string, rules: FilterRule[], matchAny: boolean, schema?: string): Promise<number | null>;

  /** Decides whether a statement only reads. Writes need a person's approval. */
  classify(statement: string): StatementClassification;
  /** The stricter gate for statements no person wrote (the AI assistant's). */
  checkStrictReadOnly(statement: string): ReadOnlyVerdict;

  execute(statement: string, options: ExecuteOptions): Promise<QueryResult>;
  explain(statement: string): Promise<QueryResult>;
  /** Cancels one run, or every run on this connection when no run id is given. */
  cancel(runId?: string): Promise<void>;
}

export interface DriverFactory {
  create(profile: ConnectionProfile): DatabaseDriver;
  /** Connects once, reports the server version, and disconnects. */
  test(profile: ConnectionProfile): Promise<{ success: boolean; message: string }>;
}

/** Manual queries return at most this many rows to the UI. */
export const MANUAL_ROW_CAP = 100_000;
/** AI-run queries are capped lower and bounded in time, because no human wrote them. */
export const AI_ROW_CAP = 5_000;
export const AI_TIMEOUT_MS = 30_000;
export const COUNT_TIMEOUT_MS = 5_000;
