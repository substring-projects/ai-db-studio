import React, { useState } from 'react';
import { Engine } from '../../../shared/types';
import { formatCell, kindFromTypeName } from '../../lib/grid';
import { quoteIdent } from '../../lib/sql';
import { Button } from '../ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '../ui/dialog';
import { Checkbox, Input, Label, Textarea } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Badge } from '../ui/badge';
import { Check, Sparkles } from 'lucide-react';

interface EditCellModalProps {
  tableName: string;
  qualifiedTable: string;
  columnName: string;
  initialValue: unknown;
  /** Addresses the row being edited. */
  target: { where: string; byPrimaryKey: boolean };
  engine?: Engine;
  columnType?: string;
  enumOptions?: string[];
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
  columnType = '',
  enumOptions = [],
  onSave,
  onClose,
}) => {
  const startsNull = initialValue === null || initialValue === undefined;
  const isBoolType =
    Boolean(columnType && (/tinyint\(1\)|bool|bit\b/i.test(columnType) || kindFromTypeName(columnType) === 'boolean')) ||
    typeof initialValue === 'boolean' ||
    (typeof initialValue === 'string' && /^(true|false|t|f)$/i.test(initialValue.trim()));

  const inferredKind = isBoolType
    ? 'boolean'
    : columnType
      ? kindFromTypeName(columnType)
      : typeof initialValue === 'number'
        ? 'number'
        : 'text';

  const [isNull, setIsNull] = useState(startsNull);
  const [boolVal, setBoolVal] = useState<boolean>(() => {
    if (typeof initialValue === 'boolean') return initialValue;
    const str = String(initialValue).toLowerCase().trim();
    return str === 'true' || str === '1' || str === 't';
  });
  
  // Parse initial enum options from column type if available (e.g. enum('active','inactive'))
  const parsedEnumOptions = React.useMemo(() => {
    if (enumOptions.length > 0) return enumOptions;
    const match = columnType.match(/enum\((.*?)\)/i);
    if (match && match[1]) {
      return match[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, ''));
    }
    return [];
  }, [enumOptions, columnType]);

  const [value, setValue] = useState(() => {
    if (startsNull) return '';
    if (typeof initialValue === 'object') {
      try {
        return JSON.stringify(initialValue, null, 2);
      } catch {
        return formatCell(initialValue);
      }
    }
    return formatCell(initialValue);
  });

  const [jsonError, setJsonError] = useState<string | null>(null);

  const formatJson = () => {
    try {
      const parsed = JSON.parse(value);
      setValue(JSON.stringify(parsed, null, 2));
      setJsonError(null);
    } catch (e) {
      setJsonError('Invalid JSON format');
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();

    let literal = 'NULL';
    if (!isNull) {
      if (inferredKind === 'boolean') {
        literal = boolVal ? 'TRUE' : 'FALSE';
      } else if (inferredKind === 'number' && value.trim() !== '' && !Number.isNaN(Number(value))) {
        literal = value.trim();
      } else if (value === 'CURRENT_TIMESTAMP' || value === 'NOW()') {
        literal = value;
      } else {
        if (inferredKind === 'json') {
          try {
            JSON.parse(value);
          } catch {
            // If user typed raw JSON or string, still allow saving
          }
        }
        literal = `'${value.replace(/'/g, "''")}'`;
      }
    }

    onSave(`UPDATE ${qualifiedTable}\nSET ${quoteIdent(engine, columnName)} = ${literal}\n${target.where};`);
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title={`Edit ${columnName}`} description={`${tableName} · ${columnType || inferredKind}`} className="max-w-md">
        <form onSubmit={submit}>
          <DialogBody className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="cell-value">Value</Label>
                {columnType && (
                  <Badge variant="outline" className="font-mono text-2xs uppercase tracking-wider">
                    {columnType}
                  </Badge>
                )}
              </div>
              <label className="flex cursor-pointer items-center gap-1.5 text-xxs text-muted-foreground select-none">
                <Checkbox checked={isNull} onChange={(e) => setIsNull(e.target.checked)} />
                Set NULL
              </label>
            </div>

            {!isNull && inferredKind === 'boolean' && (
              <div className="flex gap-2 pt-1">
                <Button
                  type="button"
                  variant={boolVal ? 'default' : 'outline'}
                  size="sm"
                  className="flex-1"
                  onClick={() => setBoolVal(true)}
                >
                  {boolVal && <Check className="size-3.5 mr-1" />} TRUE
                </Button>
                <Button
                  type="button"
                  variant={!boolVal ? 'default' : 'outline'}
                  size="sm"
                  className="flex-1"
                  onClick={() => setBoolVal(false)}
                >
                  {!boolVal && <Check className="size-3.5 mr-1" />} FALSE
                </Button>
              </div>
            )}

            {!isNull && (inferredKind === 'enum' || parsedEnumOptions.length > 0) && (
              <div className="space-y-1.5">
                {parsedEnumOptions.length > 0 ? (
                  <Select value={value} onValueChange={setValue}>
                    <SelectTrigger className="w-full font-mono text-xxs">
                      <SelectValue placeholder="Select enum value" />
                    </SelectTrigger>
                    <SelectContent>
                      {parsedEnumOptions.map((opt) => (
                        <SelectItem key={opt} value={opt}>
                          {opt}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id="cell-value"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder="Enum value"
                    className="font-mono text-xxs"
                  />
                )}
              </div>
            )}

            {!isNull && inferredKind === 'json' && (
              <div className="space-y-1.5">
                <div className="flex justify-end">
                  <Button type="button" variant="quiet" size="sm" onClick={formatJson} className="h-6 text-2xs">
                    <Sparkles className="size-3 mr-1" /> Format JSON
                  </Button>
                </div>
                <Textarea
                  id="cell-value"
                  rows={6}
                  value={value}
                  onChange={(e) => {
                    setValue(e.target.value);
                    setJsonError(null);
                  }}
                  className="resize-y font-mono text-xxs"
                  placeholder="{}"
                />
                {jsonError && <p className="text-2xs text-destructive">{jsonError}</p>}
              </div>
            )}

            {!isNull && inferredKind === 'date' && (
              <div className="space-y-1.5">
                <Input
                  id="cell-value"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="YYYY-MM-DD HH:MM:SS"
                  className="font-mono text-xxs"
                />
                <div className="flex gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 text-2xs"
                    onClick={() => setValue(new Date().toISOString().slice(0, 19).replace('T', ' '))}
                  >
                    Current timestamp
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 text-2xs"
                    onClick={() => setValue(new Date().toISOString().slice(0, 10))}
                  >
                    Today (date only)
                  </Button>
                </div>
              </div>
            )}

            {!isNull && inferredKind === 'number' && (
              <Input
                id="cell-value"
                type="number"
                step="any"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="font-mono text-xxs"
              />
            )}

            {!isNull &&
              inferredKind !== 'boolean' &&
              inferredKind !== 'enum' &&
              parsedEnumOptions.length === 0 &&
              inferredKind !== 'json' &&
              inferredKind !== 'date' &&
              inferredKind !== 'number' && (
                <Textarea
                  id="cell-value"
                  autoFocus
                  rows={4}
                  value={value}
                  placeholder="Enter text..."
                  onChange={(e) => setValue(e.target.value)}
                  className="resize-y font-mono text-xxs"
                />
              )}

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
