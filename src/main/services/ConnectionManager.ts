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
} from '../../shared/types';
import { SqlClassifier } from './SqlClassifier';

interface ActiveSession {
  profile: ConnectionProfile;
  password?: string;
  pgPool?: pg.Pool;
  myPool?: mysql.Pool;
}

export class ConnectionManager {
  private sessions = new Map<string, ActiveSession>();
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
      // Test connectivity
      const client = await pool.connect();
      client.release();
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
        waitForConnections: true,
        connectionLimit: 5,
      });
      // Test connectivity
      const conn = await pool.getConnection();
      conn.release();
      session.myPool = pool;
    }

    this.sessions.set(profile.id, session);
    return { success: true };
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

  public async getColumns(profileId: string, tableName: string): Promise<TableColumn[]> {
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
          WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_name = $1
        ) pk ON c.column_name = pk.column_name
        WHERE c.table_name = $1
        ORDER BY c.ordinal_position;
      `;
      const res = await session.pgPool!.query(sql, [tableName]);
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

  public async getTableStructure(profileId: string, tableName: string): Promise<TableStructure> {
    const session = this.sessions.get(profileId);
    if (!session) throw new Error('Database is not connected');

    const columns: TableColumn[] = [];
    const indexes: TableIndex[] = [];
    const foreignKeys: ForeignKey[] = [];

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
          WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_name = $1
        ) pk ON c.column_name = pk.column_name
        WHERE c.table_name = $1
        ORDER BY c.ordinal_position;
      `;
      const colsRes = await session.pgPool!.query(colsSql, [tableName]);
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
        WHERE tablename = $1;
      `;
      const idxRes = await session.pgPool!.query(idxSql, [tableName]);
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
        WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = $1;
      `;
      const fkRes = await session.pgPool!.query(fkSql, [tableName]);
      foreignKeys.push(
        ...fkRes.rows.map((r: any) => ({
          name: r.constraint_name,
          column: r.column_name,
          refTable: r.foreign_table_name,
          refColumn: r.foreign_column_name,
        }))
      );
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
    const ddl = `CREATE TABLE ${tableName} (\n${ddlLines.join(',\n')}\n);`;

    return { tableName, columns, indexes, foreignKeys, ddl };
  }

  public async explainQuery(profileId: string, sql: string): Promise<QueryResult> {
    const session = this.sessions.get(profileId);
    if (!session) throw new Error('Database is not connected');

    const isPg = session.profile.engine === 'POSTGRESQL';
    const explainSql = isPg ? `EXPLAIN (FORMAT TEXT) ${sql}` : `EXPLAIN ${sql}`;
    return this.rawExecute(session, explainSql, []);
  }

  public async getTableData(
    profileId: string,
    tableName: string,
    limit = 100,
    offset = 0,
    sortCol?: string,
    sortDesc = false,
    rules: FilterRule[] = [],
    matchAny = false
  ): Promise<QueryResult> {
    const session = this.sessions.get(profileId);
    if (!session) throw new Error('Database is not connected');

    const isPg = session.profile.engine === 'POSTGRESQL';
    const quote = (id: string) => (isPg ? `"${id.replace(/"/g, '""')}"` : `\`${id.replace(/`/g, '``')}\``);

    let whereClause = '';
    const params: any[] = [];
    let pIdx = 1;

    if (rules.length > 0) {
      const conditions: string[] = [];
      for (const rule of rules) {
        const col = quote(rule.column);
        switch (rule.operator) {
          case 'CONTAINS':
            conditions.push(`${col}::text ILIKE ${isPg ? `$${pIdx++}` : '?'}`);
            params.push(`%${rule.value}%`);
            break;
          case 'STARTS_WITH':
            conditions.push(`${col}::text ILIKE ${isPg ? `$${pIdx++}` : '?'}`);
            params.push(`${rule.value}%`);
            break;
          case 'ENDS_WITH':
            conditions.push(`${col}::text ILIKE ${isPg ? `$${pIdx++}` : '?'}`);
            params.push(`%${rule.value}`);
            break;
          case 'EQUALS':
            conditions.push(`${col} = ${isPg ? `$${pIdx++}` : '?'}`);
            params.push(rule.value);
            break;
          case 'NOT_EQUALS':
            conditions.push(`${col} <> ${isPg ? `$${pIdx++}` : '?'}`);
            params.push(rule.value);
            break;
          case 'GREATER_THAN':
            conditions.push(`${col} > ${isPg ? `$${pIdx++}` : '?'}`);
            params.push(rule.value);
            break;
          case 'GREATER_OR_EQUAL':
            conditions.push(`${col} >= ${isPg ? `$${pIdx++}` : '?'}`);
            params.push(rule.value);
            break;
          case 'LESS_THAN':
            conditions.push(`${col} < ${isPg ? `$${pIdx++}` : '?'}`);
            params.push(rule.value);
            break;
          case 'LESS_OR_EQUAL':
            conditions.push(`${col} <= ${isPg ? `$${pIdx++}` : '?'}`);
            params.push(rule.value);
            break;
          case 'IS_NULL':
            conditions.push(`${col} IS NULL`);
            break;
          case 'IS_NOT_NULL':
            conditions.push(`${col} IS NOT NULL`);
            break;
        }
      }
      if (conditions.length > 0) {
        whereClause = `WHERE ${conditions.join(matchAny ? ' OR ' : ' AND ')}`;
      }
    }

    let orderClause = '';
    if (sortCol) {
      orderClause = `ORDER BY ${quote(sortCol)} ${sortDesc ? 'DESC' : 'ASC'}`;
    }

    const sql = `SELECT * FROM ${quote(tableName)} ${whereClause} ${orderClause} LIMIT ${limit} OFFSET ${offset};`;
    return this.rawExecute(session, sql, params);
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
      profile: session.profile,
      sql,
      kind: classification.kind,
      parameterPreview: 'None',
      approvalToken: token,
    };

    this.proposals.set(proposalId, proposal);
    this.approvalTokens.set(token, { proposalId, expiresAt: Date.now() + 60_000 });

    return { classification, proposal };
  }

  public async executeQuery(profileId: string, sql: string, approvalToken?: string): Promise<QueryResult> {
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
      // Single-use token: burn it immediately
      this.approvalTokens.delete(approvalToken);
      this.proposals.delete(record.proposalId);
    }

    return this.rawExecute(session, sql, []);
  }

  private async rawExecute(session: ActiveSession, sql: string, params: any[]): Promise<QueryResult> {
    const start = performance.now();

    if (session.profile.engine === 'POSTGRESQL') {
      const res = await session.pgPool!.query(sql, params);
      const executionTimeMs = Math.round(performance.now() - start);

      if (!res.fields || res.fields.length === 0) {
        return {
          columns: ['Affected Rows'],
          rows: [[res.rowCount ?? 0]],
          rowCount: res.rowCount ?? 0,
          executionTimeMs,
        };
      }

      const columns = res.fields.map((f: any) => f.name);
      const rows = res.rows.map((r: any) => columns.map((col: string) => r[col]));
      return {
        columns,
        rows,
        rowCount: rows.length,
        executionTimeMs,
      };
    } else {
      const [result, fields] = await session.myPool!.query(sql, params);
      const executionTimeMs = Math.round(performance.now() - start);

      if (!fields || !Array.isArray(fields)) {
        const affected = (result as any)?.affectedRows ?? 0;
        return {
          columns: ['Affected Rows'],
          rows: [[affected]],
          rowCount: affected,
          executionTimeMs,
        };
      }

      const columns = (fields as any[]).map((f) => f.name);
      const rows = (result as any[]).map((r) => columns.map((col) => r[col]));
      return {
        columns,
        rows,
        rowCount: rows.length,
        executionTimeMs,
      };
    }
  }
}
