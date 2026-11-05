import React, { useState } from 'react';
import { Edit2, X } from 'lucide-react';

interface EditCellModalProps {
  tableName: string;
  columnName: string;
  initialValue: any;
  pkColumn?: string;
  pkValue?: any;
  onSave: (sql: string) => void;
  onClose: () => void;
}

export const EditCellModal: React.FC<EditCellModalProps> = ({
  tableName,
  columnName,
  initialValue,
  pkColumn,
  pkValue,
  onSave,
  onClose,
}) => {
  const [value, setValue] = useState(initialValue === null || initialValue === undefined ? '' : String(initialValue));
  const [isNull, setIsNull] = useState(initialValue === null || initialValue === undefined);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    let valSnippet = isNull ? 'NULL' : `'${value.replace(/'/g, "''")}'`;

    let whereClause = '';
    if (pkColumn && pkValue !== undefined && pkValue !== null) {
      whereClause = `WHERE "${pkColumn}" = '${String(pkValue).replace(/'/g, "''")}'`;
    } else {
      whereClause = `WHERE "${columnName}" = '${String(initialValue).replace(/'/g, "''")}' LIMIT 1`;
    }

    const sql = `UPDATE "${tableName}" SET "${columnName}" = ${valSnippet} ${whereClause};`;
    onSave(sql);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-md bg-studio-surface border border-studio-border rounded-xl shadow-2xl overflow-hidden animate-pop-in">
        {/* Header */}
        <div className="flex items-center gap-4 px-6 py-5 border-b border-studio-border bg-studio-surface/50">
          <div className="w-11 h-11 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center shrink-0 shadow-sm animate-badge-bounce">
            <Edit2 className="w-5 h-5 text-purple-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-studio-text leading-tight">Edit Cell</h3>
            <p className="text-xs text-studio-muted truncate mt-0.5">
              Table: <span className="font-mono text-studio-accent">{tableName}</span> / Column:{' '}
              <span className="font-mono text-studio-accent">{columnName}</span>
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
              <label className="flex items-center gap-1.5 cursor-pointer text-xs text-studio-muted hover:text-studio-text">
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
            />
          </div>

          <p className="text-[11px] text-studio-muted leading-relaxed">
            You will review and confirm the generated UPDATE SQL statement before changes commit.
          </p>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-studio-muted hover:text-studio-text hover:bg-accent rounded-lg transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-studio-accent hover:bg-studio-accentHover rounded-lg transition-all shadow-sm cursor-pointer"
            >
              Review Change
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
