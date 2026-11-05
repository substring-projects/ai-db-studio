import React, { useState, useEffect } from 'react';
import {
  Play,
  StopCircle,
  Plus,
  X,
  Clock,
  PanelRightClose,
  PanelRightOpen,
  FileCode,
  Edit2,
  Trash2,
  ChevronDown,
} from 'lucide-react';
import { useStudio } from '../../context/StudioContext';
import { SqlEditor } from './SqlEditor';
import { QueryResultsGrid } from './QueryResultsGrid';
import { DatabaseExplorer } from './DatabaseExplorer';
import { DbTable, FilterRule, QueryHistoryItem, QueryResult } from '../../../shared/types';

export const Workbench: React.FC = () => {
  const {
    activeProfile,
    drafts,
    activeDraftId,
    openDraftIds,
    openDraft,
    closeDraft,
    closeOtherDrafts,
    closeAllDrafts,
    closeDraftsToRight,
    saveDraft,
    deleteDraft,
    createNewDraft,
    openWarningModal,
    openDangerModal,
    openPromptModal,
    showToast,
  } = useStudio();

  // Active SQL content
  const activeDraft = drafts.find((d) => d.id === activeDraftId) || drafts[0];
  const [sql, setSql] = useState(activeDraft?.sql || 'SELECT 1;');

  // Sync editor when active draft changes
  useEffect(() => {
    if (activeDraft) {
      setSql(activeDraft.sql);
    }
  }, [activeDraft?.id]);

  const handleSqlChange = (newSql: string) => {
    setSql(newSql);
    if (activeDraft) {
      saveDraft({ ...activeDraft, sql: newSql });
    }
  };

  // Query Execution State
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // History state
  const [historyList, setHistoryList] = useState<QueryHistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // Explorer collapse state
  const [explorerVisible, setExplorerVisible] = useState(true);

  // Tab Context Menu state
  const [tabContextMenu, setTabContextMenu] = useState<{ x: number; y: number; draftId: string } | null>(null);

  const loadHistory = async () => {
    try {
      const list = await window.electronAPI.getHistory();
      setHistoryList(list);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  // Close context menu on outside click
  useEffect(() => {
    const handleOutside = () => {
      setTabContextMenu(null);
      setShowHistory(false);
    };
    window.addEventListener('click', handleOutside);
    return () => window.removeEventListener('click', handleOutside);
  }, []);

  const execute = async (customSql?: string, overrideToken?: string) => {
    if (!activeProfile) {
      showToast('Please select a database profile first.', 'warning');
      return;
    }
    const statement = customSql || sql;
    if (!statement.trim()) return;

    setRunning(true);
    setError(null);

    try {
      // 1. Prepare query and check safety rails
      const prep = await window.electronAPI.prepareQuery(activeProfile.id, statement);

      if (!prep.classification.isReadOnly && !overrideToken) {
        setRunning(false);
        if (prep.proposal) {
          openWarningModal({
            proposal: prep.proposal,
            onConfirm: (token) => execute(statement, token),
            onCancel: () => showToast('Execution cancelled by user', 'info'),
          });
        }
        return;
      }

      // 2. Execute query
      const res = await window.electronAPI.executeQuery(activeProfile.id, statement, overrideToken);
      setResults(res);

      // 3. Log to history
      await window.electronAPI.addHistory({
        sql: statement,
        durationMs: res.executionTimeMs,
        rowCount: res.rowCount,
        connectionName: activeProfile.name,
      });
      loadHistory();
    } catch (err: any) {
      setError(err.message || 'Execution error');
      setResults(null);
    } finally {
      setRunning(false);
    }
  };

  const handleSelectTableData = async (table: DbTable, rules?: FilterRule[], matchAny?: boolean) => {
    if (!activeProfile) return;
    setRunning(true);
    setError(null);
    try {
      const res = await window.electronAPI.getTableData(
        activeProfile.id,
        table.name,
        100,
        0,
        undefined,
        false,
        rules,
        matchAny
      );
      setResults(res);
      showToast(`Loaded ${res.rowCount} rows from ${table.name}`, 'info');
    } catch (err: any) {
      setError(err.message || 'Failed to load table data');
      setResults(null);
    } finally {
      setRunning(false);
    }
  };

  const handleQueryTable = (table: DbTable) => {
    const query = `SELECT * FROM ${table.name} LIMIT 100;`;
    createNewDraft(query, `${table.name}`);
  };

  return (
    <div className="flex-1 flex overflow-hidden bg-studio-bg">
      {/* Main Workspace (Editor + Results Grid) */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Tab Bar */}
        <div className="h-10 px-2 flex items-center gap-1 border-b border-studio-border bg-studio-surface/40 overflow-x-auto shrink-0 select-none">
          {openDraftIds.map((dId) => {
            const draft = drafts.find((d) => d.id === dId);
            if (!draft) return null;
            const isActive = activeDraftId === dId;

            return (
              <div
                key={dId}
                onClick={() => openDraft(draft)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setTabContextMenu({ x: e.clientX, y: e.clientY, draftId: dId });
                }}
                className={`group flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs cursor-pointer border transition-all ${
                  isActive
                    ? 'bg-studio-surface text-studio-text border-studio-border shadow-xs font-medium'
                    : 'text-studio-muted hover:text-studio-text hover:bg-white/5 border-transparent'
                }`}
              >
                <FileCode className={`w-3.5 h-3.5 ${isActive ? 'text-studio-accent' : 'text-studio-muted'}`} />
                <span className="truncate max-w-[120px]">{draft.title}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    closeDraft(dId);
                  }}
                  className="p-0.5 rounded hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}

          <button
            onClick={() => createNewDraft()}
            title="New SQL Draft"
            className="p-1.5 text-studio-muted hover:text-studio-text hover:bg-white/5 rounded-lg transition-colors cursor-pointer ml-1"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Execution Toolbar */}
        <div className="h-11 px-4 flex items-center justify-between border-b border-studio-border bg-studio-bg shrink-0 select-none">
          <div className="flex items-center gap-3">
            <button
              onClick={() => execute()}
              disabled={running}
              className="px-3.5 py-1.5 text-xs font-semibold text-studio-sidebar bg-studio-accent hover:bg-studio-accentHover active:scale-95 disabled:opacity-50 rounded-lg flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
            >
              {running ? (
                <div className="w-3.5 h-3.5 border-2 border-studio-sidebar border-t-transparent rounded-full animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5 fill-current" />
              )}
              <span>Run Query</span>
              <span className="text-[10px] opacity-75 font-mono ml-1">⌘↵</span>
            </button>

            {/* Query History dropdown */}
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowHistory(!showHistory);
                }}
                className="px-2.5 py-1.5 text-xs font-medium text-studio-muted hover:text-studio-text hover:bg-white/5 border border-studio-border rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Clock className="w-3.5 h-3.5" />
                <span>History</span>
                <ChevronDown className="w-3 h-3" />
              </button>

              {showHistory && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="absolute left-0 top-10 w-96 max-h-72 overflow-y-auto bg-studio-surface border border-studio-border rounded-xl shadow-2xl z-30 p-1.5 text-xs select-none animate-pop-in"
                >
                  <div className="px-3 py-2 text-[11px] font-semibold text-studio-muted border-b border-studio-border flex justify-between">
                    <span>Recent Executions</span>
                    <button
                      onClick={() => {
                        window.electronAPI.clearHistory();
                        setHistoryList([]);
                      }}
                      className="text-red-400 hover:underline cursor-pointer"
                    >
                      Clear
                    </button>
                  </div>
                  {historyList.length === 0 ? (
                    <div className="p-4 text-center text-studio-muted italic">No query history yet.</div>
                  ) : (
                    historyList.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => {
                          handleSqlChange(item.sql);
                          setShowHistory(false);
                          showToast('Restored query from history', 'info');
                        }}
                        className="p-2 hover:bg-white/5 rounded-lg cursor-pointer transition-colors"
                      >
                        <div className="font-mono text-studio-text truncate">{item.sql}</div>
                        <div className="text-[10px] text-studio-muted flex gap-3 mt-1">
                          <span>{item.connectionName}</span>
                          <span>{item.durationMs}ms</span>
                          <span>{item.rowCount} rows</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Toggle Explorer Button */}
          <button
            onClick={() => setExplorerVisible(!explorerVisible)}
            title={explorerVisible ? 'Hide Database Explorer' : 'Show Database Explorer'}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-studio-muted hover:text-studio-text hover:bg-white/5 border border-studio-border rounded-lg transition-colors cursor-pointer"
          >
            {explorerVisible ? (
              <PanelRightClose className="w-3.5 h-3.5" />
            ) : (
              <PanelRightOpen className="w-3.5 h-3.5 text-studio-accent" />
            )}
            <span>Explorer</span>
          </button>
        </div>

        {/* Editor Area */}
        <div className="h-64 shrink-0">
          <SqlEditor value={sql} onChange={handleSqlChange} onExecute={() => execute()} />
        </div>

        {/* Results Area */}
        <div className="flex-1 flex flex-col min-h-0">
          <QueryResultsGrid results={results} loading={running} error={error} />
        </div>
      </div>

      {/* Database Explorer on the RIGHT */}
      {explorerVisible && (
        <DatabaseExplorer
          onSelectTableData={handleSelectTableData}
          onQueryTable={handleQueryTable}
          onClose={() => setExplorerVisible(false)}
        />
      )}

      {/* Tab Context Menu */}
      {tabContextMenu && (
        <div
          style={{ top: tabContextMenu.y, left: tabContextMenu.x }}
          className="fixed z-50 w-52 py-1.5 bg-studio-surface border border-studio-border rounded-xl shadow-2xl text-xs select-none animate-pop-in"
        >
          <button
            onClick={() => {
              const draft = drafts.find((d) => d.id === tabContextMenu.draftId);
              if (draft) {
                openPromptModal({
                  title: 'Rename SQL Draft',
                  subtitle: 'Choose a descriptive title for this draft.',
                  fieldLabel: 'Draft Title',
                  initialValue: draft.title,
                  placeholder: 'Title…',
                  validate: (v) => Boolean(v.trim()),
                  errorMsg: 'Title cannot be empty.',
                  onConfirm: (newTitle) => {
                    saveDraft({ ...draft, title: newTitle });
                    showToast(`Draft renamed to “${newTitle}”`, 'success');
                  },
                });
              }
              setTabContextMenu(null);
            }}
            className="w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-white/5 text-studio-text text-left cursor-pointer"
          >
            <Edit2 className="w-3.5 h-3.5 text-purple-400" />
            <span>Rename Draft…</span>
          </button>

          <button
            onClick={() => {
              closeDraft(tabContextMenu.draftId);
              setTabContextMenu(null);
            }}
            className="w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-white/5 text-studio-text text-left cursor-pointer"
          >
            <X className="w-3.5 h-3.5 text-studio-muted" />
            <span>Close Tab</span>
          </button>

          <button
            onClick={() => {
              closeOtherDrafts(tabContextMenu.draftId);
              setTabContextMenu(null);
            }}
            className="w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-white/5 text-studio-text text-left cursor-pointer"
          >
            <X className="w-3.5 h-3.5 text-studio-muted" />
            <span>Close Other Tabs</span>
          </button>

          <button
            onClick={() => {
              closeDraftsToRight(tabContextMenu.draftId);
              setTabContextMenu(null);
            }}
            className="w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-white/5 text-studio-text text-left cursor-pointer"
          >
            <X className="w-3.5 h-3.5 text-studio-muted" />
            <span>Close Tabs to the Right</span>
          </button>

          <button
            onClick={() => {
              closeAllDrafts();
              setTabContextMenu(null);
            }}
            className="w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-white/5 text-studio-text text-left cursor-pointer"
          >
            <X className="w-3.5 h-3.5 text-studio-muted" />
            <span>Close All Tabs</span>
          </button>

          <div className="h-px bg-studio-border my-1" />

          <button
            onClick={() => {
              const draft = drafts.find((d) => d.id === tabContextMenu.draftId);
              if (draft) {
                openDangerModal({
                  title: 'Delete SQL Draft?',
                  subtitle: 'This permanently removes the draft from storage.',
                  message: `Are you sure you want to delete “${draft.title}”?`,
                  actionText: 'Delete Draft',
                  onConfirm: () => deleteDraft(draft.id),
                });
              }
              setTabContextMenu(null);
            }}
            className="w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-red-500/10 text-red-400 text-left cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5 text-red-400" />
            <span>Delete Draft</span>
          </button>
        </div>
      )}
    </div>
  );
};
