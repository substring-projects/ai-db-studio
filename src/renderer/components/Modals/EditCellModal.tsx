import React, { useState } from 'react';
import { Engine } from '../../../shared/types';
import { formatCell } from '../../lib/grid';
import { quoteIdent } from '../../lib/sql';
import { Button } from '../ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '../ui/dialog';
import { Checkbox, Label, Textarea } from '../ui/input';

interface EditCellModalProps {
  tableName: string;
  qualifiedTable: string;
  columnName: string;
  initialValue: unknown;
  /** Addresses the row being edited. */
  target: { where: string; byPrimaryKey: boolean };
  engine?: Engine;
  onSave: (sql: string) => void;
  onClose: () => void;
}

export const EditCellModal: React.FC<EditCellModalProps> = ({
  tableName,
  qualifiedTable,
  columnName,
  initialValue,
  target,
  engine,
  onSave,
  onClose,
}) => {
  const startsNull = initialValue === null || initialValue === undefined;
  const [value, setValue] = useState(startsNull ? '' : formatCell(initialValue));
  const [isNull, setIsNull] = useState(startsNull);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const literal = isNull ? 'NULL' : `'${value.replace(/'/g, "''")}'`;
    onSave(`UPDATE ${qualifiedTable}\nSET ${quoteIdent(engine, columnName)} = ${literal}\n${target.where};`);
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title={`Edit ${columnName}`} description={tableName} className="max-w-md">
        <form onSubmit={submit}>
          <DialogBody className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="cell-value">Value</Label>
              <label className="flex cursor-pointer items-center gap-1.5 text-xxs text-muted-foreground">
                <Checkbox checked={isNull} onChange={(e) => setIsNull(e.target.checked)} />
                NULL
              </label>
            </div>
            <Textarea
              id="cell-value"
              autoFocus
              disabled={isNull}
              rows={4}
              value={isNull ? '' : value}
              placeholder={isNull ? 'NULL' : undefined}
              onChange={(e) => setValue(e.target.value)}
              className="resize-y font-mono text-xxs"
            />
            {!target.byPrimaryKey && (
              <p className="text-xxs leading-4 text-warning">
                This table has no primary key, so the row is matched by all its values. Identical rows change too.
              </p>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Review update</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
