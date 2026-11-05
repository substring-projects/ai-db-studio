import React, { useState, useEffect } from 'react';
import {
  Play,
  Plus,
  X,
  Clock,
  PanelRightClose,
  PanelRightOpen,
  FileCode,
  Edit2,
  Trash2,
  ChevronDown,
  Sparkles,
  HelpCircle,
  Binary,
} from 'lucide-react';
import { useStudio } from '../../context/StudioContext';
import { SqlEditor } from './SqlEditor';
import { QueryResultsGrid } from './QueryResultsGrid';
import { DatabaseExplorer } from './DatabaseExplorer';
import { AiAssistantPanel } from './AiAssistantPanel';
import { TableStructureModal } from '../Modals/TableStructureModal';
import { InsertRowModal } from '../Modals/InsertRowModal';
import { EditCellModal } from '../Modals/EditCellModal';
import { CreateTableModal } from '../Modals/CreateTableModal';
import {
  DbTable,
  FilterRule,
  QueryHistoryItem,
  QueryResult,
  TableColumn,
  TableStructure,
} from '../../../shared/types';

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

  // Active Table Context for CRUD
  const [currentTable, setCurrentTable] = useState<DbTable | null>(null);
  const [currentTableColumns, setCurrentTableColumns] = useState<TableColumn[]>([]);
  const [lastFilterRules, setLastFilterRules] = useState<{ rules?: FilterRule[]; matchAny?: boolean }>({});

  // Explorer & AI Panel visibility
  const [explorerVisible, setExplorerVisible] = useState(true);
  const [aiPanelVisible, setAiPanelVisible] = useState(false);

  // Database Schema caching (for AI Copilot)
  const [schemaTables, setSchemaTables] = useState<DbTable[]>([]);
  const [schemaColumnsMap, setSchemaColumnsMap] = useState<Record<string, TableColumn[]>>({});

  // Modals state
  const [structureModal, setStructureModal] = useState<TableStructure | null>(null);
  const [insertModalOpen, setInsertModalOpen] = useState(false);
  const [createTableModalOpen, setCreateTableModalOpen] = useState(false);
  const [editCellState, setEditCellState] = useState<{
    tableName: string;
    columnName: string;
    initialValue: any;
    pkColumn?: string;
    pkValue?: any;
    rowColumns?: string[];
    rowData?: any[];
    engine?: string;
  } | null>(null);

  // History state
  const [historyList, setHistoryList] = useState<QueryHistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);

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

  // Execute SQL statement with safety rails & token approval
  const execute = async (customSql?: string, overrideToken?: string, refreshTableAfter = false) => {
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
            onConfirm: (token) => execute(statement, token, refreshTableAfter),
            onCancel: () => showToast('Execution cancelled by user', 'info'),
          });
        }
        return;
      }

      // 2. Execute query
      const res = await window.electronAPI.executeQuery(activeProfile.id, statement, overrideToken);

      // 3. Log to history
      await window.electronAPI.addHistory({
        sql: statement,
        durationMs: res.executionTimeMs,
        rowCount: res.rowCount,
        connectionName: activeProfile.name,
      });
      loadHistory();

      if (refreshTableAfter && currentTable) {
        await handleSelectTableData(currentTable, lastFilterRules.rules, lastFilterRules.matchAny);
        showToast('Table data updated successfully', 'success');
      } else {
        setResults(res);
      }
    } catch (err: any) {
      setError(err.message || 'Execution error');
      setResults(null);
    } finally {
      setRunning(false);
    }
  };

  // Explain Query Plan
  const explain = async () => {
    if (!activeProfile) {
      showToast('Please select a database profile first.', 'warning');
      return;
    }
    if (!sql.trim()) return;

    setRunning(true);
    setError(null);

    try {
      const res = await window.electronAPI.explainQuery(activeProfile.id, sql);
      setResults(res);
      showToast('Query execution plan retrieved', 'info');
    } catch (err: any) {
      setError(err.message || 'Execution plan failed');
      setResults(null);
    } finally {
      setRunning(false);
    }
  };

  // Select Table Data from Explorer
  const handleSelectTableData = async (table: DbTable, rules?: FilterRule[], matchAny?: boolean) => {
    if (!activeProfile) return;
    setRunning(true);
    setError(null);
    setCurrentTable(table);
    setLastFilterRules({ rules, matchAny });

    try {
      // Load columns definition for this table if not cached
      const cols = await window.electronAPI.getColumns(activeProfile.id, table.name);
      setCurrentTableColumns(cols);

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
    const query = `SELECT * FROM "${table.name}" LIMIT 100;`;
    createNewDraft(query, `${table.name}`);
  };

  // Inspect Table Structure
  const handleInspectStructure = async (table: DbTable) => {
    if (!activeProfile) return;
    try {
      const struct = await window.electronAPI.getTableStructure(activeProfile.id, table.name);
      setStructureModal(struct);
    } catch (err: any) {
      showToast(err.message || 'Failed to inspect table structure', 'danger');
    }
  };

  // Drop Table with confirmation
  const handleDropTable = (table: DbTable) => {
    openDangerModal({
      title: 'Drop Table?',
      subtitle: `This permanently destroys table "${table.name}" and all records within it.`,
      message: `Are you sure you want to drop table "${table.name}"? This action cannot be undone.`,
      actionText: 'Drop Table',
      onConfirm: () => {
        execute(`DROP TABLE "${table.name}";`);
      },
    });
  };

  // Truncate Table with confirmation
  const handleTruncateTable = (table: DbTable) => {
    openDangerModal({
      title: 'Truncate Table?',
      subtitle: `This immediately deletes ALL rows inside table "${table.name}".`,
      message: `Are you sure you want to truncate table "${table.name}"?`,
      actionText: 'Truncate Table',
      onConfirm: () => {
        execute(`TRUNCATE TABLE "${table.name}";`, undefined, true);
      },
    });
  };

  // Grid Cell Edit handler
  const handleEditCell = (column: string, value: any, rowIndex: number, row: any[]) => {
    if (!currentTable) return;

    // Detect PK column (case-insensitive)
    const pkCol = currentTableColumns.find((c) => c.primaryKey);
    let pkValue: any = undefined;

    if (pkCol && results) {
      const pkIdx = results.columns.findIndex((c) => c.toLowerCase() === pkCol.name.toLowerCase());
      if (pkIdx >= 0) {
        pkValue = row[pkIdx];
      }
    }

    setEditCellState({
      tableName: currentTable.name,
      columnName: column,
      initialValue: value,
      pkColumn: pkCol?.name,
      pkValue,
      rowColumns: results?.columns,
      rowData: row,
      engine: activeProfile?.engine,
    });
  };

  // Grid Row Delete handler
  const handleDeleteRow = (rowIndex: number, row: any[]) => {
    if (!currentTable || !results) return;

    const isPg = activeProfile?.engine === 'POSTGRESQL';
    const quote = (id: string) => (isPg ? `"${id.replace(/"/g, '""')}"` : `\`${id.replace(/`/g, '``')}\``);

    const pkCol = currentTableColumns.find((c) => c.primaryKey);
    let whereClause = '';

    if (pkCol) {
      const pkIdx = results.columns.findIndex((c) => c.toLowerCase() === pkCol.name.toLowerCase());
      if (pkIdx >= 0) {
        const pkVal = row[pkIdx];
        whereClause = `WHERE ${quote(pkCol.name)} = '${String(pkVal).replace(/'/g, "''")}'`;
      }
    }

    if (!whereClause) {
      // Fallback matching row columns
      const conditions = results.columns
        .map((col, idx) => {
          const val = row[idx];
          if (val === null || val === undefined) return `${quote(col)} IS NULL`;
          return `${quote(col)} = '${String(val).replace(/'/g, "''")}'`;
        })
        .slice(0, 5)
        .join(' AND ');
      whereClause = `WHERE ${conditions}`;
    }

    const deleteSql = `DELETE FROM ${quote(currentTable.name)} ${whereClause};`;

    openDangerModal({
      title: 'Delete Row?',
      subtitle: `Table: ${currentTable.name}`,
      message: `Are you sure you want to delete this row?\n${deleteSql}`,
      actionText: 'Delete Row',
      onConfirm: () => {
        execute(deleteSql, undefined, true);
      },
    });
  };

  return (
    <div className="flex-1 flex overflow-hidden bg-studio-bg">
      {/* Main Workspace (Editor + Results Grid) */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Tab Bar */}
        <div className="h-10 px-2 flex items-center gap-1 border-b border-border bg-card/40 overflow-x-auto shrink-0 select-none">
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
                    ? 'bg-card text-foreground border-border shadow-2xs font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/70 border-transparent'
                }`}
              >
                <FileCode className={`w-3.5 h-3.5 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
                <span className="truncate max-w-[120px]">{draft.title}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    closeDraft(dId);
                  }}
                  className="p-0.5 rounded hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}

          <button
            onClick={() => createNewDraft()}
            title="New SQL Draft"
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors cursor-pointer ml-1"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Execution Toolbar */}
        <div className="h-11 px-4 flex items-center justify-between border-b border-border bg-background shrink-0 select-none">
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => execute()}
              disabled={running}
              className="px-3.5 py-1.5 text-xs font-semibold text-white bg-studio-accent hover:bg-studio-accentHover active:scale-95 disabled:opacity-50 rounded-lg flex items-center gap-1.5 shadow-sm shadow-primary/20 transition-all cursor-pointer"
            >
              {running ? (
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5 fill-current" />
              )}
              <span>Run Query</span>
              <span className="text-[10px] opacity-80 font-mono ml-0.5">⌘↵</span>
            </button>

            <button
              onClick={explain}
              disabled={running}
              title="Explain Query Execution Plan"
              className="px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent border border-border rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Binary className="w-3.5 h-3.5 text-cyan-500" />
              <span>Explain</span>
            </button>

            {/* Query History dropdown */}
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowHistory(!showHistory);
                }}
                className="px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent border border-border rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Clock className="w-3.5 h-3.5" />
                <span>History</span>
                <ChevronDown className="w-3 h-3" />
              </button>

              {showHistory && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="absolute left-0 top-10 w-96 max-h-72 overflow-y-auto bg-popover text-popover-foreground border border-border rounded-xl shadow-2xl z-30 p-1.5 text-xs select-none animate-pop-in"
                >
                  <div className="px-3 py-2 text-[11px] font-semibold text-muted-foreground border-b border-border flex justify-between">
                    <span>Recent Executions</span>
                    <button
                      onClick={() => {
                        window.electronAPI.clearHistory();
                        setHistoryList([]);
                      }}
                      className="text-destructive hover:underline cursor-pointer"
                    >
                      Clear
                    </button>
                  </div>
                  {historyList.length === 0 ? (
                    <div className="p-4 text-center text-muted-foreground italic">No query history yet.</div>
                  ) : (
                    historyList.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => {
                          handleSqlChange(item.sql);
                          setShowHistory(false);
                          showToast('Restored query from history', 'info');
                        }}
                        className="p-2 hover:bg-accent hover:text-accent-foreground rounded-lg cursor-pointer transition-colors"
                      >
                        <div className="font-mono text-foreground truncate">{item.sql}</div>
                        <div className="text-[10px] text-muted-foreground flex gap-3 mt-1">
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

          <div className="flex items-center gap-2">
            {/* Toggle AI Copilot */}
            <button
              onClick={() => setAiPanelVisible(!aiPanelVisible)}
              title={aiPanelVisible ? 'Hide AI SQL Copilot' : 'Open AI SQL Copilot'}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-all cursor-pointer ${
                aiPanelVisible
                  ? 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent border-border'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-purple-500" />
              <span>AI Copilot</span>
            </button>

            {/* Toggle Explorer Button */}
            <button
              onClick={() => setExplorerVisible(!explorerVisible)}
              title={explorerVisible ? 'Hide Database Explorer' : 'Show Database Explorer'}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent border border-border rounded-lg transition-colors cursor-pointer"
            >
              {explorerVisible ? (
                <PanelRightClose className="w-3.5 h-3.5" />
              ) : (
                <PanelRightOpen className="w-3.5 h-3.5 text-primary" />
              )}
              <span>Explorer</span>
            </button>
          </div>
        </div>

        {/* Editor Area */}
        <div className="h-60 shrink-0">
          <SqlEditor
            value={sql}
            onChange={handleSqlChange}
            onExecute={() => execute()}
            onExplain={explain}
          />
        </div>

        {/* Results Area */}
        <div className="flex-1 flex flex-col min-h-0">
          <QueryResultsGrid
            results={results}
            loading={running}
            error={error}
            tableName={currentTable?.name}
            onEditCell={handleEditCell}
            onInsertRow={() => setInsertModalOpen(true)}
            onDeleteRow={handleDeleteRow}
            onRefresh={() => {
              if (currentTable) {
                handleSelectTableData(currentTable, lastFilterRules.rules, lastFilterRules.matchAny);
              } else {
                execute();
              }
            }}
          />
        </div>
      </div>

      {/* Database Explorer */}
      {explorerVisible && (
        <DatabaseExplorer
          onSelectTableData={handleSelectTableData}
          onQueryTable={handleQueryTable}
          onInspectStructure={handleInspectStructure}
          onCreateTable={() => setCreateTableModalOpen(true)}
          onDropTable={handleDropTable}
          onTruncateTable={handleTruncateTable}
          onClose={() => setExplorerVisible(false)}
          onSchemaUpdate={(tables, columns) => {
            setSchemaTables(tables);
            setSchemaColumnsMap(columns);
          }}
        />
      )}

      {/* AI Assistant Panel */}
      {aiPanelVisible && (
        <AiAssistantPanel
          tables={schemaTables}
          columnsMap={schemaColumnsMap}
          onInsertSql={(newSql) => {
            handleSqlChange(newSql);
          }}
          onExecuteSql={(newSql) => {
            handleSqlChange(newSql);
            execute(newSql);
          }}
          onClose={() => setAiPanelVisible(false)}
        />
      )}

      {/* Tab Context Menu */}
      {tabContextMenu && (
        <div
          style={{ top: tabContextMenu.y, left: tabContextMenu.x }}
          className="fixed z-50 w-52 py-1.5 bg-popover text-popover-foreground border border-border rounded-xl shadow-2xl text-xs select-none animate-pop-in"
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
            className="w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-accent hover:text-accent-foreground text-left cursor-pointer"
          >
            <Edit2 className="w-3.5 h-3.5 text-purple-400" />
            <span>Rename Draft…</span>
          </button>

          <button
            onClick={() => {
              closeDraft(tabContextMenu.draftId);
              setTabContextMenu(null);
            }}
            className="w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-accent hover:text-accent-foreground text-left cursor-pointer"
          >
            <X className="w-3.5 h-3.5 text-muted-foreground" />
            <span>Close Tab</span>
          </button>

          <button
            onClick={() => {
              closeOtherDrafts(tabContextMenu.draftId);
              setTabContextMenu(null);
            }}
            className="w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-accent hover:text-accent-foreground text-left cursor-pointer"
          >
            <X className="w-3.5 h-3.5 text-muted-foreground" />
            <span>Close Other Tabs</span>
          </button>

          <button
            onClick={() => {
              closeDraftsToRight(tabContextMenu.draftId);
              setTabContextMenu(null);
            }}
            className="w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-accent hover:text-accent-foreground text-left cursor-pointer"
          >
            <X className="w-3.5 h-3.5 text-muted-foreground" />
            <span>Close Tabs to the Right</span>
          </button>

          <button
            onClick={() => {
              closeAllDrafts();
              setTabContextMenu(null);
            }}
            className="w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-accent hover:text-accent-foreground text-left cursor-pointer"
          >
            <X className="w-3.5 h-3.5 text-muted-foreground" />
            <span>Close All Tabs</span>
          </button>

          <div className="h-px bg-border my-1" />

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

      {/* Table Structure Modal */}
      {structureModal && (
        <TableStructureModal
          structure={structureModal}
          onClose={() => setStructureModal(null)}
        />
      )}

      {/* Insert Row Modal */}
      {insertModalOpen && currentTable && (
        <InsertRowModal
          tableName={currentTable.name}
          columns={currentTableColumns}
          engine={activeProfile?.engine}
          onInsert={(sql) => execute(sql, undefined, true)}
          onClose={() => setInsertModalOpen(false)}
        />
      )}

      {/* Edit Cell Modal */}
      {editCellState && (
        <EditCellModal
          tableName={editCellState.tableName}
          columnName={editCellState.columnName}
          initialValue={editCellState.initialValue}
          pkColumn={editCellState.pkColumn}
          pkValue={editCellState.pkValue}
          rowColumns={editCellState.rowColumns}
          rowData={editCellState.rowData}
          engine={editCellState.engine}
          onSave={(sql) => execute(sql, undefined, true)}
          onClose={() => setEditCellState(null)}
        />
      )}

      {/* Create Table Modal */}
      {createTableModalOpen && (
        <CreateTableModal
          onExecuteDdl={(ddl) => execute(ddl)}
          onClose={() => setCreateTableModalOpen(false)}
        />
      )}
    </div>
  );
};
