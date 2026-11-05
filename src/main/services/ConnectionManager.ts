import pg from 'pg';
import mysql from 'mysql2/promise';
import crypto from 'node:crypto';
import {
  ConnectionProfile,
  DbTable,
  FilterRule,
  MutationProposal,
  QueryResult,
  StatementClassification,
  TableColumn,
  TableIndex,
  ForeignKey,
  TableStructure,
  TableConstraint,
  TableMetadata,
} from '../../shared/types';
import { SqlClassifier } from './SqlClassifier';

interface ActiveSession {
  profile: ConnectionProfile;
  password?: string;
  pgPool?: pg.Pool;
  myPool?: mysql.Pool;
}

/**
 * Date and time columns keep the database's own text. Parsing them into a JS Date would apply
 * the local timezone: a DATE of 2026-01-02 would come back as 2026-01-01T18:30Z in India, which
 * is wrong to display and would not match the row when used in a generated WHERE clause.
 */
const TEMPORAL_OIDS = new Set([1082 /* date */, 1083 /* time */, 1114 /* timestamp */, 1184 /* timestamptz */, 1266 /* timetz */]);
const pgTypes = {
  getTypeParser: (oid: number, format?: any) =>
    TEMPORAL_OIDS.has(oid) ? (value: any) => value : (pg.types.getTypeParser as any)(oid, format),
};

/** Manual queries return at most this many rows to the UI. */
const MANUAL_ROW_CAP = 100_000;
/** AI-run queries are capped lower and bounded in time, because no human wrote them. */
const AI_ROW_CAP = 5_000;
const AI_TIMEOUT_MS = 30_000;
const COUNT_TIMEOUT_MS = 5_000;

export class ConnectionManager {
  private sessions = new Map<string, ActiveSession>();
  /** Queries in flight, keyed by the run id the renderer gave them, for cancellation. */
  private activeRuns = new Map<string, { profileId: string; backendId: number }>();
  private approvalTokens = new Map<string, { proposalId: string; expiresAt: number }>();
  private proposals = new Map<string, MutationProposal>();

  public async connect(profile: ConnectionProfile, password?: string): Promise<{ success: boolean; message?: string }> {
    await this.disconnect(profile.id);

    const pwd = password || profile.password || '';
    const session: ActiveSession = { profile, password: pwd };

    if (profile.engine === 'POSTGRESQL') {
      const pool = new pg.Pool({
        host: profile.host,
        port: profile.port,
        database: profile.database,
        user: profile.username,
        password: pwd,
        ssl: profile.tlsMode === 'DISABLE' ? false : { rejectUnauthorized: false },
        connectionTimeoutMillis: 8000,
      });
      // An idle client dropping must not surface as an unhandled 'error' event in the main process.
      pool.on('error', (err) => console.error(`Postgres pool error on "${profile.name}": ${err.message}`));
      // Test connectivity
      try {
        const client = await pool.connect();
        client.release();
      } catch (err) {
        await pool.end().catch(() => undefined);
        throw err;
      }
      session.pgPool = pool;
    } else if (profile.engine === 'MYSQL') {
      const pool = mysql.createPool({
        host: profile.host,
        port: profile.port,
        database: profile.database,
        user: profile.username,
        password: pwd,
        ssl: profile.tlsMode === 'DISABLE' ? undefined : { rejectUnauthorized: false },
        connectTimeout: 8000,
        dateStrings: true,
        waitForConnections: true,
        connectionLimit: 5,
      });
      // Test connectivity
      try {
        const conn = await pool.getConnection();
        conn.release();
      } catch (err) {
        await pool.end().catch(() => undefined);
        throw err;
      }
      session.myPool = pool;
    }

    this.sessions.set(profile.id, session);
    return { success: true };
  }

  public isConnected(profileId: string): boolean {
    return this.sessions.has(profileId);
  }

  public getProfile(profileId: string): ConnectionProfile | undefined {
    return this.sessions.get(profileId)?.profile;
  }

  public async disconnect(profileId: string): Promise<void> {
    const session = this.sessions.get(profileId);
    if (!session) return;

    if (session.pgPool) {
      try {
        await session.pgPool.end();
      } catch (e) {
        console.error('Error closing Postgres pool', e);
      }
    }
    if (session.myPool) {
      try {
        await session.myPool.end();
      } catch (e) {
        console.error('Error closing MySQL pool', e);
      }
    }
    this.sessions.delete(profileId);
  }

  public async testConnection(profile: ConnectionProfile): Promise<{ success: boolean; message: string }> {
    try {
      const pwd = profile.password || '';
      if (profile.engine === 'POSTGRESQL') {
        const client = new pg.Client({
          host: profile.host,
          port: profile.port,
          database: profile.database,
          user: profile.username,
          password: pwd,
          ssl: profile.tlsMode === 'DISABLE' ? false : { rejectUnauthorized: false },
          connectionTimeoutMillis: 5000,
        });
        await client.connect();
        const res = await client.query('SELECT version()');
        await client.end();
        return { success: true, message: `Connected to PostgreSQL: ${res.rows[0]?.version?.split(' ')?.[0] || 'OK'}` };
      } else {
        const conn = await mysql.createConnection({
          host: profile.host,
          port: profile.port,
          database: profile.database,
          user: profile.username,
          password: pwd,
          ssl: profile.tlsMode === 'DISABLE' ? undefined : { rejectUnauthorized: false },
          connectTimeout: 5000,
        });
        const [rows] = await conn.query('SELECT VERSION() as v');
        await conn.end();
        const ver = Array.isArray(rows) && rows[0] && typeof rows[0] === 'object' && 'v' in rows[0] ? (rows[0] as any).v : 'OK';
        return { success: true, message: `Connected to MySQL: ${ver}` };
      }
    } catch (err: any) {
      return { success: false, message: err.message || 'Connection failed' };
    }
  }

  public async getTables(profileId: string): Promise<DbTable[]> {
    const session = this.sessions.get(profileId);
    if (!session) throw new Error('Database is not connected. Connect first.');

    if (session.profile.engine === 'POSTGRESQL') {
      const sql = `
        SELECT table_name, table_schema, table_type
        FROM information_schema.tables
        WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
        ORDER BY table_type, table_name;
      `;
      const res = await session.pgPool!.query(sql);
      return res.rows.map((r: any) => ({
        name: r.table_name,
        schema: r.table_schema,
        type: r.table_type === 'VIEW' ? 'VIEW' : 'TABLE',
      }));
    } else {
      const sql = `
        SELECT table_name, table_type
        FROM information_schema.tables
        WHERE table_schema = ?
        ORDER BY table_type, table_name;
      `;
      const [rows] = await session.myPool!.query(sql, [session.profile.database]);
      return (rows as any[]).map((r: any) => ({
        name: r.table_name || r.TABLE_NAME,
        type: (r.table_type || r.TABLE_TYPE) === 'VIEW' ? 'VIEW' : 'TABLE',
      }));
    }
  }

  public async getColumns(profileId: string, tableName: string, schema?: string): Promise<TableColumn[]> {
    const session = this.sessions.get(profileId);
    if (!session) throw new Error('Database is not connected');

    if (session.profile.engine === 'POSTGRESQL') {
      const sql = `
        SELECT c.column_name, c.data_type, c.is_nullable,
               (CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END) as is_pk
        FROM information_schema.columns c
        LEFT JOIN (
          SELECT kcu.column_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
          WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_name = $1 ${schema ? 'AND tc.table_schema = $2' : ''}
        ) pk ON c.column_name = pk.column_name
        WHERE c.table_name = $1 ${schema ? 'AND c.table_schema = $2' : ''}
        ORDER BY c.ordinal_position;
      `;
      const res = await session.pgPool!.query(sql, schema ? [tableName, schema] : [tableName]);
      return res.rows.map((r: any) => ({
        name: r.column_name,
        typeName: r.data_type,
        nullable: r.is_nullable === 'YES',
        primaryKey: Boolean(r.is_pk),
      }));
    } else {
      const sql = `
        SELECT column_name, data_type, is_nullable, column_key
        FROM information_schema.columns
        WHERE table_schema = ? AND table_name = ?
        ORDER BY ordinal_position;
      `;
      const [rows] = await session.myPool!.query(sql, [session.profile.database, tableName]);
      return (rows as any[]).map((r: any) => ({
        name: r.column_name || r.COLUMN_NAME,
        typeName: r.data_type || r.DATA_TYPE,
        nullable: (r.is_nullable || r.IS_NULLABLE) === 'YES',
        primaryKey: (r.column_key || r.COLUMN_KEY) === 'PRI',
      }));
    }
  }

  public async getAllTableColumns(profileId: string): Promise<Record<string, TableColumn[]>> {
    const session = this.sessions.get(profileId);
    if (!session) throw new Error('Database is not connected');

    const result: Record<string, TableColumn[]> = {};

    if (session.profile.engine === 'POSTGRESQL') {
      try {
        const sql = `
          SELECT c.table_schema, c.table_name, c.column_name, c.data_type, c.is_nullable,
                 (CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END) as is_pk
          FROM information_schema.columns c
          LEFT JOIN (
            SELECT tc.table_schema, tc.table_name, kcu.column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
            WHERE tc.constraint_type = 'PRIMARY KEY'
          ) pk ON c.table_schema = pk.table_schema AND c.table_name = pk.table_name AND c.column_name = pk.column_name
          WHERE c.table_schema NOT IN ('pg_catalog', 'information_schema')
          ORDER BY c.table_name, c.ordinal_position;
        `;
        const res = await session.pgPool!.query(sql);
        for (const r of res.rows) {
          // Tables outside "public" are keyed schema.table so same-named tables stay separate.
          const tName = r.table_schema === 'public' ? r.table_name : `${r.table_schema}.${r.table_name}`;
          if (!result[tName]) result[tName] = [];
          result[tName].push({
            name: r.column_name,
            typeName: r.data_type,
            nullable: r.is_nullable === 'YES',
            primaryKey: Boolean(r.is_pk),
          });
        }
      } catch (err) {
        // Fallback to simpler columns query if PK join fails
        const fallbackSql = `
          SELECT table_schema, table_name, column_name, data_type, is_nullable
          FROM information_schema.columns
          WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
          ORDER BY table_name, ordinal_position;
        `;
        const res = await session.pgPool!.query(fallbackSql);
        for (const r of res.rows) {
          const tName = r.table_schema === 'public' ? r.table_name : `${r.table_schema}.${r.table_name}`;
          if (!result[tName]) result[tName] = [];
          result[tName].push({
            name: r.column_name,
            typeName: r.data_type,
            nullable: r.is_nullable === 'YES',
            primaryKey: false,
          });
        }
      }
    } else {
      const sql = `
        SELECT table_name, column_name, data_type, is_nullable, column_key
        FROM information_schema.columns
        WHERE table_schema = ?
        ORDER BY table_name, ordinal_position;
      `;
      const [rows] = await session.myPool!.query(sql, [session.profile.database]);
      for (const r of rows as any[]) {
        const tName = r.table_name || r.TABLE_NAME;
        if (!result[tName]) result[tName] = [];
        result[tName].push({
          name: r.column_name || r.COLUMN_NAME,
          typeName: r.data_type || r.DATA_TYPE,
          nullable: (r.is_nullable || r.IS_NULLABLE) === 'YES',
          primaryKey: (r.column_key || r.COLUMN_KEY) === 'PRI',
        });
      }
    }

    return result;
  }

  public async getTableStructure(profileId: string, tableName: string, schema?: string): Promise<TableStructure> {
    const session = this.sessions.get(profileId);
    if (!session) throw new Error('Database is not connected');

    const columns: TableColumn[] = [];
    const indexes: TableIndex[] = [];
    const foreignKeys: ForeignKey[] = [];
    const constraints: TableConstraint[] = [];
    const metadata: TableMetadata = { schema };
    let exactDdl: string | undefined;

    if (session.profile.engine === 'POSTGRESQL') {
      const colsSql = `
        SELECT c.column_name, c.data_type, c.is_nullable, c.column_default,
               (CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END) as is_pk
        FROM information_schema.columns c
        LEFT JOIN (
          SELECT kcu.column_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
          WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_name = $1 ${schema ? 'AND tc.table_schema = $2' : ''}
        ) pk ON c.column_name = pk.column_name
        WHERE c.table_name = $1 ${schema ? 'AND c.table_schema = $2' : ''}
        ORDER BY c.ordinal_position;
      `;
      const nameParams = schema ? [tableName, schema] : [tableName];
      const colsRes = await session.pgPool!.query(colsSql, nameParams);
      columns.push(
        ...colsRes.rows.map((r: any) => ({
          name: r.column_name,
          typeName: r.data_type,
          nullable: r.is_nullable === 'YES',
          primaryKey: Boolean(r.is_pk),
          defaultValue: r.column_default,
        }))
      );

      const idxSql = `
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE tablename = $1 ${schema ? 'AND schemaname = $2' : ''};
      `;
      const idxRes = await session.pgPool!.query(idxSql, nameParams);
      for (const r of idxRes.rows) {
        const isUnique = /CREATE UNIQUE INDEX/i.test(r.indexdef);
        const isPrimary = /_pkey\b/i.test(r.indexname);
        const match = r.indexdef.match(/\((.*?)\)/);
        const cols = match ? match[1].split(',').map((s: string) => s.trim().replace(/"/g, '')) : [];
        indexes.push({
          name: r.indexname,
          columns: cols,
          isUnique,
          isPrimary,
        });
      }

      const fkSql = `
        SELECT
          tc.constraint_name,
          kcu.column_name,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = $1 ${schema ? 'AND tc.table_schema = $2' : ''};
      `;
      const fkRes = await session.pgPool!.query(fkSql, nameParams);
      foreignKeys.push(
        ...fkRes.rows.map((r: any) => ({
          name: r.constraint_name,
          column: r.column_name,
          refTable: r.foreign_table_name,
          refColumn: r.foreign_column_name,
        }))
      );

      // Scoped to one schema; without an explicit one, the connection's current schema.
      const relFilter = `c.relname = $1 AND n.nspname = ${schema ? '$2' : 'current_schema()'}`;
      try {
        const conRes = await session.pgPool!.query(
          `SELECT con.conname, con.contype, pg_get_constraintdef(con.oid) AS definition
           FROM pg_constraint con
           JOIN pg_class c ON c.oid = con.conrelid
           JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE ${relFilter}
           ORDER BY con.contype, con.conname;`,
          nameParams
        );
        const conTypes: Record<string, string> = {
          p: 'PRIMARY KEY',
          f: 'FOREIGN KEY',
          u: 'UNIQUE',
          c: 'CHECK',
          x: 'EXCLUDE',
          t: 'TRIGGER',
        };
        constraints.push(
          ...conRes.rows.map((r: any) => ({
            name: r.conname,
            type: conTypes[r.contype] || r.contype,
            definition: r.definition,
          }))
        );

        const metaRes = await session.pgPool!.query(
          `SELECT c.reltuples::bigint AS row_estimate,
                  pg_total_relation_size(c.oid) AS total_bytes,
                  pg_get_userbyid(c.relowner) AS owner,
                  obj_description(c.oid, 'pg_class') AS comment,
                  c.relkind,
                  n.nspname AS schema_name,
                  CASE WHEN c.relkind IN ('v', 'm') THEN pg_get_viewdef(c.oid, true) END AS view_def
           FROM pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE ${relFilter};`,
          nameParams
        );
        const m = metaRes.rows[0];
        if (m) {
          metadata.schema = m.schema_name;
          // reltuples is -1 until the table has been analyzed: that means unknown, not empty.
          metadata.rowEstimate = Number(m.row_estimate) >= 0 ? Number(m.row_estimate) : undefined;
          metadata.totalBytes = Number(m.total_bytes);
          metadata.owner = m.owner;
          metadata.comment = m.comment || undefined;
          if (m.view_def) {
            const q = (id: string) => `"${id.replace(/"/g, '""')}"`;
            exactDdl = `CREATE ${m.relkind === 'm' ? 'MATERIALIZED ' : ''}VIEW ${q(m.schema_name)}.${q(tableName)} AS\n${m.view_def}`;
          }
        }
      } catch (e: any) {
        console.error(`Error fetching Postgres table metadata: ${e.message}`);
      }
    } else {
      const colsSql = `
        SELECT column_name, data_type, is_nullable, column_key, column_default
        FROM information_schema.columns
        WHERE table_schema = ? AND table_name = ?
        ORDER BY ordinal_position;
      `;
      const [colRows] = await session.myPool!.query(colsSql, [session.profile.database, tableName]);
      columns.push(
        ...(colRows as any[]).map((r: any) => ({
          name: r.column_name || r.COLUMN_NAME,
          typeName: r.data_type || r.DATA_TYPE,
          nullable: (r.is_nullable || r.IS_NULLABLE) === 'YES',
          primaryKey: (r.column_key || r.COLUMN_KEY) === 'PRI',
          defaultValue: r.column_default || r.COLUMN_DEFAULT,
        }))
      );

      try {
        const [idxRows] = await session.myPool!.query(`SHOW INDEX FROM \`${tableName}\``);
        const idxGroup = new Map<string, { unique: boolean; primary: boolean; cols: string[] }>();
        for (const r of idxRows as any[]) {
          const keyName = r.Key_name;
          if (!idxGroup.has(keyName)) {
            idxGroup.set(keyName, {
              unique: Number(r.Non_unique) === 0,
              primary: keyName === 'PRIMARY',
              cols: [],
            });
          }
          idxGroup.get(keyName)!.cols.push(r.Column_name);
        }
        for (const [name, info] of idxGroup.entries()) {
          indexes.push({
            name,
            columns: info.cols,
            isUnique: info.unique,
            isPrimary: info.primary,
          });
        }
      } catch (e) {
        console.error('Error fetching MySQL indexes', e);
      }

      try {
        const fkSql = `
          SELECT CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
          FROM information_schema.key_column_usage
          WHERE table_schema = ? AND table_name = ? AND REFERENCED_TABLE_NAME IS NOT NULL;
        `;
        const [fkRows] = await session.myPool!.query(fkSql, [session.profile.database, tableName]);
        foreignKeys.push(
          ...(fkRows as any[]).map((r: any) => ({
            name: r.CONSTRAINT_NAME,
            column: r.COLUMN_NAME,
            refTable: r.REFERENCED_TABLE_NAME,
            refColumn: r.REFERENCED_COLUMN_NAME,
          }))
        );
      } catch (e) {
        console.error('Error fetching MySQL foreign keys', e);
      }

      try {
        const [conRows] = await session.myPool!.query(
          `SELECT tc.CONSTRAINT_NAME AS name, tc.CONSTRAINT_TYPE AS type, cc.CHECK_CLAUSE AS definition
           FROM information_schema.table_constraints tc
           LEFT JOIN information_schema.check_constraints cc
             ON cc.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA AND cc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
           WHERE tc.TABLE_SCHEMA = ? AND tc.TABLE_NAME = ?
           ORDER BY tc.CONSTRAINT_TYPE, tc.CONSTRAINT_NAME;`,
          [session.profile.database, tableName]
        );
        constraints.push(
          ...(conRows as any[]).map((r) => ({ name: r.name, type: r.type, definition: r.definition || undefined }))
        );

        const [metaRows] = await session.myPool!.query(
          `SELECT ENGINE AS engine, TABLE_ROWS AS row_estimate, DATA_LENGTH + INDEX_LENGTH AS total_bytes,
                  TABLE_COLLATION AS collation_name, TABLE_COMMENT AS comment_text
           FROM information_schema.tables
           WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?;`,
          [session.profile.database, tableName]
        );
        const m = (metaRows as any[])[0];
        if (m) {
          metadata.schema = session.profile.database;
          metadata.engine = m.engine || undefined;
          metadata.rowEstimate = m.row_estimate === null ? undefined : Number(m.row_estimate);
          metadata.totalBytes = m.total_bytes === null ? undefined : Number(m.total_bytes);
          metadata.collation = m.collation_name || undefined;
          metadata.comment = m.comment_text || undefined;
        }

        const [ddlRows] = await session.myPool!.query(
          `SHOW CREATE TABLE \`${tableName.replace(/`/g, '``')}\``
        );
        const row = (ddlRows as any[])[0];
        if (row) exactDdl = row['Create Table'] || row['Create View'];
      } catch (e: any) {
        console.error(`Error fetching MySQL table metadata: ${e.message}`);
      }
    }

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
      ddlLines.push(
        `  CONSTRAINT ${fk.name} FOREIGN KEY (${fk.column}) REFERENCES ${fk.refTable} (${fk.refColumn})`
      );
    }
    const ddl = exactDdl || `CREATE TABLE ${tableName} (\n${ddlLines.join(',\n')}\n);`;

    return { tableName, columns, indexes, foreignKeys, ddl, constraints, metadata };
  }

  public async explainQuery(profileId: string, sql: string): Promise<QueryResult> {
    const session = this.sessions.get(profileId);
    if (!session) throw new Error('Database is not connected');

    // EXPLAIN only covers the first statement; anything after it would really run.
    if (SqlClassifier.analyze(sql).statements.length !== 1) {
      throw new Error('Explain works on a single statement. Select one statement and try again.');
    }

    const isPg = session.profile.engine === 'POSTGRESQL';
    const explainSql = isPg ? `EXPLAIN (FORMAT TEXT) ${sql}` : `EXPLAIN ${sql}`;
    return this.rawExecute(session, explainSql, []);
  }

  /** Builds a WHERE clause for the session's dialect, with values bound as parameters. */
  private buildWhere(isPg: boolean, rules: FilterRule[], matchAny: boolean): { where: string; params: any[] } {
    const quote = (id: string) => this.quoteIdent(isPg, id);
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

  private quoteIdent(isPg: boolean, id: string): string {
    return isPg ? `"${id.replace(/"/g, '""')}"` : `\`${id.replace(/`/g, '``')}\``;
  }

  private qualifiedTable(isPg: boolean, tableName: string, schema?: string): string {
    const table = this.quoteIdent(isPg, tableName);
    return isPg && schema ? `${this.quoteIdent(isPg, schema)}.${table}` : table;
  }

  public async getTableData(
    profileId: string,
    tableName: string,
    limit = 100,
    offset = 0,
    sortCol?: string,
    sortDesc = false,
    rules: FilterRule[] = [],
    matchAny = false,
    schema?: string
  ): Promise<QueryResult> {
    const session = this.sessions.get(profileId);
    if (!session) throw new Error('Database is not connected');

    const isPg = session.profile.engine === 'POSTGRESQL';
    const { where, params } = this.buildWhere(isPg, rules || [], matchAny);
    const order = sortCol ? `ORDER BY ${this.quoteIdent(isPg, sortCol)} ${sortDesc ? 'DESC' : 'ASC'}` : '';
    const safeLimit = Math.max(1, Math.floor(Number(limit)) || 100);
    const safeOffset = Math.max(0, Math.floor(Number(offset)) || 0);

    const sql = `SELECT * FROM ${this.qualifiedTable(isPg, tableName, schema)} ${where} ${order} LIMIT ${safeLimit} OFFSET ${safeOffset};`;
    return this.rawExecute(session, sql, params);
  }

  /**
   * Counts matching rows for the pager. Counting can be slow on large tables, so it is
   * time-boxed and returns null when it runs out of time instead of holding the UI up.
   */
  public async getTableCount(
    profileId: string,
    tableName: string,
    rules: FilterRule[] = [],
    matchAny = false,
    schema?: string
  ): Promise<number | null> {
    const session = this.sessions.get(profileId);
    if (!session) throw new Error('Database is not connected');

    const isPg = session.profile.engine === 'POSTGRESQL';
    const { where, params } = this.buildWhere(isPg, rules || [], matchAny);
    const from = `${this.qualifiedTable(isPg, tableName, schema)} ${where}`;

    try {
      if (isPg) {
        const client = await session.pgPool!.connect();
        try {
          await client.query('BEGIN READ ONLY');
          await client.query(`SET LOCAL statement_timeout = ${COUNT_TIMEOUT_MS}`);
          const res = await client.query(`SELECT COUNT(*) AS total FROM ${from}`, params);
          return Number(res.rows[0].total);
        } finally {
          await client.query('ROLLBACK').catch(() => undefined);
          client.release();
        }
      }
      const [rows] = await session.myPool!.query(
        `SELECT /*+ MAX_EXECUTION_TIME(${COUNT_TIMEOUT_MS}) */ COUNT(*) AS total FROM ${from}`,
        params
      );
      return Number((rows as any[])[0].total);
    } catch {
      return null;
    }
  }

  public prepareQuery(
    profileId: string,
    sql: string
  ): { classification: StatementClassification; proposal?: MutationProposal } {
    const session = this.sessions.get(profileId);
    if (!session) throw new Error('Database is not connected');

    const classification = SqlClassifier.classify(sql);
    if (classification.isReadOnly) {
      return { classification };
    }

    // Require human approval for mutations
    const proposalId = crypto.randomUUID();
    const token = crypto.randomBytes(16).toString('hex');
    const proposal: MutationProposal = {
      id: proposalId,
      // The confirmation dialog only needs where this will run, never the credentials.
      profile: { ...session.profile, password: undefined },
      sql,
      kind: classification.kind,
      parameterPreview: 'None',
      approvalToken: token,
    };

    this.proposals.set(proposalId, proposal);
    this.approvalTokens.set(token, { proposalId, expiresAt: Date.now() + 60_000 });

    return { classification, proposal };
  }

  public async executeQuery(
    profileId: string,
    sql: string,
    approvalToken?: string,
    runId?: string
  ): Promise<QueryResult> {
    const session = this.sessions.get(profileId);
    if (!session) throw new Error('Database is not connected');

    const classification = SqlClassifier.classify(sql);

    // If mutation, verify token
    if (!classification.isReadOnly) {
      if (!approvalToken) {
        throw new Error('Write operations require explicit user approval.');
      }
      const record = this.approvalTokens.get(approvalToken);
      if (!record || record.expiresAt < Date.now()) {
        throw new Error('Approval token is invalid or expired. Please confirm execution again.');
      }
      // Single-use token: burn it immediately, whether or not it turns out to match.
      const proposal = this.proposals.get(record.proposalId);
      this.approvalTokens.delete(approvalToken);
      this.proposals.delete(record.proposalId);
      // An approval covers the exact statement and connection that were reviewed, nothing else.
      if (!proposal || proposal.sql !== sql || proposal.profile.id !== profileId) {
        throw new Error('This approval was for a different statement. Please confirm execution again.');
      }
    }

    return this.rawExecute(session, sql, [], { runId, maxRows: MANUAL_ROW_CAP });
  }

  /**
   * Runs AI-generated SQL without a person. There is no approval path here on purpose: the
   * statement must pass the strict read-only gate, and it then runs inside a read-only
   * transaction, so the database itself refuses any write the gate failed to recognise.
   * Anything else has to go through a person's review and executeQuery's approval token.
   */
  public async executeReadOnly(profileId: string, sql: string, runId?: string): Promise<QueryResult> {
    const session = this.sessions.get(profileId);
    if (!session) throw new Error('Database is not connected');

    const verdict = SqlClassifier.checkStrictReadOnly(sql);
    if (!verdict.ok) {
      throw new Error(`Blocked: AI-generated SQL must be read-only. ${verdict.reason}`);
    }

    return this.rawExecute(session, sql, [], { runId, maxRows: AI_ROW_CAP, readOnly: true });
  }

  /** Cancels one run, or every run on the connection when no run id is given. */
  public async cancelQuery(profileId: string, runId?: string): Promise<void> {
    const session = this.sessions.get(profileId);
    if (!session) return;

    const targets = [...this.activeRuns.entries()]
      .filter(([id, run]) => run.profileId === profileId && (!runId || id === runId))
      .map(([, run]) => run.backendId);

    for (const backendId of targets) {
      if (session.pgPool) {
        await session.pgPool.query('SELECT pg_cancel_backend($1)', [backendId]);
      } else if (session.myPool) {
        await session.myPool.query(`KILL QUERY ${Number(backendId)}`);
      }
    }
  }

  private async rawExecute(
    session: ActiveSession,
    sql: string,
    params: any[],
    options: { runId?: string; maxRows?: number; readOnly?: boolean } = {}
  ): Promise<QueryResult> {
    const { runId, readOnly } = options;
    const maxRows = options.maxRows ?? MANUAL_ROW_CAP;
    const start = performance.now();
    const elapsed = () => Math.round(performance.now() - start);
    const profileId = session.profile.id;

    const toResult = (columns: string[], rows: any[][]): QueryResult => ({
      columns,
      rows: rows.length > maxRows ? rows.slice(0, maxRows) : rows,
      rowCount: Math.min(rows.length, maxRows),
      executionTimeMs: elapsed(),
      ...(rows.length > maxRows ? { truncated: true } : {}),
    });
    const affected = (count: number): QueryResult => ({
      columns: ['Affected Rows'],
      rows: [[count]],
      rowCount: count,
      executionTimeMs: elapsed(),
      isCommand: true,
    });

    if (session.profile.engine === 'POSTGRESQL') {
      const client = await session.pgPool!.connect();
      if (runId) this.activeRuns.set(runId, { profileId, backendId: (client as any).processID });
      try {
        if (readOnly) {
          await client.query('BEGIN READ ONLY');
          await client.query(`SET LOCAL statement_timeout = ${AI_TIMEOUT_MS}`);
        }
        // Array rows keep every column when two share a name (SELECT a.id, b.id ...).
        const raw: any = await client.query({ text: sql, values: params, rowMode: 'array', types: pgTypes } as any);
        // A multi-statement script returns one result per statement: show the last with rows.
        const list: any[] = Array.isArray(raw) ? raw : [raw];
        const withRows = [...list].reverse().find((r) => r.fields && r.fields.length > 0);
        if (!withRows) {
          return affected(list.reduce((sum, r) => sum + (r.rowCount ?? 0), 0));
        }
        return toResult(withRows.fields.map((f: any) => f.name), withRows.rows);
      } finally {
        if (runId) this.activeRuns.delete(runId);
        if (readOnly) await client.query('ROLLBACK').catch(() => undefined);
        client.release();
      }
    }

    const conn = await session.myPool!.getConnection();
    if (runId) this.activeRuns.set(runId, { profileId, backendId: conn.threadId });
    try {
      if (readOnly) {
        await conn.query(`SET SESSION MAX_EXECUTION_TIME = ${AI_TIMEOUT_MS}`).catch(() => undefined);
        await conn.query('START TRANSACTION READ ONLY');
      }
      const [result, fields] = await conn.query({ sql, values: params, rowsAsArray: true });
      if (!fields || !Array.isArray(fields)) {
        return affected((result as any)?.affectedRows ?? 0);
      }
      return toResult((fields as any[]).map((f) => f.name), result as any[][]);
    } finally {
      if (runId) this.activeRuns.delete(runId);
      if (readOnly) {
        await conn.query('ROLLBACK').catch(() => undefined);
        await conn.query('SET SESSION MAX_EXECUTION_TIME = 0').catch(() => undefined);
      }
      conn.release();
    }
  }
}
