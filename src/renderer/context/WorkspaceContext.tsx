import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { DbTable, QueryHistoryItem, QueryResult } from '../../shared/types';
import { cleanError, useStudio } from './StudioContext';
import { useSchema } from './SchemaContext';
import { createId, formatCount, formatDuration, prefs } from '../lib/utils';

export type WorkspaceTab =
  | { id: string; kind: 'sql'; draftId: string }
  | { id: string; kind: 'table'; profileId: string; table: string; schema?: string; objectType: DbTable['type'] }
  | { id: string; kind: 'structure'; profileId: string; table: string; schema?: string }
  | { id: string; kind: 'er'; profileId: string; schema?: string }
  | { id: string; kind: 'ai'; conversationId: string }
  | { id: string; kind: 'result'; title: string; profileId?: string; sql?: string; result: QueryResult }
  | { id: string; kind: 'connections' }
  | { id: string; kind: 'settings' };

export type Activity = 'explorer' | 'sql' | 'ai' | 'history';
export type PanelView = 'results' | 'messages' | 'log' | 'stats';

export interface RunState {
  runId: string;
  profileId: string;
  sql: string;
  status: 'running' | 'success' | 'error' | 'cancelled';
  result?: QueryResult;
  error?: string;
  kind?: 'query' | 'explain';
  startedAt: number;
  durationMs?: number;
}

export interface LogEntry {
  id: string;
  time: number;
  level: 'info' | 'success' | 'warning' | 'error';
  source: 'query' | 'table' | 'ai' | 'connection';
  message: string;
  sql?: string;
}

interface RunOptions {
  /** Called after a successful run, for example to reload a table the statement changed. */
  onSuccess?: (result: QueryResult) => void;
  explain?: boolean;
  /** Runs without taking over the bottom panel, for actions started outside a SQL tab. */
  background?: boolean;
}

interface WorkspaceContextType {
  // Tabs
  tabs: WorkspaceTab[];
  activeTab: WorkspaceTab | null;
  activateTab: (id: string) => void;
  closeTab: (id: string) => void;
  closeOtherTabs: (id: string) => void;
  closeTabsToRight: (id: string) => void;
  closeAllTabs: () => void;
  moveTab: (id: string, targetId: string) => void;
  cycleTab: (direction: 1 | -1) => void;
  newQuery: (sql?: string, title?: string, profileId?: string | null) => Promise<void>;
  openDraft: (draftId: string) => void;
  openTableData: (profileId: string, table: DbTable) => void;
  openStructure: (profileId: string, table: DbTable) => void;
  openErDiagram: (profileId: string, schema?: string) => void;
  openChat: (conversationId: string) => void;
  openResultTab: (title: string, result: QueryResult, sql?: string, profileId?: string) => void;
  openSingleton: (kind: 'connections' | 'settings') => void;

  // Layout
  activity: Activity;
  selectActivity: (activity: Activity) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
  togglePanel: () => void;
  panelView: PanelView;
  setPanelView: (view: PanelView) => void;
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
  aiPanelOpen: boolean;
  setAiPanelOpen: (open: boolean) => void;
  toggleAiPanel: () => void;

  // Execution
  runs: Record<string, RunState>;
  runSql: (tabId: string, profileId: string, sql: string, options?: RunOptions) => Promise<void>;
  cancelRun: (tabId: string) => Promise<void>;
  /** Records a run the tab performed itself, such as loading a page of table data. */
  recordRun: (tabId: string, run: RunState) => void;
  logs: LogEntry[];
  appendLog: (entry: Omit<LogEntry, 'id' | 'time'>) => void;
  clearLogs: () => void;
  history: QueryHistoryItem[];
  addHistory: (item: Omit<QueryHistoryItem, 'id' | 'executedAt'>) => void;
  clearHistory: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

const LOG_LIMIT = 500;
const STATE_KEY = 'studio:workspace';

interface PersistedWorkspace {
  tabs: WorkspaceTab[];
  activeId: string | null;
}

const MUTATING_DDL = /^\s*(CREATE|DROP|ALTER|TRUNCATE|RENAME)\b/i;

/** Thin store for the editor cursor, so typing does not re-render the whole shell. */
const cursorListeners = new Set<() => void>();
let cursor: { line: number; column: number; selected: number } | null = null;
export const editorCursorStore = {
  set(next: typeof cursor) {
    cursor = next;
    cursorListeners.forEach((l) => l());
  },
  get: () => cursor,
  subscribe(listener: () => void) {
    cursorListeners.add(listener);
    return () => {
      cursorListeners.delete(listener);
    };
  },
};

export const WorkspaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { drafts, draftsLoaded, createDraft, deleteDraft, profiles, setActiveProfileId, openWarningModal, showToast } = useStudio();
  const { loadSchema } = useSchema();

  const [tabs, setTabs] = useState<WorkspaceTab[]>(() => prefs.get<PersistedWorkspace>(STATE_KEY, { tabs: [], activeId: null }).tabs);
  const [activeId, setActiveId] = useState<string | null>(() => prefs.get<PersistedWorkspace>(STATE_KEY, { tabs: [], activeId: null }).activeId);

  const [activity, setActivity] = useState<Activity>(() => prefs.get('studio:activity', 'explorer'));
  const [sidebarOpen, setSidebarOpenState] = useState<boolean>(() => prefs.get('studio:sidebarOpen', true));
  const [panelByKind, setPanelByKind] = useState<{ sql: boolean; other: boolean }>(() =>
    prefs.get('studio:panelOpen', { sql: true, other: false })
  );
  const [panelView, setPanelView] = useState<PanelView>(() => prefs.get('studio:panelView', 'results'));
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [aiPanelOpen, setAiPanelOpenState] = useState<boolean>(() => prefs.get('studio:aiPanelOpen', false));

  const [runs, setRuns] = useState<Record<string, RunState>>({});
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [history, setHistory] = useState<QueryHistoryItem[]>([]);

  const activeTab = useMemo(() => tabs.find((t) => t.id === activeId) ?? null, [tabs, activeId]);
  const panelKind: 'sql' | 'other' = activeTab?.kind === 'sql' ? 'sql' : 'other';
  const panelOpen = panelByKind[panelKind];

  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;
  const runsRef = useRef(runs);
  runsRef.current = runs;
  const panelKindRef = useRef(panelKind);
  panelKindRef.current = panelKind;

  // Result tabs hold rows in memory only: query results are never written to disk.
  useEffect(() => {
    prefs.set(STATE_KEY, { tabs: tabs.filter((t) => t.kind !== 'result'), activeId });
  }, [tabs, activeId]);
  useEffect(() => prefs.set('studio:activity', activity), [activity]);
  useEffect(() => prefs.set('studio:sidebarOpen', sidebarOpen), [sidebarOpen]);
  useEffect(() => prefs.set('studio:panelOpen', panelByKind), [panelByKind]);
  useEffect(() => prefs.set('studio:panelView', panelView), [panelView]);
  useEffect(() => prefs.set('studio:aiPanelOpen', aiPanelOpen), [aiPanelOpen]);

  useEffect(() => {
    window.electronAPI.getHistory().then(setHistory).catch(() => undefined);
  }, []);

  // Drop restored tabs whose draft no longer exists, and always leave one query open.
  const reconciled = useRef(false);
  useEffect(() => {
    if (!draftsLoaded || reconciled.current) return;
    reconciled.current = true;
    const valid = tabsRef.current.filter((t) => t.kind !== 'sql' || drafts.some((d) => d.id === t.draftId));
    if (valid.length > 0) {
      setTabs(valid);
      setActiveId((current) => (valid.some((t) => t.id === current) ? current : valid[0].id));
    } else if (drafts[0]) {
      const tab: WorkspaceTab = { id: createId('tab'), kind: 'sql', draftId: drafts[0].id };
      setTabs([tab]);
      setActiveId(tab.id);
    }
  }, [draftsLoaded, drafts]);

  // A tab's connection becomes the active one, so the status bar always describes what is on screen.
  useEffect(() => {
    if (!activeTab) return;
    let profileId: string | null | undefined;
    if (activeTab.kind === 'table' || activeTab.kind === 'structure' || activeTab.kind === 'result') {
      profileId = activeTab.profileId;
    } else if (activeTab.kind === 'sql') {
      profileId = drafts.find((d) => d.id === activeTab.draftId)?.connectionId;
    }
    if (profileId && profiles.some((p) => p.id === profileId)) setActiveProfileId(profileId);
  }, [activeTab, drafts, profiles, setActiveProfileId]);

  const appendLog = useCallback((entry: Omit<LogEntry, 'id' | 'time'>) => {
    setLogs((prev) => [{ ...entry, id: createId('log'), time: Date.now() }, ...prev].slice(0, LOG_LIMIT));
  }, []);
  const clearLogs = useCallback(() => setLogs([]), []);

  const addHistory = useCallback((item: Omit<QueryHistoryItem, 'id' | 'executedAt'>) => {
    window.electronAPI
      .addHistory(item)
      .then(() => window.electronAPI.getHistory())
      .then(setHistory)
      .catch(() => undefined);
  }, []);

  const clearHistory = useCallback(async () => {
    await window.electronAPI.clearHistory();
    setHistory([]);
  }, []);

  const addTab = useCallback((tab: WorkspaceTab) => {
    setTabs((prev) => {
      const index = prev.findIndex((t) => t.id === activeIdRef.current);
      const next = [...prev];
      next.splice(index >= 0 ? index + 1 : prev.length, 0, tab);
      return next;
    });
    setActiveId(tab.id);
  }, []);

  /** Focuses a tab that already shows this, or opens a new one. */
  const focusOrAdd = useCallback(
    (matches: (t: WorkspaceTab) => boolean, create: () => WorkspaceTab) => {
      const existing = tabsRef.current.find(matches);
      if (existing) setActiveId(existing.id);
      else addTab(create());
    },
    [addTab]
  );

  const openDraft = useCallback(
    (draftId: string) => {
      focusOrAdd(
        (t) => t.kind === 'sql' && t.draftId === draftId,
        () => ({ id: createId('tab'), kind: 'sql', draftId })
      );
    },
    [focusOrAdd]
  );

  const newQuery = useCallback(
    async (sql = '', title?: string, profileId?: string | null) => {
      const draft = await createDraft(sql, title, profileId);
      addTab({ id: createId('tab'), kind: 'sql', draftId: draft.id });
    },
    [addTab, createDraft]
  );

  const openTableData = useCallback(
    (profileId: string, table: DbTable) => {
      focusOrAdd(
        (t) => t.kind === 'table' && t.profileId === profileId && t.table === table.name && t.schema === table.schema,
        () => ({
          id: createId('tab'),
          kind: 'table',
          profileId,
          table: table.name,
          schema: table.schema,
          objectType: table.type,
        })
      );
    },
    [focusOrAdd]
  );

  const openStructure = useCallback(
    (profileId: string, table: DbTable) => {
      focusOrAdd(
        (t) => t.kind === 'structure' && t.profileId === profileId && t.table === table.name && t.schema === table.schema,
        () => ({ id: createId('tab'), kind: 'structure', profileId, table: table.name, schema: table.schema })
      );
    },
    [focusOrAdd]
  );

  const openErDiagram = useCallback(
    (profileId: string, schema?: string) => {
      focusOrAdd(
        (t) => t.kind === 'er' && t.profileId === profileId && t.schema === schema,
        () => ({ id: createId('tab'), kind: 'er', profileId, schema }) as WorkspaceTab
      );
    },
    [focusOrAdd]
  );

  const openChat = useCallback(
    (conversationId: string) => {
      focusOrAdd(
        (t) => t.kind === 'ai' && t.conversationId === conversationId,
        () => ({ id: createId('tab'), kind: 'ai', conversationId })
      );
    },
    [focusOrAdd]
  );

  const openResultTab = useCallback(
    (title: string, result: QueryResult, sql?: string, profileId?: string) => {
      addTab({ id: createId('tab'), kind: 'result', title, result, sql, profileId });
    },
    [addTab]
  );

  const openSingleton = useCallback(
    (kind: 'connections' | 'settings') => {
      focusOrAdd(
        (t) => t.kind === kind,
        () => ({ id: createId('tab'), kind }) as WorkspaceTab
      );
    },
    [focusOrAdd]
  );

  const activateTab = useCallback((id: string) => setActiveId(id), []);

  const applyTabs = useCallback((next: WorkspaceTab[], closedIndex: number) => {
    setTabs(next);
    setActiveId((current) => {
      if (next.some((t) => t.id === current)) return current;
      return next[Math.min(closedIndex, next.length - 1)]?.id ?? null;
    });
  }, []);

  /** An untouched query leaves nothing behind; one with text stays available under SQL Editor. */
  const discardIfEmpty = useCallback(
    (tab: WorkspaceTab | undefined) => {
      if (tab?.kind !== 'sql') return;
      const draft = draftsRef.current.find((d) => d.id === tab.draftId);
      if (draft && !draft.sql.trim()) deleteDraft(draft.id);
    },
    [deleteDraft]
  );

  const closeTab = useCallback(
    (id: string) => {
      const index = tabsRef.current.findIndex((t) => t.id === id);
      discardIfEmpty(tabsRef.current[index]);
      applyTabs(tabsRef.current.filter((t) => t.id !== id), index);
      setRuns((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    },
    [applyTabs, discardIfEmpty]
  );
  const closeOtherTabs = useCallback(
    (id: string) => {
      tabsRef.current.filter((t) => t.id !== id).forEach(discardIfEmpty);
      setTabs((prev) => prev.filter((t) => t.id === id));
      setActiveId(id);
    },
    [discardIfEmpty]
  );
  const closeTabsToRight = useCallback(
    (id: string) => {
      const index = tabsRef.current.findIndex((t) => t.id === id);
      tabsRef.current.slice(index + 1).forEach(discardIfEmpty);
      applyTabs(tabsRef.current.slice(0, index + 1), index);
    },
    [applyTabs, discardIfEmpty]
  );
  const closeAllTabs = useCallback(() => {
    tabsRef.current.forEach(discardIfEmpty);
    setTabs([]);
    setActiveId(null);
  }, [discardIfEmpty]);
  const moveTab = useCallback((id: string, targetId: string) => {
    setTabs((prev) => {
      const from = prev.findIndex((t) => t.id === id);
      const to = prev.findIndex((t) => t.id === targetId);
      if (from < 0 || to < 0 || from === to) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }, []);
  const cycleTab = useCallback((direction: 1 | -1) => {
    const list = tabsRef.current;
    if (list.length === 0) return;
    const index = list.findIndex((t) => t.id === activeIdRef.current);
    setActiveId(list[(index + direction + list.length) % list.length].id);
  }, []);

  const setSidebarOpen = useCallback((open: boolean) => setSidebarOpenState(open), []);
  const toggleSidebar = useCallback(() => setSidebarOpenState((v) => !v), []);
  const setAiPanelOpen = useCallback((open: boolean) => setAiPanelOpenState(open), []);
  const toggleAiPanel = useCallback(() => setAiPanelOpenState((v) => !v), []);
  const setPanelOpen = useCallback((open: boolean) => {
    setPanelByKind((prev) => (prev[panelKindRef.current] === open ? prev : { ...prev, [panelKindRef.current]: open }));
  }, []);
  const togglePanel = useCallback(() => {
    setPanelByKind((prev) => ({ ...prev, [panelKindRef.current]: !prev[panelKindRef.current] }));
  }, []);

  const activityRef = useRef(activity);
  activityRef.current = activity;
  const selectActivity = useCallback((next: Activity) => {
    // Clicking the active item collapses the sidebar, as in VS Code.
    setSidebarOpenState((open) => (activityRef.current === next ? !open : true));
    setActivity(next);
  }, []);

  const runSql = useCallback(
    async (tabId: string, profileId: string, sql: string, options: RunOptions = {}) => {
      const statement = sql.trim();
      if (!statement) return;
      const profile = profiles.find((p) => p.id === profileId);
      if (!profile) {
        showToast('Choose a connection first.', 'warning');
        return;
      }

      const runId = createId('run');
      const startedAt = Date.now();
      const update = (patch: Partial<RunState>) =>
        setRuns((prev) => (prev[tabId]?.runId === runId ? { ...prev, [tabId]: { ...prev[tabId], ...patch } } : prev));
      const startRun = () => {
        setRuns((prev) => ({
          ...prev,
          [tabId]: {
            runId,
            profileId,
            sql: statement,
            status: 'running',
            startedAt,
            kind: options.explain ? 'explain' : 'query',
            result: prev[tabId]?.result,
          },
        }));
        if (!options.background) {
          setPanelByKind((prev) => ({ ...prev, sql: true }));
          setPanelView('results');
        }
      };
      const showError = (message: string) => {
        if (options.background) showToast(message, 'danger');
        else {
          setPanelByKind((prev) => ({ ...prev, sql: true }));
          setPanelView('results');
        }
        appendLog({ level: 'error', source: 'query', sql: statement, message });
      };

      const finish = async (execute: () => Promise<QueryResult>) => {
        try {
          const result = await execute();
          // Some statements return normally when cancelled (MySQL's SLEEP does): the cancel still stands.
          if (runsRef.current[tabId]?.runId === runId && runsRef.current[tabId]?.status === 'cancelled') {
            appendLog({ level: 'warning', source: 'query', sql: statement, message: 'Query cancelled' });
            return;
          }
          const durationMs = result.executionTimeMs;
          update({ status: 'success', result, error: undefined, durationMs });
          appendLog({
            level: 'success',
            source: 'query',
            sql: statement,
            message: `${options.explain ? 'Explain' : profile.name}: ${
              result.isCommand ? `${formatCount(result.rowCount)} rows affected` : `${formatCount(result.rowCount)} rows`
            } in ${formatDuration(durationMs)}`,
          });
          if (!options.explain) {
            addHistory({ sql: statement, durationMs, rowCount: result.rowCount, connectionName: profile.name });
          }
          if (MUTATING_DDL.test(statement)) loadSchema(profileId);
          options.onSuccess?.(result);
        } catch (err) {
          if (runsRef.current[tabId]?.runId === runId && runsRef.current[tabId]?.status === 'cancelled') {
            appendLog({ level: 'warning', source: 'query', sql: statement, message: 'Query cancelled' });
            return;
          }
          const message = cleanError(err, 'Execution failed');
          update({ status: 'error', error: message, durationMs: Date.now() - startedAt });
          showError(message);
        }
      };

      if (options.explain) {
        startRun();
        await finish(() => window.electronAPI.explainQuery(profileId, statement));
        return;
      }

      try {
        // The backend classifies the statement; a write needs a single-use approval token.
        const prep = await window.electronAPI.prepareQuery(profileId, statement);
        if (!prep.classification.isReadOnly) {
          if (!prep.proposal) return;
          openWarningModal({
            proposal: prep.proposal,
            onConfirm: (token) => {
              startRun();
              finish(() => window.electronAPI.executeQuery(profileId, statement, token, runId));
            },
            onCancel: () =>
              appendLog({ level: 'info', source: 'query', sql: statement, message: 'Statement not run: confirmation declined' }),
          });
          return;
        }
      } catch (err) {
        const message = cleanError(err);
        setRuns((prev) => ({
          ...prev,
          [tabId]: { runId, profileId, sql: statement, status: 'error', error: message, startedAt, durationMs: 0 },
        }));
        showError(message);
        return;
      }

      startRun();
      await finish(() => window.electronAPI.executeQuery(profileId, statement, undefined, runId));
    },
    [addHistory, appendLog, loadSchema, openWarningModal, profiles, showToast]
  );

  const recordRun = useCallback((tabId: string, run: RunState) => {
    setRuns((prev) => ({ ...prev, [tabId]: run }));
  }, []);

  const cancelRun = useCallback(
    async (tabId: string) => {
      const run = runsRef.current[tabId];
      if (!run || run.status !== 'running') return;
      const cancelled: RunState = { ...run, status: 'cancelled', durationMs: Date.now() - run.startedAt };
      runsRef.current = { ...runsRef.current, [tabId]: cancelled };
      setRuns((prev) => ({ ...prev, [tabId]: cancelled }));
      try {
        await window.electronAPI.cancelQuery(run.profileId, run.runId);
      } catch (err) {
        appendLog({ level: 'error', source: 'query', message: `Could not cancel: ${cleanError(err)}` });
      }
    },
    [appendLog]
  );

  const value = useMemo<WorkspaceContextType>(
    () => ({
      tabs,
      activeTab,
      activateTab,
      closeTab,
      closeOtherTabs,
      closeTabsToRight,
      closeAllTabs,
      moveTab,
      cycleTab,
      newQuery,
      openDraft,
      openTableData,
      openStructure,
      openErDiagram,
      openChat,
      openResultTab,
      openSingleton,
      activity,
      selectActivity,
      sidebarOpen,
      setSidebarOpen,
      toggleSidebar,
      panelOpen,
      setPanelOpen,
      togglePanel,
      panelView,
      setPanelView,
      paletteOpen,
      setPaletteOpen,
      aiPanelOpen,
      setAiPanelOpen,
      toggleAiPanel,
      runs,
      runSql,
      cancelRun,
      recordRun,
      logs,
      appendLog,
      clearLogs,
      history,
      addHistory,
      clearHistory,
    }),
    [
      tabs,
      activeTab,
      activateTab,
      closeTab,
      closeOtherTabs,
      closeTabsToRight,
      closeAllTabs,
      moveTab,
      cycleTab,
      newQuery,
      openDraft,
      openTableData,
      openStructure,
      openErDiagram,
      openChat,
      openResultTab,
      openSingleton,
      activity,
      selectActivity,
      sidebarOpen,
      setSidebarOpen,
      toggleSidebar,
      panelOpen,
      setPanelOpen,
      togglePanel,
      panelView,
      paletteOpen,
      aiPanelOpen,
      setAiPanelOpen,
      toggleAiPanel,
      runs,
      runSql,
      cancelRun,
      recordRun,
      logs,
      appendLog,
      clearLogs,
      history,
      addHistory,
      clearHistory,
    ]
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
};

export const useWorkspace = () => {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error('useWorkspace must be used within a WorkspaceProvider');
  return context;
};
