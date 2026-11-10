import { collectionRef } from '../../shared/mongoShell.ts';

/** BSON types offered for validation rules, in $jsonSchema spelling. */
export const BSON_TYPES = ['string', 'int', 'long', 'double', 'decimal', 'bool', 'date', 'objectId', 'object', 'array', 'binData', 'null'] as const;
export type BsonTypeName = (typeof BSON_TYPES)[number];

export type IndexDirection = '1' | '-1' | 'text' | '2dsphere' | 'hashed';

export interface IndexKeySpec {
  field: string;
  direction: IndexDirection;
}

export interface CollectionIndexSpec {
  name: string;
  keys: IndexKeySpec[];
  unique: boolean;
  sparse: boolean;
  /** Documents expire this many seconds after the date in the (single) indexed field. Empty for none. */
  ttlSeconds: string;
}

export interface FieldRule {
  name: string;
  bsonType: BsonTypeName;
  required: boolean;
  /** Optional allowed values, comma separated. */
  allowed: string;
}

export interface CollectionSpec {
  name: string;
  kind: 'standard' | 'capped' | 'timeseries';
  /** Capped: size in bytes and an optional document limit. */
  cappedSize: string;
  cappedMax: string;
  /** Time series. */
  timeField: string;
  metaField: string;
  granularity: '' | 'seconds' | 'minutes' | 'hours';
  expireAfterSeconds: string;
  /** Validation built from field rules, or written by hand in shell syntax (takes precedence). */
  fieldRules: FieldRule[];
  customValidator: string;
  validationLevel: 'strict' | 'moderate';
  validationAction: 'error' | 'warn';
  indexes: CollectionIndexSpec[];
}

export const emptyCollectionSpec = (): CollectionSpec => ({
  name: '',
  kind: 'standard',
  cappedSize: '',
  cappedMax: '',
  timeField: '',
  metaField: '',
  granularity: '',
  expireAfterSeconds: '',
  fieldRules: [],
  customValidator: '',
  validationLevel: 'strict',
  validationAction: 'error',
  indexes: [],
});

const str = (value: string) => JSON.stringify(value);
const key = (name: string) => (/^[A-Za-z_$][\w$]*$/.test(name) ? name : str(name));
const isWhole = (text: string) => /^\d+$/.test(text.trim());

/** Literal for an allowed value: numbers and booleans as such when the type expects them. */
function allowedLiteral(value: string, type: BsonTypeName): string {
  const v = value.trim();
  if (['int', 'long', 'double', 'decimal'].includes(type) && /^-?\d+(\.\d+)?$/.test(v)) return v;
  if (type === 'bool' && /^(true|false)$/i.test(v)) return v.toLowerCase();
  return str(v.replace(/^["']|["']$/g, ''));
}

/** A $jsonSchema validator from simple field rules. */
export function validatorFromRules(rules: FieldRule[]): string | null {
  const used = rules.filter((r) => r.name.trim());
  if (used.length === 0) return null;
  const required = used.filter((r) => r.required).map((r) => str(r.name.trim()));
  const properties = used.map((r) => {
    const parts = [`bsonType: ${str(r.bsonType)}`];
    const allowed = r.allowed
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
    if (allowed.length > 0) parts.push(`enum: [${allowed.map((v) => allowedLiteral(v, r.bsonType)).join(', ')}]`);
    return `      ${key(r.name.trim())}: { ${parts.join(', ')} }`;
  });
  return [
    '{',
    '  $jsonSchema: {',
    '    bsonType: "object",',
    ...(required.length ? [`    required: [${required.join(', ')}],`] : []),
    '    properties: {',
    properties.join(',\n'),
    '    }',
    '  }',
    '}',
  ].join('\n');
}

/** Problems that would make createCollection fail or do something unintended. */
export function validateCollectionSpec(spec: CollectionSpec): string[] {
  const errors: string[] = [];
  const name = spec.name.trim();
  if (!name) errors.push('Enter a collection name.');
  else {
    if (name.includes('$')) errors.push('Collection names cannot contain $.');
    if (name.startsWith('system.')) errors.push('Names starting with system. are reserved.');
    if (/\0/.test(name)) errors.push('Collection names cannot contain the null character.');
  }
  if (spec.kind === 'capped') {
    if (!isWhole(spec.cappedSize) || Number(spec.cappedSize) <= 0) errors.push('A capped collection needs a maximum size in bytes.');
    if (spec.cappedMax.trim() && !isWhole(spec.cappedMax)) errors.push('Maximum documents must be a whole number.');
  }
  if (spec.kind === 'timeseries') {
    if (!spec.timeField.trim()) errors.push('A time series collection needs a time field.');
    if (spec.metaField.trim() && spec.metaField.trim() === spec.timeField.trim()) errors.push('The meta field must differ from the time field.');
    if (spec.expireAfterSeconds.trim() && !isWhole(spec.expireAfterSeconds)) errors.push('Expire after must be a whole number of seconds.');
  }
  const ruleNames = new Set<string>();
  for (const rule of spec.fieldRules) {
    const n = rule.name.trim();
    if (!n) continue;
    if (ruleNames.has(n)) errors.push(`Validation rule for “${n}” is defined twice.`);
    ruleNames.add(n);
  }
  if (spec.customValidator.trim() && !/^\{[\s\S]*\}$/.test(spec.customValidator.trim())) {
    errors.push('A custom validator must be a document { … }.');
  }
  spec.indexes.forEach((ix, i) => {
    const label = ix.name.trim() || `Index ${i + 1}`;
    const fields = ix.keys.filter((k) => k.field.trim());
    if (fields.length === 0) errors.push(`${label} needs at least one field.`);
    if (ix.ttlSeconds.trim()) {
      if (!isWhole(ix.ttlSeconds)) errors.push(`${label}: expire after must be a whole number of seconds.`);
      if (fields.length !== 1) errors.push(`${label}: a TTL index must have exactly one field.`);
    }
    if (ix.unique && fields.some((k) => k.direction === 'hashed')) errors.push(`${label}: hashed indexes cannot be unique.`);
  });
  return [...new Set(errors)];
}

function optionsDocument(spec: CollectionSpec): string | null {
  const lines: string[] = [];
  if (spec.kind === 'capped') {
    lines.push('  capped: true', `  size: ${Number(spec.cappedSize)}`);
    if (spec.cappedMax.trim()) lines.push(`  max: ${Number(spec.cappedMax)}`);
  }
  if (spec.kind === 'timeseries') {
    const ts = [`timeField: ${str(spec.timeField.trim())}`];
    if (spec.metaField.trim()) ts.push(`metaField: ${str(spec.metaField.trim())}`);
    if (spec.granularity) ts.push(`granularity: ${str(spec.granularity)}`);
    lines.push(`  timeseries: { ${ts.join(', ')} }`);
    if (spec.expireAfterSeconds.trim()) lines.push(`  expireAfterSeconds: ${Number(spec.expireAfterSeconds)}`);
  }
  const validator = spec.customValidator.trim() || validatorFromRules(spec.fieldRules);
  if (validator) {
    lines.push(`  validator: ${validator.replace(/\n/g, '\n  ')}`);
    lines.push(`  validationLevel: ${str(spec.validationLevel)}`, `  validationAction: ${str(spec.validationAction)}`);
  }
  return lines.length ? `{\n${lines.join(',\n')}\n}` : null;
}

function indexStatement(collection: string, ix: CollectionIndexSpec): string {
  const keys = ix.keys
    .filter((k) => k.field.trim())
    .map((k) => `${key(k.field.trim())}: ${k.direction === '1' || k.direction === '-1' ? k.direction : str(k.direction)}`);
  const options: string[] = [];
  if (ix.name.trim()) options.push(`name: ${str(ix.name.trim())}`);
  if (ix.unique) options.push('unique: true');
  if (ix.sparse) options.push('sparse: true');
  if (ix.ttlSeconds.trim()) options.push(`expireAfterSeconds: ${Number(ix.ttlSeconds)}`);
  return `${collectionRef(collection)}.createIndex({ ${keys.join(', ')} }${options.length ? `, { ${options.join(', ')} }` : ''})`;
}

/** The statements that create the collection and its indexes, one per line group. */
export function buildCreateCollection(spec: CollectionSpec): string {
  const name = spec.name.trim();
  const options = optionsDocument(spec);
  const statements = [`db.createCollection(${str(name)}${options ? `, ${options}` : ''})`];
  for (const ix of spec.indexes) statements.push(indexStatement(name, ix));
  return statements.join(';\n') + ';';
}
