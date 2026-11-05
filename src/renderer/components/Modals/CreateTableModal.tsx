import React, { useState } from 'react';
import { Plus, Trash2, X, Table2 } from 'lucide-react';

interface ColumnDef {
  name: string;
  type: string;
  isPk: boolean;
  notNull: boolean;
  defaultValue: string;
}

interface CreateTableModalProps {
  onExecuteDdl: (ddl: string) => void;
  onClose: () => void;
}

const COMMON_TYPES = [
  'VARCHAR(255)',
  'TEXT',
  'INTEGER',
  'BIGINT',
  'BOOLEAN',
  'TIMESTAMP',
  'NUMERIC(10,2)',
  'JSONB',
];

export const CreateTableModal: React.FC<CreateTableModalProps> = ({ onExecuteDdl, onClose }) => {
  const [tableName, setTableName] = useState('');
  const [columns, setColumns] = useState<ColumnDef[]>([
    { name: 'id', type: 'BIGINT', isPk: true, notNull: true, defaultValue: '' },
    { name: 'created_at', type: 'TIMESTAMP', isPk: false, notNull: true, defaultValue: 'CURRENT_TIMESTAMP' },
  ]);

  const addColumn = () => {
    setColumns((prev) => [
      ...prev,
      { name: '', type: 'VARCHAR(255)', isPk: false, notNull: false, defaultValue: '' },
    ]);
  };

  const removeColumn = (index: number) => {
    setColumns((prev) => prev.filter((_, i) => i !== index));
  };

  const updateCol = (index: number, patch: Partial<ColumnDef>) => {
    setColumns((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tableName.trim()) {
      alert('Table name is required.');
      return;
    }

    const validCols = columns.filter((c) => c.name.trim());
    if (validCols.length === 0) {
      alert('At least one column is required.');
      return;
    }

    const lines = validCols.map((col) => {
      let l = `  "${col.name.trim()}" ${col.type}`;
      if (col.notNull) l += ' NOT NULL';
      if (col.defaultValue.trim()) l += ` DEFAULT ${col.defaultValue.trim()}`;
      return l;
    });

    const pks = validCols.filter((c) => c.isPk).map((c) => `"${c.name.trim()}"`);
    if (pks.length > 0) {
      lines.push(`  PRIMARY KEY (${pks.join(', ')})`);
    }

    const ddl = `CREATE TABLE "${tableName.trim()}" (\n${lines.join(',\n')}\n);`;
    onExecuteDdl(ddl);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-2xl bg-studio-surface border border-studio-border rounded-xl shadow-2xl overflow-hidden animate-slide-up flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-studio-border bg-studio-surface/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-studio-accent/15 border border-studio-accent/30 flex items-center justify-center text-studio-accent shrink-0">
              <Table2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-studio-text">Create New Table</h3>
              <p className="text-xs text-studio-muted mt-0.5">Define columns, constraints, and data types.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-studio-muted hover:text-studio-text rounded-lg hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
          {/* Table Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-studio-text">Table Name</label>
            <input
              type="text"
              required
              value={tableName}
              onChange={(e) => setTableName(e.target.value)}
              placeholder="e.g. orders, users, products"
              className="w-full px-3.5 py-2 text-xs bg-studio-bg text-studio-text border border-studio-border rounded-lg focus:outline-none focus:border-studio-accent font-mono"
            />
          </div>

          {/* Columns Designer */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-studio-text">Columns</label>
            <div className="space-y-2">
              {columns.map((col, idx) => (
                <div key={idx} className="flex items-center gap-2 p-2 bg-studio-bg border border-studio-border rounded-lg">
                  <input
                    type="text"
                    required
                    placeholder="column_name"
                    value={col.name}
                    onChange={(e) => updateCol(idx, { name: e.target.value })}
                    className="flex-1 px-2.5 py-1.5 text-xs bg-studio-surface border border-studio-border rounded text-studio-text font-mono focus:outline-none focus:border-studio-accent"
                  />

                  <select
                    value={col.type}
                    onChange={(e) => updateCol(idx, { type: e.target.value })}
                    className="w-36 px-2.5 py-1.5 text-xs bg-studio-surface border border-studio-border rounded text-studio-text font-mono focus:outline-none focus:border-studio-accent cursor-pointer"
                  >
                    {COMMON_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>

                  <label className="flex items-center gap-1 text-[11px] text-studio-muted cursor-pointer px-1">
                    <input
                      type="checkbox"
                      checked={col.isPk}
                      onChange={(e) => updateCol(idx, { isPk: e.target.checked })}
                      className="rounded text-studio-accent focus:ring-0"
                    />
                    <span>PK</span>
                  </label>

                  <label className="flex items-center gap-1 text-[11px] text-studio-muted cursor-pointer px-1">
                    <input
                      type="checkbox"
                      checked={col.notNull}
                      onChange={(e) => updateCol(idx, { notNull: e.target.checked })}
                      className="rounded text-studio-accent focus:ring-0"
                    />
                    <span>Not Null</span>
                  </label>

                  <input
                    type="text"
                    placeholder="Default"
                    value={col.defaultValue}
                    onChange={(e) => updateCol(idx, { defaultValue: e.target.value })}
                    className="w-28 px-2 py-1.5 text-xs bg-studio-surface border border-studio-border rounded text-studio-text font-mono focus:outline-none focus:border-studio-accent"
                  />

                  <button
                    type="button"
                    onClick={() => removeColumn(idx)}
                    className="p-1.5 text-studio-muted hover:text-destructive rounded hover:bg-destructive/10 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={addColumn}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-studio-accent hover:text-studio-accentHover border border-dashed border-studio-border hover:border-studio-accent rounded-lg transition-colors cursor-pointer mt-2"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Column</span>
            </button>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-studio-muted hover:text-studio-text hover:bg-accent rounded-lg transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-studio-accent hover:bg-studio-accentHover rounded-lg shadow-sm transition-all cursor-pointer"
            >
              Review & Create Table
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
