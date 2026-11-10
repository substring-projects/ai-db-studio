/**
 * Writes MongoDB shell syntax from values in relaxed Extended JSON, the form documents take
 * on their way to the interface: an ObjectId arrives as { $oid: "…" } and is written back
 * as ObjectId("…"), so edits keep each value's BSON type.
 */

const IDENT = /^[A-Za-z_$][\w$]*$/;

type Plain = null | boolean | number | string | Plain[] | { [key: string]: Plain };

/** The single-key wrappers relaxed Extended JSON uses for BSON types. */
export function isEjsonWrapper(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return (
    keys.length === 1 &&
    [
      '$oid',
      '$date',
      '$numberDecimal',
      '$numberLong',
      '$numberInt',
      '$numberDouble',
      '$binary',
      '$uuid',
      '$regularExpression',
      '$timestamp',
      '$minKey',
      '$maxKey',
      '$symbol',
      '$code',
    ].includes(keys[0])
  );
}

/** Short display text for a BSON wrapper, or undefined when the value is not one. */
export function describeEjson(value: unknown): string | undefined {
  if (!isEjsonWrapper(value)) return undefined;
  const [key, inner] = Object.entries(value)[0] as [string, any];
  switch (key) {
    case '$oid':
      return `ObjectId('${inner}')`;
    case '$date':
      return typeof inner === 'string' ? inner : typeof inner?.$numberLong === 'string' ? new Date(Number(inner.$numberLong)).toISOString() : String(inner);
    case '$numberDecimal':
    case '$numberLong':
    case '$numberInt':
    case '$numberDouble':
      return String(inner);
    case '$uuid':
      return `UUID('${inner}')`;
    case '$binary':
      return `Binary(${inner?.subType ?? '00'}, '${inner?.base64 ?? ''}')`;
    case '$regularExpression':
      return `/${inner?.pattern ?? ''}/${inner?.options ?? ''}`;
    case '$timestamp':
      return `Timestamp(${inner?.t ?? 0}, ${inner?.i ?? 0})`;
    default:
      return undefined;
  }
}

const str = (value: string) => JSON.stringify(value);

/** Shell literal for a value in relaxed Extended JSON. `indent` pretty-prints objects. */
export function toShell(value: unknown, indent = 0, depth = 0): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : value > 0 ? 'Infinity' : value < 0 ? '-Infinity' : 'NaN';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return str(value);
  if (typeof value === 'bigint') return `NumberLong(${str(String(value))})`;

  const pad = (level: number) => (indent ? `\n${' '.repeat(indent * level)}` : '');
  const sep = indent ? ',' : ', ';

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const items = value.map((v) => `${pad(depth + 1)}${toShell(v, indent, depth + 1)}`);
    return `[${items.join(sep)}${pad(depth)}]`;
  }

  if (isEjsonWrapper(value)) {
    const [key, inner] = Object.entries(value)[0] as [string, any];
    switch (key) {
      case '$oid':
        return `ObjectId(${str(String(inner))})`;
      case '$date':
        if (typeof inner === 'string') return `ISODate(${str(inner)})`;
        if (inner && typeof inner.$numberLong === 'string') return `new Date(${Number(inner.$numberLong)})`;
        return `new Date(${Number(inner)})`;
      case '$numberDecimal':
        return `NumberDecimal(${str(String(inner))})`;
      case '$numberLong':
        return `NumberLong(${str(String(inner))})`;
      case '$numberInt':
        return `NumberInt(${str(String(inner))})`;
      case '$numberDouble':
        return inner === 'NaN' ? 'NaN' : inner === 'Infinity' ? 'Infinity' : inner === '-Infinity' ? '-Infinity' : String(Number(inner));
      case '$uuid':
        return `UUID(${str(String(inner))})`;
      case '$binary':
        return `BinData(${Number.parseInt(String(inner?.subType ?? '0'), 16) || 0}, ${str(String(inner?.base64 ?? ''))})`;
      case '$regularExpression':
        return `RegExp(${str(String(inner?.pattern ?? ''))}, ${str(String(inner?.options ?? ''))})`;
      case '$timestamp':
        return `Timestamp(${Number(inner?.t ?? 0)}, ${Number(inner?.i ?? 0)})`;
      case '$minKey':
        return 'MinKey()';
      case '$maxKey':
        return 'MaxKey()';
      default:
        break;
    }
  }

  const entries = Object.entries(value as Record<string, Plain>);
  if (entries.length === 0) return '{}';
  const items = entries.map(([k, v]) => `${pad(depth + 1)}${IDENT.test(k) ? k : str(k)}: ${toShell(v, indent, depth + 1)}`);
  return indent ? `{${items.join(sep)}${pad(depth)}}` : `{ ${items.join(sep)} }`;
}

/** `db.users`, or `db.getCollection("odd name")` when the name is not a plain identifier. */
export function collectionRef(name: string): string {
  return IDENT.test(name) && !['getCollection', 'getCollectionNames', 'createCollection', 'stats'].includes(name)
    ? `db.${name}`
    : `db.getCollection(${str(name)})`;
}

/** Field path in an update document, quoted when needed. */
const fieldKey = (field: string) => (IDENT.test(field) ? field : str(field));

export function browseStatement(collection: string, limit = 100): string {
  return `${collectionRef(collection)}.find({}).limit(${limit})`;
}

export function dropStatement(collection: string): string {
  return `${collectionRef(collection)}.drop()`;
}

/** Sets one field, or removes it with `$unset` when `remove` is true. */
export function updateFieldStatement(collection: string, id: unknown, field: string, valueShell: string, remove = false): string {
  const update = remove ? `{ $unset: { ${fieldKey(field)}: "" } }` : `{ $set: { ${fieldKey(field)}: ${valueShell} } }`;
  return `${collectionRef(collection)}.updateOne({ _id: ${toShell(id)} }, ${update})`;
}

export function insertStatement(collection: string, documentShell: string): string {
  const body = documentShell.trim();
  return body.startsWith('[')
    ? `${collectionRef(collection)}.insertMany(${body})`
    : `${collectionRef(collection)}.insertOne(${body})`;
}

export function replaceStatement(collection: string, id: unknown, documentShell: string): string {
  return `${collectionRef(collection)}.replaceOne({ _id: ${toShell(id)} }, ${documentShell.trim()})`;
}

export function deleteStatement(collection: string, ids: unknown[]): string {
  return ids.length === 1
    ? `${collectionRef(collection)}.deleteOne({ _id: ${toShell(ids[0])} })`
    : `${collectionRef(collection)}.deleteMany({ _id: { $in: [${ids.map((id) => toShell(id)).join(', ')}] } })`;
}

/** Collection a shell statement works on, for statements that start with one. */
export function statementCollection(text: string): string | null {
  const getCollection = text.match(/^\s*db\.getCollection\(\s*(["'])((?:\\.|(?!\1).)*)\1\s*\)/);
  if (getCollection) return getCollection[2];
  const dotted = text.match(/^\s*db\.([A-Za-z_$][\w$]*)\.(?:find|findOne|aggregate)\s*\(/);
  return dotted ? dotted[1] : null;
}

/** Methods the shell parser accepts, for editor completions. Kept equal to the parser's lists by a test. */
export const MONGO_COLLECTION_METHODS = [
  'find', 'findOne', 'aggregate', 'countDocuments', 'estimatedDocumentCount', 'count', 'distinct', 'getIndexes',
  'insertOne', 'insertMany', 'updateOne', 'updateMany', 'replaceOne', 'findOneAndUpdate', 'findOneAndReplace',
  'deleteOne', 'deleteMany', 'findOneAndDelete', 'bulkWrite', 'createIndex', 'createIndexes', 'dropIndex',
  'dropIndexes', 'drop', 'renameCollection',
];
export const MONGO_DATABASE_METHODS = ['getCollection', 'getCollectionNames', 'listCollections', 'stats', 'createCollection', 'createView', 'dropDatabase'];
export const MONGO_CURSOR_METHODS = ['sort', 'limit', 'skip', 'project', 'hint', 'collation', 'maxTimeMS', 'batchSize', 'comment', 'toArray', 'pretty', 'count', 'explain'];
export const MONGO_OPERATORS = [
  '$eq', '$ne', '$gt', '$gte', '$lt', '$lte', '$in', '$nin', '$and', '$or', '$nor', '$not', '$exists', '$type', '$regex',
  '$options', '$elemMatch', '$size', '$all', '$expr', '$text', '$search', '$set', '$unset', '$inc', '$push', '$pull',
  '$addToSet', '$pop', '$rename', '$currentDate', '$min', '$max', '$mul', '$match', '$group', '$project', '$sort',
  '$limit', '$skip', '$unwind', '$lookup', '$addFields', '$count', '$facet', '$replaceRoot', '$sum', '$avg', '$first',
  '$last', '$push', '$dateToString', '$toString', '$concat', '$cond', '$ifNull',
];

/**
 * Collection whose documents a query returns unchanged, so its results can be edited by _id:
 * a single find() or findOne(). Aggregations are excluded because their output can be reshaped.
 */
export function editableCollection(text: string): string | null {
  const code = text.trim().replace(/;\s*$/, '');
  if ((code.match(/(^|[;\n])\s*db\./g) ?? []).length !== 1) return null;
  const getCollection = code.match(/^db\.getCollection\(\s*(["'])((?:\\.|(?!\1).)*)\1\s*\)\.(find|findOne)\s*\(/);
  if (getCollection) return getCollection[2];
  const dotted = code.match(/^db\.([A-Za-z_$][\w$]*)\.(find|findOne)\s*\(/);
  return dotted ? dotted[1] : null;
}
