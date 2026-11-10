import test from 'node:test';
import assert from 'node:assert';
import { ObjectId, Decimal128 } from 'mongodb';
import {
  COLLECTION_METHODS,
  DATABASE_METHODS,
  checkShellStrictReadOnly,
  classifyShell,
  parseShell,
  parseValue,
} from '../src/main/services/drivers/mongo/shell.ts';
import { buildMongoFilter, candidateValues } from '../src/main/services/drivers/mongo/filters.ts';
import { documentsToResult, inferFields } from '../src/main/services/drivers/mongo/documents.ts';
import {
  MONGO_COLLECTION_METHODS,
  MONGO_DATABASE_METHODS,
  collectionRef,
  deleteStatement,
  describeEjson,
  insertStatement,
  statementCollection,
  toShell,
  updateFieldStatement,
} from '../src/shared/mongoShell.ts';
import { ENGINES, engineInfo, splitConnectionString } from '../src/shared/engines.ts';
import { assessRisk } from '../src/renderer/lib/sql.ts';
import { browseQuery, dropTableStatement, tableReadDescription, truncateStatement } from '../src/renderer/lib/statements.ts';
import { formatCell } from '../src/renderer/lib/grid.ts';

test('shell statements parse into collection, method, arguments and cursor chain', () => {
  const [s] = parseShell('db.users.find({ age: { $gt: 30 } }, { name: 1 }).sort({ name: -1 }).limit(5)');
  assert.equal(s.collection, 'users');
  assert.equal(s.method, 'find');
  assert.deepEqual(s.args, [{ age: { $gt: 30 } }, { name: 1 }]);
  assert.deepEqual(s.chain.map((c) => c.name), ['sort', 'limit']);

  assert.equal(parseShell('db.getCollection("my orders").countDocuments()')[0].collection, 'my orders');
  assert.equal(parseShell('db["a-b"].find()')[0].collection, 'a-b');
  assert.equal(parseShell('db.system.profile.find()')[0].collection, 'system.profile');
  assert.equal(parseShell('db.createCollection("x")')[0].collection, undefined);
  assert.equal(parseShell('db.users.find(); db.orders.find()\ndb.items.find()').length, 3);
  assert.equal(parseShell('// just a comment').length, 0);
});

test('BSON constructors parse to their types', () => {
  const [s] = parseShell('db.u.find({ _id: ObjectId("5f1d7f0b2a8c4e3b9c1a2b3c"), at: ISODate("2024-01-01T00:00:00Z"), d: NumberDecimal("1.5") })');
  const filter = s.args[0];
  assert.ok(filter._id instanceof ObjectId);
  assert.ok(filter.at instanceof Date);
  assert.equal(filter.d._bsontype, 'Decimal128');
});

test('no JavaScript runs: code, variables and unknown methods are rejected', () => {
  for (const bad of [
    'const x = 1',
    'users.find()',
    'db.users.find({ a: process.env.HOME })',
    'db.users.find().forEach(printjson)',
    'require("fs")',
    'db.getSiblingDB("admin").dropDatabase()',
    'db.users.mapReduce()',
    'db.users.find().map(x => x)',
    'for (;;) {}',
    'db.users.find({ a: (() => 1)() })',
  ]) {
    assert.throws(() => parseShell(bad), Error, bad);
  }
  assert.throws(() => parseValue('process.exit()'), /Unsupported value/);
  assert.equal(parseValue('""'), '');
});

test('reads and writes are classified; pipelines that write are writes', () => {
  assert.deepEqual(classifyShell('db.users.find({})'), { isReadOnly: true, kind: 'SELECT', statementCount: 1 });
  assert.equal(classifyShell('db.u.insertOne({ a: 1 })').kind, 'INSERT');
  assert.equal(classifyShell('db.u.updateMany({}, { $set: { a: 1 } })').kind, 'UPDATE');
  assert.equal(classifyShell('db.u.deleteOne({ a: 1 })').kind, 'DELETE');
  assert.equal(classifyShell('db.u.drop()').kind, 'DDL');
  assert.equal(classifyShell('db.u.find(); db.u.deleteMany({})').isReadOnly, false);
  assert.equal(classifyShell('db.u.aggregate([{ $match: {} }, { $out: "copy" }])').isReadOnly, false);
  assert.equal(classifyShell('db.u.aggregate([{ $match: {} }, { $merge: { into: "copy" } }])').isReadOnly, false);
  assert.equal(classifyShell('db.u.aggregate([{ $group: { _id: "$a" } }])').isReadOnly, true);
  assert.throws(() => classifyShell('db.u.find({ a: process })'));
});

test('the AI gate allows one plain read and nothing that writes or runs code', () => {
  assert.equal(checkShellStrictReadOnly('db.u.find({ a: 1 }).limit(5)').ok, true);
  assert.equal(checkShellStrictReadOnly('db.u.aggregate([{ $match: { a: 1 } }])').ok, true);
  for (const bad of [
    'db.u.deleteMany({})',
    'db.u.find(); db.u.find()',
    'db.u.find({ $where: "this.a > 1" })',
    'db.u.aggregate([{ $lookup: { from: "a", pipeline: [{ $merge: "x" }], as: "y" } }])',
    'db.u.aggregate([{ $group: { _id: null, x: { $accumulator: {} } } }])',
    'db.u.find({ $expr: { $function: { body: "", args: [], lang: "js" } } })',
    'db.dropDatabase()',
    'not mongo',
  ]) {
    assert.equal(checkShellStrictReadOnly(bad).ok, false, bad);
  }
});

test('editor method lists match what the parser accepts', () => {
  assert.deepEqual([...MONGO_COLLECTION_METHODS].sort(), Object.keys(COLLECTION_METHODS).sort());
  assert.deepEqual(MONGO_DATABASE_METHODS.filter((m) => m !== 'getCollection').sort(), Object.keys(DATABASE_METHODS).sort());
});

test('table view filters become typed MongoDB filters', () => {
  const eq = buildMongoFilter([{ column: 'age', operator: 'EQUALS', value: '30' }], false);
  assert.deepEqual(eq.age.$in.slice(0, 2), ['30', 30]);
  assert.ok(candidateValues('5f1d7f0b2a8c4e3b9c1a2b3c').some((v) => v instanceof ObjectId));
  assert.ok(candidateValues('2024-01-02').some((v) => v instanceof Date));
  assert.ok(candidateValues('true').includes(true));

  const contains = buildMongoFilter([{ column: 'name', operator: 'CONTAINS', value: 'a.b' }], false);
  assert.deepEqual(contains.$or[0], { name: { $regex: 'a\\.b', $options: 'i' } });
  assert.equal(contains.$or[1].$expr.$regexMatch.input.$convert.input, '$name', 'numbers and ids match on their text too');
  assert.deepEqual(buildMongoFilter([{ column: 'n', operator: 'GREATER_THAN', value: '5' }], false), { n: { $gt: 5 } });
  assert.deepEqual(buildMongoFilter([{ column: 'n', operator: 'IS_NULL', value: '' }], false), { n: null });
  const any = buildMongoFilter(
    [
      { column: 'a', operator: 'IS_NOT_NULL', value: '' },
      { column: 'b', operator: 'STARTS_WITH', value: 'x' },
    ],
    true
  );
  assert.deepEqual(Object.keys(any), ['$or']);
  assert.deepEqual(buildMongoFilter([], false), {});
});

test('fields are inferred from a sample, with mixed and missing values', () => {
  const fields = inferFields([
    { _id: new ObjectId(), name: 'a', age: 1 },
    { _id: new ObjectId(), name: 'b', age: 'unknown', price: Decimal128.fromString('1.5') },
    { _id: new ObjectId(), age: null },
  ]);
  const byName = Object.fromEntries(fields.map((f) => [f.name, f]));
  assert.deepEqual(fields.map((f) => f.name), ['_id', 'name', 'age', 'price']);
  assert.equal(byName._id.typeName, 'objectId');
  assert.equal(byName._id.primaryKey, true);
  assert.equal(byName.age.typeName, 'int | string');
  assert.equal(byName.age.nullable, true);
  assert.equal(byName.name.nullable, true);
  assert.equal(byName.price.typeName, 'decimal');
});

test('documents become grid rows in relaxed Extended JSON', () => {
  const id = new ObjectId('5f1d7f0b2a8c4e3b9c1a2b3c');
  const result = documentsToResult([{ name: 'a', _id: id, at: new Date('2024-01-01T00:00:00Z') }, { _id: id, extra: [1] }], {
    maxRows: 10,
    elapsedMs: 3,
  });
  assert.deepEqual(result.columns, ['_id', 'name', 'at', 'extra']);
  assert.deepEqual(result.rows[0][0], { $oid: '5f1d7f0b2a8c4e3b9c1a2b3c' });
  assert.deepEqual(result.rows[0][2], { $date: '2024-01-01T00:00:00Z' });
  assert.equal(result.rows[1][1], null);
  assert.equal(documentsToResult([{}, {}, {}], { maxRows: 2, elapsedMs: 0 }).truncated, true);
});

test('values round-trip from the grid back to shell syntax with their types', () => {
  const values = [
    { $oid: '5f1d7f0b2a8c4e3b9c1a2b3c' },
    { $date: '2024-01-01T00:00:00Z' },
    { $numberDecimal: '9.5' },
    { $numberLong: '9007199254740993' },
    'it\'s "quoted"',
    42,
    -1.5,
    true,
    null,
    [1, { a: 'b' }],
    { 'odd key': { nested: { $oid: '5f1d7f0b2a8c4e3b9c1a2b3c' } } },
  ];
  for (const value of values) {
    const shell = toShell(value, 2);
    const parsed = parseValue(shell);
    assert.ok(parsed !== undefined, shell);
  }
  assert.ok(parseValue(toShell({ $oid: '5f1d7f0b2a8c4e3b9c1a2b3c' })) instanceof ObjectId);
  assert.ok(parseValue(toShell({ $date: '2024-01-01T00:00:00Z' })) instanceof Date);
  assert.equal(parseValue(toShell({ $numberDecimal: '9.5' }))._bsontype, 'Decimal128');
  assert.equal(parseValue(toShell({ $numberLong: '9007199254740993' })).toString(), '9007199254740993');
  assert.equal(describeEjson({ $oid: 'abc' }), "ObjectId('abc')");
  assert.equal(formatCell({ $oid: 'abc' }), "ObjectId('abc')");
  assert.equal(formatCell({ a: 1 }), '{"a":1}', 'ordinary JSON is unchanged');
});

test('generated edit statements are valid and target the document by _id', () => {
  const id = { $oid: '5f1d7f0b2a8c4e3b9c1a2b3c' };
  const update = updateFieldStatement('users', id, 'age', '31');
  assert.equal(update, 'db.users.updateOne({ _id: ObjectId("5f1d7f0b2a8c4e3b9c1a2b3c") }, { $set: { age: 31 } })');
  assert.equal(classifyShell(update).kind, 'UPDATE');
  assert.match(updateFieldStatement('users', id, 'odd field', '', true), /\$unset: \{ "odd field": "" \}/);
  assert.equal(deleteStatement('users', [id]), 'db.users.deleteOne({ _id: ObjectId("5f1d7f0b2a8c4e3b9c1a2b3c") })');
  assert.match(deleteStatement('users', [id, 7]), /deleteMany\(\{ _id: \{ \$in: \[ObjectId\("5f1d7f0b2a8c4e3b9c1a2b3c"\), 7\] \} \}\)/);
  assert.equal(insertStatement('x y', '[{}]'), 'db.getCollection("x y").insertMany([{}])');
  assert.equal(collectionRef('stats'), 'db.getCollection("stats")', 'names that clash with db methods are quoted');
  for (const s of [update, deleteStatement('users', [id, 7]), insertStatement('x y', '{ a: 1 }')]) parseShell(s);
  assert.equal(statementCollection('db.getCollection("a b").find({})'), 'a b');
});

test('connection strings lose their credentials before they are stored', () => {
  assert.deepEqual(splitConnectionString('mongodb+srv://me:p%40ss@cluster0.x.net/shop?retryWrites=true'), {
    uri: 'mongodb+srv://cluster0.x.net/shop?retryWrites=true',
    username: 'me',
    password: 'p@ss',
  });
  assert.deepEqual(splitConnectionString('mongodb://localhost:27017'), { uri: 'mongodb://localhost:27017' });
});

test('engine catalog: every engine is complete, and SQL statements are unchanged', () => {
  for (const info of Object.values(ENGINES)) {
    assert.ok(info.label && info.badge && info.defaults.port > 0, info.id);
  }
  assert.equal(engineInfo(undefined).id, 'POSTGRESQL');
  assert.equal(browseQuery('POSTGRESQL', 't', 'analytics'), 'SELECT *\nFROM "analytics"."t"\nLIMIT 100;');
  assert.equal(browseQuery('MYSQL', 't'), 'SELECT *\nFROM `t`\nLIMIT 100;');
  assert.equal(truncateStatement('POSTGRESQL', 't'), 'TRUNCATE TABLE "t";');
  assert.equal(dropTableStatement('MYSQL', 't'), 'DROP TABLE `t`;');
  assert.equal(tableReadDescription('POSTGRESQL', 't'), 'SELECT * FROM "t"');
  assert.equal(browseQuery('MONGODB', 'users'), 'db.users.find({}).limit(100)');
  assert.equal(truncateStatement('MONGODB', 'users'), 'db.users.deleteMany({})');
  assert.ok(assessRisk(truncateStatement('MONGODB', 'users')).high, 'deleting everything is flagged');
  assert.equal(dropTableStatement('MONGODB', 'users'), 'db.users.drop()');
});

test('review card warnings for MongoDB statements', () => {
  assert.equal(assessRisk('db.users.find({})').high, false);
  assert.ok(assessRisk('db.users.deleteMany({})').reasons[0].includes('every document'));
  assert.ok(assessRisk('db.users.deleteMany()').high);
  assert.equal(assessRisk('db.users.deleteMany({ a: 1 })').high, false);
  assert.ok(assessRisk('db.users.updateMany({}, { $set: { a: 1 } })').high);
  assert.ok(assessRisk('db.users.drop()').high);
  assert.ok(assessRisk('db.dropDatabase()').high);
  assert.ok(assessRisk('db.u.aggregate([{ $out: "x" }])').high);
  assert.ok(assessRisk('DROP TABLE users').high, 'SQL checks still apply');
});

import { inferReferences } from '../src/main/services/drivers/mongo/documents.ts';
import { editableCollection } from '../src/shared/mongoShell.ts';
import { buildCreateCollection, emptyCollectionSpec, validateCollectionSpec, validatorFromRules } from '../src/renderer/lib/mongoCollection.ts';

test('references are inferred from ObjectId fields named after collections', () => {
  const fields = [
    { name: '_id', typeName: 'objectId', primaryKey: true, nullable: false },
    { name: 'userId', typeName: 'objectId', primaryKey: false, nullable: false },
    { name: 'category_id', typeName: 'objectId | null', primaryKey: false, nullable: true },
    { name: 'owner', typeName: 'objectId', primaryKey: false, nullable: false },
    { name: 'productId', typeName: 'string', primaryKey: false, nullable: false },
    { name: 'teamId', typeName: 'objectId', primaryKey: false, nullable: false },
  ];
  const refs = inferReferences(fields, ['users', 'categories', 'owners', 'products']);
  assert.deepEqual(
    refs.map((r) => [r.column, r.refTable, r.refColumn, r.inferred]),
    [
      ['userId', 'users', '_id', true],
      ['category_id', 'categories', '_id', true],
      ['owner', 'owners', '_id', true],
    ]
  );
});

test('only single find() and findOne() results are editable', () => {
  assert.equal(editableCollection('db.users.find({ a: 1 }).limit(5)'), 'users');
  assert.equal(editableCollection('db.getCollection("my coll").findOne({})'), 'my coll');
  assert.equal(editableCollection('db.users.aggregate([{ $group: { _id: "$a" } }])'), null);
  assert.equal(editableCollection('db.users.find(); db.orders.find()'), null);
  assert.equal(editableCollection('db.users.countDocuments()'), null);
  assert.equal(editableCollection('SELECT * FROM users'), null);
});

test('create collection: options, validation and indexes become valid commands', () => {
  const spec = {
    ...emptyCollectionSpec(),
    name: 'orders',
    fieldRules: [
      { name: 'status', bsonType: 'string', required: true, allowed: 'new, paid' },
      { name: 'total', bsonType: 'double', required: true, allowed: '' },
      { name: 'qty', bsonType: 'int', required: false, allowed: '1, 2' },
    ],
    indexes: [
      { name: '', keys: [{ field: 'status', direction: '1' }, { field: 'createdAt', direction: '-1' }], unique: false, sparse: false, ttlSeconds: '' },
      { name: 'email_unique', keys: [{ field: 'email', direction: '1' }], unique: true, sparse: true, ttlSeconds: '' },
      { name: '', keys: [{ field: 'expiresAt', direction: '1' }], unique: false, sparse: false, ttlSeconds: '3600' },
    ],
  };
  assert.deepEqual(validateCollectionSpec(spec), []);
  const script = buildCreateCollection(spec);
  const statements = parseShell(script);
  assert.equal(statements.length, 4);
  assert.equal(statements[0].method, 'createCollection');
  const options = statements[0].args[1];
  assert.deepEqual(options.validator.$jsonSchema.required, ['status', 'total']);
  assert.deepEqual(options.validator.$jsonSchema.properties.status.enum, ['new', 'paid']);
  assert.deepEqual(options.validator.$jsonSchema.properties.qty.enum, [1, 2]);
  assert.equal(options.validationAction, 'error');
  assert.deepEqual(statements[1].args, [{ status: 1, createdAt: -1 }]);
  assert.deepEqual(statements[2].args[1], { name: 'email_unique', unique: true, sparse: true });
  assert.deepEqual(statements[3].args[1], { expireAfterSeconds: 3600 });
  assert.equal(classifyShell(script).isReadOnly, false);

  const capped = parseShell(buildCreateCollection({ ...emptyCollectionSpec(), name: 'logs', kind: 'capped', cappedSize: '1048576', cappedMax: '100' }));
  assert.deepEqual(capped[0].args[1], { capped: true, size: 1048576, max: 100 });
  const ts = parseShell(
    buildCreateCollection({ ...emptyCollectionSpec(), name: 'm', kind: 'timeseries', timeField: 'ts', metaField: 'sensor', granularity: 'minutes', expireAfterSeconds: '60' })
  );
  assert.deepEqual(ts[0].args[1], { timeseries: { timeField: 'ts', metaField: 'sensor', granularity: 'minutes' }, expireAfterSeconds: 60 });
  assert.equal(buildCreateCollection({ ...emptyCollectionSpec(), name: 'plain' }), 'db.createCollection("plain");');
  assert.equal(validatorFromRules([]), null);
});

test('create collection: invalid definitions are caught', () => {
  const errors = (patch) => validateCollectionSpec({ ...emptyCollectionSpec(), name: 'x', ...patch });
  assert.ok(errors({ name: '' })[0].includes('name'));
  assert.ok(errors({ name: 'a$b' })[0].includes('$'));
  assert.ok(errors({ name: 'system.x' })[0].includes('reserved'));
  assert.ok(errors({ kind: 'capped', cappedSize: '' })[0].includes('size'));
  assert.ok(errors({ kind: 'timeseries' })[0].includes('time field'));
  assert.ok(errors({ indexes: [{ name: '', keys: [{ field: '', direction: '1' }], unique: false, sparse: false, ttlSeconds: '' }] })[0].includes('field'));
  assert.ok(
    errors({ indexes: [{ name: '', keys: [{ field: 'a', direction: '1' }, { field: 'b', direction: '1' }], unique: false, sparse: false, ttlSeconds: '5' }] })[0].includes(
      'TTL'
    )
  );
  assert.ok(errors({ customValidator: 'not a doc' })[0].includes('validator'));
});
