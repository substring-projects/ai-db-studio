import electron from 'electron';
const { app, net } = electron;
import { spawn } from 'node:child_process';
import { createHash, createPublicKey, verify } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  RELEASES_URL,
  UPDATE_REPO,
  UpdateFile,
  UpdateInfo,
  UpdateStatus,
  WhatsNew,
  compareVersions,
  parseUpdateInfo,
  pickUpdateFile,
  updateFileName,
} from '../../shared/update';
import { UPDATE_PUBLIC_KEY } from '../updateKey';

const DOWNLOAD_BASE = `${RELEASES_URL}/latest/download`;
const PENDING_FILE = 'update-pending.json';
const LAUNCH_DELAY_MS = 8_000;
const RECHECK_MS = 12 * 60 * 60 * 1000;

interface Options {
  /** Whether the launch and periodic checks run. Manual checks always do. */
  autoCheck: () => boolean;
  skippedVersion: () => string | undefined;
  onStatus: (status: UpdateStatus) => void;
}

/**
 * In-app updates from GitHub Releases, without Squirrel.
 *
 * Squirrel.Mac only accepts updates signed with an Apple Developer ID, and these builds are
 * ad-hoc signed. So, like Tauri's updater, this checks its own Ed25519 signature over the
 * release's update file, verifies the download's SHA-512 against it, and then:
 *   macOS    swaps the .app bundle after the app quits and reopens it
 *   Windows  runs the NSIS installer silently, which relaunches the app
 */
export class UpdateService {
  private status: UpdateStatus = { state: 'idle' };
  private info: UpdateInfo | null = null;
  private file: UpdateFile | null = null;
  private notes = '';
  private downloaded: string | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly options: Options) {}

  getStatus(): UpdateStatus {
    return this.status;
  }

  /** Starts the quiet checks: once shortly after launch, then twice a day. */
  start() {
    if (!app.isPackaged || !updateFileName(process.platform)) return;
    const quietCheck = () => {
      if (this.options.autoCheck() && (this.status.state === 'idle' || this.status.state === 'up-to-date' || this.status.state === 'error')) {
        this.check(false).catch(() => undefined);
      }
    };
    setTimeout(quietCheck, LAUNCH_DELAY_MS);
    this.timer = setInterval(quietCheck, RECHECK_MS);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  async check(manual: boolean): Promise<UpdateStatus> {
    if (this.status.state === 'downloading' || this.status.state === 'ready') return this.status;
    const fileName = updateFileName(process.platform);
    if (!fileName) {
      return this.set({ state: 'error', manual, message: 'In-app updates are available on macOS and Windows.' });
    }
    this.set({ state: 'checking', manual });
    try {
      const [text, signature] = await Promise.all([
        this.fetchText(`${DOWNLOAD_BASE}/${fileName}`),
        this.fetchText(`${DOWNLOAD_BASE}/${fileName}.sig`),
      ]);
      if (!verify(null, Buffer.from(text), createPublicKey(UPDATE_PUBLIC_KEY), Buffer.from(signature.trim(), 'base64'))) {
        throw new Error('The update file’s signature is not valid, so it was not trusted.');
      }
      const info = parseUpdateInfo(text);
      const current = app.getVersion();
      if (compareVersions(info.version, current) <= 0) {
        return this.set({ state: 'up-to-date', version: current, manual });
      }

      this.info = info;
      this.file = pickUpdateFile(info, process.platform, process.arch);
      this.notes = await this.fetchNotes(info.version);
      const blocked = this.installBlocker();
      return this.set({
        state: 'available',
        version: info.version,
        current,
        notes: this.notes,
        canInstall: !blocked && Boolean(this.file),
        reason: blocked ?? (this.file ? undefined : 'No download for this computer in this release.'),
        skipped: this.options.skippedVersion() === info.version,
        manual,
      });
    } catch (err) {
      return this.set({ state: 'error', manual, message: friendlyError(err) });
    }
  }

  async download(): Promise<UpdateStatus> {
    const { info, file } = this;
    if (!info || !file || this.status.state !== 'available' || !this.status.canInstall) return this.status;
    const dir = path.join(app.getPath('temp'), 'ai-db-studio-update');
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    const target = path.join(dir, path.basename(file.url));

    this.set({ state: 'downloading', version: info.version, notes: this.notes, progress: 0 });
    try {
      const response = await net.fetch(`${RELEASES_URL}/download/v${info.version}/${encodeURIComponent(file.url)}`);
      if (!response.ok || !response.body) throw new Error(`Download failed (HTTP ${response.status})`);
      const total = Number(response.headers.get('content-length')) || file.size || 0;
      const hash = createHash('sha512');
      const out = fs.createWriteStream(target);
      let received = 0;
      let lastReport = 0;
      const reader = response.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        hash.update(value);
        received += value.length;
        if (!out.write(value)) await new Promise<void>((resolve) => out.once('drain', () => resolve()));
        const now = Date.now();
        if (now - lastReport > 150) {
          lastReport = now;
          this.set({ state: 'downloading', version: info.version, notes: this.notes, progress: total ? Math.min(99, Math.round((received / total) * 100)) : null });
        }
      }
      await new Promise<void>((resolve, reject) => out.end((err?: Error | null) => (err ? reject(err) : resolve())));

      if (hash.digest('base64') !== file.sha512) {
        fs.rmSync(dir, { recursive: true, force: true });
        throw new Error('The download did not match its checksum, so it was discarded.');
      }
      this.downloaded = target;
      return this.set({ state: 'ready', version: info.version, notes: this.notes });
    } catch (err) {
      return this.set({
        state: 'available',
        version: info.version,
        current: app.getVersion(),
        notes: this.notes,
        canInstall: true,
        reason: friendlyError(err),
        skipped: false,
        manual: true,
      });
    }
  }

  /** Hands over to the installer and quits. The app reopens on the new version. */
  async install(): Promise<void> {
    if (this.status.state !== 'ready' || !this.downloaded || !this.info) return;
    const archive = this.downloaded;
    this.savePending({ version: this.info.version, notes: this.notes });

    if (process.platform === 'darwin') {
      const bundle = currentAppBundle();
      if (!bundle) throw new Error('Could not find the app bundle to replace.');
      const extractDir = path.join(path.dirname(archive), 'extracted');
      fs.rmSync(extractDir, { recursive: true, force: true });
      await run('/usr/bin/ditto', ['-x', '-k', archive, extractDir]);
      const newApp = fs.readdirSync(extractDir).find((name) => name.endsWith('.app'));
      if (!newApp) throw new Error('The update archive has no app inside.');
      const script = path.join(path.dirname(archive), 'install.sh');
      fs.writeFileSync(script, MAC_INSTALL_SCRIPT, { mode: 0o755 });
      spawn('/bin/bash', [script, String(process.pid), path.join(extractDir, newApp), bundle], {
        detached: true,
        stdio: 'ignore',
      }).unref();
    } else if (process.platform === 'win32') {
      // electron-builder's NSIS installer: --updated keeps the install location, /S runs it
      // silently and --force-run starts the app again when it finishes.
      spawn(archive, ['--updated', '/S', '--force-run'], { detached: true, stdio: 'ignore' }).unref();
    } else {
      return;
    }
    app.quit();
  }

  /** The notes for the version that just installed, once. */
  takeWhatsNew(): WhatsNew | null {
    const file = path.join(app.getPath('userData'), PENDING_FILE);
    try {
      const pending = JSON.parse(fs.readFileSync(file, 'utf8')) as WhatsNew;
      if (pending.version !== app.getVersion()) return null;
      fs.rmSync(file, { force: true });
      return pending;
    } catch {
      return null;
    }
  }

  private savePending(value: WhatsNew) {
    try {
      fs.writeFileSync(path.join(app.getPath('userData'), PENDING_FILE), JSON.stringify(value));
    } catch {
      // Only costs the What's New screen.
    }
  }

  /** Why this copy cannot update itself in place, if it cannot. */
  private installBlocker(): string | undefined {
    if (!app.isPackaged) return 'Updates install only in packaged builds.';
    if (process.platform === 'win32' && process.env.PORTABLE_EXECUTABLE_FILE) {
      return 'The portable version cannot update itself. Download the new version instead.';
    }
    if (process.platform === 'darwin') {
      const bundle = currentAppBundle();
      if (!bundle) return 'Could not find the app bundle to replace.';
      if (bundle.startsWith('/Volumes/') || bundle.includes('/AppTranslocation/')) {
        return 'Move AI DB Studio to your Applications folder to install updates.';
      }
      try {
        fs.accessSync(path.dirname(bundle), fs.constants.W_OK);
      } catch {
        return `AI DB Studio can’t write to ${path.dirname(bundle)}. Download the new version instead.`;
      }
    }
    return undefined;
  }

  private async fetchText(url: string): Promise<string> {
    const response = await net.fetch(url, { cache: 'no-store' });
    if (response.status === 404) throw new Error('No published release has update information yet.');
    if (!response.ok) throw new Error(`GitHub answered HTTP ${response.status}`);
    return response.text();
  }

  /** Release notes are shown, not trusted: a missing body just means an empty notes panel. */
  private async fetchNotes(version: string): Promise<string> {
    try {
      const response = await net.fetch(`https://api.github.com/repos/${UPDATE_REPO}/releases/tags/v${version}`, {
        headers: { Accept: 'application/vnd.github+json' },
      });
      if (!response.ok) return '';
      const body = (await response.json()) as { body?: string };
      return typeof body.body === 'string' ? body.body : '';
    } catch {
      return '';
    }
  }

  private set(status: UpdateStatus): UpdateStatus {
    this.status = status;
    this.options.onStatus(status);
    return status;
  }
}

/** /Applications/AI DB Studio.app from …/Contents/MacOS/AI DB Studio. */
function currentAppBundle(): string | null {
  const bundle = path.resolve(app.getPath('exe'), '..', '..', '..');
  return bundle.endsWith('.app') ? bundle : null;
}

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'ignore' });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${path.basename(command)} exited with code ${code}`))));
  });
}

function friendlyError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|ENOTFOUND|ERR_NETWORK_CHANGED/i.test(message)) {
    return 'Could not reach GitHub. Check your internet connection.';
  }
  return message;
}

/**
 * Runs detached after the app quits: waits for the old process to exit, moves the new bundle
 * into place (restoring the old one if that fails) and reopens the app. Arguments are passed
 * positionally, never interpolated, so paths with spaces or quotes are safe.
 */
const MAC_INSTALL_SCRIPT = `#!/bin/bash
PID="$1"; NEW_APP="$2"; TARGET="$3"; BACKUP="$TARGET.previous"
for _ in $(seq 1 300); do kill -0 "$PID" 2>/dev/null || break; sleep 0.2; done
rm -rf "$BACKUP"
if mv "$TARGET" "$BACKUP"; then
  if mv "$NEW_APP" "$TARGET"; then
    rm -rf "$BACKUP"
  else
    mv "$BACKUP" "$TARGET"
  fi
fi
xattr -dr com.apple.quarantine "$TARGET" 2>/dev/null
open "$TARGET"
`;
