import { BSON } from 'mongodb';
import type { ForeignKey, QueryResult, TableColumn } from '../../../../shared/types';

/** BSON type name of a value, as MongoDB's $type operator spells it. */
export function bsonType(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return 'array';
  if (value instanceof Date) return 'date';
  if (value instanceof RegExp) return 'regex';
  const bsontype = (value as any)?._bsontype as string | undefined;
  if (bsontype) {
    const names: Record<string, string> = {
      ObjectId: 'objectId',
      ObjectID: 'objectId',
      Decimal128: 'decimal',
      Long: 'long',
      Int32: 'int',
      Double: 'double',
      Binary: 'binData',
      Timestamp: 'timestamp',
      BSONRegExp: 'regex',
      MinKey: 'minKey',
      MaxKey: 'maxKey',
      Code: 'javascript',
      BSONSymbol: 'symbol',
    };
    return names[bsontype] ?? bsontype.toLowerCase();
  }
  switch (typeof value) {
    case 'string':
      return 'string';
    case 'boolean':
      return 'bool';
    case 'number':
      return Number.isInteger(value) ? 'int' : 'double';
    case 'bigint':
      return 'long';
    default:
      return 'object';
  }
}

/**
 * Top-level fields seen in a sample of documents. MongoDB has no fixed columns, so this is
 * a description of the sample: a field missing from some documents counts as nullable, and a
 * field holding several types lists them all ("int | string").
 */
export function inferFields(docs: Record<string, unknown>[]): TableColumn[] {
  const order: string[] = [];
  const types = new Map<string, Set<string>>();
  const present = new Map<string, number>();
  for (const doc of docs) {
    for (const [key, value] of Object.entries(doc)) {
      if (!types.has(key)) {
        types.set(key, new Set());
        order.push(key);
      }
      types.get(key)!.add(bsonType(value));
      present.set(key, (present.get(key) ?? 0) + 1);
    }
  }
  const idFirst = order.includes('_id') ? ['_id', ...order.filter((k) => k !== '_id')] : order;
  return idFirst.map((name) => {
    const seen = types.get(name)!;
    const concrete = [...seen].filter((t) => t !== 'null' && t !== 'undefined').sort();
    return {
      name,
      typeName: concrete.length === 0 ? 'null' : concrete.join(' | '),
      primaryKey: name === '_id',
      nullable: name !== '_id' && (seen.has('null') || (present.get(name) ?? 0) < docs.length),
    };
  });
}

/** A document in relaxed Extended JSON: plain values that survive IPC and keep their BSON type. */
export function toPlain(doc: unknown): any {
  return BSON.EJSON.serialize(doc as any, { relaxed: true });
}

/**
 * Documents as a grid result: one column per top-level field (in order of first appearance,
 * _id first), values in relaxed Extended JSON, and a missing field shown as null.
 */
export function documentsToResult(docs: unknown[], options: { maxRows: number; elapsedMs: number; truncated?: boolean }): QueryResult {
  const kept = docs.slice(0, options.maxRows);
  const plain: Record<string, unknown>[] = kept.map((doc) =>
    doc && typeof doc === 'object' && !Array.isArray(doc) ? (toPlain(doc) as Record<string, unknown>) : { value: toPlain(doc) }
  );
  const columns: string[] = [];
  const seen = new Set<string>();
  for (const doc of plain) {
    for (const key of Object.keys(doc)) {
      if (!seen.has(key)) {
        seen.add(key);
        columns.push(key);
      }
    }
  }
  const ordered = seen.has('_id') ? ['_id', ...columns.filter((c) => c !== '_id')] : columns;
  return {
    columns: ordered,
    rows: plain.map((doc) => ordered.map((c) => (c in doc ? (doc[c] as any) : null))),
    rowCount: plain.length,
    executionTimeMs: options.elapsedMs,
    ...(options.truncated || docs.length > options.maxRows ? { truncated: true } : {}),
  };
}

/** A list of plain values (distinct, collection names) as a one-column result. */
export function valuesToResult(column: string, values: unknown[], elapsedMs: number): QueryResult {
  return {
    columns: [column],
    rows: values.map((v) => [toPlain(v)]),
    rowCount: values.length,
    executionTimeMs: elapsedMs,
  };
}

export function affectedResult(count: number, elapsedMs: number): QueryResult {
  return { columns: ['Affected Rows'], rows: [[count]], rowCount: count, executionTimeMs: elapsedMs, isCommand: true };
}

const normalise = (name: string) => name.toLowerCase().replace(/[_\-\s]/g, '');

/** Collection names a field's base name could refer to: user → users, category → categories. */
function candidateNames(base: string): string[] {
  const b = normalise(base);
  return [b, `${b}s`, `${b}es`, b.replace(/y$/, 'ies'), b.replace(/s$/, '')];
}

/**
 * Relationships MongoDB does not declare but the data suggests: a field holding ObjectIds whose
 * name matches a collection (userId, user_id or user → users) most likely references that
 * collection's _id. Marked as inferred everywhere they are shown.
 */
export function inferReferences(fields: TableColumn[], collections: string[]): ForeignKey[] {
  const byName = new Map(collections.map((c) => [normalise(c), c]));
  const references: ForeignKey[] = [];
  for (const field of fields) {
    if (field.name === '_id' || !field.typeName.split(' | ').includes('objectId')) continue;
    const base = field.name.replace(/(_ids?|Ids?|IDs?)$/, '') || field.name;
    const target = candidateNames(base)
      .map((candidate) => byName.get(candidate))
      .find(Boolean);
    if (target) {
      references.push({ name: `${field.name} → ${target}`, column: field.name, refTable: target, refColumn: '_id', inferred: true });
    }
  }
  return references;
}
