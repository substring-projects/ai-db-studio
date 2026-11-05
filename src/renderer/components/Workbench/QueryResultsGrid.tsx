import React, { useState } from 'react';
import { Download, Copy, Check, Clock, Hash } from 'lucide-react';
import { QueryResult } from '../../../shared/types';
import { useStudio } from '../../context/StudioContext';

interface QueryResultsGridProps {
  results: QueryResult | null;
  loading: boolean;
  error: string | null;
}

export const QueryResultsGrid: React.FC<QueryResultsGridProps> = ({ results, loading, error }) => {
  const { showToast } = useStudio();
  const [copiedCell, setCopiedCell] = useState<{ r: number; c: number } | null>(null);

  const copyCell = (val: any, r: number, c: number) => {
    const text = val === null || val === undefined ? 'NULL' : String(val);
    window.electronAPI.copyToClipboard(text);
    setCopiedCell({ r, c });
    setTimeout(() => setCopiedCell(null), 1200);
    showToast('Cell value copied to clipboard', 'info');
  };

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
    link.download = `query-results-${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('Exported to CSV', 'success');
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-studio-muted text-xs gap-3">
        <div className="w-6 h-6 border-2 border-studio-accent border-t-transparent rounded-full animate-spin" />
        <span>Executing statement…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 p-6 flex flex-col items-center justify-center text-red-400 text-xs text-center max-w-lg mx-auto">
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl leading-relaxed font-mono">
          {error}
        </div>
      </div>
    );
  }

  if (!results) {
    return (
      <div className="flex-1 flex items-center justify-center text-studio-muted text-xs">
        Run a statement or select a table to inspect data.
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-studio-bg">
      {/* Grid Status Header */}
      <div className="h-8 px-4 flex items-center justify-between border-b border-studio-border bg-studio-surface/50 text-[11px] shrink-0">
        <div className="flex items-center gap-4 text-studio-muted font-mono">
          <span className="flex items-center gap-1.5">
            <Hash className="w-3.5 h-3.5 text-studio-accent" />
            <span className="text-studio-text font-semibold">{results.rowCount}</span> rows
          </span>
          <span className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-studio-accent" />
            <span className="text-studio-text font-semibold">{results.executionTimeMs}</span> ms
          </span>
        </div>

        <button
          onClick={exportCsv}
          className="flex items-center gap-1.5 px-2.5 py-1 text-studio-text hover:text-studio-accent rounded hover:bg-white/5 transition-colors cursor-pointer text-[11px]"
        >
          <Download className="w-3 h-3" />
          <span>Export CSV</span>
        </button>
      </div>

      {/* Table Data View */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-left text-xs font-mono select-text">
          <thead className="sticky top-0 bg-studio-surface border-b border-studio-border z-10 shadow-xs">
            <tr>
              <th className="w-12 px-3 py-2 text-center text-[10px] text-studio-muted border-r border-studio-border font-semibold">
                #
              </th>
              {results.columns.map((col) => (
                <th
                  key={col}
                  className="px-3 py-2 text-studio-text font-semibold border-r border-studio-border truncate max-w-xs"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {results.rows.length === 0 ? (
              <tr>
                <td
                  colSpan={results.columns.length + 1}
                  className="px-4 py-8 text-center text-studio-muted italic"
                >
                  No records returned.
                </td>
              </tr>
            ) : (
              results.rows.map((row, rIdx) => (
                <tr
                  key={rIdx}
                  className={`border-b border-studio-border/50 hover:bg-studio-accent/5 transition-colors ${
                    rIdx % 2 === 1 ? 'bg-white/[0.015]' : ''
                  }`}
                >
                  <td className="px-3 py-1.5 text-center text-[10px] text-studio-muted border-r border-studio-border/50 select-none">
                    {rIdx + 1}
                  </td>
                  {row.map((cell, cIdx) => {
                    const isCopied = copiedCell?.r === rIdx && copiedCell?.c === cIdx;
                    return (
                      <td
                        key={cIdx}
                        onClick={() => copyCell(cell, rIdx, cIdx)}
                        title="Click to copy value"
                        className="px-3 py-1.5 border-r border-studio-border/50 truncate max-w-sm cursor-pointer hover:bg-studio-accent/10 relative group"
                      >
                        <span
                          className={
                            cell === null || cell === undefined
                              ? 'text-studio-muted/60 italic'
                              : 'text-studio-text'
                          }
                        >
                          {cell === null || cell === undefined ? 'NULL' : String(cell)}
                        </span>
                        {isCopied ? (
                          <Check className="w-3 h-3 text-emerald-400 absolute right-1.5 top-2" />
                        ) : (
                          <Copy className="w-2.5 h-2.5 text-studio-muted opacity-0 group-hover:opacity-60 absolute right-1.5 top-2" />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
