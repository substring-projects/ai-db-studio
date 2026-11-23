import test from 'node:test';
import assert from 'node:assert';
import { generateKeyPairSync, sign, verify } from 'node:crypto';
import { compareVersions, parseUpdateInfo, pickUpdateFile, updateFileName } from '../src/shared/update.ts';

const MAC_YML = `version: 0.4.0
files:
  - url: AI-DB-Studio-0.4.0-mac-universal.zip
    sha512: aaa==
    size: 300
  - url: AI-DB-Studio-0.4.0-mac-arm64.zip
    sha512: bbb==
    size: 200
  - url: AI-DB-Studio-0.4.0-mac-x64.zip
    sha512: ccc==
    size: 210
path: AI-DB-Studio-0.4.0-mac-universal.zip
sha512: aaa==
releaseDate: '2026-11-23T10:00:00.000Z'
`;

const WIN_YML = `version: 0.4.0
files:
  - url: AI-DB-Studio-Setup-0.4.0-x64.exe
    sha512: ddd==
    size: 100
path: AI-DB-Studio-Setup-0.4.0-x64.exe
sha512: ddd==
releaseDate: '2026-11-23T10:00:00.000Z'
`;

test('update files are parsed', () => {
  const info = parseUpdateInfo(MAC_YML);
  assert.equal(info.version, '0.4.0');
  assert.equal(info.releaseDate, '2026-11-23T10:00:00.000Z');
  assert.equal(info.files.length, 3);
  assert.deepEqual(info.files[1], { url: 'AI-DB-Studio-0.4.0-mac-arm64.zip', sha512: 'bbb==', size: 200 });
  assert.equal(parseUpdateInfo(WIN_YML.replace(/\n/g, '\r\n')).files[0].url, 'AI-DB-Studio-Setup-0.4.0-x64.exe');
  // Old-style files with only top-level path and sha512.
  assert.deepEqual(parseUpdateInfo('version: 1.0.0\npath: a.exe\nsha512: x\n').files, [{ url: 'a.exe', sha512: 'x' }]);
  assert.throws(() => parseUpdateInfo('files:\n'), /version/);
  assert.throws(() => parseUpdateInfo('version: 1.0.0\n'), /no downloads/);
});

test('versions compare in semantic order', () => {
  assert.equal(compareVersions('0.4.0', '0.3.0'), 1);
  assert.equal(compareVersions('0.3.0', '0.3.0'), 0);
  assert.equal(compareVersions('0.10.0', '0.9.9'), 1);
  assert.equal(compareVersions('v1.0.0', '1.0.0'), 0);
  assert.equal(compareVersions('1.0.0-beta.1', '1.0.0'), -1);
  assert.equal(compareVersions('1.0.0', '1.0.0-beta.1'), 1);
});

test('the download matches the platform and arch', () => {
  const mac = parseUpdateInfo(MAC_YML);
  assert.equal(pickUpdateFile(mac, 'darwin', 'arm64').url, 'AI-DB-Studio-0.4.0-mac-arm64.zip');
  assert.equal(pickUpdateFile(mac, 'darwin', 'x64').url, 'AI-DB-Studio-0.4.0-mac-x64.zip');
  const universalOnly = { ...mac, files: [mac.files[0]] };
  assert.equal(pickUpdateFile(universalOnly, 'darwin', 'arm64').url, 'AI-DB-Studio-0.4.0-mac-universal.zip');
  assert.equal(pickUpdateFile(parseUpdateInfo(WIN_YML), 'win32', 'x64').url, 'AI-DB-Studio-Setup-0.4.0-x64.exe');
  assert.equal(pickUpdateFile(mac, 'linux', 'x64'), null);
  assert.equal(updateFileName('darwin'), 'latest-mac.yml');
  assert.equal(updateFileName('win32'), 'latest.yml');
  assert.equal(updateFileName('linux'), null);
});

test('signatures from the sign script verify, and edits break them', async () => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const signature = sign(null, Buffer.from(MAC_YML), privateKey);
  assert.ok(verify(null, Buffer.from(MAC_YML), publicKey, signature));
  assert.ok(!verify(null, Buffer.from(MAC_YML.replace('bbb==', 'evil==')), publicKey, signature));
});
