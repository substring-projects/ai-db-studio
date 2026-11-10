import pg from 'pg';
import type { ConnectionProfile, DbTable, QueryResult, TableColumn } from '../../../../shared/types';
import { AI_TIMEOUT_MS, COUNT_TIMEOUT_MS, DriverFactory, ExecuteOptions, MANUAL_ROW_CAP } from '../types';
import { SqlDriver, StructureParts } from './SqlDriver';

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

export class PostgresDriver extends SqlDriver {
  protected readonly isPg = true;
  private pool?: pg.Pool;

  private get db(): pg.Pool {
    if (!this.pool) throw new Error('Database is not connected');
    return this.pool;
  }

  public async connect(password: string): Promise<void> {
    const profile = this.profile;
    const pool = new pg.Pool({
      host: profile.host,
      port: profile.port,
      database: profile.database,
      user: profile.username,
      password,
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
    this.pool = pool;
  }

  public async disconnect(): Promise<void> {
    if (!this.pool) return;
    try {
      await this.pool.end();
    } catch (e) {
      console.error('Error closing Postgres pool', e);
    }
    this.pool = undefined;
  }

  public async getTables(): Promise<DbTable[]> {
    const sql = `
      SELECT table_name, table_schema, table_type
      FROM information_schema.tables
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
      ORDER BY table_type, table_name;
    `;
    const res = await this.db.query(sql);
    return res.rows.map((r: any) => ({
      name: r.table_name,
      schema: r.table_schema,
      type: r.table_type === 'VIEW' ? 'VIEW' : 'TABLE',
    }));
  }

  public async getColumns(tableName: string, schema?: string): Promise<TableColumn[]> {
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
    const res = await this.db.query(sql, schema ? [tableName, schema] : [tableName]);
    return res.rows.map((r: any) => ({
      name: r.column_name,
      typeName: r.data_type,
      nullable: r.is_nullable === 'YES',
      primaryKey: Boolean(r.is_pk),
    }));
  }

  public async getAllColumns(): Promise<Record<string, TableColumn[]>> {
    const result: Record<string, TableColumn[]> = {};
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
      const res = await this.db.query(sql);
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
      const res = await this.db.query(fallbackSql);
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
    return result;
  }

  protected async readStructure(tableName: string, schema?: string): Promise<StructureParts> {
    const parts: StructureParts = { columns: [], indexes: [], foreignKeys: [], constraints: [], metadata: { schema } };
    const { columns, indexes, foreignKeys, constraints, metadata } = parts;

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
    const colsRes = await this.db.query(colsSql, nameParams);
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
    const idxRes = await this.db.query(idxSql, nameParams);
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
        ccu.table_schema AS foreign_table_schema,
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
    const fkRes = await this.db.query(fkSql, nameParams);
    foreignKeys.push(
      ...fkRes.rows.map((r: any) => ({
        name: r.constraint_name,
        column: r.column_name,
        refTable: r.foreign_table_name,
        refSchema: r.foreign_table_schema,
        refColumn: r.foreign_column_name,
      }))
    );

    // Scoped to one schema; without an explicit one, the connection's current schema.
    const relFilter = `c.relname = $1 AND n.nspname = ${schema ? '$2' : 'current_schema()'}`;
    try {
      const conRes = await this.db.query(
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

      const metaRes = await this.db.query(
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
          parts.exactDdl = `CREATE ${m.relkind === 'm' ? 'MATERIALIZED ' : ''}VIEW ${q(m.schema_name)}.${q(tableName)} AS\n${m.view_def}`;
        }
      }
    } catch (e: any) {
      console.error(`Error fetching Postgres table metadata: ${e.message}`);
    }
    return parts;
  }

  protected async countRows(from: string, params: any[]): Promise<number> {
    const client = await this.db.connect();
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

  protected async cancelBackend(backendId: number): Promise<void> {
    await this.db.query('SELECT pg_cancel_backend($1)', [backendId]);
  }

  protected async rawExecute(sql: string, params: any[], options: ExecuteOptions): Promise<QueryResult> {
    const { runId, readOnly } = options;
    const maxRows = options.maxRows ?? MANUAL_ROW_CAP;
    const start = performance.now();
    const elapsed = () => Math.round(performance.now() - start);

    const client = await this.db.connect();
    if (runId) this.activeRuns.set(runId, (client as any).processID);
    try {
      if (readOnly) {
        await client.query('BEGIN READ ONLY');
        await client.query(`SET LOCAL statement_timeout = ${options.timeoutMs ?? AI_TIMEOUT_MS}`);
      }
      // Array rows keep every column when two share a name (SELECT a.id, b.id ...).
      const raw: any = await client.query({ text: sql, values: params, rowMode: 'array', types: pgTypes } as any);
      // A multi-statement script returns one result per statement: show the last with rows.
      const list: any[] = Array.isArray(raw) ? raw : [raw];
      const withRows = [...list].reverse().find((r) => r.fields && r.fields.length > 0);
      if (!withRows) {
        return this.affected(
          list.reduce((sum, r) => sum + (r.rowCount ?? 0), 0),
          elapsed()
        );
      }
      return this.toResult(withRows.fields.map((f: any) => f.name), withRows.rows, maxRows, elapsed());
    } finally {
      if (runId) this.activeRuns.delete(runId);
      if (readOnly) await client.query('ROLLBACK').catch(() => undefined);
      client.release();
    }
  }
}

export const postgresFactory: DriverFactory = {
  create: (profile: ConnectionProfile) => new PostgresDriver(profile),
  async test(profile: ConnectionProfile) {
    try {
      const client = new pg.Client({
        host: profile.host,
        port: profile.port,
        database: profile.database,
        user: profile.username,
        password: profile.password || '',
        ssl: profile.tlsMode === 'DISABLE' ? false : { rejectUnauthorized: false },
        connectionTimeoutMillis: 5000,
      });
      await client.connect();
      const res = await client.query('SELECT version()');
      await client.end();
      return { success: true, message: `Connected to PostgreSQL: ${res.rows[0]?.version?.split(' ')?.[0] || 'OK'}` };
    } catch (err: any) {
      return { success: false, message: err.message || 'Connection failed' };
    }
  },
};
