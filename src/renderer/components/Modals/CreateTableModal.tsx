import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Clock, Columns3, Copy, KeyRound, Link2, ListTree, Plus, Settings2, Trash2 } from 'lucide-react';
import { Engine } from '../../../shared/types';
import { useSchema } from '../../context/SchemaContext';
import {
  COLUMN_TYPES,
  ColumnSpec,
  ColumnTypeDef,
  ForeignKeySpec,
  IndexSpec,
  REFERENTIAL_ACTIONS,
  ReferentialAction,
  TableOptions,
  buildCreateTable,
  defaultOptions,
  emptyColumn,
  findType,
  isIntegerType,
  validateTable,
} from '../../lib/ddl';
import { columnKey } from '../../lib/sql';
import { cn } from '../../lib/utils';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '../ui/dialog';
import { Checkbox, Input, Label } from '../ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from '../ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';

interface CreateTableModalProps {
  engine?: Engine;
  schema?: string;
  /** Connection whose tables can be referenced by foreign keys. */
  profileId?: string;
  onExecuteDdl: (ddl: string) => void;
  onClose: () => void;
}

type Keyed<T> = T & { key: number };

const CUSTOM_TYPE = '__custom__';
const NONE = '__none__';

const PARAM_PLACEHOLDER: Record<string, string> = {
  length: 'length',
  precision: 'p,s',
  values: "'a','b'",
  fsp: '0–6',
};

const GROUPS: ColumnTypeDef['group'][] = ['Numeric', 'Text', 'Date & time', 'Boolean', 'Binary', 'JSON', 'Other'];

const MYSQL_ENGINES = ['InnoDB', 'MyISAM', 'MEMORY', 'ARCHIVE'];
const MYSQL_CHARSETS = ['utf8mb4', 'utf8mb3', 'latin1', 'ascii', 'binary'];

let keySeq = 0;
const nextKey = () => ++keySeq;

export const CreateTableModal: React.FC<CreateTableModalProps> = ({ engine = 'POSTGRESQL', schema, profileId, onExecuteDdl, onClose }) => {
  const { schemas } = useSchema();
  const schemaEntry = profileId ? schemas[profileId] : undefined;
  const isMy = engine === 'MYSQL';
  const timestampType = isMy ? 'TIMESTAMP' : 'TIMESTAMPTZ';

  const [tableName, setTableName] = useState('');
  const [tab, setTab] = useState('columns');
  const [showErrors, setShowErrors] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  /** Columns whose type is typed in by hand instead of picked from the list. */
  const [customTypes, setCustomTypes] = useState<Set<number>>(new Set());
  const [columns, setColumns] = useState<Keyed<ColumnSpec>[]>(() => [
    { key: nextKey(), ...emptyColumn({ name: 'id', type: 'BIGINT', params: '', primaryKey: true, notNull: true, autoIncrement: true, unsigned: isMy }) },
    { key: nextKey(), ...emptyColumn({ name: 'created_at', type: timestampType, params: '', notNull: true, defaultValue: 'CURRENT_TIMESTAMP' }) },
  ]);
  const [foreignKeys, setForeignKeys] = useState<Keyed<ForeignKeySpec>[]>([]);
  const [indexes, setIndexes] = useState<Keyed<IndexSpec>[]>([]);
  const [options, setOptions] = useState<TableOptions>(() => ({
    ...defaultOptions(),
    ...(isMy ? { storageEngine: 'InnoDB', charset: 'utf8mb4' } : {}),
  }));

  const namedColumns = columns.filter((c) => c.name.trim());
  const spec = useMemo(
    () => ({ name: tableName, schema, columns, foreignKeys, indexes, options }),
    [tableName, schema, columns, foreignKeys, indexes, options]
  );
  const errors = useMemo(() => validateTable(engine, spec), [engine, spec]);
  const preview = useMemo(
    () => (tableName.trim() && namedColumns.length > 0 ? buildCreateTable(engine, spec) : ''),
    [engine, spec, tableName, namedColumns.length]
  );

  const tables = useMemo(
    () => (schemaEntry?.tables ?? []).filter((t) => t.type === 'TABLE'),
    [schemaEntry?.tables]
  );
  const refColumns = (table: string, refSchema?: string) => schemaEntry?.columns[columnKey(table, refSchema)] ?? [];

  const updateColumn = (key: number, patch: Partial<ColumnSpec>) =>
    setColumns((prev) => prev.map((c) => (c.key === key ? { ...c, ...patch } : c)));

  const renameColumn = (key: number, name: string) => {
    const old = columns.find((c) => c.key === key)?.name;
    updateColumn(key, { name });
    // Keep foreign keys and indexes pointing at the renamed column.
    if (old) {
      setForeignKeys((prev) => prev.map((fk) => (fk.column === old ? { ...fk, column: name } : fk)));
      setIndexes((prev) => prev.map((ix) => ({ ...ix, columns: ix.columns.map((c) => (c === old ? name : c)) })));
    }
  };

  const changeType = (col: Keyed<ColumnSpec>, type: string) => {
    const def = findType(engine, type);
    updateColumn(col.key, {
      type,
      params: def?.params ? def.defaultParams ?? '' : '',
      autoIncrement: col.autoIncrement && Boolean(def?.integer),
      onUpdateNow: col.onUpdateNow && /TIMESTAMP|DATETIME/.test(type),
    });
  };

  const addColumn = (patch: Partial<ColumnSpec> = {}) => {
    const key = nextKey();
    setColumns((prev) => [...prev, { key, ...emptyColumn(patch) }]);
    return key;
  };

  const hasColumn = (name: string) => columns.some((c) => c.name.trim().toLowerCase() === name);

  const addTimestamps = () => {
    if (!hasColumn('created_at')) addColumn({ name: 'created_at', type: timestampType, params: '', notNull: true, defaultValue: 'CURRENT_TIMESTAMP' });
    if (!hasColumn('updated_at'))
      addColumn({ name: 'updated_at', type: timestampType, params: '', notNull: true, defaultValue: 'CURRENT_TIMESTAMP', onUpdateNow: isMy });
  };

  const addIdColumn = () => {
    if (hasColumn('id')) return;
    setColumns((prev) => [
      { key: nextKey(), ...emptyColumn({ name: 'id', type: 'BIGINT', params: '', primaryKey: true, notNull: true, autoIncrement: true, unsigned: isMy }) },
      ...prev.map((c) => ({ ...c, primaryKey: false })),
    ]);
  };

  const addUuidColumn = () => {
    if (hasColumn('id')) return;
    setColumns((prev) => [
      {
        key: nextKey(),
        ...emptyColumn(
          isMy
            ? { name: 'id', type: 'CHAR', params: '36', primaryKey: true, notNull: true, defaultValue: '(UUID())' }
            : { name: 'id', type: 'UUID', params: '', primaryKey: true, notNull: true, defaultValue: 'gen_random_uuid()' }
        ),
      },
      ...prev.map((c) => ({ ...c, primaryKey: false })),
    ]);
  };

  const moveColumn = (key: number, delta: number) =>
    setColumns((prev) => {
      const i = prev.findIndex((c) => c.key === key);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const toggleExpanded = (key: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const addForeignKey = () => {
    const candidate = namedColumns.find((c) => /_id$/i.test(c.name.trim()) && !foreignKeys.some((fk) => fk.column === c.name.trim()));
    const guessed = candidate ? tables.find((t) => {
      const base = candidate.name.trim().replace(/_id$/i, '').toLowerCase();
      const n = t.name.toLowerCase();
      return n === base || n === `${base}s` || n === `${base}es` || n === base.replace(/y$/, 'ies');
    }) : undefined;
    const refPk = guessed ? refColumns(guessed.name, guessed.schema).find((c) => c.primaryKey)?.name ?? '' : '';
    setForeignKeys((prev) => [
      ...prev,
      {
        key: nextKey(),
        name: '',
        column: candidate?.name.trim() ?? '',
        refTable: guessed?.name ?? '',
        refSchema: guessed?.schema,
        refColumn: refPk,
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
      },
    ]);
  };

  const updateForeignKey = (key: number, patch: Partial<ForeignKeySpec>) =>
    setForeignKeys((prev) => prev.map((fk) => (fk.key === key ? { ...fk, ...patch } : fk)));

  const updateIndex = (key: number, patch: Partial<IndexSpec>) =>
    setIndexes((prev) => prev.map((ix) => (ix.key === key ? { ...ix, ...patch } : ix)));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (errors.length > 0) {
      setShowErrors(true);
      return;
    }
    onExecuteDdl(buildCreateTable(engine, spec));
    onClose();
  };

  const typeOptions = (current: string) => {
    const list = COLUMN_TYPES[engine];
    const custom = current && !findType(engine, current);
    return (
      <SelectContent className="max-h-80">
        {GROUPS.map((group, gi) => {
          const items = list.filter((t) => t.group === group);
          if (items.length === 0) return null;
          return (
            <SelectGroup key={group}>
              {gi > 0 && <SelectSeparator />}
              <SelectLabel>{group}</SelectLabel>
              {items.map((t) => (
                <SelectItem key={t.name} value={t.name} className="font-mono text-xxs">
                  {t.name}
                </SelectItem>
              ))}
            </SelectGroup>
          );
        })}
        <SelectSeparator />
        {custom && (
          <SelectItem value={current} className="font-mono text-xxs">
            {current}
          </SelectItem>
        )}
        <SelectItem value={CUSTOM_TYPE} className="text-xxs">
          Custom type…
        </SelectItem>
      </SelectContent>
    );
  };

  const columnGrid = 'grid grid-cols-[18px_minmax(110px,1fr)_130px_64px_26px_26px_26px_26px_minmax(90px,140px)_24px] items-center gap-1.5';

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title="Create table"
        description={schema ? `In schema ${schema}` : isMy ? 'MySQL' : 'PostgreSQL'}
        className="max-w-4xl"
      >
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label htmlFor="table-name">Table name</Label>
                <Input
                  id="table-name"
                  autoFocus
                  value={tableName}
                  onChange={(e) => setTableName(e.target.value)}
                  placeholder="e.g. orders"
                  className="w-64 font-mono"
                />
              </div>
              <label className="flex h-7 cursor-pointer items-center gap-1.5 text-xxs text-muted-foreground">
                <Checkbox checked={options.ifNotExists} onChange={(e) => setOptions((o) => ({ ...o, ifNotExists: e.target.checked }))} />
                IF NOT EXISTS
              </label>
            </div>

            <Tabs value={tab} onValueChange={setTab}>
              <TabsList>
                <TabsTrigger value="columns">
                  <Columns3 /> Columns <Badge>{namedColumns.length}</Badge>
                </TabsTrigger>
                <TabsTrigger value="fks">
                  <Link2 /> Foreign keys <Badge>{foreignKeys.length}</Badge>
                </TabsTrigger>
                <TabsTrigger value="indexes">
                  <ListTree /> Indexes <Badge>{indexes.length}</Badge>
                </TabsTrigger>
                <TabsTrigger value="options">
                  <Settings2 /> Options
                </TabsTrigger>
                <TabsTrigger value="sql">
                  <Copy /> SQL preview
                </TabsTrigger>
              </TabsList>

              {/* Columns */}
              <TabsContent value="columns" className="pt-2">
                <div className={cn(columnGrid, 'pb-1 text-2xs text-muted-foreground')}>
                  <span />
                  <span>Name</span>
                  <span>Type</span>
                  <span>Size</span>
                  <span title="Primary key">PK</span>
                  <span title="Not null">NN</span>
                  <span title="Auto increment">AI</span>
                  <span title="Unique">UQ</span>
                  <span>Default</span>
                  <span />
                </div>
                <div className="space-y-1">
                  {columns.map((col, i) => {
                    const def = findType(engine, col.type);
                    const isOpen = expanded.has(col.key);
                    const canAutoInc = isIntegerType(engine, col.type);
                    const isTime = /TIMESTAMP|DATETIME/.test(col.type.toUpperCase());
                    const hasExtras = col.check || col.comment || col.unsigned || col.onUpdateNow;
                    return (
                      <div key={col.key} className={cn('rounded-md', isOpen && 'bg-muted/40 pb-2')}>
                        <div className={columnGrid}>
                          <Button
                            variant="quiet"
                            size="icon-xs"
                            aria-label={isOpen ? 'Hide column options' : 'More column options'}
                            title="More options: unsigned, check, comment…"
                            onClick={() => toggleExpanded(col.key)}
                            className={cn(hasExtras && !isOpen && 'text-primary')}
                          >
                            {isOpen ? <ChevronDown /> : <ChevronRight />}
                          </Button>
                          <Input
                            aria-label="Column name"
                            value={col.name}
                            placeholder={`column_${i + 1}`}
                            onChange={(e) => renameColumn(col.key, e.target.value)}
                            className="font-mono text-xxs"
                          />
                          {!customTypes.has(col.key) ? (
                            <Select
                              value={col.type || undefined}
                              onValueChange={(type) => {
                                if (type === CUSTOM_TYPE) {
                                  setCustomTypes((prev) => new Set(prev).add(col.key));
                                  updateColumn(col.key, { type: '', params: '', autoIncrement: false, unsigned: false });
                                } else {
                                  changeType(col, type);
                                }
                              }}
                            >
                              <SelectTrigger aria-label="Column type" className="font-mono text-xxs">
                                <SelectValue placeholder="Type" />
                              </SelectTrigger>
                              {typeOptions(col.type)}
                            </Select>
                          ) : (
                            <Input
                              aria-label="Custom column type"
                              value={col.type}
                              onChange={(e) => updateColumn(col.key, { type: e.target.value })}
                              placeholder="e.g. POINT"
                              autoFocus
                              onBlur={() => {
                                // An empty or known type goes back to the list.
                                if (!col.type.trim() || findType(engine, col.type)) {
                                  setCustomTypes((prev) => {
                                    const next = new Set(prev);
                                    next.delete(col.key);
                                    return next;
                                  });
                                  if (!col.type.trim()) changeType(col, 'VARCHAR');
                                  else changeType(col, col.type.trim().toUpperCase());
                                }
                              }}
                              className="font-mono text-xxs"
                            />
                          )}
                          <Input
                            aria-label="Type size"
                            value={col.params}
                            disabled={Boolean(def) && !def?.params}
                            placeholder={def?.params ? PARAM_PLACEHOLDER[def.params] : def ? '—' : 'args'}
                            onChange={(e) => updateColumn(col.key, { params: e.target.value })}
                            className="font-mono text-xxs"
                          />
                          <Checkbox
                            aria-label="Primary key"
                            title="Primary key"
                            checked={col.primaryKey}
                            onChange={(e) => updateColumn(col.key, { primaryKey: e.target.checked, notNull: e.target.checked || col.notNull })}
                          />
                          <Checkbox
                            aria-label="Not null"
                            title="Not null"
                            checked={col.notNull || col.primaryKey}
                            disabled={col.primaryKey}
                            onChange={(e) => updateColumn(col.key, { notNull: e.target.checked })}
                          />
                          <Checkbox
                            aria-label="Auto increment"
                            title={canAutoInc ? (isMy ? 'AUTO_INCREMENT' : 'GENERATED BY DEFAULT AS IDENTITY') : 'Only integer types can auto-increment'}
                            checked={col.autoIncrement}
                            disabled={!canAutoInc}
                            onChange={(e) =>
                              updateColumn(col.key, {
                                autoIncrement: e.target.checked,
                                ...(e.target.checked ? { defaultValue: '', notNull: true } : {}),
                              })
                            }
                          />
                          <Checkbox
                            aria-label="Unique"
                            title="Unique"
                            checked={col.unique}
                            onChange={(e) => updateColumn(col.key, { unique: e.target.checked })}
                          />
                          <Input
                            aria-label="Default value"
                            value={col.autoIncrement ? '' : col.defaultValue}
                            disabled={col.autoIncrement}
                            placeholder={col.autoIncrement ? 'auto' : 'none'}
                            title="A value (quoted for you) or an expression such as now() or CURRENT_TIMESTAMP"
                            onChange={(e) => updateColumn(col.key, { defaultValue: e.target.value })}
                            className="font-mono text-xxs"
                          />
                          <Button
                            variant="quiet"
                            size="icon-sm"
                            aria-label={`Remove ${col.name || 'column'}`}
                            onClick={() => {
                              const name = col.name.trim();
                              setColumns((prev) => prev.filter((c) => c.key !== col.key));
                              setForeignKeys((prev) => prev.filter((fk) => fk.column !== name));
                              setIndexes((prev) =>
                                prev.map((ix) => ({ ...ix, columns: ix.columns.filter((c) => c !== name) })).filter((ix) => ix.columns.length > 0)
                              );
                            }}
                          >
                            <Trash2 />
                          </Button>
                        </div>
                        {isOpen && (
                          <div className="ml-6 mt-2 grid grid-cols-2 gap-x-3 gap-y-2 pr-8">
                            <div className="space-y-1">
                              <Label>Check constraint</Label>
                              <Input
                                value={col.check}
                                placeholder={col.name ? `${col.name.trim()} > 0` : 'price > 0'}
                                onChange={(e) => updateColumn(col.key, { check: e.target.value })}
                                className="font-mono text-xxs"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label>Comment</Label>
                              <Input
                                value={col.comment}
                                placeholder="What this column holds"
                                onChange={(e) => updateColumn(col.key, { comment: e.target.value })}
                                className="text-xxs"
                              />
                            </div>
                            <div className="col-span-2 flex flex-wrap items-center gap-4">
                              {isMy && def && def.group === 'Numeric' && def.name !== 'BIT' && (
                                <label className="flex cursor-pointer items-center gap-1.5 text-xxs text-muted-foreground">
                                  <Checkbox checked={col.unsigned} onChange={(e) => updateColumn(col.key, { unsigned: e.target.checked })} />
                                  UNSIGNED
                                </label>
                              )}
                              {isMy && isTime && (
                                <label className="flex cursor-pointer items-center gap-1.5 text-xxs text-muted-foreground">
                                  <Checkbox checked={col.onUpdateNow} onChange={(e) => updateColumn(col.key, { onUpdateNow: e.target.checked })} />
                                  ON UPDATE CURRENT_TIMESTAMP
                                </label>
                              )}
                              <div className="ml-auto flex items-center gap-1">
                                <Button variant="quiet" size="sm" disabled={i === 0} onClick={() => moveColumn(col.key, -1)}>
                                  Move up
                                </Button>
                                <Button variant="quiet" size="sm" disabled={i === columns.length - 1} onClick={() => moveColumn(col.key, 1)}>
                                  Move down
                                </Button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Button variant="outline" size="sm" onClick={() => addColumn()}>
                    <Plus /> Add column
                  </Button>
                  <Button variant="quiet" size="sm" onClick={addIdColumn} disabled={hasColumn('id')}>
                    <KeyRound /> Auto-increment id
                  </Button>
                  <Button variant="quiet" size="sm" onClick={addUuidColumn} disabled={hasColumn('id')}>
                    <KeyRound /> UUID id
                  </Button>
                  <Button variant="quiet" size="sm" onClick={addTimestamps} disabled={hasColumn('created_at') && hasColumn('updated_at')}>
                    <Clock /> Timestamps
                  </Button>
                </div>
                {!isMy && columns.some((c) => c.name.trim() === 'updated_at') && (
                  <p className="mt-2 text-2xs text-muted-foreground">
                    PostgreSQL has no ON UPDATE clause: keep updated_at current with a trigger or from your application.
                  </p>
                )}
              </TabsContent>

              {/* Foreign keys */}
              <TabsContent value="fks" className="pt-2">
                {foreignKeys.length === 0 ? (
                  <p className="py-3 text-xxs text-muted-foreground">
                    No foreign keys. Add one to link a column to a row in another table.
                  </p>
                ) : (
                  <div className="space-y-2">
                    <div className="grid grid-cols-[1fr_1.2fr_1fr_110px_110px_24px] gap-1.5 text-2xs text-muted-foreground">
                      <span>Column</span>
                      <span>References table</span>
                      <span>Column</span>
                      <span>On delete</span>
                      <span>On update</span>
                      <span />
                    </div>
                    {foreignKeys.map((fk) => {
                      const targetCols = fk.refTable ? refColumns(fk.refTable, fk.refSchema) : [];
                      const tableValue = fk.refTable ? columnKey(fk.refTable, fk.refSchema) : undefined;
                      return (
                        <div key={fk.key} className="space-y-1">
                          <div className="grid grid-cols-[1fr_1.2fr_1fr_110px_110px_24px] items-center gap-1.5">
                            <Select value={fk.column || undefined} onValueChange={(column) => updateForeignKey(fk.key, { column })}>
                              <SelectTrigger aria-label="Foreign key column" className="font-mono text-xxs">
                                <SelectValue placeholder="Column" />
                              </SelectTrigger>
                              <SelectContent>
                                {namedColumns.map((c) => (
                                  <SelectItem key={c.key} value={c.name.trim()} className="font-mono text-xxs">
                                    {c.name.trim()}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {tables.length > 0 ? (
                              <Select
                                value={tableValue}
                                onValueChange={(value) => {
                                  const t = tables.find((t) => columnKey(t.name, t.schema) === value);
                                  if (!t) return;
                                  const pk = refColumns(t.name, t.schema).find((c) => c.primaryKey)?.name ?? '';
                                  updateForeignKey(fk.key, { refTable: t.name, refSchema: t.schema, refColumn: pk });
                                }}
                              >
                                <SelectTrigger aria-label="Referenced table" className="font-mono text-xxs">
                                  <SelectValue placeholder="Table" />
                                </SelectTrigger>
                                <SelectContent className="max-h-80">
                                  {tables.map((t) => (
                                    <SelectItem key={columnKey(t.name, t.schema)} value={columnKey(t.name, t.schema)} className="font-mono text-xxs">
                                      {columnKey(t.name, t.schema)}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <Input
                                aria-label="Referenced table"
                                value={fk.refTable}
                                placeholder="table"
                                onChange={(e) => updateForeignKey(fk.key, { refTable: e.target.value, refSchema: undefined })}
                                className="font-mono text-xxs"
                              />
                            )}
                            {targetCols.length > 0 ? (
                              <Select value={fk.refColumn || undefined} onValueChange={(refColumn) => updateForeignKey(fk.key, { refColumn })}>
                                <SelectTrigger aria-label="Referenced column" className="font-mono text-xxs">
                                  <SelectValue placeholder="Column" />
                                </SelectTrigger>
                                <SelectContent>
                                  {targetCols.map((c) => (
                                    <SelectItem key={c.name} value={c.name} className="font-mono text-xxs">
                                      {c.name} {c.primaryKey ? '· PK' : ''}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <Input
                                aria-label="Referenced column"
                                value={fk.refColumn}
                                placeholder="id"
                                onChange={(e) => updateForeignKey(fk.key, { refColumn: e.target.value })}
                                className="font-mono text-xxs"
                              />
                            )}
                            {(['onDelete', 'onUpdate'] as const).map((field) => (
                              <Select
                                key={field}
                                value={fk[field]}
                                onValueChange={(value) => updateForeignKey(fk.key, { [field]: value as ReferentialAction })}
                              >
                                <SelectTrigger aria-label={field === 'onDelete' ? 'On delete' : 'On update'} className="text-xxs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {REFERENTIAL_ACTIONS.map((a) => (
                                    <SelectItem key={a} value={a} className="text-xxs">
                                      {a}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ))}
                            <Button
                              variant="quiet"
                              size="icon-sm"
                              aria-label="Remove foreign key"
                              onClick={() => setForeignKeys((prev) => prev.filter((f) => f.key !== fk.key))}
                            >
                              <Trash2 />
                            </Button>
                          </div>
                          <Input
                            aria-label="Constraint name"
                            value={fk.name}
                            placeholder={`Constraint name (default fk_${tableName.trim() || 'table'}_${fk.column || 'column'})`}
                            onChange={(e) => updateForeignKey(fk.key, { name: e.target.value })}
                            className="h-6 max-w-sm font-mono text-2xs"
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
                <Button variant="outline" size="sm" className="mt-2" onClick={addForeignKey} disabled={namedColumns.length === 0}>
                  <Plus /> Add foreign key
                </Button>
              </TabsContent>

              {/* Indexes */}
              <TabsContent value="indexes" className="pt-2">
                {indexes.length === 0 ? (
                  <p className="py-3 text-xxs text-muted-foreground">
                    No extra indexes. The primary key and unique columns are indexed automatically.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {indexes.map((ix) => (
                      <div key={ix.key} className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2">
                        <Input
                          aria-label="Index name"
                          value={ix.name}
                          placeholder="Name (generated if empty)"
                          onChange={(e) => updateIndex(ix.key, { name: e.target.value })}
                          className="w-52 font-mono text-xxs"
                        />
                        <label className="flex cursor-pointer items-center gap-1.5 text-xxs text-muted-foreground">
                          <Checkbox checked={ix.unique} onChange={(e) => updateIndex(ix.key, { unique: e.target.checked })} />
                          Unique
                        </label>
                        <div className="flex flex-1 flex-wrap items-center gap-1">
                          {namedColumns.map((c) => {
                            const name = c.name.trim();
                            const position = ix.columns.indexOf(name);
                            const on = position >= 0;
                            return (
                              <button
                                key={c.key}
                                type="button"
                                onClick={() =>
                                  updateIndex(ix.key, {
                                    columns: on ? ix.columns.filter((x) => x !== name) : [...ix.columns, name],
                                  })
                                }
                                className={cn(
                                  'h-6 rounded-md border px-2 font-mono text-2xs transition-colors',
                                  on ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:bg-accent'
                                )}
                              >
                                {on && <span className="mr-1 text-primary">{position + 1}</span>}
                                {name}
                              </button>
                            );
                          })}
                        </div>
                        <Button
                          variant="quiet"
                          size="icon-sm"
                          aria-label="Remove index"
                          onClick={() => setIndexes((prev) => prev.filter((x) => x.key !== ix.key))}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    ))}
                    <p className="text-2xs text-muted-foreground">Click columns in the order the index should use them.</p>
                  </div>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  disabled={namedColumns.length === 0}
                  onClick={() => setIndexes((prev) => [...prev, { key: nextKey(), name: '', columns: [], unique: false }])}
                >
                  <Plus /> Add index
                </Button>
              </TabsContent>

              {/* Options */}
              <TabsContent value="options" className="space-y-3 pt-2">
                <div className="space-y-1">
                  <Label htmlFor="table-comment">Table comment</Label>
                  <Input
                    id="table-comment"
                    value={options.comment}
                    placeholder="What this table stores"
                    onChange={(e) => setOptions((o) => ({ ...o, comment: e.target.value }))}
                    className="max-w-lg text-xxs"
                  />
                </div>
                {isMy && (
                  <div className="grid max-w-lg grid-cols-3 gap-2">
                    <OptionSelect
                      label="Storage engine"
                      value={options.storageEngine}
                      choices={MYSQL_ENGINES}
                      onChange={(storageEngine) => setOptions((o) => ({ ...o, storageEngine }))}
                    />
                    <OptionSelect
                      label="Character set"
                      value={options.charset}
                      choices={MYSQL_CHARSETS}
                      onChange={(charset) => setOptions((o) => ({ ...o, charset, collation: '' }))}
                    />
                    <div className="space-y-1">
                      <Label htmlFor="table-collation">Collation</Label>
                      <Input
                        id="table-collation"
                        value={options.collation}
                        placeholder={options.charset === 'utf8mb4' ? 'utf8mb4_0900_ai_ci' : 'server default'}
                        onChange={(e) => setOptions((o) => ({ ...o, collation: e.target.value }))}
                        className="font-mono text-xxs"
                      />
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* Preview */}
              <TabsContent value="sql" className="pt-2">
                {preview ? (
                  <pre className="max-h-80 overflow-auto rounded-md border border-border bg-muted/40 p-3 font-mono text-xxs leading-5">{preview}</pre>
                ) : (
                  <p className="py-3 text-xxs text-muted-foreground">Enter a table name and at least one column to see the SQL.</p>
                )}
              </TabsContent>
            </Tabs>

            {showErrors && errors.length > 0 && (
              <ul className="space-y-0.5 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xxs text-destructive">
                {errors.map((err) => (
                  <li key={err}>{err}</li>
                ))}
              </ul>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Review table</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

const OptionSelect: React.FC<{ label: string; value: string; choices: string[]; onChange: (value: string) => void }> = ({
  label,
  value,
  choices,
  onChange,
}) => (
  <div className="space-y-1">
    <Label>{label}</Label>
    <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? '' : v)}>
      <SelectTrigger aria-label={label} className="font-mono text-xxs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE} className="text-xxs">
          Server default
        </SelectItem>
        {choices.map((c) => (
          <SelectItem key={c} value={c} className="font-mono text-xxs">
            {c}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
);
