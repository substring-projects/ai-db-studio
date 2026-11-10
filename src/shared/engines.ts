import type { Engine } from './types';

/** SQL databases share the SQL editor, DDL tools and SQL safety checks; document stores do not. */
export type EngineFamily = 'sql' | 'document';

export interface EngineInfo {
  id: Engine;
  label: string;
  /** Two-letter badge shown in the explorer. */
  badge: string;
  family: EngineFamily;
  /** Language of the query editor. */
  queryLanguage: 'sql' | 'mongodb';
  defaults: { port: number; database: string; username: string };
  /** Words used in the interface, so a collection is never called a table. */
  terms: { table: string; tables: string; row: string; rows: string; column: string; columns: string };
  features: {
    /** Objects are grouped by schema (PostgreSQL) rather than living in one database. */
    schemas: boolean;
    createTable: boolean;
    /** Document databases create collections with options instead of tables with columns. */
    createCollection: boolean;
    erDiagram: boolean;
    foreignKeys: boolean;
    truncate: boolean;
    /** The SQL formatter understands this dialect. */
    format: boolean;
    explain: boolean;
    /** Connections can be given as a connection string. */
    connectionString: boolean;
    /** The AI assistant can write and run queries for this database. */
    aiQueries: boolean;
  };
}

const SQL_TERMS = { table: 'table', tables: 'tables', row: 'row', rows: 'rows', column: 'column', columns: 'columns' };

export const ENGINES: Record<Engine, EngineInfo> = {
  POSTGRESQL: {
    id: 'POSTGRESQL',
    label: 'PostgreSQL',
    badge: 'PG',
    family: 'sql',
    queryLanguage: 'sql',
    defaults: { port: 5432, database: 'postgres', username: 'postgres' },
    terms: SQL_TERMS,
    features: {
      schemas: true,
      createTable: true,
      createCollection: false,
      erDiagram: true,
      foreignKeys: true,
      truncate: true,
      format: true,
      explain: true,
      connectionString: false,
      aiQueries: true,
    },
  },
  MYSQL: {
    id: 'MYSQL',
    label: 'MySQL',
    badge: 'MY',
    family: 'sql',
    queryLanguage: 'sql',
    defaults: { port: 3306, database: 'mysql', username: 'root' },
    terms: SQL_TERMS,
    features: {
      schemas: false,
      createTable: true,
      createCollection: false,
      erDiagram: true,
      foreignKeys: true,
      truncate: true,
      format: true,
      explain: true,
      connectionString: false,
      aiQueries: true,
    },
  },
  MONGODB: {
    id: 'MONGODB',
    label: 'MongoDB',
    badge: 'MG',
    family: 'document',
    queryLanguage: 'mongodb',
    defaults: { port: 27017, database: 'test', username: '' },
    terms: { table: 'collection', tables: 'collections', row: 'document', rows: 'documents', column: 'field', columns: 'fields' },
    features: {
      schemas: false,
      createTable: false,
      createCollection: true,
      // Drawn from relationships inferred from field names and ObjectId values.
      erDiagram: true,
      foreignKeys: false,
      truncate: false,
      format: false,
      explain: true,
      connectionString: true,
      aiQueries: true,
    },
  },
};

export const ENGINE_LIST: EngineInfo[] = Object.values(ENGINES);

/** Details of an engine; profiles saved before an engine field existed are PostgreSQL. */
export function engineInfo(engine: Engine | undefined): EngineInfo {
  return (engine && ENGINES[engine]) || ENGINES.POSTGRESQL;
}

export function isSqlEngine(engine: Engine | undefined): boolean {
  return engineInfo(engine).family === 'sql';
}

/**
 * Removes a username and password from a connection string, returning them separately so
 * the password can be stored encrypted like every other password.
 */
export function splitConnectionString(uri: string): { uri: string; username?: string; password?: string } {
  const match = uri.trim().match(/^(mongodb(?:\+srv)?:\/\/)([^@/]*@)?(.*)$/i);
  if (!match) return { uri: uri.trim() };
  const [, scheme, credentials, rest] = match;
  if (!credentials) return { uri: `${scheme}${rest}` };
  const raw = credentials.slice(0, -1);
  const colon = raw.indexOf(':');
  const decode = (text: string) => {
    try {
      return decodeURIComponent(text);
    } catch {
      return text;
    }
  };
  return {
    uri: `${scheme}${rest}`,
    username: decode(colon >= 0 ? raw.slice(0, colon) : raw) || undefined,
    password: colon >= 0 ? decode(raw.slice(colon + 1)) : undefined,
  };
}
