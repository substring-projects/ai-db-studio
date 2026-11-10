import * as acorn from 'acorn';
import ejsonShellParser from 'ejson-shell-parser';
import type { StatementClassification } from '../../../../shared/types';
import type { ReadOnlyVerdict } from '../types';

/**
 * Parses MongoDB shell statements such as `db.users.find({ age: { $gt: 30 } }).sort({ name: 1 })`
 * without running any JavaScript. The statement is read as a syntax tree, its shape must be a
 * supported method call on `db`, and every argument is parsed by ejson-shell-parser, which only
 * accepts literal values and BSON constructors. Anything else is rejected.
 */

export interface MongoCall {
  name: string;
  args: unknown[];
}

export interface MongoStatement {
  text: string;
  /** Undefined for database-level methods such as db.createCollection(). */
  collection?: string;
  method: string;
  args: unknown[];
  /** Cursor methods chained after the call: sort, limit, skip… */
  chain: MongoCall[];
}

type Kind = StatementClassification['kind'];

// A CommonJS module: under Node's ES module loader the function sits on .default.
const parseEjson: typeof ejsonShellParser = (ejsonShellParser as any).default ?? ejsonShellParser;

/** Methods on a collection and what they do. */
export const COLLECTION_METHODS: Record<string, { read: boolean; kind: Kind }> = {
  find: { read: true, kind: 'SELECT' },
  findOne: { read: true, kind: 'SELECT' },
  aggregate: { read: true, kind: 'SELECT' },
  countDocuments: { read: true, kind: 'SELECT' },
  estimatedDocumentCount: { read: true, kind: 'SELECT' },
  count: { read: true, kind: 'SELECT' },
  distinct: { read: true, kind: 'SELECT' },
  getIndexes: { read: true, kind: 'SELECT' },
  insertOne: { read: false, kind: 'INSERT' },
  insertMany: { read: false, kind: 'INSERT' },
  updateOne: { read: false, kind: 'UPDATE' },
  updateMany: { read: false, kind: 'UPDATE' },
  replaceOne: { read: false, kind: 'UPDATE' },
  findOneAndUpdate: { read: false, kind: 'UPDATE' },
  findOneAndReplace: { read: false, kind: 'UPDATE' },
  deleteOne: { read: false, kind: 'DELETE' },
  deleteMany: { read: false, kind: 'DELETE' },
  findOneAndDelete: { read: false, kind: 'DELETE' },
  bulkWrite: { read: false, kind: 'OTHER' },
  createIndex: { read: false, kind: 'DDL' },
  createIndexes: { read: false, kind: 'DDL' },
  dropIndex: { read: false, kind: 'DDL' },
  dropIndexes: { read: false, kind: 'DDL' },
  drop: { read: false, kind: 'DDL' },
  renameCollection: { read: false, kind: 'DDL' },
};

/** Methods on the database itself. */
export const DATABASE_METHODS: Record<string, { read: boolean; kind: Kind }> = {
  getCollectionNames: { read: true, kind: 'SELECT' },
  listCollections: { read: true, kind: 'SELECT' },
  stats: { read: true, kind: 'SELECT' },
  createCollection: { read: false, kind: 'DDL' },
  createView: { read: false, kind: 'DDL' },
  dropDatabase: { read: false, kind: 'DDL' },
};

/** Cursor methods allowed after find() and aggregate(). */
const CURSOR_METHODS: Record<string, string[]> = {
  find: ['sort', 'limit', 'skip', 'project', 'projection', 'hint', 'collation', 'maxTimeMS', 'batchSize', 'comment', 'toArray', 'pretty', 'count', 'explain'],
  aggregate: ['toArray', 'pretty', 'explain', 'maxTimeMS', 'batchSize', 'comment'],
};

/** Operators that write data or run server-side JavaScript; never allowed without a person. */
const UNSAFE_OPERATORS = new Set(['$out', '$merge', '$where', '$function', '$accumulator']);
/** Aggregation stages that write their output to a collection. */
const WRITE_STAGES = new Set(['$out', '$merge']);

/** Parses one argument: literals and BSON constructors only. */
export function parseValue(text: string): unknown {
  const source = text.trim();
  if (/^(['"])\1$/.test(source)) return '';
  let value: unknown;
  try {
    // Loose mode also allows comments and Date/Math helpers; it still evaluates no other code.
    value = parseEjson(source, { mode: 'loose' as any });
  } catch (err: any) {
    throw new Error(`Invalid value ${preview(source)}: ${err.message}`);
  }
  // The parser signals input it refuses (functions, variables, other calls) with an empty string.
  if (value === '') throw new Error(`Unsupported value ${preview(source)}. Use literal values such as { field: 1 } or ObjectId("…").`);
  return value;
}

const preview = (text: string) => (text.length > 60 ? `${text.slice(0, 57)}…` : text);

function memberName(node: any, source: string): string {
  if (!node.computed && node.property.type === 'Identifier') return node.property.name;
  if (node.computed && node.property.type === 'Literal' && typeof node.property.value === 'string') return node.property.value;
  throw new Error(`Unsupported syntax: ${preview(source.slice(node.start, node.end))}`);
}

/** Collection name for `db.name`, `db.a.b` or `db["name"]`, or undefined when the node is `db` itself. */
function collectionPath(node: any, source: string): string | undefined {
  if (node.type === 'Identifier') {
    if (node.name !== 'db') throw new Error(`Statements must start with db, for example db.users.find({}). Found "${node.name}".`);
    return undefined;
  }
  if (node.type === 'MemberExpression') {
    const parent = collectionPath(node.object, source);
    const name = memberName(node, source);
    return parent ? `${parent}.${name}` : name;
  }
  throw new Error(`Unsupported syntax: ${preview(source.slice(node.start, node.end))}`);
}

function toStatement(expression: any, source: string): MongoStatement {
  const text = source.slice(expression.start, expression.end);
  const calls: MongoCall[] = [];
  let node = expression;
  while (node.type === 'CallExpression') {
    if (node.callee.type !== 'MemberExpression') {
      throw new Error(`Unsupported syntax: ${preview(text)}`);
    }
    const args = node.arguments.map((arg: any) => {
      if (arg.type === 'SpreadElement') throw new Error('Spread arguments are not supported.');
      return parseValue(source.slice(arg.start, arg.end));
    });
    calls.unshift({ name: memberName(node.callee, source), args });
    node = node.callee.object;
  }
  if (calls.length === 0) throw new Error(`Not a MongoDB command: ${preview(text)}. Try db.collection.find({}).`);

  let collection = collectionPath(node, source);
  if (collection === undefined && calls[0].name === 'getCollection') {
    const name = calls[0].args[0];
    if (typeof name !== 'string' || !name) throw new Error('db.getCollection() needs a collection name.');
    collection = name;
    calls.shift();
    if (calls.length === 0) throw new Error(`Call a method on the collection, for example db.getCollection("${name}").find({}).`);
  }

  const [first, ...chain] = calls;
  const methods = collection === undefined ? DATABASE_METHODS : COLLECTION_METHODS;
  if (!methods[first.name]) {
    const scope = collection === undefined ? 'database' : 'collection';
    throw new Error(
      `Unsupported ${scope} method "${first.name}". Supported: ${Object.keys(methods).join(', ')}.`
    );
  }
  const allowedChain = CURSOR_METHODS[first.name] ?? ['pretty', 'toArray'];
  for (const call of chain) {
    if (!allowedChain.includes(call.name)) {
      throw new Error(`".${call.name}()" can't follow ${first.name}().${allowedChain.length ? ` Allowed: ${allowedChain.join(', ')}.` : ''}`);
    }
  }
  return { text, collection, method: first.name, args: first.args, chain };
}

/** Parses a script of one or more statements separated by semicolons or new lines. */
export function parseShell(source: string): MongoStatement[] {
  let program: any;
  try {
    program = acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'script' });
  } catch (err: any) {
    throw new Error(`Syntax error: ${err.message.replace(/\s*\(\d+:\d+\)$/, '')}`);
  }
  const statements: MongoStatement[] = [];
  for (const node of program.body) {
    if (node.type === 'EmptyStatement') continue;
    if (node.type !== 'ExpressionStatement') {
      throw new Error('Only MongoDB commands are supported, such as db.users.find({}). Variables, functions and loops are not.');
    }
    statements.push(toStatement(node.expression, source));
  }
  return statements;
}

/** Whether any key anywhere in the value is one of the given operators. */
function findOperator(value: unknown, operators: Set<string>, seen = new Set<unknown>()): string | undefined {
  if (!value || typeof value !== 'object' || seen.has(value)) return undefined;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const hit = findOperator(item, operators, seen);
      if (hit) return hit;
    }
    return undefined;
  }
  // BSON values (ObjectId, Decimal128…) carry no operators.
  if ((value as any)._bsontype || value instanceof Date || value instanceof RegExp) return undefined;
  for (const [key, inner] of Object.entries(value)) {
    if (operators.has(key)) return key;
    const hit = findOperator(inner, operators, seen);
    if (hit) return hit;
  }
  return undefined;
}

/** An aggregate() whose pipeline writes to a collection is a write. */
export function writesThroughPipeline(statement: MongoStatement): boolean {
  return statement.method === 'aggregate' && Boolean(findOperator(statement.args[0], WRITE_STAGES));
}

function statementInfo(statement: MongoStatement): { read: boolean; kind: Kind } {
  const info = (statement.collection === undefined ? DATABASE_METHODS : COLLECTION_METHODS)[statement.method];
  if (writesThroughPipeline(statement)) return { read: false, kind: 'INSERT' };
  return info;
}

/** Same shape as SQL classification; throws when the script is not valid. */
export function classifyShell(source: string): StatementClassification {
  const statements = parseShell(source);
  if (statements.length === 0) return { isReadOnly: true, kind: 'OTHER', statementCount: 0 };
  const infos = statements.map(statementInfo);
  const firstWrite = infos.find((i) => !i.read);
  return {
    isReadOnly: !firstWrite,
    kind: firstWrite?.kind ?? infos[0].kind,
    statementCount: statements.length,
  };
}

/** The gate for statements no person wrote: one plain read, nothing that writes or runs code. */
export function checkShellStrictReadOnly(source: string): ReadOnlyVerdict {
  let statements: MongoStatement[];
  try {
    statements = parseShell(source);
  } catch (err: any) {
    return { ok: false, reason: err.message };
  }
  if (statements.length !== 1) return { ok: false, reason: 'Exactly one statement is allowed.' };
  const [statement] = statements;
  if (!statementInfo(statement).read) return { ok: false, reason: `${statement.method}() changes data.` };
  const unsafe = findOperator([statement.args, statement.chain.map((c) => c.args)], UNSAFE_OPERATORS);
  if (unsafe) return { ok: false, reason: `${unsafe} is not allowed.` };
  return { ok: true };
}
