import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  ConnectionProfile,
  SqlDraft,
  WorkspaceSettings,
  MutationProposal,
  DbTable,
} from '../../shared/types';

export interface ToastItem {
  id: string;
  message: string;
  type: 'success' | 'danger' | 'warning' | 'info';
}

interface StudioContextType {
  // Navigation
  activeView: 'workbench' | 'connections' | 'settings';
  setActiveView: (view: 'workbench' | 'connections' | 'settings') => void;

  // Profiles
  profiles: ConnectionProfile[];
  activeProfile: ConnectionProfile | null;
  setActiveProfile: (profile: ConnectionProfile | null) => void;
  connectedProfileIds: string[];
  refreshProfiles: () => Promise<void>;
  connectProfile: (profile: ConnectionProfile, password?: string) => Promise<boolean>;
  disconnectProfile: (profileId: string) => Promise<void>;
  saveProfile: (profile: ConnectionProfile) => Promise<void>;
  deleteProfile: (id: string) => Promise<void>;

  // Drafts
  drafts: SqlDraft[];
  activeDraftId: string | null;
  setActiveDraftId: (id: string | null) => void;
  openDraftIds: string[];
  openDraft: (draft: SqlDraft) => void;
  closeDraft: (id: string) => void;
  closeOtherDrafts: (keepId: string) => void;
  closeAllDrafts: () => void;
  closeDraftsToRight: (refId: string) => void;
  saveDraft: (draft: SqlDraft) => Promise<void>;
  deleteDraft: (id: string) => Promise<void>;
  createNewDraft: (sql?: string, title?: string) => void;

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
  openPromptModal: (opts: {
    title: string;
    subtitle: string;
    fieldLabel: string;
    initialValue?: string;
    placeholder?: string;
    validate?: (val: string) => boolean;
    errorMsg?: string;
    onConfirm: (val: string) => void;
  }) => void;
  openDangerModal: (opts: {
    title: string;
    subtitle: string;
    message: string;
    actionText?: string;
    onConfirm: () => void;
  }) => void;
  openWarningModal: (opts: {
    proposal: MutationProposal;
    onConfirm: (token: string) => void;
    onCancel: () => void;
  }) => void;
  openEditProfileModal: (profile?: ConnectionProfile | null) => void;
  editingProfile: ConnectionProfile | null | undefined;
  closeModals: () => void;
}

const StudioContext = createContext<StudioContextType | undefined>(undefined);

export const StudioProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeView, setActiveView] = useState<'workbench' | 'connections' | 'settings'>('workbench');
  const [profiles, setProfiles] = useState<ConnectionProfile[]>([]);
  const [activeProfile, setActiveProfile] = useState<ConnectionProfile | null>(null);
  const [connectedProfileIds, setConnectedProfileIds] = useState<string[]>([]);

  const [drafts, setDrafts] = useState<SqlDraft[]>([]);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [openDraftIds, setOpenDraftIds] = useState<string[]>([]);

  const [settings, setSettings] = useState<WorkspaceSettings>({
    theme: 'dark',
    explorerVisible: true,
    explorerDivider: 0.72,
    maxHistory: 200,
    aiProvider: 'ollama',
    aiEndpoint: 'http://localhost:11434',
    aiModel: 'codellama',
  });
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  const [toasts, setToasts] = useState<ToastItem[]>([]);

  // Modal states
  const [promptModal, setPromptModal] = useState<any>(null);
  const [dangerModal, setDangerModal] = useState<any>(null);
  const [warningModal, setWarningModal] = useState<any>(null);
  const [editingProfile, setEditingProfile] = useState<ConnectionProfile | null | undefined>(undefined);

  const showToast = (message: string, type: ToastItem['type'] = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const refreshProfiles = async () => {
    try {
      const list = await window.electronAPI.getProfiles();
      setProfiles(list);
      if (list.length > 0 && !activeProfile) {
        setActiveProfile(list[0]);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const refreshDrafts = async () => {
    try {
      const list = await window.electronAPI.getDrafts();
      setDrafts(list);
      if (list.length > 0 && openDraftIds.length === 0) {
        setOpenDraftIds([list[0].id]);
        setActiveDraftId(list[0].id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const refreshSettings = async () => {
    try {
      const s = await window.electronAPI.getSettings();
      setSettings(s);
      setTheme(s.theme || 'dark');
      if (s.theme === 'light') {
        document.documentElement.classList.add('light');
      } else {
        document.documentElement.classList.remove('light');
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    refreshProfiles();
    refreshDrafts();
    refreshSettings();
  }, []);

  const connectProfile = async (profile: ConnectionProfile, password?: string): Promise<boolean> => {
    try {
      const res = await window.electronAPI.connect(profile, password);
      if (res.success) {
        setConnectedProfileIds((prev) => Array.from(new Set([...prev, profile.id])));
        setActiveProfile(profile);
        showToast(`Connected to ${profile.name}`, 'success');
        return true;
      } else {
        showToast(res.message || 'Connection failed', 'danger');
        return false;
      }
    } catch (err: any) {
      showToast(err.message || 'Connection failed', 'danger');
      return false;
    }
  };

  const disconnectProfile = async (profileId: string) => {
    try {
      await window.electronAPI.disconnect(profileId);
      setConnectedProfileIds((prev) => prev.filter((id) => id !== profileId));
      showToast('Disconnected', 'info');
    } catch (err: any) {
      showToast(err.message || 'Disconnect failed', 'danger');
    }
  };

  const saveProfile = async (profile: ConnectionProfile) => {
    await window.electronAPI.saveProfile(profile);
    await refreshProfiles();
    showToast(`Profile “${profile.name}” saved`, 'success');
  };

  const deleteProfile = async (id: string) => {
    const prof = profiles.find((p) => p.id === id);
    await window.electronAPI.deleteProfile(id);
    await disconnectProfile(id);
    await refreshProfiles();
    showToast(`Profile “${prof?.name || id}” removed`, 'info');
  };

  const openDraft = (draft: SqlDraft) => {
    if (!openDraftIds.includes(draft.id)) {
      setOpenDraftIds((prev) => [...prev, draft.id]);
    }
    setActiveDraftId(draft.id);
  };

  const closeDraft = (id: string) => {
    const next = openDraftIds.filter((dId) => dId !== id);
    setOpenDraftIds(next);
    if (activeDraftId === id) {
      setActiveDraftId(next.length > 0 ? next[next.length - 1] : null);
    }
  };

  const closeOtherDrafts = (keepId: string) => {
    setOpenDraftIds([keepId]);
    setActiveDraftId(keepId);
  };

  const closeAllDrafts = () => {
    setOpenDraftIds([]);
    setActiveDraftId(null);
  };

  const closeDraftsToRight = (refId: string) => {
    const idx = openDraftIds.indexOf(refId);
    if (idx >= 0) {
      const next = openDraftIds.slice(0, idx + 1);
      setOpenDraftIds(next);
      if (!next.includes(activeDraftId || '')) {
        setActiveDraftId(refId);
      }
    }
  };

  const saveDraft = async (draft: SqlDraft) => {
    await window.electronAPI.saveDraft(draft);
    await refreshDrafts();
  };

  const deleteDraft = async (id: string) => {
    const d = drafts.find((x) => x.id === id);
    await window.electronAPI.deleteDraft(id);
    closeDraft(id);
    await refreshDrafts();
    showToast(`Draft “${d?.title || id}” deleted`, 'info');
  };

  const createNewDraft = async (sql = '', title?: string) => {
    const id = 'draft-' + Date.now();
    const newDraft: SqlDraft = {
      id,
      title: title || `Draft ${drafts.length + 1}`,
      sql,
      connectionId: activeProfile?.id,
    };
    await window.electronAPI.saveDraft(newDraft);
    await refreshDrafts();
    openDraft(newDraft);
    showToast(`New draft created`, 'success');
  };

  const updateSettings = async (newSettings: Partial<WorkspaceSettings>) => {
    const updated = await window.electronAPI.saveSettings(newSettings);
    setSettings(updated);
  };

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    updateSettings({ theme: next });
    if (next === 'light') {
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.remove('light');
    }
  };

  const closeModals = () => {
    setPromptModal(null);
    setDangerModal(null);
    setWarningModal(null);
    setEditingProfile(undefined);
  };

  return (
    <StudioContext.Provider
      value={{
        activeView,
        setActiveView,
        profiles,
        activeProfile,
        setActiveProfile,
        connectedProfileIds,
        refreshProfiles,
        connectProfile,
        disconnectProfile,
        saveProfile,
        deleteProfile,
        drafts,
        activeDraftId,
        setActiveDraftId,
        openDraftIds,
        openDraft,
        closeDraft,
        closeOtherDrafts,
        closeAllDrafts,
        closeDraftsToRight,
        saveDraft,
        deleteDraft,
        createNewDraft,
        settings,
        updateSettings,
        theme,
        toggleTheme,
        toasts,
        showToast,
        removeToast,
        openPromptModal: (opts) => setPromptModal(opts),
        openDangerModal: (opts) => setDangerModal(opts),
        openWarningModal: (opts) => setWarningModal(opts),
        openEditProfileModal: (p) => setEditingProfile(p === undefined ? null : p),
        editingProfile,
        closeModals,
      }}
    >
      {children}
      {/* Modals rendered here */}
      {promptModal && (
        <PromptModal
          {...promptModal}
          onClose={() => setPromptModal(null)}
        />
      )}
      {dangerModal && (
        <DangerConfirmModal
          {...dangerModal}
          onClose={() => setDangerModal(null)}
        />
      )}
      {warningModal && (
        <WarningConfirmModal
          {...warningModal}
          onClose={() => setWarningModal(null)}
        />
      )}
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

// Imports of modal components placed after to prevent circular dependency
import { PromptModal } from '../components/Modals/PromptModal';
import { DangerConfirmModal } from '../components/Modals/DangerConfirmModal';
import { WarningConfirmModal } from '../components/Modals/WarningConfirmModal';
import { ConnectionModal } from '../components/Modals/ConnectionModal';
