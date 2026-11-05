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
  sql: string;
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
}

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
  getColumns: (profileId: string, tableName: string) => Promise<TableColumn[]>;
  getTableData: (
    profileId: string,
    tableName: string,
    limit: number,
    offset: number,
    sortCol?: string,
    sortDesc?: boolean,
    rules?: FilterRule[],
    matchAny?: boolean
  ) => Promise<QueryResult>;

  // Queries
  prepareQuery: (profileId: string, sql: string) => Promise<{
    classification: StatementClassification;
    proposal?: MutationProposal;
  }>;
  executeQuery: (profileId: string, sql: string, approvalToken?: string) => Promise<QueryResult>;
  cancelQuery: (profileId: string) => Promise<void>;

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

  // Clipboard
  copyToClipboard: (text: string) => Promise<void>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
