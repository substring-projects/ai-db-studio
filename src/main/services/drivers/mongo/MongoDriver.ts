import { AbstractCursor, Collection, Db, MongoClient, MongoClientOptions } from 'mongodb';
import type { ConnectionProfile, DbTable, FilterRule, QueryResult, StatementClassification, TableColumn, TableStructure } from '../../../../shared/types';
import { collectionRef, toShell } from '../../../../shared/mongoShell';
import { COUNT_TIMEOUT_MS, DatabaseDriver, DriverFactory, ExecuteOptions, MANUAL_ROW_CAP, ReadOnlyVerdict, TableDataRequest } from '../types';
import { affectedResult, documentsToResult, inferFields, inferReferences, toPlain, valuesToResult } from './documents';
import { buildMongoFilter } from './filters';
import { MongoStatement, checkShellStrictReadOnly, classifyShell, parseShell, writesThroughPipeline } from './shell';

/** Comment attached to a run's reads, so a cancel can find and stop them on the server. */
const runTag = (runId: string) => `ai-db-studio:${runId}`;

/** Documents read to describe a collection's fields. */
const SAMPLE_SIZE = 100;
/** Collections sampled when describing the whole database, to keep connecting fast. */
const MAX_SAMPLED_COLLECTIONS = 200;

/** Client options for a profile. The password is passed separately and never stored in the URI. */
export function clientOptions(profile: ConnectionProfile, password: string): { uri: string; options: MongoClientOptions } {
  const uri = profile.connectionString?.trim() || `mongodb://${profile.host || 'localhost'}:${profile.port || 27017}/`;
  const options: MongoClientOptions = {
    appName: 'AI DB Studio',
    serverSelectionTimeoutMS: 8000,
    connectTimeoutMS: 8000,
  };
  if (profile.username) {
    options.auth = { username: profile.username, password };
    if (profile.authSource) options.authSource = profile.authSource;
  }
  // PREFER keeps the driver's default: TLS for mongodb+srv:// and for strings that ask for it.
  if (profile.tlsMode === 'DISABLE') options.tls = false;
  if (profile.tlsMode === 'REQUIRE') {
    options.tls = true;
    // Matches the PostgreSQL and MySQL drivers, which also don't verify certificates yet.
    options.tlsAllowInvalidCertificates = true;
  }
  return { uri, options };
}

/** Database a profile works in: the profile's, else the one named in the connection string, else "test". */
export function databaseName(profile: ConnectionProfile): string {
  if (profile.database?.trim()) return profile.database.trim();
  const path = profile.connectionString?.match(/^mongodb(?:\+srv)?:\/\/[^/]+\/([^?]+)/i)?.[1];
  return path ? decodeURIComponent(path) : 'test';
}

export class MongoDriver implements DatabaseDriver {
  private client?: MongoClient;
  private database?: Db;
  /** Closes the cursor of each run in flight, keyed by run id. */
  private runs = new Map<string, () => Promise<void>>();
  /** Run ids with a statement in flight, for stopping their operations on the server. */
  private inFlight = new Set<string>();

  constructor(public readonly profile: ConnectionProfile) {}

  private get db(): Db {
    if (!this.database) throw new Error('Database is not connected');
    return this.database;
  }

  public async connect(password: string): Promise<void> {
    const { uri, options } = clientOptions(this.profile, password);
    const client = new MongoClient(uri, options);
    try {
      await client.connect();
      const db = client.db(databaseName(this.profile));
      await db.command({ ping: 1 });
      this.client = client;
      this.database = db;
    } catch (err) {
      await client.close().catch(() => undefined);
      throw err;
    }
  }

  public async disconnect(): Promise<void> {
    const client = this.client;
    this.client = undefined;
    this.database = undefined;
    if (!client) return;
    try {
      await client.close();
    } catch (e) {
      console.error('Error closing MongoDB client', e);
    }
  }

  public async getTables(): Promise<DbTable[]> {
    const infos = await this.db.listCollections({}, { nameOnly: false }).toArray();
    return infos
      .filter((c) => !c.name.startsWith('system.'))
      .map((c) => ({ name: c.name, type: c.type === 'view' ? ('VIEW' as const) : ('TABLE' as const) }))
      .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'TABLE' ? -1 : 1));
  }

  private async sample(name: string, size = SAMPLE_SIZE): Promise<Record<string, unknown>[]> {
    return (await this.db.collection(name).find({}, { limit: size, maxTimeMS: COUNT_TIMEOUT_MS }).toArray()) as Record<string, unknown>[];
  }

  public async getColumns(collection: string): Promise<TableColumn[]> {
    return inferFields(await this.sample(collection));
  }

  public async getAllColumns(): Promise<Record<string, TableColumn[]>> {
    const tables = (await this.getTables()).slice(0, MAX_SAMPLED_COLLECTIONS);
    const result: Record<string, TableColumn[]> = {};
    // A few at a time, so a database with many collections doesn't flood the server.
    for (let i = 0; i < tables.length; i += 8) {
      await Promise.all(
        tables.slice(i, i + 8).map(async (t) => {
          try {
            result[t.name] = inferFields(await this.sample(t.name, 20));
          } catch {
            result[t.name] = [];
          }
        })
      );
    }
    return result;
  }

  public async getStructure(name: string): Promise<TableStructure> {
    const collection = this.db.collection(name);
    const [docs, info, names] = await Promise.all([
      this.sample(name),
      this.db.listCollections({ name }).next(),
      this.db
        .listCollections({}, { nameOnly: true })
        .toArray()
        .then((list) => list.map((c) => c.name).filter((n) => !n.startsWith('system.')))
        .catch(() => [] as string[]),
    ]);
    const columns = inferFields(docs);
    const isView = info?.type === 'view';
    const options = ((info as any)?.options ?? {}) as Record<string, any>;

    const indexes: TableStructure['indexes'] = [];
    const indexDocs: any[] = [];
    if (!isView) {
      try {
        indexDocs.push(...(await collection.listIndexes().toArray()));
        for (const ix of indexDocs) {
          indexes.push({
            name: ix.name,
            columns: Object.entries(ix.key ?? {}).map(([field, dir]) => (dir === 1 ? field : `${field} (${dir})`)),
            isUnique: Boolean(ix.unique) || ix.name === '_id_',
            isPrimary: ix.name === '_id_',
          });
        }
      } catch (e: any) {
        console.error(`Error fetching MongoDB indexes: ${e.message}`);
      }
    }

    const constraints: TableStructure['constraints'] = [];
    if (options.validator) {
      constraints.push({ name: 'validator', type: 'VALIDATOR', definition: toShell(toPlain(options.validator), 2) });
    }
    if (options.validationLevel) constraints.push({ name: 'validationLevel', type: 'VALIDATION', definition: String(options.validationLevel) });
    if (options.validationAction) constraints.push({ name: 'validationAction', type: 'VALIDATION', definition: String(options.validationAction) });

    const metadata: TableStructure['metadata'] = { schema: this.db.databaseName };
    if (!isView) {
      try {
        metadata.rowEstimate = await collection.estimatedDocumentCount({ maxTimeMS: COUNT_TIMEOUT_MS });
        const [stats] = await collection.aggregate([{ $collStats: { storageStats: {} } }], { maxTimeMS: COUNT_TIMEOUT_MS }).toArray();
        const storage = (stats as any)?.storageStats;
        if (storage) metadata.totalBytes = Number(storage.totalSize ?? (storage.size ?? 0) + (storage.totalIndexSize ?? 0));
      } catch (e: any) {
        console.error(`Error fetching MongoDB collection stats: ${e.message}`);
      }
    }

    // A script that recreates the collection: its options, then its secondary indexes.
    const createOptions = Object.fromEntries(Object.entries(options).filter(([key]) => key !== 'uuid'));
    const lines = [
      `db.createCollection(${JSON.stringify(name)}${Object.keys(createOptions).length ? `, ${toShell(toPlain(createOptions), 2)}` : ''});`,
      ...indexDocs
        .filter((ix) => ix.name !== '_id_')
        .map((ix) => {
          const { key, v: _v, ns: _ns, ...rest } = ix;
          return `${collectionRef(name)}.createIndex(${toShell(toPlain(key))}, ${toShell(toPlain(rest))});`;
        }),
    ];

    return { tableName: name, columns, indexes, foreignKeys: inferReferences(columns, names), ddl: lines.join('\n'), constraints, metadata };
  }

  public async getTableData(request: TableDataRequest): Promise<QueryResult> {
    const start = performance.now();
    const filter = buildMongoFilter(request.rules || [], request.matchAny);
    const limit = Math.max(1, Math.floor(Number(request.limit)) || 100);
    const skip = Math.max(0, Math.floor(Number(request.offset)) || 0);
    const docs = await this.db
      .collection(request.table)
      .find(filter, {
        sort: request.sortColumn ? { [request.sortColumn]: request.sortDesc ? -1 : 1 } : undefined,
        skip,
        limit,
      })
      .toArray();
    return documentsToResult(docs, { maxRows: MANUAL_ROW_CAP, elapsedMs: Math.round(performance.now() - start) });
  }

  public async getTableCount(collection: string, rules: FilterRule[] = [], matchAny = false): Promise<number | null> {
    const coll = this.db.collection(collection);
    try {
      const filter = buildMongoFilter(rules || [], matchAny);
      if (Object.keys(filter).length === 0) {
        // Metadata-based and instant; views don't support it, so they fall through to a count.
        try {
          return await coll.estimatedDocumentCount({ maxTimeMS: COUNT_TIMEOUT_MS });
        } catch {
          /* counted below */
        }
      }
      return await coll.countDocuments(filter, { maxTimeMS: COUNT_TIMEOUT_MS });
    } catch {
      return null;
    }
  }

  public classify(statement: string): StatementClassification {
    return classifyShell(statement);
  }

  public checkStrictReadOnly(statement: string): ReadOnlyVerdict {
    return checkShellStrictReadOnly(statement);
  }

  public async execute(source: string, options: ExecuteOptions): Promise<QueryResult> {
    const statements = parseShell(source);
    if (statements.length === 0) return affectedResult(0, 0);
    if (options.readOnly) {
      // The caller already checked; check again here because this is the last line of defence.
      const verdict = checkShellStrictReadOnly(source);
      if (!verdict.ok) throw new Error(`Blocked: ${verdict.reason}`);
    }
    const start = performance.now();
    let lastWithRows: QueryResult | undefined;
    let affected = 0;
    if (options.runId) this.inFlight.add(options.runId);
    try {
      for (const statement of statements) {
        const result = await this.run(statement, options);
        if (result.isCommand) affected += result.rowCount;
        else lastWithRows = result;
      }
    } finally {
      if (options.runId) this.inFlight.delete(options.runId);
    }
    const elapsedMs = Math.round(performance.now() - start);
    // Like a SQL script: show the last result that has rows, else the total affected.
    return lastWithRows ? { ...lastWithRows, executionTimeMs: elapsedMs } : affectedResult(affected, elapsedMs);
  }

  public async explain(source: string): Promise<QueryResult> {
    const statements = parseShell(source);
    if (statements.length !== 1) throw new Error('Explain works on a single statement. Select one statement and try again.');
    const [statement] = statements;
    if (!statement.collection || !['find', 'aggregate'].includes(statement.method) || writesThroughPipeline(statement)) {
      throw new Error('Explain works on find() and aggregate() statements.');
    }
    const start = performance.now();
    const coll = this.db.collection(statement.collection);
    const plan =
      statement.method === 'find'
        ? await this.buildFind(coll, statement).explain('queryPlanner')
        : await coll.aggregate(asArray(statement.args[0]), asObject(statement.args[1])).explain('queryPlanner');
    const lines = JSON.stringify(toPlain(plan), null, 2).split('\n');
    return {
      columns: ['QUERY PLAN'],
      rows: lines.map((line) => [line]),
      rowCount: lines.length,
      executionTimeMs: Math.round(performance.now() - start),
    };
  }

  /**
   * Stops a run like the SQL drivers do: closes its cursor and kills its reads on the server,
   * found by the comment each read carries. Writes are not tagged, so a cancel never stops a
   * multi-document write halfway, which MongoDB could not roll back.
   */
  public async cancel(runId?: string): Promise<void> {
    const targets = [...this.runs.entries()].filter(([id]) => !runId || id === runId);
    await Promise.all(targets.map(([, close]) => close().catch(() => undefined)));
    const ids = runId ? (this.inFlight.has(runId) ? [runId] : []) : [...this.inFlight];
    await this.killOperations(ids).catch((err) => console.error(`Could not stop MongoDB operation: ${err.message}`));
  }

  private async killOperations(runIds: string[]): Promise<void> {
    if (!this.client || runIds.length === 0) return;
    const tags = runIds.map(runTag);
    const admin = this.client.db('admin');
    // Only this user's own operations, which needs no extra privileges.
    const ops = await admin
      .aggregate([
        { $currentOp: { allUsers: false, idleConnections: false } },
        { $match: { $or: [{ 'command.comment': { $in: tags } }, { 'cursor.originatingCommand.comment': { $in: tags } }] } },
      ])
      .toArray();
    await Promise.all(ops.map((op) => admin.command({ killOp: 1, op: op.opid }).catch(() => undefined)));
  }

  private buildFind(coll: Collection, statement: MongoStatement, timeoutMs?: number, runId?: string) {
    const cursor = coll.find(asObject(statement.args[0]), {
      ...(statement.args[1] ? { projection: asObject(statement.args[1]) } : {}),
      ...(timeoutMs ? { maxTimeMS: timeoutMs } : {}),
      ...(runId ? { comment: runTag(runId) } : {}),
    });
    for (const call of statement.chain) {
      const [arg] = call.args;
      switch (call.name) {
        case 'sort':
          cursor.sort(asObject(arg) as any);
          break;
        case 'limit':
          cursor.limit(asNumber(arg, 'limit'));
          break;
        case 'skip':
          cursor.skip(asNumber(arg, 'skip'));
          break;
        case 'project':
        case 'projection':
          cursor.project(asObject(arg));
          break;
        case 'hint':
          cursor.hint(arg as any);
          break;
        case 'collation':
          cursor.collation(asObject(arg) as any);
          break;
        case 'maxTimeMS':
          cursor.maxTimeMS(asNumber(arg, 'maxTimeMS'));
          break;
        case 'batchSize':
          cursor.batchSize(asNumber(arg, 'batchSize'));
          break;
        case 'comment':
          cursor.comment(String(arg));
          break;
        default:
          break;
      }
    }
    return cursor;
  }

  /** Reads up to maxRows + 1 documents, so a larger result is reported as truncated. */
  private async drain(cursor: AbstractCursor<any>, options: ExecuteOptions, elapsed: () => number): Promise<QueryResult> {
    const close = () => cursor.close();
    if (options.runId) this.runs.set(options.runId, close);
    try {
      const docs: unknown[] = [];
      for await (const doc of cursor) {
        docs.push(doc);
        if (docs.length > options.maxRows) break;
      }
      return documentsToResult(docs, { maxRows: options.maxRows, elapsedMs: elapsed() });
    } finally {
      if (options.runId) this.runs.delete(options.runId);
      await cursor.close().catch(() => undefined);
    }
  }

  private async run(statement: MongoStatement, options: ExecuteOptions): Promise<QueryResult> {
    const start = performance.now();
    const elapsed = () => Math.round(performance.now() - start);
    const timeoutMs = options.readOnly ? options.timeoutMs : undefined;
    // Reads carry the run's tag so they can be cancelled; writes deliberately don't.
    const maxTime = { ...(timeoutMs ? { maxTimeMS: timeoutMs } : {}), ...(options.runId ? { comment: runTag(options.runId) } : {}) };
    const [a0, a1, a2] = statement.args;

    if (statement.collection === undefined) {
      switch (statement.method) {
        case 'getCollectionNames': {
          const names = (await this.db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name).sort();
          return valuesToResult('name', names, elapsed());
        }
        case 'listCollections':
          return this.drain(this.db.listCollections(asObject(a0)) as any, options, elapsed);
        case 'stats':
          return documentsToResult([await this.db.stats(asObject(a0) as any)], { maxRows: options.maxRows, elapsedMs: elapsed() });
        case 'createCollection':
          await this.db.createCollection(asString(a0, 'collection name'), asObject(a1) as any);
          return affectedResult(0, elapsed());
        case 'createView':
          await this.db.createCollection(asString(a0, 'view name'), {
            viewOn: asString(a1, 'source collection'),
            pipeline: asArray(a2) as any,
          });
          return affectedResult(0, elapsed());
        case 'dropDatabase':
          await this.db.dropDatabase();
          return affectedResult(0, elapsed());
        default:
          throw new Error(`Unsupported database method "${statement.method}".`);
      }
    }

    const coll = this.db.collection(statement.collection);
    switch (statement.method) {
      case 'find': {
        if (statement.chain.some((c) => c.name === 'explain')) {
          const verbosity = statement.chain.find((c) => c.name === 'explain')?.args[0];
          const plan = await this.buildFind(coll, statement, timeoutMs, options.runId).explain((verbosity as any) ?? 'queryPlanner');
          return documentsToResult([plan], { maxRows: options.maxRows, elapsedMs: elapsed() });
        }
        if (statement.chain.some((c) => c.name === 'count')) {
          return valuesToResult('count', [await coll.countDocuments(asObject(a0), maxTime)], elapsed());
        }
        return this.drain(this.buildFind(coll, statement, timeoutMs, options.runId), options, elapsed);
      }
      case 'findOne': {
        const doc = await coll.findOne(asObject(a0), { ...(a1 ? { projection: asObject(a1) } : {}), ...maxTime });
        return documentsToResult(doc ? [doc] : [], { maxRows: options.maxRows, elapsedMs: elapsed() });
      }
      case 'aggregate': {
        const cursor = coll.aggregate(asArray(a0), { ...asObject(a1), ...maxTime });
        if (statement.chain.some((c) => c.name === 'explain')) {
          return documentsToResult([await cursor.explain('queryPlanner')], { maxRows: options.maxRows, elapsedMs: elapsed() });
        }
        if (writesThroughPipeline(statement)) {
          await cursor.toArray();
          return affectedResult(0, elapsed());
        }
        return this.drain(cursor, options, elapsed);
      }
      case 'countDocuments':
      case 'count':
        return valuesToResult('count', [await coll.countDocuments(asObject(a0), { ...asObject(a1), ...maxTime })], elapsed());
      case 'estimatedDocumentCount':
        return valuesToResult('count', [await coll.estimatedDocumentCount({ ...asObject(a0), ...maxTime })], elapsed());
      case 'distinct':
        return valuesToResult(asString(a0, 'field'), await coll.distinct(asString(a0, 'field'), asObject(a1), maxTime), elapsed());
      case 'getIndexes':
        return documentsToResult(await coll.listIndexes().toArray(), { maxRows: options.maxRows, elapsedMs: elapsed() });

      case 'insertOne':
        await coll.insertOne(asObject(a0), asObject(a1));
        return affectedResult(1, elapsed());
      case 'insertMany':
        return affectedResult((await coll.insertMany(asArray(a0) as any[], asObject(a1))).insertedCount, elapsed());
      case 'updateOne':
      case 'updateMany': {
        const update = Array.isArray(a1) ? (a1 as any[]) : asObject(a1);
        const res =
          statement.method === 'updateOne'
            ? await coll.updateOne(asObject(a0), update, asObject(a2))
            : await coll.updateMany(asObject(a0), update, asObject(a2));
        return affectedResult(res.modifiedCount + res.upsertedCount, elapsed());
      }
      case 'replaceOne': {
        const res = await coll.replaceOne(asObject(a0), asObject(a1), asObject(a2));
        return affectedResult(res.modifiedCount + res.upsertedCount, elapsed());
      }
      case 'findOneAndUpdate':
      case 'findOneAndReplace':
      case 'findOneAndDelete': {
        const doc =
          statement.method === 'findOneAndUpdate'
            ? await coll.findOneAndUpdate(asObject(a0), Array.isArray(a1) ? (a1 as any[]) : asObject(a1), asObject(a2))
            : statement.method === 'findOneAndReplace'
              ? await coll.findOneAndReplace(asObject(a0), asObject(a1), asObject(a2))
              : await coll.findOneAndDelete(asObject(a0), asObject(a1));
        return documentsToResult(doc ? [doc] : [], { maxRows: options.maxRows, elapsedMs: elapsed() });
      }
      case 'deleteOne':
        return affectedResult((await coll.deleteOne(asObject(a0), asObject(a1))).deletedCount, elapsed());
      case 'deleteMany':
        return affectedResult((await coll.deleteMany(asObject(a0), asObject(a1))).deletedCount, elapsed());
      case 'bulkWrite': {
        const res = await coll.bulkWrite(asArray(a0) as any[], asObject(a1));
        return affectedResult(res.insertedCount + res.modifiedCount + res.deletedCount + res.upsertedCount, elapsed());
      }
      case 'createIndex':
        await coll.createIndex(asObject(a0) as any, asObject(a1));
        return affectedResult(0, elapsed());
      case 'createIndexes':
        await coll.createIndexes(asArray(a0) as any[], asObject(a1));
        return affectedResult(0, elapsed());
      case 'dropIndex':
        await coll.dropIndex(a0 as any);
        return affectedResult(0, elapsed());
      case 'dropIndexes':
        await coll.dropIndexes();
        return affectedResult(0, elapsed());
      case 'drop':
        await coll.drop();
        return affectedResult(0, elapsed());
      case 'renameCollection':
        await coll.rename(asString(a0, 'new name'), asObject(a1));
        return affectedResult(0, elapsed());
      default:
        throw new Error(`Unsupported collection method "${statement.method}".`);
    }
  }
}

function asObject(value: unknown): Record<string, any> {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error(`Expected a document such as { field: 1 }, got ${JSON.stringify(value)}.`);
  return value as Record<string, any>;
}

function asArray(value: unknown): any[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error('Expected an array, for example [{ $match: {} }].');
  return value;
}

function asNumber(value: unknown, what: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${what}() needs a number.`);
  return value;
}

function asString(value: unknown, what: string): string {
  if (typeof value !== 'string' || !value) throw new Error(`Expected a ${what}.`);
  return value;
}

export const mongoFactory: DriverFactory = {
  create: (profile: ConnectionProfile) => new MongoDriver(profile),
  async test(profile: ConnectionProfile) {
    const { uri, options } = clientOptions(profile, profile.password || '');
    const client = new MongoClient(uri, { ...options, serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000 });
    try {
      await client.connect();
      const db = client.db(databaseName(profile));
      await db.command({ ping: 1 });
      const info = await db.command({ buildInfo: 1 }).catch(() => undefined);
      return { success: true, message: `Connected to MongoDB: ${info?.version ?? 'OK'}` };
    } catch (err: any) {
      return { success: false, message: err.message || 'Connection failed' };
    } finally {
      await client.close().catch(() => undefined);
    }
  },
};
