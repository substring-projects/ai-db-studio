// Signs update files for the in-app updater: writes <file>.sig (base64 Ed25519) next to each.
//
//   UPDATE_SIGNING_KEY="$(cat key.pem)" node scripts/sign-update.mjs release/latest.yml ...
import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const pem = process.env.UPDATE_SIGNING_KEY;
if (!pem) {
  console.error('UPDATE_SIGNING_KEY is not set.');
  process.exit(1);
}
const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('Pass the files to sign.');
  process.exit(1);
}
const key = createPrivateKey(pem);
const publicKey = createPublicKey(key);
for (const file of files) {
  const data = readFileSync(file);
  const signature = sign(null, data, key);
  if (!verify(null, data, publicKey, signature)) throw new Error(`Signature check failed for ${file}`);
  writeFileSync(`${file}.sig`, signature.toString('base64'));
  console.log(`Signed ${file}`);
}
