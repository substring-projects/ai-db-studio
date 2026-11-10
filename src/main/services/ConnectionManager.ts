import crypto from 'node:crypto';
import {
  ConnectionProfile,
  DbTable,
  FilterRule,
  MutationProposal,
  QueryResult,
  StatementClassification,
  TableColumn,
  TableStructure,
} from '../../shared/types';
import { engineInfo } from '../../shared/engines';
import { DatabaseDriver, driverFactory } from './drivers';
import { AI_ROW_CAP, AI_TIMEOUT_MS, MANUAL_ROW_CAP, ReadOnlyVerdict } from './drivers/types';

/**
 * Owns the open connections and the rules every database shares: writes run only with a
 * person's single-use approval, and AI-written statements must pass a strict read-only gate.
 * Everything specific to one database lives in its driver (see ./drivers).
 */
export class ConnectionManager {
  private sessions = new Map<string, DatabaseDriver>();
  private approvalTokens = new Map<string, { proposalId: string; expiresAt: number }>();
  private proposals = new Map<string, MutationProposal>();

  private driver(profileId: string, message = 'Database is not connected'): DatabaseDriver {
    const driver = this.sessions.get(profileId);
    if (!driver) throw new Error(message);
    return driver;
  }

  public async connect(profile: ConnectionProfile, password?: string): Promise<{ success: boolean; message?: string }> {
    await this.disconnect(profile.id);
    const driver = driverFactory(profile.engine).create(profile);
    await driver.connect(password || profile.password || '');
    this.sessions.set(profile.id, driver);
    return { success: true };
  }

  public isConnected(profileId: string): boolean {
    return this.sessions.has(profileId);
  }

  public getProfile(profileId: string): ConnectionProfile | undefined {
    return this.sessions.get(profileId)?.profile;
  }

  public async disconnect(profileId: string): Promise<void> {
    const driver = this.sessions.get(profileId);
    if (!driver) return;
    await driver.disconnect();
    this.sessions.delete(profileId);
  }

  public async disconnectAll(): Promise<void> {
    const ids = Array.from(this.sessions.keys());
    await Promise.all(ids.map((id) => this.disconnect(id)));
  }

  public async testConnection(profile: ConnectionProfile): Promise<{ success: boolean; message: string }> {
    try {
      return await driverFactory(profile.engine).test(profile);
    } catch (err: any) {
      return { success: false, message: err.message || 'Connection failed' };
    }
  }

  public async getTables(profileId: string): Promise<DbTable[]> {
    return this.driver(profileId, 'Database is not connected. Connect first.').getTables();
  }

  public async getColumns(profileId: string, tableName: string, schema?: string): Promise<TableColumn[]> {
    return this.driver(profileId).getColumns(tableName, schema);
  }

  public async getAllTableColumns(profileId: string): Promise<Record<string, TableColumn[]>> {
    return this.driver(profileId).getAllColumns();
  }

  public async getTableStructure(profileId: string, tableName: string, schema?: string): Promise<TableStructure> {
    return this.driver(profileId).getStructure(tableName, schema);
  }

  public async explainQuery(profileId: string, sql: string): Promise<QueryResult> {
    return this.driver(profileId).explain(sql);
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
    return this.driver(profileId).getTableData({
      table: tableName,
      schema,
      limit,
      offset,
      sortColumn: sortCol,
      sortDesc,
      rules: rules || [],
      matchAny,
    });
  }

  public async getTableCount(
    profileId: string,
    tableName: string,
    rules: FilterRule[] = [],
    matchAny = false,
    schema?: string
  ): Promise<number | null> {
    return this.driver(profileId).getTableCount(tableName, rules || [], matchAny, schema);
  }

  /** The strict gate for statements no person wrote, in the connection's own query language. */
  public checkStrictReadOnly(profileId: string, sql: string): ReadOnlyVerdict {
    return this.driver(profileId).checkStrictReadOnly(sql);
  }

  public prepareQuery(
    profileId: string,
    sql: string
  ): { classification: StatementClassification; proposal?: MutationProposal } {
    const driver = this.driver(profileId);

    const classification = driver.classify(sql);
    if (classification.isReadOnly) {
      return { classification };
    }

    // Require human approval for mutations
    const proposalId = crypto.randomUUID();
    const token = crypto.randomBytes(16).toString('hex');
    const proposal: MutationProposal = {
      id: proposalId,
      // The confirmation dialog only needs where this will run, never the credentials.
      profile: { ...driver.profile, password: undefined },
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
    const driver = this.driver(profileId);

    const classification = driver.classify(sql);

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

    return driver.execute(sql, { runId, maxRows: MANUAL_ROW_CAP });
  }

  /**
   * Runs AI-generated statements without a person. There is no approval path here on purpose:
   * the statement must pass the driver's strict read-only gate, and drivers add database-level
   * protection where the database offers it (SQL drivers use a read-only transaction).
   * Anything else has to go through a person's review and executeQuery's approval token.
   */
  public async executeReadOnly(profileId: string, sql: string, runId?: string): Promise<QueryResult> {
    const driver = this.driver(profileId);

    const verdict = driver.checkStrictReadOnly(sql);
    if (!verdict.ok) {
      const what = engineInfo(driver.profile.engine).family === 'sql' ? 'SQL' : 'commands';
      throw new Error(`Blocked: AI-generated ${what} must be read-only. ${verdict.reason}`);
    }

    return driver.execute(sql, { runId, maxRows: AI_ROW_CAP, readOnly: true, timeoutMs: AI_TIMEOUT_MS });
  }

  /** Cancels one run, or every run on the connection when no run id is given. */
  public async cancelQuery(profileId: string, runId?: string): Promise<void> {
    const driver = this.sessions.get(profileId);
    if (!driver) return;
    await driver.cancel(runId);
  }
}
