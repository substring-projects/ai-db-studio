import React, { useState } from 'react';
import { Edit2, X, Check } from 'lucide-react';
import { Button } from '../ui/button';

interface EditCellModalProps {
  tableName: string;
  columnName: string;
  initialValue: any;
  pkColumn?: string;
  pkValue?: any;
  rowColumns?: string[];
  rowData?: any[];
  engine?: string;
  onSave: (sql: string) => void;
  onClose: () => void;
}

export const EditCellModal: React.FC<EditCellModalProps> = ({
  tableName,
  columnName,
  initialValue,
  pkColumn,
  pkValue,
  rowColumns,
  rowData,
  engine,
  onSave,
  onClose,
}) => {
  const [value, setValue] = useState(initialValue === null || initialValue === undefined ? '' : String(initialValue));
  const [isNull, setIsNull] = useState(initialValue === null || initialValue === undefined);

  const isPg = engine === 'POSTGRESQL';
  const quote = (id: string) => (isPg ? `"${id.replace(/"/g, '""')}"` : `\`${id.replace(/`/g, '``')}\``);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const valSnippet = isNull ? 'NULL' : `'${value.replace(/'/g, "''")}'`;

    let whereClause = '';
    if (pkColumn && pkValue !== undefined && pkValue !== null) {
      whereClause = `WHERE ${quote(pkColumn)} = '${String(pkValue).replace(/'/g, "''")}'`;
    } else if (rowColumns && rowData && rowColumns.length > 0) {
      // Match the unique row based on its existing non-null values
      const conditions = rowColumns
        .map((col, idx) => {
          const val = rowData[idx];
          if (val === null || val === undefined) {
            return `${quote(col)} IS NULL`;
          }
          return `${quote(col)} = '${String(val).replace(/'/g, "''")}'`;
        })
        .slice(0, 5);
      whereClause = `WHERE ${conditions.join(' AND ')}`;
    } else {
      if (initialValue === null || initialValue === undefined) {
        whereClause = `WHERE ${quote(columnName)} IS NULL`;
      } else {
        whereClause = `WHERE ${quote(columnName)} = '${String(initialValue).replace(/'/g, "''")}'`;
      }
    }

    const sql = `UPDATE ${quote(tableName)} SET ${quote(columnName)} = ${valSnippet} ${whereClause};`;
    onSave(sql);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-md bg-studio-surface border border-studio-border rounded-xl shadow-2xl overflow-hidden animate-pop-in">
        {/* Header */}
        <div className="flex items-center gap-4 px-6 py-5 border-b border-studio-border bg-studio-surface/50">
          <div className="w-11 h-11 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center shrink-0 shadow-sm animate-badge-bounce">
            <Edit2 className="w-5 h-5 text-purple-500" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-studio-text leading-tight">Edit Cell</h3>
            <p className="text-xs text-studio-muted truncate mt-0.5 font-mono">
              {tableName} · <span className="text-primary font-semibold">{columnName}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-studio-muted hover:text-studio-text rounded-lg hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-studio-text">New Value</label>
              <label className="flex items-center gap-1.5 cursor-pointer text-xs text-studio-muted hover:text-studio-text select-none">
                <input
                  type="checkbox"
                  checked={isNull}
                  onChange={(e) => setIsNull(e.target.checked)}
                  className="rounded text-studio-accent focus:ring-0"
                />
                <span>Set NULL</span>
              </label>
            </div>

            <textarea
              disabled={isNull}
              value={isNull ? '' : value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={isNull ? 'NULL' : 'Enter value…'}
              rows={3}
              className="w-full px-3.5 py-2 text-xs bg-studio-bg text-studio-text border border-studio-border rounded-lg focus:outline-none focus:border-studio-accent font-mono disabled:opacity-40 resize-none"
              autoFocus
            />
          </div>

          <div className="p-2.5 rounded-lg bg-muted/40 border border-border text-[11px] text-muted-foreground leading-relaxed flex items-center gap-2">
            <Check className="w-3.5 h-3.5 text-primary shrink-0" />
            <span>Target: {pkColumn && pkValue !== undefined ? `PK ${pkColumn} = ${pkValue}` : 'Matched by row values'}</span>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
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
              Review & Update
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
