import test from 'node:test';
import assert from 'node:assert';
import { isSealed, open, seal } from '../src/main/services/secrets.ts';

const working = {
  isAvailable: () => true,
  encrypt: (plain) => Buffer.from(plain).toString('base64'),
  decrypt: (encoded) => Buffer.from(encoded, 'base64').toString(),
};
const unavailable = { ...working, isAvailable: () => false };
const broken = { ...working, decrypt: () => { throw new Error('keychain changed'); } };

test('a sealed secret does not contain the original and opens again', () => {
  const stored = seal('hunter2', working);
  assert.ok(isSealed(stored));
  assert.ok(!stored.includes('hunter2'));
  assert.deepEqual(open(stored, working), { value: 'hunter2' });
});

test('never falls back to plain text when encryption is unavailable', () => {
  assert.equal(seal('hunter2', unavailable), undefined);
});

test('empty secrets stay empty', () => {
  assert.equal(seal('', working), undefined);
  assert.equal(seal(undefined, working), undefined);
  assert.deepEqual(open(undefined, working), {});
});

test('values from older versions are recognized for rewriting', () => {
  assert.deepEqual(open('old-plain-password', working), { value: 'old-plain-password', legacyPlaintext: true });
});

test('a secret that cannot be decrypted is kept, not lost', () => {
  const stored = seal('hunter2', working);
  assert.deepEqual(open(stored, broken), { locked: stored });
});
