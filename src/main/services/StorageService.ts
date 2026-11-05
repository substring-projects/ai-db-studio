import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { ConnectionProfile, SqlDraft, QueryHistoryItem, WorkspaceSettings } from '../../shared/types';

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
};

export class StorageService {
  private filePath: string;
  private data: StorageData;

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
          sql: '-- Welcome to AI DB Studio\n-- Connect to a database profile on the right to start querying.\nSELECT 1;',
          updatedAt: Date.now(),
        },
      ],
      history: [],
      settings: DEFAULT_SETTINGS,
    };
    this.saveData(initial);
    return initial;
  }

  private saveData(data: StorageData): void {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (e) {
      console.error('Failed to write storage file', e);
    }
  }

  private commit(): void {
    this.saveData(this.data);
  }

  // Profiles
  public getProfiles(): ConnectionProfile[] {
    return this.data.profiles;
  }

  public saveProfile(profile: ConnectionProfile): ConnectionProfile {
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
    this.data.settings = { ...this.data.settings, ...settings };
    this.commit();
    return this.data.settings;
  }
}
