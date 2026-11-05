import React, { useState, useEffect } from 'react';
import {
  Table2,
  Eye,
  Key,
  ChevronRight,
  ChevronDown,
  Search,
  RefreshCw,
  Sliders,
  Play,
  Copy,
  SlidersHorizontal,
  X,
  Plus,
  Info,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import { DbTable, TableColumn, FilterRule } from '../../../shared/types';
import { useStudio } from '../../context/StudioContext';
import { AdvancedFilterModal } from '../Modals/AdvancedFilterModal';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';

interface DatabaseExplorerProps {
  onSelectTableData: (table: DbTable, rules?: FilterRule[], matchAny?: boolean) => void;
  onQueryTable: (table: DbTable) => void;
  onInspectStructure: (table: DbTable) => void;
  onCreateTable: () => void;
  onDropTable: (table: DbTable) => void;
  onTruncateTable: (table: DbTable) => void;
  onClose: () => void;
  onSchemaUpdate?: (tables: DbTable[], columnsMap: Record<string, TableColumn[]>) => void;
  initialColumnsMap?: Record<string, TableColumn[]>;
  width?: number;
}

export const DatabaseExplorer: React.FC<DatabaseExplorerProps> = ({
  onSelectTableData,
  onQueryTable,
  onInspectStructure,
  onCreateTable,
  onDropTable,
  onTruncateTable,
  onClose,
  onSchemaUpdate,
  initialColumnsMap,
  width,
}) => {
  const { activeProfile, connectedProfileIds, connectProfile, showToast } = useStudio();
  const isConnected = activeProfile && connectedProfileIds.includes(activeProfile.id);

  const [tables, setTables] = useState<DbTable[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [expandedTable, setExpandedTable] = useState<string | null>(null);
  const [columnsMap, setColumnsMap] = useState<Record<string, TableColumn[]>>(initialColumnsMap || {});

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; table: DbTable } | null>(null);

  // Advanced filter modal
  const [filterModalTable, setFilterModalTable] = useState<DbTable | null>(null);
  const [tableFilterRules, setTableFilterRules] = useState<Record<string, { rules: FilterRule[]; matchAny: boolean }>>({});

  // Sync with initialColumnsMap when provided
  useEffect(() => {
    if (initialColumnsMap && Object.keys(initialColumnsMap).length > 0) {
      setColumnsMap((prev) => ({ ...prev, ...initialColumnsMap }));
    }
  }, [initialColumnsMap]);

  const loadTables = async () => {
    if (!activeProfile || !isConnected) return;
    setLoading(true);
    try {
      const [res, allCols] = await Promise.all([
        window.electronAPI.getTables(activeProfile.id),
        window.electronAPI.getAllColumns(activeProfile.id).catch(() => ({})),
      ]);
      setTables(res);
      const mergedCols = { ...columnsMap, ...(allCols || {}) };
      setColumnsMap(mergedCols);
      if (onSchemaUpdate) {
        onSchemaUpdate(res, mergedCols);
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to load tables', 'danger');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isConnected) {
      loadTables();
    } else {
      setTables([]);
      setColumnsMap({});
      setExpandedTable(null);
    }
  }, [activeProfile?.id, isConnected]);

  const toggleExpand = async (table: DbTable) => {
    if (expandedTable === table.name) {
      setExpandedTable(null);
      return;
    }
    setExpandedTable(table.name);

    if (!columnsMap[table.name] && activeProfile) {
      try {
        const cols = await window.electronAPI.getColumns(activeProfile.id, table.name);
        const updated = { ...columnsMap, [table.name]: cols };
        setColumnsMap(updated);
        if (onSchemaUpdate) {
          onSchemaUpdate(tables, updated);
        }
      } catch (err: any) {
        showToast(err.message || 'Failed to load columns', 'danger');
      }
    }
  };

  const handleContextMenu = (e: React.MouseEvent, table: DbTable) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, table });
  };

  // Close context menu on outside click
  useEffect(() => {
    const handleOutside = () => setContextMenu(null);
    window.addEventListener('click', handleOutside);
    return () => window.removeEventListener('click', handleOutside);
  }, []);

  const filtered = tables.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div
      style={{ width: width ? `${width}px` : undefined }}
      className={`h-full flex flex-col bg-studio-sidebar border-l border-border shrink-0 select-none ${
        width ? '' : 'w-80'
      }`}
    >
      {/* Explorer Header */}
      <div className="h-11 px-3.5 flex items-center justify-between border-b border-border bg-card/40 shrink-0">
        <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
          <Table2 className="w-4 h-4 text-primary" />
          <span>Explorer</span>
          {tables.length > 0 && (
            <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
              {tables.length}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          {isConnected && (
            <Button
              onClick={onCreateTable}
              title="Create New Table"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
            >
              <Plus className="w-3.5 h-3.5" />
            </Button>
          )}
          <Button
            onClick={loadTables}
            disabled={!isConnected || loading}
            title="Refresh objects"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            onClick={onClose}
            title="Collapse Explorer"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Connection Prompt if not connected */}
      {!isConnected && (
        <div className="p-5 flex flex-col items-center justify-center text-center gap-3 text-xs flex-1">
          <p className="text-muted-foreground leading-relaxed">
            {activeProfile
              ? `Profile “${activeProfile.name}” is disconnected.`
              : 'Choose a profile to browse database objects.'}
          </p>
          {activeProfile && (
            <Button
              onClick={() => connectProfile(activeProfile)}
              variant="accent"
              className="text-xs"
            >
              Connect
            </Button>
          )}
        </div>
      )}

      {/* Explorer Body */}
      {isConnected && (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Search Bar */}
          <div className="p-2.5 border-b border-border">
            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tables & views…"
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-background border border-input rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>

          {/* Table List */}
          <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
            {loading && tables.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">Loading objects…</div>
            ) : filtered.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">No tables found.</div>
            ) : (
              filtered.map((table) => {
                const isExpanded = expandedTable === table.name;
                const columns = columnsMap[table.name];
                const activeFilter = tableFilterRules[table.name];

                return (
                  <div key={table.name} className="flex flex-col">
                    {/* Table row */}
                    <div
                      onContextMenu={(e) => handleContextMenu(e, table)}
                      className={`group flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition-colors ${
                        isExpanded ? 'bg-accent text-accent-foreground font-semibold' : 'hover:bg-accent/60 text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <div
                        onClick={() => toggleExpand(table)}
                        className="flex items-center gap-2 flex-1 min-w-0"
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-3.5 h-3.5 text-primary shrink-0" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        )}
                        {table.type === 'VIEW' ? (
                          <Eye className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                        ) : (
                          <Table2 className="w-3.5 h-3.5 text-primary shrink-0" />
                        )}
                        <span className="truncate">{table.name}</span>
                      </div>

                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {activeFilter && activeFilter.rules.length > 0 && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-blue-500/15 text-blue-500">
                            F({activeFilter.rules.length})
                          </span>
                        )}
                        <button
                          onClick={() => onSelectTableData(table, activeFilter?.rules, activeFilter?.matchAny)}
                          title="View Data (Top 100)"
                          className="p-1 hover:text-primary rounded hover:bg-muted"
                        >
                          <Play className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => onInspectStructure(table)}
                          title="Inspect Structure"
                          className="p-1 hover:text-primary rounded hover:bg-muted"
                        >
                          <Info className="w-3 h-3 text-cyan-500" />
                        </button>
                        <button
                          onClick={() => setFilterModalTable(table)}
                          title="Advanced Filter"
                          className="p-1 hover:text-primary rounded hover:bg-muted"
                        >
                          <SlidersHorizontal className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    {/* Columns expanded list */}
                    {isExpanded && (
                      <div className="pl-7 pr-2 py-1 space-y-0.5 border-l border-border/60 ml-4 my-0.5">
                        {!columns ? (
                          <div className="text-[11px] text-muted-foreground py-1">Loading columns…</div>
                        ) : (
                          columns.map((col) => (
                            <div
                              key={col.name}
                              className="flex items-center justify-between py-1 text-[11px] text-muted-foreground font-mono"
                            >
                              <div className="flex items-center gap-1.5 truncate">
                                {col.primaryKey && <Key className="w-2.5 h-2.5 text-amber-500 shrink-0" />}
                                <span className={col.primaryKey ? 'text-foreground font-semibold' : ''}>
                                  {col.name}
                                </span>
                              </div>
                              <span className="text-[10px] text-muted-foreground/70 shrink-0 pl-2">
                                {col.typeName}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Context Menu Popup */}
      {contextMenu && (
        <div
          style={{ top: contextMenu.y, left: contextMenu.x }}
          className="fixed z-50 w-56 py-1.5 bg-popover text-popover-foreground border border-border rounded-xl shadow-2xl text-xs select-none animate-pop-in"
        >
          <button
            onClick={() => {
              const activeFilter = tableFilterRules[contextMenu.table.name];
              onSelectTableData(contextMenu.table, activeFilter?.rules, activeFilter?.matchAny);
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-accent hover:text-accent-foreground text-left cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 text-emerald-500" />
            <span>View Data (Top 100)</span>
          </button>

          <button
            onClick={() => {
              onQueryTable(contextMenu.table);
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-accent hover:text-accent-foreground text-left cursor-pointer"
          >
            <Table2 className="w-3.5 h-3.5 text-primary" />
            <span>Query in SQL Draft</span>
          </button>

          <button
            onClick={() => {
              onInspectStructure(contextMenu.table);
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-accent hover:text-accent-foreground text-left cursor-pointer"
          >
            <Info className="w-3.5 h-3.5 text-cyan-500" />
            <span>Inspect Structure & DDL…</span>
          </button>

          <button
            onClick={() => {
              setFilterModalTable(contextMenu.table);
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-accent hover:text-accent-foreground text-left cursor-pointer"
          >
            <Sliders className="w-3.5 h-3.5 text-blue-500" />
            <span>Advanced Filters…</span>
          </button>

          <div className="h-px bg-border my-1" />

          <button
            onClick={() => {
              window.electronAPI.copyToClipboard(contextMenu.table.name);
              showToast(`Copied "${contextMenu.table.name}"`, 'info');
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-accent hover:text-accent-foreground text-left cursor-pointer"
          >
            <Copy className="w-3.5 h-3.5 text-muted-foreground" />
            <span>Copy Table Name</span>
          </button>

          <div className="h-px bg-border my-1" />

          <button
            onClick={() => {
              onTruncateTable(contextMenu.table);
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-amber-500/10 text-amber-600 dark:text-amber-400 text-left cursor-pointer"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
            <span>Truncate Table…</span>
          </button>

          <button
            onClick={() => {
              onDropTable(contextMenu.table);
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-destructive/10 text-destructive text-left cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5 text-destructive" />
            <span>Drop Table…</span>
          </button>
        </div>
      )}

      {/* Advanced Filter Modal */}
      {filterModalTable && (
        <AdvancedFilterModal
          tableName={filterModalTable.name}
          columns={columnsMap[filterModalTable.name]?.map((c) => c.name) || []}
          initialRules={tableFilterRules[filterModalTable.name]?.rules || []}
          initialMatchAny={tableFilterRules[filterModalTable.name]?.matchAny || false}
          onApply={(rules, matchAny) => {
            setTableFilterRules((prev) => ({
              ...prev,
              [filterModalTable.name]: { rules, matchAny },
            }));
            onSelectTableData(filterModalTable, rules, matchAny);
          }}
          onClose={() => setFilterModalTable(null)}
        />
      )}
    </div>
  );
};
