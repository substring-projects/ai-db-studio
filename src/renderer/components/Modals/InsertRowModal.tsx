import React, { useState } from 'react';
import { PlusCircle, X } from 'lucide-react';
import { TableColumn } from '../../../shared/types';
import { Button } from '../ui/button';

interface InsertRowModalProps {
  tableName: string;
  columns: TableColumn[];
  engine?: string;
  onInsert: (sql: string) => void;
  onClose: () => void;
}

export const InsertRowModal: React.FC<InsertRowModalProps> = ({
  tableName,
  columns,
  engine,
  onInsert,
  onClose,
}) => {
  const [values, setValues] = useState<Record<string, string>>({});
  const [nullFlags, setNullFlags] = useState<Record<string, boolean>>({});

  const isPg = engine === 'POSTGRESQL';
  const quote = (id: string) => (isPg ? `"${id.replace(/"/g, '""')}"` : `\`${id.replace(/`/g, '``')}\``);

  const handleValueChange = (colName: string, val: string) => {
    setValues((prev) => ({ ...prev, [colName]: val }));
  };

  const toggleNull = (colName: string) => {
    setNullFlags((prev) => ({ ...prev, [colName]: !prev[colName] }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const colsToInsert: string[] = [];
    const valsToInsert: string[] = [];

    for (const col of columns) {
      const isNull = nullFlags[col.name];
      const val = values[col.name];

      if (isNull) {
        colsToInsert.push(quote(col.name));
        valsToInsert.push('NULL');
      } else if (val !== undefined && val.trim() !== '') {
        colsToInsert.push(quote(col.name));
        const escaped = val.replace(/'/g, "''");
        valsToInsert.push(`'${escaped}'`);
      }
    }

    if (colsToInsert.length === 0) {
      alert('Please set at least one column value or NULL.');
      return;
    }

    const sql = `INSERT INTO ${quote(tableName)} (${colsToInsert.join(', ')}) VALUES (${valsToInsert.join(', ')});`;
    onInsert(sql);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-lg bg-studio-surface border border-studio-border rounded-xl shadow-2xl overflow-hidden animate-slide-up flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-studio-border bg-studio-surface/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-500 shrink-0">
              <PlusCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-studio-text">
                Insert Row into <span className="font-mono text-studio-accent">{tableName}</span>
              </h3>
              <p className="text-xs text-studio-muted mt-0.5">
                Set column values for the new record. Unspecified columns will use defaults.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-studio-muted hover:text-studio-text rounded-lg hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-3.5 text-xs">
          {columns.map((col) => {
            const isNull = nullFlags[col.name] || false;
            return (
              <div
                key={col.name}
                className="p-3 bg-studio-bg border border-studio-border rounded-lg space-y-2 transition-colors hover:border-studio-muted"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold text-studio-text">{col.name}</span>
                    <span className="text-[10px] font-mono text-studio-muted uppercase">
                      {col.typeName}
                    </span>
                    {col.primaryKey && (
                      <span className="px-1 py-0.2 rounded text-[9px] bg-amber-500/15 text-amber-500">
                        PK
                      </span>
                    )}
                  </div>

                  {col.nullable && (
                    <label className="flex items-center gap-1.5 cursor-pointer text-studio-muted hover:text-studio-text">
                      <input
                        type="checkbox"
                        checked={isNull}
                        onChange={() => toggleNull(col.name)}
                        className="rounded text-studio-accent focus:ring-0"
                      />
                      <span>Set NULL</span>
                    </label>
                  )}
                </div>

                <input
                  type="text"
                  disabled={isNull}
                  value={isNull ? '' : values[col.name] || ''}
                  onChange={(e) => handleValueChange(col.name, e.target.value)}
                  placeholder={isNull ? 'NULL' : col.defaultValue ? `Default: ${col.defaultValue}` : 'Enter value…'}
                  className="w-full px-3 py-1.5 bg-studio-surface border border-studio-border rounded-md text-studio-text placeholder-studio-muted focus:outline-none focus:border-studio-accent disabled:opacity-40 font-mono text-xs"
                />
              </div>
            );
          })}

          <div className="pt-2 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="accent"
              size="sm"
            >
              Review & Insert
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
