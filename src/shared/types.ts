export type Engine = 'POSTGRESQL' | 'MYSQL';
export type TlsMode = 'PREFER' | 'REQUIRE' | 'DISABLE';

export interface ConnectionProfile {
  id: string;
  name: string;
  engine: Engine;
  host: string;
  port: number;
  database: string;
  username: string;
  tlsMode: TlsMode;
  password?: string;
}

export interface SqlDraft {
  id: string;
  connectionId?: string | null;
  title: string;
  /** Working copy, written to disk automatically so nothing is lost. */
  sql: string;
  /** Baseline from the last explicit save; differing from `sql` marks the tab unsaved. */
  savedSql?: string;
  updatedAt?: number;
}

export interface QueryHistoryItem {
  id: string;
  sql: string;
  executedAt: number;
  durationMs: number;
  rowCount: number;
  connectionName: string;
}

export type FilterOperator =
  | 'CONTAINS'
  | 'EQUALS'
  | 'NOT_EQUALS'
  | 'STARTS_WITH'
  | 'ENDS_WITH'
  | 'GREATER_THAN'
  | 'GREATER_OR_EQUAL'
  | 'LESS_THAN'
  | 'LESS_OR_EQUAL'
  | 'IS_NULL'
  | 'IS_NOT_NULL';

export interface FilterRule {
  column: string;
  operator: FilterOperator;
  value: string;
}

export interface TableColumn {
  name: string;
  typeName: string;
  primaryKey: boolean;
  nullable: boolean;
  defaultValue?: string | null;
}

export interface TableIndex {
  name: string;
  columns: string[];
  isUnique: boolean;
  isPrimary: boolean;
}

export interface ForeignKey {
  name: string;
  column: string;
  refTable: string;
  refColumn: string;
}

export interface TableStructure {
  tableName: string;
  columns: TableColumn[];
  indexes: TableIndex[];
  foreignKeys: ForeignKey[];
  ddl: string;
  constraints?: TableConstraint[];
  metadata?: TableMetadata;
}

export interface TableConstraint {
  name: string;
  type: string;
  definition?: string;
}

export interface TableMetadata {
  schema?: string;
  engine?: string;
  owner?: string;
  collation?: string;
  comment?: string;
  rowEstimate?: number;
  totalBytes?: number;
}

export interface DbTable {
  name: string;
  schema?: string;
  type: 'TABLE' | 'VIEW';
  rowCountEstimate?: number;
}

export interface QueryResult {
  columns: string[];
  rows: (string | number | boolean | null)[][];
  rowCount: number;
  executionTimeMs: number;
  /** More rows matched than the row cap allows; `rows` holds only the first ones. */
  truncated?: boolean;
  /** The statement returned no result set; `rowCount` is the number of affected rows. */
  isCommand?: boolean;
}

export interface StatementClassification {
  isReadOnly: boolean;
  kind: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'DDL' | 'OTHER';
  statementCount: number;
}

export interface MutationProposal {
  id: string;
  profile: ConnectionProfile;
  sql: string;
  kind: string;
  parameterPreview: string;
  approvalToken?: string;
}

export interface WorkspaceSettings {
  theme: 'dark' | 'light';
  explorerVisible: boolean;
  explorerDivider: number;
  maxHistory: number;
  aiProvider: 'ollama' | 'openai';
  aiEndpoint: string;
  aiModel: string;
  aiApiKey?: string;
  /** Lets the AI model read query result rows. Off unless the user turns it on. */
  aiShareResults?: boolean;
}

export interface AiMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sql?: string;
  timestamp: number;
}

export interface AiChatRequest {
  requestId: string;
  conversationId: string;
  /** Id of the user message that starts this turn. */
  turnId: string;
  prompt: string;
  profileId: string | null;
  schemaContext: string;
  /** Run safe read queries without asking. */
  autoRun: boolean;
  /** Earlier messages, used once for conversations that predate stored memory. */
  seedHistory?: { role: 'user' | 'assistant'; content: string }[];
}

export type AiEvent =
  | { type: 'text'; delta: string }
  | { type: 'query-start'; id: string; sql: string; readOnly: boolean; reason?: string; needsReview: boolean }
  | { type: 'query-approved'; id: string }
  | { type: 'query-declined'; id: string }
  | { type: 'query-cancelled'; id: string }
  | { type: 'query-result'; id: string; result: QueryResult }
  | { type: 'query-error'; id: string; error: string }
  | { type: 'done' };

export interface ElectronAPI {
  // Profiles
  getProfiles: () => Promise<ConnectionProfile[]>;
  saveProfile: (profile: ConnectionProfile) => Promise<ConnectionProfile>;
  deleteProfile: (id: string) => Promise<void>;
  testConnection: (profile: ConnectionProfile) => Promise<{ success: boolean; message: string }>;

  // Database Sessions & Metadata
  connect: (profile: ConnectionProfile, password?: string) => Promise<{ success: boolean; message?: string }>;
  disconnect: (profileId: string) => Promise<void>;
  getTables: (profileId: string) => Promise<DbTable[]>;
  getColumns: (profileId: string, tableName: string, schema?: string) => Promise<TableColumn[]>;
  getAllColumns: (profileId: string) => Promise<Record<string, TableColumn[]>>;
  getTableStructure: (profileId: string, tableName: string, schema?: string) => Promise<TableStructure>;
  getTableData: (
    profileId: string,
    tableName: string,
    limit: number,
    offset: number,
    sortCol?: string,
    sortDesc?: boolean,
    rules?: FilterRule[],
    matchAny?: boolean,
    schema?: string
  ) => Promise<QueryResult>;
  getTableCount: (
    profileId: string,
    tableName: string,
    rules?: FilterRule[],
    matchAny?: boolean,
    schema?: string
  ) => Promise<number | null>;

  // Queries
  prepareQuery: (profileId: string, sql: string) => Promise<{
    classification: StatementClassification;
    proposal?: MutationProposal;
  }>;
  executeQuery: (profileId: string, sql: string, approvalToken?: string, runId?: string) => Promise<QueryResult>;
  /** The only way AI-generated SQL is run: strictly read-only, with no approval path. */
  executeReadOnlyQuery: (profileId: string, sql: string, runId?: string) => Promise<QueryResult>;
  explainQuery: (profileId: string, sql: string) => Promise<QueryResult>;
  cancelQuery: (profileId: string, runId?: string) => Promise<void>;

  // Drafts
  getDrafts: () => Promise<SqlDraft[]>;
  saveDraft: (draft: SqlDraft) => Promise<SqlDraft>;
  deleteDraft: (id: string) => Promise<void>;

  // History
  getHistory: () => Promise<QueryHistoryItem[]>;
  addHistory: (item: Omit<QueryHistoryItem, 'id' | 'executedAt'>) => Promise<void>;
  clearHistory: () => Promise<void>;

  // Settings
  getSettings: () => Promise<WorkspaceSettings>;
  saveSettings: (settings: Partial<WorkspaceSettings>) => Promise<WorkspaceSettings>;

  // AI Assistant
  aiChat: (request: AiChatRequest) => Promise<void>;
  onAiEvent: (listener: (requestId: string, event: AiEvent) => void) => () => void;
  cancelAi: (requestId: string) => Promise<void>;
  /** A person's decision on a statement waiting for review. */
  reviewAiQuery: (requestId: string, queryId: string, approved: boolean) => Promise<void>;
  cancelAiQuery: (requestId: string, queryId: string) => Promise<void>;
  /** Clears a conversation's memory, or just the part from one turn onward. */
  forgetAiMemory: (conversationId: string, fromTurnId?: string) => Promise<void>;

  // Clipboard
  copyToClipboard: (text: string) => Promise<void>;

  // System
  platform: string;
  setWindowTheme: (theme: 'dark' | 'light') => Promise<void>;
  onMenuCommand: (listener: (command: string) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
