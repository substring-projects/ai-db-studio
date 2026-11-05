import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Engine } from '../../../shared/types';
import { qualifiedName, quoteIdent } from '../../lib/sql';
import { Button } from '../ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '../ui/dialog';
import { Checkbox, Input, Label } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

interface ColumnDef {
  key: number;
  name: string;
  type: string;
  isPk: boolean;
  notNull: boolean;
  defaultValue: string;
}

interface CreateTableModalProps {
  engine?: Engine;
  schema?: string;
  onExecuteDdl: (ddl: string) => void;
  onClose: () => void;
}

const TYPES: Record<Engine, string[]> = {
  POSTGRESQL: ['VARCHAR(255)', 'TEXT', 'INTEGER', 'BIGINT', 'BOOLEAN', 'TIMESTAMP', 'TIMESTAMPTZ', 'DATE', 'NUMERIC(10,2)', 'JSONB', 'UUID'],
  MYSQL: ['VARCHAR(255)', 'TEXT', 'INT', 'BIGINT', 'BOOLEAN', 'DATETIME', 'TIMESTAMP', 'DATE', 'DECIMAL(10,2)', 'JSON'],
};

export const CreateTableModal: React.FC<CreateTableModalProps> = ({ engine = 'POSTGRESQL', schema, onExecuteDdl, onClose }) => {
  const [tableName, setTableName] = useState('');
  const [nextKey, setNextKey] = useState(3);
  const [error, setError] = useState<string | null>(null);
  const [columns, setColumns] = useState<ColumnDef[]>([
    { key: 1, name: 'id', type: 'BIGINT', isPk: true, notNull: true, defaultValue: '' },
    { key: 2, name: 'created_at', type: 'TIMESTAMP', isPk: false, notNull: true, defaultValue: 'CURRENT_TIMESTAMP' },
  ]);

  const update = (key: number, patch: Partial<ColumnDef>) => {
    setColumns((prev) => prev.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const valid = columns.filter((c) => c.name.trim());
    if (valid.length === 0) {
      setError('Add at least one column.');
      return;
    }
    const lines = valid.map((col) => {
      let line = `  ${quoteIdent(engine, col.name.trim())} ${col.type}`;
      if (col.notNull) line += ' NOT NULL';
      if (col.defaultValue.trim()) line += ` DEFAULT ${col.defaultValue.trim()}`;
      return line;
    });
    const pks = valid.filter((c) => c.isPk).map((c) => quoteIdent(engine, c.name.trim()));
    if (pks.length > 0) lines.push(`  PRIMARY KEY (${pks.join(', ')})`);
    onExecuteDdl(`CREATE TABLE ${qualifiedName(engine, tableName.trim(), schema)} (\n${lines.join(',\n')}\n);`);
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title="Create table" description={schema ? `In schema ${schema}` : undefined} className="max-w-2xl">
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="table-name">Table name</Label>
              <Input
                id="table-name"
                required
                autoFocus
                value={tableName}
                onChange={(e) => setTableName(e.target.value)}
                className="max-w-64 font-mono"
              />
            </div>
            <div>
              <div className="grid grid-cols-[1fr_140px_32px_56px_110px_24px] items-center gap-2 pb-1 text-xxs text-muted-foreground">
                <span>Column</span>
                <span>Type</span>
                <span>PK</span>
                <span>Not null</span>
                <span>Default</span>
                <span />
              </div>
              <div className="space-y-1">
                {columns.map((col) => (
                  <div key={col.key} className="grid grid-cols-[1fr_140px_32px_56px_110px_24px] items-center gap-2">
                    <Input
                      aria-label="Column name"
                      value={col.name}
                      onChange={(e) => update(col.key, { name: e.target.value })}
                      className="font-mono text-xxs"
                    />
                    <Select value={col.type} onValueChange={(type) => update(col.key, { type })}>
                      <SelectTrigger aria-label="Column type" className="font-mono text-xxs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[...new Set([...TYPES[engine], col.type])].map((t) => (
                          <SelectItem key={t} value={t} className="font-mono text-xxs">
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Checkbox aria-label="Primary key" checked={col.isPk} onChange={(e) => update(col.key, { isPk: e.target.checked })} />
                    <Checkbox aria-label="Not null" checked={col.notNull} onChange={(e) => update(col.key, { notNull: e.target.checked })} />
                    <Input
                      aria-label="Default value"
                      value={col.defaultValue}
                      onChange={(e) => update(col.key, { defaultValue: e.target.value })}
                      className="font-mono text-xxs"
                    />
                    <Button
                      variant="quiet"
                      size="icon-sm"
                      aria-label={`Remove ${col.name || 'column'}`}
                      onClick={() => setColumns((prev) => prev.filter((c) => c.key !== col.key))}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                variant="quiet"
                size="sm"
                className="mt-1.5"
                onClick={() => {
                  setColumns((prev) => [
                    ...prev,
                    { key: nextKey, name: '', type: 'VARCHAR(255)', isPk: false, notNull: false, defaultValue: '' },
                  ]);
                  setNextKey((k) => k + 1);
                }}
              >
                <Plus /> Add column
              </Button>
            </div>
          </DialogBody>
          <DialogFooter className={error ? 'justify-between' : undefined}>
            {error && <p className="text-xxs text-destructive">{error}</p>}
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit">Review table</Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
