import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ConnectionProfile, MutationProposal, SqlDraft, WorkspaceSettings } from '../../shared/types';
import { createId, prefs } from '../lib/utils';
import { PromptModal } from '../components/Modals/PromptModal';
import { DangerConfirmModal } from '../components/Modals/DangerConfirmModal';
import { WarningConfirmModal } from '../components/Modals/WarningConfirmModal';
import { ConnectionModal } from '../components/Modals/ConnectionModal';

export interface ToastItem {
  id: string;
  message: string;
  type: 'success' | 'danger' | 'warning' | 'info';
}

export type ConnectionState = 'offline' | 'connecting' | 'connected' | 'failed';

interface PromptOptions {
  title: string;
  subtitle: string;
  fieldLabel: string;
  initialValue?: string;
  placeholder?: string;
  validate?: (val: string) => boolean;
  errorMsg?: string;
  onConfirm: (val: string) => void;
}

interface DangerOptions {
  title: string;
  subtitle: string;
  message: string;
  actionText?: string;
  onConfirm: () => void;
}

interface WarningOptions {
  proposal: MutationProposal;
  onConfirm: (token: string) => void;
  onCancel: () => void;
}

interface StudioContextType {
  // Profiles
  profiles: ConnectionProfile[];
  activeProfile: ConnectionProfile | null;
  setActiveProfileId: (id: string | null) => void;
  connectedProfileIds: string[];
  connectionStates: Record<string, { state: ConnectionState; error?: string }>;
  refreshProfiles: () => Promise<void>;
  connectProfile: (profile: ConnectionProfile, password?: string) => Promise<boolean>;
  disconnectProfile: (profileId: string) => Promise<void>;
  saveProfile: (profile: ConnectionProfile) => Promise<void>;
  deleteProfile: (id: string) => Promise<void>;

  // Drafts
  drafts: SqlDraft[];
  draftsLoaded: boolean;
  /** Updates a draft immediately in memory and writes it to disk shortly after. */
  updateDraft: (draft: SqlDraft) => void;
  deleteDraft: (id: string) => Promise<void>;
  createDraft: (sql?: string, title?: string, connectionId?: string | null) => Promise<SqlDraft>;

  // Settings
  settings: WorkspaceSettings;
  updateSettings: (newSettings: Partial<WorkspaceSettings>) => Promise<void>;
  theme: 'dark' | 'light';
  toggleTheme: () => void;

  // Toasts
  toasts: ToastItem[];
  showToast: (message: string, type?: ToastItem['type']) => void;
  removeToast: (id: string) => void;

  // Modals
  openPromptModal: (opts: PromptOptions) => void;
  openDangerModal: (opts: DangerOptions) => void;
  openWarningModal: (opts: WarningOptions) => void;
  openEditProfileModal: (profile?: ConnectionProfile | null) => void;
}

const StudioContext = createContext<StudioContextType | undefined>(undefined);

const DEFAULT_SETTINGS: WorkspaceSettings = {
  theme: 'dark',
  explorerVisible: true,
  explorerDivider: 0.72,
  maxHistory: 200,
  aiProvider: 'ollama',
  aiEndpoint: 'http://localhost:11434',
  aiModel: 'codellama',
};

const DRAFT_SAVE_DELAY_MS = 500;
const THEME_CACHE_KEY = 'studio:theme';

function applyTheme(theme: 'dark' | 'light') {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.classList.toggle('light', theme === 'light');
  prefs.set(THEME_CACHE_KEY, theme);
  window.electronAPI.setWindowTheme?.(theme);
}

/** Strips Electron's IPC wrapper so people see the database's own message. */
export function cleanError(err: unknown, fallback = 'Something went wrong'): string {
  const message = err instanceof Error ? err.message : String(err ?? '');
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') || fallback;
}

export const StudioProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [profiles, setProfiles] = useState<ConnectionProfile[]>([]);
  const [activeProfileId, setActiveProfileIdState] = useState<string | null>(() =>
    prefs.get<string | null>('studio:activeProfile', null)
  );
  const [connectionStates, setConnectionStates] = useState<StudioContextType['connectionStates']>({});

  const [drafts, setDrafts] = useState<SqlDraft[]>([]);
  const [draftsLoaded, setDraftsLoaded] = useState(false);
  const pendingDraftSaves = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const [settings, setSettings] = useState<WorkspaceSettings>(DEFAULT_SETTINGS);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => prefs.get(THEME_CACHE_KEY, 'dark'));
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const [promptModal, setPromptModal] = useState<PromptOptions | null>(null);
  const [dangerModal, setDangerModal] = useState<DangerOptions | null>(null);
  const [warningModal, setWarningModal] = useState<WarningOptions | null>(null);
  const [editingProfile, setEditingProfile] = useState<ConnectionProfile | null | undefined>(undefined);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastItem['type'] = 'info') => {
      const id = createId('toast');
      setToasts((prev) => [...prev.slice(-3), { id, message, type }]);
      setTimeout(() => removeToast(id), type === 'danger' ? 6000 : 3000);
    },
    [removeToast]
  );

  const setActiveProfileId = useCallback((id: string | null) => {
    setActiveProfileIdState(id);
    prefs.set('studio:activeProfile', id);
  }, []);

  const refreshProfiles = useCallback(async () => {
    try {
      const list = await window.electronAPI.getProfiles();
      setProfiles(list);
      setActiveProfileIdState((current) =>
        current && list.some((p) => p.id === current) ? current : list[0]?.id ?? null
      );
    } catch (e: any) {
      console.error(`Failed to load connection profiles: ${e.message}`);
    }
  }, []);

  useEffect(() => {
    refreshProfiles();
    window.electronAPI
      .getDrafts()
      .then((list) =>
        // Older drafts have no explicit-save baseline: what is on disk now becomes it.
        setDrafts(list.map((d) => (d.savedSql === undefined ? { ...d, savedSql: d.sql } : d)))
      )
      .catch((e) => console.error(`Failed to load drafts: ${e.message}`))
      .finally(() => setDraftsLoaded(true));
    window.electronAPI
      .getSettings()
      .then((s) => {
        setSettings(s);
        setTheme(s.theme || 'dark');
        applyTheme(s.theme || 'dark');
      })
      .catch((e) => console.error(`Failed to load settings: ${e.message}`));
  }, [refreshProfiles]);

  const setConnectionState = (id: string, state: ConnectionState, error?: string) => {
    setConnectionStates((prev) => ({ ...prev, [id]: { state, error } }));
  };

  const connectProfile = useCallback(
    async (profile: ConnectionProfile, password?: string): Promise<boolean> => {
      setConnectionState(profile.id, 'connecting');
      try {
        const res = await window.electronAPI.connect(profile, password);
        if (res.success) {
          setConnectionState(profile.id, 'connected');
          setActiveProfileId(profile.id);
          return true;
        }
        setConnectionState(profile.id, 'failed', res.message || 'Connection failed');
        showToast(res.message || 'Connection failed', 'danger');
        return false;
      } catch (err) {
        const message = cleanError(err, 'Connection failed');
        setConnectionState(profile.id, 'failed', message);
        showToast(`${profile.name}: ${message}`, 'danger');
        return false;
      }
    },
    [setActiveProfileId, showToast]
  );

  const disconnectProfile = useCallback(
    async (profileId: string) => {
      try {
        await window.electronAPI.disconnect(profileId);
        setConnectionState(profileId, 'offline');
      } catch (err) {
        showToast(cleanError(err, 'Disconnect failed'), 'danger');
      }
    },
    [showToast]
  );

  const saveProfile = useCallback(
    async (profile: ConnectionProfile) => {
      await window.electronAPI.saveProfile(profile);
      await refreshProfiles();
      showToast(`Saved “${profile.name}”`, 'success');
    },
    [refreshProfiles, showToast]
  );

  const deleteProfile = useCallback(
    async (id: string) => {
      await window.electronAPI.disconnect(id);
      await window.electronAPI.deleteProfile(id);
      setConnectionStates((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      await refreshProfiles();
    },
    [refreshProfiles]
  );

  const updateDraft = useCallback((draft: SqlDraft) => {
    setDrafts((prev) => prev.map((d) => (d.id === draft.id ? draft : d)));
    const timers = pendingDraftSaves.current;
    const existing = timers.get(draft.id);
    if (existing) clearTimeout(existing);
    timers.set(
      draft.id,
      setTimeout(() => {
        timers.delete(draft.id);
        window.electronAPI.saveDraft(draft).catch((e) => console.error(`Failed to save draft: ${e.message}`));
      }, DRAFT_SAVE_DELAY_MS)
    );
  }, []);

  const deleteDraft = useCallback(async (id: string) => {
    const timers = pendingDraftSaves.current;
    const pending = timers.get(id);
    if (pending) clearTimeout(pending);
    timers.delete(id);
    await window.electronAPI.deleteDraft(id);
    setDrafts((prev) => prev.filter((d) => d.id !== id));
  }, []);

  const createDraft = useCallback(async (sql = '', title?: string, connectionId?: string | null) => {
    const draft: SqlDraft = {
      id: createId('draft'),
      title: title || 'Untitled',
      sql,
      savedSql: sql,
      connectionId: connectionId ?? null,
    };
    const stored = await window.electronAPI.saveDraft(draft);
    const created = { ...draft, ...stored };
    setDrafts((prev) => [...prev, created]);
    return created;
  }, []);

  const updateSettings = useCallback(async (newSettings: Partial<WorkspaceSettings>) => {
    setSettings(await window.electronAPI.saveSettings(newSettings));
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      window.electronAPI.saveSettings({ theme: next }).then(setSettings);
      return next;
    });
  }, []);

  const activeProfile = useMemo(
    () => profiles.find((p) => p.id === activeProfileId) ?? null,
    [profiles, activeProfileId]
  );
  const connectedProfileIds = useMemo(
    () => Object.keys(connectionStates).filter((id) => connectionStates[id].state === 'connected'),
    [connectionStates]
  );

  const value = useMemo<StudioContextType>(
    () => ({
      profiles,
      activeProfile,
      setActiveProfileId,
      connectedProfileIds,
      connectionStates,
      refreshProfiles,
      connectProfile,
      disconnectProfile,
      saveProfile,
      deleteProfile,
      drafts,
      draftsLoaded,
      updateDraft,
      deleteDraft,
      createDraft,
      settings,
      updateSettings,
      theme,
      toggleTheme,
      toasts,
      showToast,
      removeToast,
      openPromptModal: setPromptModal,
      openDangerModal: setDangerModal,
      openWarningModal: setWarningModal,
      openEditProfileModal: (p) => setEditingProfile(p ?? null),
    }),
    [
      profiles,
      activeProfile,
      setActiveProfileId,
      connectedProfileIds,
      connectionStates,
      refreshProfiles,
      connectProfile,
      disconnectProfile,
      saveProfile,
      deleteProfile,
      drafts,
      draftsLoaded,
      updateDraft,
      deleteDraft,
      createDraft,
      settings,
      updateSettings,
      theme,
      toggleTheme,
      toasts,
      showToast,
      removeToast,
    ]
  );

  return (
    <StudioContext.Provider value={value}>
      {children}
      {promptModal && <PromptModal {...promptModal} onClose={() => setPromptModal(null)} />}
      {dangerModal && <DangerConfirmModal {...dangerModal} onClose={() => setDangerModal(null)} />}
      {warningModal && <WarningConfirmModal {...warningModal} onClose={() => setWarningModal(null)} />}
      {editingProfile !== undefined && (
        <ConnectionModal
          profile={editingProfile}
          onClose={() => setEditingProfile(undefined)}
          onSave={saveProfile}
        />
      )}
    </StudioContext.Provider>
  );
};

export const useStudio = () => {
  const context = useContext(StudioContext);
  if (!context) throw new Error('useStudio must be used within a StudioProvider');
  return context;
};
