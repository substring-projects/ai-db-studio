import React, { useState } from 'react';
import { Engine, TableColumn } from '../../../shared/types';
import { quoteIdent } from '../../lib/sql';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '../ui/dialog';
import { Checkbox, Input } from '../ui/input';

interface InsertRowModalProps {
  tableName: string;
  qualifiedTable: string;
  columns: TableColumn[];
  engine?: Engine;
  onInsert: (sql: string) => void;
  onClose: () => void;
}

export const InsertRowModal: React.FC<InsertRowModalProps> = ({ tableName, qualifiedTable, columns, engine, onInsert, onClose }) => {
  const [values, setValues] = useState<Record<string, string>>({});
  const [nulls, setNulls] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const names: string[] = [];
    const literals: string[] = [];
    for (const col of columns) {
      const value = values[col.name];
      if (nulls[col.name]) {
        names.push(quoteIdent(engine, col.name));
        literals.push('NULL');
      } else if (value !== undefined && value.trim() !== '') {
        names.push(quoteIdent(engine, col.name));
        literals.push(`'${value.replace(/'/g, "''")}'`);
      }
    }
    if (names.length === 0) {
      setError('Set at least one column.');
      return;
    }
    onInsert(`INSERT INTO ${qualifiedTable} (${names.join(', ')})\nVALUES (${literals.join(', ')});`);
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={`Insert into ${tableName}`}
        description="Columns left empty use their default value."
        className="max-w-lg"
      >
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="px-0 py-1">
            {columns.map((col) => {
              const isNull = nulls[col.name] ?? false;
              return (
                <div key={col.name} className="flex items-center gap-3 px-4 py-1">
                  <label htmlFor={`insert-${col.name}`} className="flex w-44 shrink-0 flex-col">
                    <span className="flex items-center gap-1 truncate font-mono text-xxs">
                      <span className="truncate">{col.name}</span>
                      {col.primaryKey && <Badge variant="warning">PK</Badge>}
                    </span>
                    <span className="truncate font-mono text-2xs text-muted-foreground">
                      {col.typeName}
                      {col.nullable ? '' : ' not null'}
                    </span>
                  </label>
                  <Input
                    id={`insert-${col.name}`}
                    disabled={isNull}
                    value={isNull ? '' : values[col.name] ?? ''}
                    placeholder={isNull ? 'NULL' : col.defaultValue ? `Default: ${col.defaultValue}` : undefined}
                    onChange={(e) => {
                      setValues((prev) => ({ ...prev, [col.name]: e.target.value }));
                      setError(null);
                    }}
                    className="font-mono text-xxs"
                  />
                  <label className="flex w-12 shrink-0 cursor-pointer items-center gap-1 text-2xs text-muted-foreground">
                    {col.nullable && (
                      <>
                        <Checkbox
                          checked={isNull}
                          onChange={() => setNulls((prev) => ({ ...prev, [col.name]: !prev[col.name] }))}
                        />
                        NULL
                      </>
                    )}
                  </label>
                </div>
              );
            })}
          </DialogBody>
          <DialogFooter className={error ? 'justify-between' : undefined}>
            {error && <p className="text-xxs text-destructive">{error}</p>}
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit">Review insert</Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
