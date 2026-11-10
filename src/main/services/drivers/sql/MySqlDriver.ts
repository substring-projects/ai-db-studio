import mysql from 'mysql2/promise';
import type { ConnectionProfile, DbTable, QueryResult, TableColumn } from '../../../../shared/types';
import { AI_TIMEOUT_MS, COUNT_TIMEOUT_MS, DriverFactory, ExecuteOptions, MANUAL_ROW_CAP } from '../types';
import { SqlDriver, StructureParts } from './SqlDriver';

export class MySqlDriver extends SqlDriver {
  protected readonly isPg = false;
  private pool?: mysql.Pool;

  private get db(): mysql.Pool {
    if (!this.pool) throw new Error('Database is not connected');
    return this.pool;
  }

  public async connect(password: string): Promise<void> {
    const profile = this.profile;
    const pool = mysql.createPool({
      host: profile.host,
      port: profile.port,
      database: profile.database,
      user: profile.username,
      password,
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
    this.pool = pool;
  }

  public async disconnect(): Promise<void> {
    if (!this.pool) return;
    try {
      await this.pool.end();
    } catch (e) {
      console.error('Error closing MySQL pool', e);
    }
    this.pool = undefined;
  }

  public async getTables(): Promise<DbTable[]> {
    const sql = `
      SELECT table_name, table_type
      FROM information_schema.tables
      WHERE table_schema = ?
      ORDER BY table_type, table_name;
    `;
    const [rows] = await this.db.query(sql, [this.profile.database]);
    return (rows as any[]).map((r: any) => ({
      name: r.table_name || r.TABLE_NAME,
      type: (r.table_type || r.TABLE_TYPE) === 'VIEW' ? 'VIEW' : 'TABLE',
    }));
  }

  public async getColumns(tableName: string): Promise<TableColumn[]> {
    const sql = `
      SELECT column_name, data_type, is_nullable, column_key
      FROM information_schema.columns
      WHERE table_schema = ? AND table_name = ?
      ORDER BY ordinal_position;
    `;
    const [rows] = await this.db.query(sql, [this.profile.database, tableName]);
    return (rows as any[]).map((r: any) => ({
      name: r.column_name || r.COLUMN_NAME,
      typeName: r.data_type || r.DATA_TYPE,
      nullable: (r.is_nullable || r.IS_NULLABLE) === 'YES',
      primaryKey: (r.column_key || r.COLUMN_KEY) === 'PRI',
    }));
  }

  public async getAllColumns(): Promise<Record<string, TableColumn[]>> {
    const result: Record<string, TableColumn[]> = {};
    const sql = `
      SELECT table_name, column_name, data_type, is_nullable, column_key
      FROM information_schema.columns
      WHERE table_schema = ?
      ORDER BY table_name, ordinal_position;
    `;
    const [rows] = await this.db.query(sql, [this.profile.database]);
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
    return result;
  }

  protected async readStructure(tableName: string, schema?: string): Promise<StructureParts> {
    const parts: StructureParts = { columns: [], indexes: [], foreignKeys: [], constraints: [], metadata: { schema } };
    const { columns, indexes, foreignKeys, constraints, metadata } = parts;
    const database = this.profile.database;

    const colsSql = `
      SELECT column_name, data_type, is_nullable, column_key, column_default
      FROM information_schema.columns
      WHERE table_schema = ? AND table_name = ?
      ORDER BY ordinal_position;
    `;
    const [colRows] = await this.db.query(colsSql, [database, tableName]);
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
      const [idxRows] = await this.db.query(`SHOW INDEX FROM \`${tableName}\``);
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
      const [fkRows] = await this.db.query(fkSql, [database, tableName]);
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
      const [conRows] = await this.db.query(
        `SELECT tc.CONSTRAINT_NAME AS name, tc.CONSTRAINT_TYPE AS type, cc.CHECK_CLAUSE AS definition
         FROM information_schema.table_constraints tc
         LEFT JOIN information_schema.check_constraints cc
           ON cc.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA AND cc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
         WHERE tc.TABLE_SCHEMA = ? AND tc.TABLE_NAME = ?
         ORDER BY tc.CONSTRAINT_TYPE, tc.CONSTRAINT_NAME;`,
        [database, tableName]
      );
      constraints.push(...(conRows as any[]).map((r) => ({ name: r.name, type: r.type, definition: r.definition || undefined })));

      const [metaRows] = await this.db.query(
        `SELECT ENGINE AS engine, TABLE_ROWS AS row_estimate, DATA_LENGTH + INDEX_LENGTH AS total_bytes,
                TABLE_COLLATION AS collation_name, TABLE_COMMENT AS comment_text
         FROM information_schema.tables
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?;`,
        [database, tableName]
      );
      const m = (metaRows as any[])[0];
      if (m) {
        metadata.schema = database;
        metadata.engine = m.engine || undefined;
        metadata.rowEstimate = m.row_estimate === null ? undefined : Number(m.row_estimate);
        metadata.totalBytes = m.total_bytes === null ? undefined : Number(m.total_bytes);
        metadata.collation = m.collation_name || undefined;
        metadata.comment = m.comment_text || undefined;
      }

      const [ddlRows] = await this.db.query(`SHOW CREATE TABLE \`${tableName.replace(/`/g, '``')}\``);
      const row = (ddlRows as any[])[0];
      if (row) parts.exactDdl = row['Create Table'] || row['Create View'];
    } catch (e: any) {
      console.error(`Error fetching MySQL table metadata: ${e.message}`);
    }
    return parts;
  }

  protected async countRows(from: string, params: any[]): Promise<number> {
    const [rows] = await this.db.query(`SELECT /*+ MAX_EXECUTION_TIME(${COUNT_TIMEOUT_MS}) */ COUNT(*) AS total FROM ${from}`, params);
    return Number((rows as any[])[0].total);
  }

  protected async cancelBackend(backendId: number): Promise<void> {
    await this.db.query(`KILL QUERY ${Number(backendId)}`);
  }

  protected async rawExecute(sql: string, params: any[], options: ExecuteOptions): Promise<QueryResult> {
    const { runId, readOnly } = options;
    const maxRows = options.maxRows ?? MANUAL_ROW_CAP;
    const start = performance.now();
    const elapsed = () => Math.round(performance.now() - start);
    const timeoutMs = options.timeoutMs ?? AI_TIMEOUT_MS;

    const conn = await this.db.getConnection();
    if (runId) this.activeRuns.set(runId, conn.threadId);
    try {
      if (readOnly) {
        await conn.query(`SET SESSION MAX_EXECUTION_TIME = ${timeoutMs}`).catch(() => undefined);
        await conn.query('START TRANSACTION READ ONLY');
      }
      const [result, fields] = await conn.query({ sql, values: params, rowsAsArray: true });
      if (!fields || !Array.isArray(fields)) {
        return this.affected((result as any)?.affectedRows ?? 0, elapsed());
      }
      return this.toResult((fields as any[]).map((f) => f.name), result as any[][], maxRows, elapsed());
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

export const mysqlFactory: DriverFactory = {
  create: (profile: ConnectionProfile) => new MySqlDriver(profile),
  async test(profile: ConnectionProfile) {
    try {
      const conn = await mysql.createConnection({
        host: profile.host,
        port: profile.port,
        database: profile.database,
        user: profile.username,
        password: profile.password || '',
        ssl: profile.tlsMode === 'DISABLE' ? undefined : { rejectUnauthorized: false },
        connectTimeout: 5000,
      });
      const [rows] = await conn.query('SELECT VERSION() as v');
      await conn.end();
      const ver = Array.isArray(rows) && rows[0] && typeof rows[0] === 'object' && 'v' in rows[0] ? (rows[0] as any).v : 'OK';
      return { success: true, message: `Connected to MySQL: ${ver}` };
    } catch (err: any) {
      return { success: false, message: err.message || 'Connection failed' };
    }
  },
};
