import electron from 'electron';
const { app, safeStorage } = electron;
import fs from 'node:fs';
import path from 'node:path';
import { ConnectionProfile, SqlDraft, QueryHistoryItem, WorkspaceSettings } from '../../shared/types';
import { splitConnectionString } from '../../shared/engines';
import { open, seal, type SecretCipher } from './secrets';

const osCipher: SecretCipher = {
  isAvailable: () =>
    safeStorage.isEncryptionAvailable() &&
    // On Linux without a keyring, Electron falls back to a fixed key, which protects nothing.
    (process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text'),
  encrypt: (plain) => safeStorage.encryptString(plain).toString('base64'),
  decrypt: (encoded) => safeStorage.decryptString(Buffer.from(encoded, 'base64')),
};
const API_KEY_SLOT = 'settings:aiApiKey';

interface StorageData {
  profiles: ConnectionProfile[];
  drafts: SqlDraft[];
  history: QueryHistoryItem[];
  settings: WorkspaceSettings;
}

const DEFAULT_SETTINGS: WorkspaceSettings = {
  theme: 'dark',
  explorerVisible: true,
  explorerDivider: 0.72,
  maxHistory: 200,
  aiProvider: 'ollama',
  aiEndpoint: 'http://localhost:11434',
  aiModel: 'codellama',
  aiShareResults: false,
};

export class StorageService {
  private filePath: string;
  private data: StorageData;
  /** Encrypted values that could not be opened, by owner, so a save cannot destroy them. */
  private locked = new Map<string, string>();
  private unlocked = false;

  constructor() {
    let baseDir: string;
    try {
      baseDir = app.getPath('userData');
    } catch {
      baseDir = path.join(process.cwd(), '.studio-data');
    }

    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }

    this.filePath = path.join(baseDir, 'studio-storage.json');
    this.data = this.load();
  }

  private load(): StorageData {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        return {
          profiles: parsed.profiles || [],
          drafts: parsed.drafts || [],
          history: parsed.history || [],
          settings: { ...DEFAULT_SETTINGS, ...parsed.settings },
        };
      }
    } catch (e) {
      console.error('Failed to load storage file, initializing defaults', e);
    }

    const initial: StorageData = {
      profiles: [],
      drafts: [
        {
          id: 'draft-default',
          title: 'New Query',
          sql: '-- Welcome to AI DB Studio\n-- Pick a connection in the sidebar, or add one, then press Cmd/Ctrl+Enter to run.\nSELECT 1;',
          updatedAt: Date.now(),
        },
      ],
      history: [],
      settings: DEFAULT_SETTINGS,
    };
    this.saveData(initial);
    return initial;
  }

  /**
   * Decrypts stored secrets. Encryption needs the app to be ready, so this runs at startup
   * rather than in the constructor. Secrets saved by older versions get encrypted here.
   */
  public unlockSecrets(cipher: SecretCipher = osCipher): void {
    let hadPlaintext = false;
    const openSecret = (slot: string, stored: string | undefined): string | undefined => {
      const opened = open(stored, cipher);
      if (opened.legacyPlaintext) hadPlaintext = true;
      if (opened.locked) {
        this.locked.set(slot, opened.locked);
        console.error(`A saved secret (${slot}) could not be decrypted. It will need to be entered again.`);
      }
      return opened.value;
    };

    this.data.profiles = this.data.profiles.map((p) => ({ ...p, password: openSecret(p.id, p.password) }));
    this.data.settings = { ...this.data.settings, aiApiKey: openSecret(API_KEY_SLOT, this.data.settings.aiApiKey) };
    this.cipher = cipher;
    this.unlocked = true;
    if (hadPlaintext) this.commit();
  }

  public isSecureStorageAvailable(): boolean {
    return this.cipher.isAvailable();
  }

  private cipher: SecretCipher = osCipher;

  /** What goes to disk: in-memory data with every secret encrypted or left out. */
  private toDisk(data: StorageData): StorageData {
    if (!this.unlocked) return data;
    const sealed = (slot: string, value: string | undefined) => seal(value, this.cipher) ?? this.locked.get(slot);
    return {
      ...data,
      profiles: data.profiles.map((p) => ({ ...p, password: sealed(p.id, p.password) })),
      settings: { ...data.settings, aiApiKey: sealed(API_KEY_SLOT, data.settings.aiApiKey) },
    };
  }

  private saveData(data: StorageData): void {
    try {
      // Saved queries and history stay readable to this file's owner only.
      fs.writeFileSync(this.filePath, JSON.stringify(this.toDisk(data), null, 2), { encoding: 'utf-8', mode: 0o600 });
      fs.chmodSync(this.filePath, 0o600);
    } catch (e: any) {
      console.error(`Failed to write storage file: ${e.message}`);
    }
  }

  private commit(): void {
    this.saveData(this.data);
  }

  // Profiles
  public getProfiles(): ConnectionProfile[] {
    return this.data.profiles;
  }

  public saveProfile(input: ConnectionProfile): ConnectionProfile {
    // A connection string must never carry a password into the unencrypted part of the file.
    let profile = input;
    if (input.connectionString) {
      const split = splitConnectionString(input.connectionString);
      profile = {
        ...input,
        connectionString: split.uri,
        username: input.username || split.username || '',
        password: input.password || split.password,
      };
    }
    if (profile.password) this.locked.delete(profile.id);
    const idx = this.data.profiles.findIndex((p) => p.id === profile.id);
    if (idx >= 0) {
      this.data.profiles[idx] = profile;
    } else {
      this.data.profiles.push(profile);
    }
    this.commit();
    return profile;
  }

  public deleteProfile(id: string): void {
    this.locked.delete(id);
    this.data.profiles = this.data.profiles.filter((p) => p.id !== id);
    this.commit();
  }

  // Drafts
  public getDrafts(): SqlDraft[] {
    return this.data.drafts;
  }

  public saveDraft(draft: SqlDraft): SqlDraft {
    const item = { ...draft, updatedAt: Date.now() };
    const idx = this.data.drafts.findIndex((d) => d.id === draft.id);
    if (idx >= 0) {
      this.data.drafts[idx] = item;
    } else {
      this.data.drafts.push(item);
    }
    this.commit();
    return item;
  }

  public deleteDraft(id: string): void {
    this.data.drafts = this.data.drafts.filter((d) => d.id !== id);
    this.commit();
  }

  // History
  public getHistory(): QueryHistoryItem[] {
    return this.data.history;
  }

  public addHistory(item: Omit<QueryHistoryItem, 'id' | 'executedAt'>): void {
    const record: QueryHistoryItem = {
      ...item,
      id: Math.random().toString(36).substring(2, 10),
      executedAt: Date.now(),
    };
    this.data.history.unshift(record);
    if (this.data.history.length > (this.data.settings.maxHistory || 200)) {
      this.data.history = this.data.history.slice(0, this.data.settings.maxHistory || 200);
    }
    this.commit();
  }

  public clearHistory(): void {
    this.data.history = [];
    this.commit();
  }

  // Settings
  public getSettings(): WorkspaceSettings {
    return this.data.settings;
  }

  public saveSettings(settings: Partial<WorkspaceSettings>): WorkspaceSettings {
    if (settings.aiApiKey) this.locked.delete(API_KEY_SLOT);
    this.data.settings = { ...this.data.settings, ...settings };
    this.commit();
    return this.data.settings;
  }
}
