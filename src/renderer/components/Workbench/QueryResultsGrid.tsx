import React, { useState, useMemo } from 'react';
import {
  Download,
  Copy,
  Check,
  Clock,
  Hash,
  Search,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  FileSpreadsheet,
  FileJson,
} from 'lucide-react';
import { QueryResult } from '../../../shared/types';
import { useStudio } from '../../context/StudioContext';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

interface QueryResultsGridProps {
  results: QueryResult | null;
  loading: boolean;
  error: string | null;
  tableName?: string;
  onEditCell?: (column: string, value: any, rowIndex: number, row: any[]) => void;
  onInsertRow?: () => void;
  onDeleteRow?: (rowIndex: number, row: any[]) => void;
  onRefresh?: () => void;
}

export const QueryResultsGrid: React.FC<QueryResultsGridProps> = ({
  results,
  loading,
  error,
  tableName,
  onEditCell,
  onInsertRow,
  onDeleteRow,
  onRefresh,
}) => {
  const { showToast } = useStudio();
  const [copiedCell, setCopiedCell] = useState<{ r: number; c: number } | null>(null);

  // Search filter
  const [searchQuery, setSearchQuery] = useState('');

  // Sorting
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'ASC' | 'DESC' | null>(null);

  // Pagination
  const [pageSize, setPageSize] = useState<number>(50);
  const [page, setPage] = useState<number>(1);

  // Row selection
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);

  const copyCell = (val: any, r: number, c: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const text = val === null || val === undefined ? 'NULL' : String(val);
    window.electronAPI.copyToClipboard(text);
    setCopiedCell({ r, c });
    setTimeout(() => setCopiedCell(null), 1200);
    showToast('Cell value copied to clipboard', 'info');
  };

  const handleSort = (col: string) => {
    if (sortCol !== col) {
      setSortCol(col);
      setSortDir('ASC');
    } else if (sortDir === 'ASC') {
      setSortDir('DESC');
    } else {
      setSortCol(null);
      setSortDir(null);
    }
    setPage(1);
  };

  // Process rows: filter & sort
  const processedRows = useMemo(() => {
    if (!results || !results.rows) return [];
    let rows = results.rows.map((row, index) => ({ row, originalIndex: index }));

    // Filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      rows = rows.filter(({ row }) =>
        row.some((cell) => {
          if (cell === null || cell === undefined) return false;
          return String(cell).toLowerCase().includes(q);
        })
      );
    }

    // Sort
    if (sortCol && sortDir) {
      const colIdx = results.columns.indexOf(sortCol);
      if (colIdx >= 0) {
        rows.sort((a, b) => {
          const valA = a.row[colIdx];
          const valB = b.row[colIdx];

          if (valA === valB) return 0;
          if (valA === null || valA === undefined) return sortDir === 'ASC' ? 1 : -1;
          if (valB === null || valB === undefined) return sortDir === 'ASC' ? -1 : 1;

          if (typeof valA === 'number' && typeof valB === 'number') {
            return sortDir === 'ASC' ? valA - valB : valB - valA;
          }

          const strA = String(valA).toLowerCase();
          const strB = String(valB).toLowerCase();
          return sortDir === 'ASC' ? strA.localeCompare(strB) : strB.localeCompare(strA);
        });
      }
    }

    return rows;
  }, [results, searchQuery, sortCol, sortDir]);

  // Paginated rows
  const paginatedRows = useMemo(() => {
    if (pageSize === 0) return processedRows;
    const start = (page - 1) * pageSize;
    return processedRows.slice(start, start + pageSize);
  }, [processedRows, page, pageSize]);

  const totalPages = pageSize === 0 ? 1 : Math.ceil(processedRows.length / pageSize) || 1;

  // Export handlers
  const exportCsv = () => {
    if (!results || results.rows.length === 0) return;
    const header = results.columns.map((c) => `"${c.replace(/"/g, '""')}"`).join(',');
    const rows = results.rows.map((r) =>
      r
        .map((cell) => {
          if (cell === null || cell === undefined) return '""';
          return `"${String(cell).replace(/"/g, '""')}"`;
        })
        .join(',')
    );
    const csvContent = [header, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${tableName || 'query-results'}-${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('Exported to CSV', 'success');
  };

  const exportJson = () => {
    if (!results || results.rows.length === 0) return;
    const records = results.rows.map((r) => {
      const obj: Record<string, any> = {};
      results.columns.forEach((col, idx) => {
        obj[col] = r[idx];
      });
      return obj;
    });
    const jsonContent = JSON.stringify(records, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${tableName || 'query-results'}-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('Exported to JSON', 'success');
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground text-xs gap-3 bg-studio-bg">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <span>Executing query & streaming records…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 p-6 flex flex-col items-center justify-center text-destructive text-xs text-center max-w-lg mx-auto bg-studio-bg">
        <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-xl leading-relaxed font-mono select-text">
          {error}
        </div>
      </div>
    );
  }

  if (!results) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-xs bg-studio-bg">
        Run a statement or select a table from the Database Explorer.
      </div>
    );
  }

  const selectedRowObj =
    selectedRowIndex !== null && processedRows[selectedRowIndex]
      ? processedRows[selectedRowIndex]
      : null;

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-studio-bg">
      {/* Grid Status Header & Toolbar */}
      <div className="px-4 py-2 flex flex-wrap items-center justify-between gap-2 border-b border-border bg-card/60 text-xs shrink-0 select-none">
        {/* Left: Stats & Quick Search */}
        <div className="flex items-center gap-3 font-mono">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Hash className="w-3.5 h-3.5 text-primary" />
            <span className="text-foreground font-semibold">{results.rowCount}</span> rows
          </span>
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="w-3.5 h-3.5 text-primary" />
            <span className="text-foreground font-semibold">{results.executionTimeMs}</span> ms
          </span>

          {/* Quick in-memory search */}
          <div className="relative flex items-center ml-2">
            <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search in results…"
              className="pl-8 pr-2.5 py-1 w-44 text-[11px] bg-background border border-input rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>

        {/* Right: Actions (Insert, Delete, Export CSV/JSON, Refresh) */}
        <div className="flex items-center gap-2">
          {tableName && onInsertRow && (
            <Button
              onClick={onInsertRow}
              variant="accent"
              size="sm"
              className="gap-1.5 text-xs font-semibold"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Insert Row</span>
            </Button>
          )}

          {tableName && onDeleteRow && selectedRowObj && (
            <Button
              onClick={() => onDeleteRow(selectedRowObj.originalIndex, selectedRowObj.row)}
              variant="destructive"
              size="sm"
              className="gap-1.5 text-xs"
            >
              <Trash2 className="w-3 h-3" />
              <span>Delete Row</span>
            </Button>
          )}

          {onRefresh && (
            <Button
              onClick={onRefresh}
              title="Refresh Data"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          )}

          <div className="h-4 w-px bg-border mx-0.5" />

          {/* Export Dropdown / Buttons */}
          <Button
            onClick={exportCsv}
            title="Export to CSV"
            variant="outline"
            size="sm"
            className="gap-1 text-[11px] h-7 px-2"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />
            <span>CSV</span>
          </Button>

          <Button
            onClick={exportJson}
            title="Export to JSON"
            variant="outline"
            size="sm"
            className="gap-1 text-[11px] h-7 px-2"
          >
            <FileJson className="w-3.5 h-3.5 text-blue-500" />
            <span>JSON</span>
          </Button>
        </div>
      </div>

      {/* Table Data View */}
      <div className="flex-1 overflow-auto bg-studio-bg">
        <table className="w-full border-collapse text-left text-xs font-mono select-text">
          <thead className="sticky top-0 bg-card border-b border-border z-10 shadow-2xs">
            <tr>
              <th className="w-12 px-3 py-2 text-center text-[10px] text-muted-foreground border-r border-border font-semibold select-none">
                #
              </th>
              {results.columns.map((col) => {
                const isSorted = sortCol === col;
                return (
                  <th
                    key={col}
                    onClick={() => handleSort(col)}
                    className="px-3 py-2 text-foreground font-semibold border-r border-border truncate max-w-xs cursor-pointer hover:bg-muted/80 select-none transition-colors"
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="truncate">{col}</span>
                      <span className="text-muted-foreground shrink-0">
                        {isSorted ? (
                          sortDir === 'ASC' ? (
                            <ArrowUp className="w-3 h-3 text-primary" />
                          ) : (
                            <ArrowDown className="w-3 h-3 text-primary" />
                          )
                        ) : (
                          <ArrowUpDown className="w-3 h-3 opacity-35 hover:opacity-100" />
                        )}
                      </span>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {paginatedRows.length === 0 ? (
              <tr>
                <td
                  colSpan={results.columns.length + 1}
                  className="px-4 py-8 text-center text-muted-foreground italic"
                >
                  {searchQuery ? 'No matching rows found.' : 'No records returned.'}
                </td>
              </tr>
            ) : (
              paginatedRows.map(({ row, originalIndex }, pIdx) => {
                const isSelected = selectedRowIndex === pIdx;
                const rowDisplayNumber = pageSize === 0 ? pIdx + 1 : (page - 1) * pageSize + pIdx + 1;

                return (
                  <tr
                    key={originalIndex}
                    onClick={() => setSelectedRowIndex(isSelected ? null : pIdx)}
                    className={`border-b border-border/50 transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-primary/15'
                        : pIdx % 2 === 1
                        ? 'bg-muted/30 hover:bg-accent/70'
                        : 'hover:bg-accent/70'
                    }`}
                  >
                    <td className="px-3 py-1.5 text-center text-[10px] text-muted-foreground border-r border-border/50 select-none">
                      {rowDisplayNumber}
                    </td>
                    {row.map((cell, cIdx) => {
                      const colName = results.columns[cIdx];
                      const isCopied = copiedCell?.r === pIdx && copiedCell?.c === cIdx;
                      return (
                        <td
                          key={cIdx}
                          onDoubleClick={() => {
                            if (tableName && onEditCell) {
                              onEditCell(colName, cell, originalIndex, row);
                            }
                          }}
                          title={tableName ? 'Double-click to edit cell, click icon to copy' : 'Click icon to copy'}
                          className="px-3 py-1.5 border-r border-border/50 truncate max-w-sm relative group"
                        >
                          <span
                            className={
                              cell === null || cell === undefined
                                ? 'text-muted-foreground/60 italic'
                                : 'text-foreground'
                            }
                          >
                            {cell === null || cell === undefined ? 'NULL' : String(cell)}
                          </span>

                          <button
                            onClick={(e) => copyCell(cell, pIdx, cIdx, e)}
                            className="absolute right-1.5 top-1.5 p-1 rounded hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Copy value"
                          >
                            {isCopied ? (
                              <Check className="w-3 h-3 text-emerald-500" />
                            ) : (
                              <Copy className="w-2.5 h-2.5 text-muted-foreground" />
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="h-9 px-4 flex items-center justify-between border-t border-border bg-card/60 text-[11px] shrink-0 select-none">
        <div className="flex items-center gap-2 text-muted-foreground">
          <span>Rows per page:</span>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
            className="bg-background border border-input rounded-md px-1.5 py-0.5 text-foreground text-[11px] focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
          >
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={250}>250</option>
            <option value={500}>500</option>
            <option value={0}>All</option>
          </select>
          <span className="ml-2 font-mono">
            Showing {processedRows.length === 0 ? 0 : pageSize === 0 ? 1 : (page - 1) * pageSize + 1} -{' '}
            {pageSize === 0 ? processedRows.length : Math.min(page * pageSize, processedRows.length)} of{' '}
            {processedRows.length}
          </span>
        </div>

        {pageSize > 0 && totalPages > 1 && (
          <div className="flex items-center gap-1.5">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 rounded hover:bg-accent transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="font-mono text-foreground px-1">
              Page {page} of {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 rounded hover:bg-accent transition-colors cursor-pointer"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
