// Creates the Ed25519 key pair that signs update files.
//
//   node scripts/update-keygen.mjs [path]      (default: ~/.ai-db-studio/update-signing-key.pem)
//
// Keep the private key out of the repository. Store its contents as the repository secret
// UPDATE_SIGNING_KEY and paste the printed public key into src/main/updateKey.ts.
// A new key pair means apps already installed can no longer verify updates, so do this once.
import { generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const target = process.argv[2] ?? path.join(homedir(), '.ai-db-studio', 'update-signing-key.pem');
if (existsSync(target)) {
  console.error(`${target} already exists. Refusing to overwrite a signing key.`);
  process.exit(1);
}
const { privateKey, publicKey } = generateKeyPairSync('ed25519');
mkdirSync(path.dirname(target), { recursive: true });
writeFileSync(target, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
console.log(`Private key written to ${target}\n`);
console.log('Public key for src/main/updateKey.ts:\n');
console.log(publicKey.export({ type: 'spki', format: 'pem' }));
