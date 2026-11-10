import React, { useState } from 'react';
import { FileJson } from 'lucide-react';
import type { TableColumn } from '../../../shared/types';
import { insertStatement, replaceStatement, toShell, updateFieldStatement } from '../../../shared/mongoShell';
import { Button } from '../ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '../ui/dialog';
import { Checkbox, Label, Textarea } from '../ui/input';

const SYNTAX_HINT = 'Shell syntax: "text", 42, true, null, ObjectId("…"), ISODate("…"), NumberDecimal("…"), { … }, [ … ]';

/** A starting value for a field of the given inferred type. */
function placeholderFor(typeName: string): string {
  const type = typeName.split(' | ')[0];
  switch (type) {
    case 'string':
      return '""';
    case 'int':
    case 'long':
    case 'double':
    case 'decimal':
      return '0';
    case 'bool':
      return 'false';
    case 'date':
      return 'new Date()';
    case 'array':
      return '[]';
    case 'object':
      return '{}';
    case 'objectId':
      return 'ObjectId()';
    default:
      return 'null';
  }
}

/** A new document with the collection's known fields, so inserting starts from its usual shape. */
export function documentTemplate(fields: TableColumn[]): string {
  const lines = fields
    .filter((f) => f.name !== '_id')
    .map((f) => `  ${/^[A-Za-z_$][\w$]*$/.test(f.name) ? f.name : JSON.stringify(f.name)}: ${placeholderFor(f.typeName)}`);
  return lines.length > 0 ? `{\n${lines.join(',\n')}\n}` : '{\n  \n}';
}

interface EditFieldProps {
  collection: string;
  field: string;
  /** The value as shown in the grid (relaxed Extended JSON). */
  initialValue: unknown;
  /** The document's _id. */
  id: unknown;
  onSave: (statement: string) => void;
  onEditDocument: () => void;
  onClose: () => void;
}

export const MongoEditFieldModal: React.FC<EditFieldProps> = ({ collection, field, initialValue, id, onSave, onEditDocument, onClose }) => {
  const [text, setText] = useState(() => toShell(initialValue, 2));
  const [remove, setRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!remove && !text.trim()) {
      setError('Enter a value, or use null.');
      return;
    }
    onSave(updateFieldStatement(collection, id, field, text.trim(), remove));
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title={`Edit ${field}`} description={`${collection} · document ${toShell(id)}`} className="max-w-lg">
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="mongo-field-value">Value</Label>
              <label className="flex cursor-pointer select-none items-center gap-1.5 text-xxs text-muted-foreground">
                <Checkbox checked={remove} onChange={(e) => setRemove(e.target.checked)} />
                Remove this field
              </label>
            </div>
            <Textarea
              id="mongo-field-value"
              autoFocus
              rows={8}
              disabled={remove}
              value={remove ? '' : text}
              onChange={(e) => {
                setText(e.target.value);
                setError(null);
              }}
              className="resize-y font-mono text-xxs"
            />
            <p className="text-2xs leading-4 text-muted-foreground">{SYNTAX_HINT}</p>
            {error && <p className="text-xxs text-destructive">{error}</p>}
          </DialogBody>
          <DialogFooter className="justify-between">
            <Button
              variant="quiet"
              onClick={() => {
                onClose();
                onEditDocument();
              }}
            >
              <FileJson /> Edit whole document…
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit">Review update</Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

interface DocumentProps {
  collection: string;
  mode: 'insert' | 'replace';
  initialText: string;
  /** The document's _id, for replace. */
  id?: unknown;
  onSave: (statement: string) => void;
  onClose: () => void;
}

export const MongoDocumentModal: React.FC<DocumentProps> = ({ collection, mode, initialText, id, onSave, onClose }) => {
  const [text, setText] = useState(initialText);
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!/^[[{]/.test(body)) {
      setError(mode === 'insert' ? 'Enter a document { … } or an array of documents [ … ].' : 'Enter a document { … }.');
      return;
    }
    if (mode === 'replace' && body.startsWith('[')) {
      setError('Enter a single document { … }.');
      return;
    }
    onSave(mode === 'insert' ? insertStatement(collection, body) : replaceStatement(collection, id, body));
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={mode === 'insert' ? `Insert into ${collection}` : `Edit document`}
        description={
          mode === 'insert'
            ? 'Fields are prefilled from the documents already in the collection. MongoDB adds _id if you leave it out.'
            : `${collection} · document ${toShell(id)}. Fields you remove here are removed from the document.`
        }
        className="max-w-2xl"
      >
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="space-y-2">
            <Textarea
              aria-label="Document"
              autoFocus
              rows={18}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setError(null);
              }}
              className="resize-y font-mono text-xxs"
            />
            <p className="text-2xs leading-4 text-muted-foreground">{SYNTAX_HINT}</p>
            {error && <p className="text-xxs text-destructive">{error}</p>}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">{mode === 'insert' ? 'Review insert' : 'Review update'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
