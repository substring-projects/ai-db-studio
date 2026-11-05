import React, { useState } from 'react';
import { Table2, Key, Link2, FileCode, X, Copy, Check } from 'lucide-react';
import { TableStructure } from '../../../shared/types';
import { useStudio } from '../../context/StudioContext';

interface TableStructureModalProps {
  structure: TableStructure;
  onClose: () => void;
}

export const TableStructureModal: React.FC<TableStructureModalProps> = ({ structure, onClose }) => {
  const { showToast } = useStudio();
  const [tab, setTab] = useState<'columns' | 'indexes' | 'fks' | 'ddl'>('columns');
  const [copied, setCopied] = useState(false);

  const copyDdl = () => {
    window.electronAPI.copyToClipboard(structure.ddl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    showToast('DDL copied to clipboard', 'info');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-3xl bg-studio-surface border border-studio-border rounded-xl shadow-2xl overflow-hidden animate-slide-up flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-studio-border bg-studio-surface/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-studio-accent/15 border border-studio-accent/30 flex items-center justify-center text-studio-accent shrink-0">
              <Table2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-studio-text">
                Structure · <span className="font-mono text-studio-accent">{structure.tableName}</span>
              </h3>
              <p className="text-xs text-studio-muted mt-0.5">
                {structure.columns.length} columns · {structure.indexes.length} indexes · {structure.foreignKeys.length} relations
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-studio-muted hover:text-studio-text rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab navigation */}
        <div className="flex border-b border-studio-border px-6 bg-studio-bg shrink-0 text-xs select-none">
          <button
            onClick={() => setTab('columns')}
            className={`py-2.5 px-3 font-medium border-b-2 transition-all cursor-pointer ${
              tab === 'columns'
                ? 'border-studio-accent text-studio-accent font-semibold'
                : 'border-transparent text-studio-muted hover:text-studio-text'
            }`}
          >
            Columns ({structure.columns.length})
          </button>
          <button
            onClick={() => setTab('indexes')}
            className={`py-2.5 px-3 font-medium border-b-2 transition-all cursor-pointer ${
              tab === 'indexes'
                ? 'border-studio-accent text-studio-accent font-semibold'
                : 'border-transparent text-studio-muted hover:text-studio-text'
            }`}
          >
            Indexes ({structure.indexes.length})
          </button>
          <button
            onClick={() => setTab('fks')}
            className={`py-2.5 px-3 font-medium border-b-2 transition-all cursor-pointer ${
              tab === 'fks'
                ? 'border-studio-accent text-studio-accent font-semibold'
                : 'border-transparent text-studio-muted hover:text-studio-text'
            }`}
          >
            Foreign Keys ({structure.foreignKeys.length})
          </button>
          <button
            onClick={() => setTab('ddl')}
            className={`py-2.5 px-3 font-medium border-b-2 transition-all cursor-pointer ${
              tab === 'ddl'
                ? 'border-studio-accent text-studio-accent font-semibold'
                : 'border-transparent text-studio-muted hover:text-studio-text'
            }`}
          >
            DDL Script
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-6 text-xs">
          {tab === 'columns' && (
            <table className="w-full border-collapse font-mono text-left">
              <thead>
                <tr className="border-b border-studio-border text-studio-muted text-[11px]">
                  <th className="py-2 px-3">Column Name</th>
                  <th className="py-2 px-3">Type</th>
                  <th className="py-2 px-3">Nullable</th>
                  <th className="py-2 px-3">Default</th>
                  <th className="py-2 px-3 text-center">Primary Key</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-studio-border/50">
                {structure.columns.map((c) => (
                  <tr key={c.name} className="hover:bg-white/5 transition-colors">
                    <td className="py-2 px-3 font-semibold text-studio-text flex items-center gap-1.5">
                      {c.primaryKey && <Key className="w-3 h-3 text-amber-400 shrink-0" />}
                      <span>{c.name}</span>
                    </td>
                    <td className="py-2 px-3 text-studio-accent">{c.typeName}</td>
                    <td className="py-2 px-3 text-studio-muted">{c.nullable ? 'YES' : 'NO'}</td>
                    <td className="py-2 px-3 text-studio-muted">{c.defaultValue || '-'}</td>
                    <td className="py-2 px-3 text-center">
                      {c.primaryKey ? (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/15 text-amber-400 border border-amber-500/30">
                          PK
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {tab === 'indexes' && (
            structure.indexes.length === 0 ? (
              <div className="text-center py-8 text-studio-muted italic">No indexes defined on this table.</div>
            ) : (
              <table className="w-full border-collapse font-mono text-left">
                <thead>
                  <tr className="border-b border-studio-border text-studio-muted text-[11px]">
                    <th className="py-2 px-3">Index Name</th>
                    <th className="py-2 px-3">Columns</th>
                    <th className="py-2 px-3">Unique</th>
                    <th className="py-2 px-3">Type</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-studio-border/50">
                  {structure.indexes.map((idx) => (
                    <tr key={idx.name} className="hover:bg-white/5 transition-colors">
                      <td className="py-2 px-3 font-semibold text-studio-text">{idx.name}</td>
                      <td className="py-2 px-3 text-studio-accent">{idx.columns.join(', ')}</td>
                      <td className="py-2 px-3 text-studio-muted">{idx.isUnique ? 'UNIQUE' : 'NON-UNIQUE'}</td>
                      <td className="py-2 px-3">
                        {idx.isPrimary ? (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/15 text-amber-400">
                            PRIMARY
                          </span>
                        ) : (
                          'SECONDARY'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          )}

          {tab === 'fks' && (
            structure.foreignKeys.length === 0 ? (
              <div className="text-center py-8 text-studio-muted italic">No foreign key constraints defined.</div>
            ) : (
              <table className="w-full border-collapse font-mono text-left">
                <thead>
                  <tr className="border-b border-studio-border text-studio-muted text-[11px]">
                    <th className="py-2 px-3">Constraint Name</th>
                    <th className="py-2 px-3">Column</th>
                    <th className="py-2 px-3">References</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-studio-border/50">
                  {structure.foreignKeys.map((fk) => (
                    <tr key={fk.name} className="hover:bg-white/5 transition-colors">
                      <td className="py-2 px-3 font-semibold text-studio-text">{fk.name}</td>
                      <td className="py-2 px-3 text-studio-accent">{fk.column}</td>
                      <td className="py-2 px-3 text-studio-muted flex items-center gap-1.5">
                        <Link2 className="w-3.5 h-3.5 text-purple-400" />
                        <span>{fk.refTable} ({fk.refColumn})</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          )}

          {tab === 'ddl' && (
            <div className="space-y-3">
              <div className="flex justify-end">
                <button
                  onClick={copyDdl}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-studio-border hover:border-studio-accent text-studio-text rounded-lg transition-colors cursor-pointer"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copied' : 'Copy DDL'}</span>
                </button>
              </div>
              <pre className="p-4 bg-[#0e0f12] text-studio-text rounded-lg border border-studio-border font-mono text-xs overflow-x-auto leading-relaxed">
                {structure.ddl}
              </pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-studio-bg border-t border-studio-border flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-studio-sidebar bg-studio-accent hover:bg-studio-accentHover rounded-lg transition-all cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
