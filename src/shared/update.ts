/**
 * Update metadata shared by the main process and tests.
 *
 * Releases carry electron-builder's update files (latest.yml for Windows, latest-mac.yml for
 * macOS). The release workflow signs each one, and the app checks that signature before it trusts
 * the version, file names or checksums inside.
 */

export const UPDATE_REPO = 'substring-projects/ai-db-studio';
export const RELEASES_URL = `https://github.com/${UPDATE_REPO}/releases`;

export interface UpdateFile {
  url: string;
  /** Base64 SHA-512 of the file, as electron-builder writes it. */
  sha512: string;
  size?: number;
}

export interface UpdateInfo {
  version: string;
  releaseDate?: string;
  files: UpdateFile[];
}

/** What the renderer is told about updates. */
export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking'; manual: boolean }
  | { state: 'up-to-date'; version: string; manual: boolean }
  | {
      state: 'available';
      version: string;
      current: string;
      notes: string;
      /** False when this copy cannot replace itself, e.g. the portable build or a DMG that was never copied to Applications. */
      canInstall: boolean;
      reason?: string;
      /** The person chose to skip this version; the launch check stays quiet about it. */
      skipped: boolean;
      manual: boolean;
    }
  | { state: 'downloading'; version: string; notes: string; progress: number | null }
  | { state: 'ready'; version: string; notes: string }
  | { state: 'error'; message: string; manual: boolean };

/** Shown once after an update has installed. */
export interface WhatsNew {
  version: string;
  notes: string;
}

const unquote = (value: string) => {
  const v = value.trim();
  if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) return v.slice(1, -1);
  return v;
};

/**
 * Reads electron-builder's latest*.yml. The format is fixed and small, so this handles exactly
 * it (top-level scalars plus a `files` list of flat mappings) rather than pulling in a YAML parser.
 */
export function parseUpdateInfo(text: string): UpdateInfo {
  const top: Record<string, string> = {};
  const files: Partial<UpdateFile>[] = [];
  let inFiles = false;

  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim() || raw.trimStart().startsWith('#')) continue;
    const indented = /^\s/.test(raw);
    if (!indented) {
      const m = /^([A-Za-z0-9_]+):\s*(.*)$/.exec(raw);
      if (!m) continue;
      inFiles = m[1] === 'files' && m[2] === '';
      if (!inFiles) top[m[1]] = unquote(m[2]);
      continue;
    }
    if (!inFiles) continue;
    const item = /^\s*-\s+([A-Za-z0-9_]+):\s*(.*)$/.exec(raw);
    const field = /^\s+([A-Za-z0-9_]+):\s*(.*)$/.exec(raw);
    if (item) files.push({});
    const m = item ?? field;
    if (!m || files.length === 0) continue;
    const current = files[files.length - 1];
    if (m[1] === 'url') current.url = unquote(m[2]);
    else if (m[1] === 'sha512') current.sha512 = unquote(m[2]);
    else if (m[1] === 'size') current.size = Number(unquote(m[2]));
  }

  const version = top.version;
  if (!version || !/^\d+\.\d+\.\d+/.test(version)) throw new Error('The update file has no valid version');
  const complete = files.filter((f): f is UpdateFile => Boolean(f.url && f.sha512));
  // Older electron-builder files name a single download at the top level only.
  if (complete.length === 0 && top.path && top.sha512) complete.push({ url: top.path, sha512: top.sha512 });
  if (complete.length === 0) throw new Error('The update file lists no downloads');
  return { version, releaseDate: top.releaseDate, files: complete };
}

/** Semantic version order. A pre-release (1.2.0-beta.1) sorts before its release (1.2.0). */
export function compareVersions(a: string, b: string): number {
  const split = (v: string) => {
    const [core, pre] = v.replace(/^v/, '').split('-', 2);
    return { nums: core.split('.').map((n) => Number.parseInt(n, 10) || 0), pre };
  };
  const x = split(a);
  const y = split(b);
  for (let i = 0; i < 3; i += 1) {
    const d = (x.nums[i] ?? 0) - (y.nums[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  if (x.pre === y.pre) return 0;
  if (!x.pre) return 1;
  if (!y.pre) return -1;
  return x.pre < y.pre ? -1 : 1;
}

/**
 * The download that fits this machine: the arch-specific macOS zip, then the universal one;
 * on Windows, the setup program.
 */
export function pickUpdateFile(info: UpdateInfo, platform: string, arch: string): UpdateFile | null {
  const name = (f: UpdateFile) => f.url.toLowerCase();
  if (platform === 'darwin') {
    const zips = info.files.filter((f) => name(f).endsWith('.zip'));
    return (
      zips.find((f) => name(f).includes(`-${arch}.`)) ??
      zips.find((f) => name(f).includes('universal')) ??
      null
    );
  }
  if (platform === 'win32') {
    const setups = info.files.filter((f) => name(f).endsWith('.exe') && !name(f).includes('portable'));
    return setups.find((f) => name(f).includes(arch)) ?? setups[0] ?? null;
  }
  return null;
}

/** The update file this platform reads, or null where in-app updates are not offered. */
export function updateFileName(platform: string): string | null {
  if (platform === 'darwin') return 'latest-mac.yml';
  if (platform === 'win32') return 'latest.yml';
  return null;
}
