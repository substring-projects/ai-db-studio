import React, { useMemo, useState } from 'react';
import { Copy, ListTree, Plus, Settings2, ShieldCheck, Trash2 } from 'lucide-react';
import {
  BSON_TYPES,
  BsonTypeName,
  CollectionIndexSpec,
  CollectionSpec,
  FieldRule,
  IndexDirection,
  buildCreateCollection,
  emptyCollectionSpec,
  validateCollectionSpec,
  validatorFromRules,
} from '../../lib/mongoCollection';
import { cn } from '../../lib/utils';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '../ui/dialog';
import { Checkbox, Input, Label, Textarea } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';

interface CreateCollectionModalProps {
  database?: string;
  onExecute: (statements: string) => void;
  onClose: () => void;
}

const DIRECTIONS: { value: IndexDirection; label: string }[] = [
  { value: '1', label: 'Ascending' },
  { value: '-1', label: 'Descending' },
  { value: 'text', label: 'Text' },
  { value: '2dsphere', label: '2dsphere' },
  { value: 'hashed', label: 'Hashed' },
];

const KINDS: { value: CollectionSpec['kind']; label: string; hint: string }[] = [
  { value: 'standard', label: 'Standard', hint: 'A regular collection.' },
  { value: 'capped', label: 'Capped', hint: 'Fixed size: the oldest documents are removed when it is full. Good for logs.' },
  { value: 'timeseries', label: 'Time series', hint: 'Optimised for measurements over time. Needs MongoDB 5.0 or newer.' },
];

const NONE = '__none__';

const newIndex = (): CollectionIndexSpec => ({ name: '', keys: [{ field: '', direction: '1' }], unique: false, sparse: false, ttlSeconds: '' });
const newRule = (): FieldRule => ({ name: '', bsonType: 'string', required: false, allowed: '' });

export const CreateCollectionModal: React.FC<CreateCollectionModalProps> = ({ database, onExecute, onClose }) => {
  const [spec, setSpec] = useState<CollectionSpec>(emptyCollectionSpec);
  const [tab, setTab] = useState('general');
  const [showErrors, setShowErrors] = useState(false);
  const [customValidator, setCustomValidator] = useState(false);

  const set = (patch: Partial<CollectionSpec>) => setSpec((prev) => ({ ...prev, ...patch }));
  const errors = useMemo(() => validateCollectionSpec(spec), [spec]);
  const preview = useMemo(() => (spec.name.trim() ? buildCreateCollection(spec) : ''), [spec]);
  const ruleCount = spec.fieldRules.filter((r) => r.name.trim()).length;

  const updateRule = (i: number, patch: Partial<FieldRule>) =>
    set({ fieldRules: spec.fieldRules.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  const updateIndex = (i: number, patch: Partial<CollectionIndexSpec>) =>
    set({ indexes: spec.indexes.map((ix, j) => (j === i ? { ...ix, ...patch } : ix)) });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (errors.length > 0) {
      setShowErrors(true);
      return;
    }
    onExecute(buildCreateCollection(spec));
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title="Create collection" description={database ? `In database ${database}` : 'MongoDB'} className="max-w-3xl">
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="collection-name">Collection name</Label>
              <Input
                id="collection-name"
                autoFocus
                value={spec.name}
                onChange={(e) => set({ name: e.target.value })}
                placeholder="e.g. orders"
                className="w-72 font-mono"
              />
            </div>

            <Tabs value={tab} onValueChange={setTab}>
              <TabsList>
                <TabsTrigger value="general">
                  <Settings2 /> General
                </TabsTrigger>
                <TabsTrigger value="validation">
                  <ShieldCheck /> Validation <Badge>{customValidator ? 'custom' : ruleCount}</Badge>
                </TabsTrigger>
                <TabsTrigger value="indexes">
                  <ListTree /> Indexes <Badge>{spec.indexes.length}</Badge>
                </TabsTrigger>
                <TabsTrigger value="preview">
                  <Copy /> Preview
                </TabsTrigger>
              </TabsList>

              <TabsContent value="general" className="space-y-3 pt-2">
                <div className="grid grid-cols-3 gap-2">
                  {KINDS.map((k) => (
                    <button
                      key={k.value}
                      type="button"
                      onClick={() => set({ kind: k.value })}
                      className={cn(
                        'rounded-md border p-2 text-left transition-colors',
                        spec.kind === k.value ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent'
                      )}
                    >
                      <div className="text-xs font-medium">{k.label}</div>
                      <div className="mt-0.5 text-2xs leading-4 text-muted-foreground">{k.hint}</div>
                    </button>
                  ))}
                </div>
                {spec.kind === 'capped' && (
                  <div className="grid max-w-md grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label htmlFor="capped-size">Maximum size (bytes)</Label>
                      <Input id="capped-size" value={spec.cappedSize} placeholder="10485760" onChange={(e) => set({ cappedSize: e.target.value })} className="font-mono" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="capped-max">Maximum documents (optional)</Label>
                      <Input id="capped-max" value={spec.cappedMax} placeholder="5000" onChange={(e) => set({ cappedMax: e.target.value })} className="font-mono" />
                    </div>
                  </div>
                )}
                {spec.kind === 'timeseries' && (
                  <div className="grid max-w-xl grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label htmlFor="ts-time">Time field</Label>
                      <Input id="ts-time" value={spec.timeField} placeholder="timestamp" onChange={(e) => set({ timeField: e.target.value })} className="font-mono" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="ts-meta">Meta field (optional)</Label>
                      <Input id="ts-meta" value={spec.metaField} placeholder="sensor" onChange={(e) => set({ metaField: e.target.value })} className="font-mono" />
                    </div>
                    <div className="space-y-1">
                      <Label>Granularity</Label>
                      <Select value={spec.granularity || NONE} onValueChange={(v) => set({ granularity: v === NONE ? '' : (v as CollectionSpec['granularity']) })}>
                        <SelectTrigger aria-label="Granularity" className="text-xxs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE} className="text-xxs">Server default</SelectItem>
                          <SelectItem value="seconds" className="text-xxs">Seconds</SelectItem>
                          <SelectItem value="minutes" className="text-xxs">Minutes</SelectItem>
                          <SelectItem value="hours" className="text-xxs">Hours</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="ts-expire">Delete after (seconds, optional)</Label>
                      <Input id="ts-expire" value={spec.expireAfterSeconds} placeholder="2592000" onChange={(e) => set({ expireAfterSeconds: e.target.value })} className="font-mono" />
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="validation" className="space-y-2 pt-2">
                <div className="flex items-center justify-between">
                  <p className="text-xxs text-muted-foreground">Rules every inserted or updated document must follow.</p>
                  <label className="flex cursor-pointer items-center gap-1.5 text-xxs text-muted-foreground">
                    <Checkbox
                      checked={customValidator}
                      onChange={(e) => {
                        setCustomValidator(e.target.checked);
                        set({ customValidator: e.target.checked ? validatorFromRules(spec.fieldRules) ?? '{\n  $jsonSchema: {\n    bsonType: "object"\n  }\n}' : '' });
                      }}
                    />
                    Write the validator myself
                  </label>
                </div>
                {customValidator ? (
                  <Textarea
                    aria-label="Validator"
                    rows={12}
                    value={spec.customValidator}
                    onChange={(e) => set({ customValidator: e.target.value })}
                    className="resize-y font-mono text-xxs"
                  />
                ) : (
                  <>
                    {spec.fieldRules.length > 0 && (
                      <div className="grid grid-cols-[1fr_120px_70px_1fr_24px] gap-1.5 text-2xs text-muted-foreground">
                        <span>Field</span>
                        <span>Type</span>
                        <span>Required</span>
                        <span>Allowed values (optional)</span>
                        <span />
                      </div>
                    )}
                    {spec.fieldRules.map((rule, i) => (
                      <div key={i} className="grid grid-cols-[1fr_120px_70px_1fr_24px] items-center gap-1.5">
                        <Input aria-label="Field" value={rule.name} onChange={(e) => updateRule(i, { name: e.target.value })} className="font-mono text-xxs" />
                        <Select value={rule.bsonType} onValueChange={(v) => updateRule(i, { bsonType: v as BsonTypeName })}>
                          <SelectTrigger aria-label="Type" className="font-mono text-xxs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {BSON_TYPES.map((t) => (
                              <SelectItem key={t} value={t} className="font-mono text-xxs">
                                {t}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Checkbox aria-label="Required" checked={rule.required} onChange={(e) => updateRule(i, { required: e.target.checked })} />
                        <Input
                          aria-label="Allowed values"
                          value={rule.allowed}
                          placeholder="e.g. new, paid, shipped"
                          onChange={(e) => updateRule(i, { allowed: e.target.value })}
                          className="font-mono text-xxs"
                        />
                        <Button variant="quiet" size="icon-sm" aria-label="Remove rule" onClick={() => set({ fieldRules: spec.fieldRules.filter((_, j) => j !== i) })}>
                          <Trash2 />
                        </Button>
                      </div>
                    ))}
                    <Button variant="outline" size="sm" onClick={() => set({ fieldRules: [...spec.fieldRules, newRule()] })}>
                      <Plus /> Add field rule
                    </Button>
                  </>
                )}
                {(customValidator || ruleCount > 0) && (
                  <div className="flex flex-wrap items-center gap-4 pt-1">
                    <label className="flex items-center gap-1.5 text-xxs text-muted-foreground">
                      Level
                      <Select value={spec.validationLevel} onValueChange={(v) => set({ validationLevel: v as CollectionSpec['validationLevel'] })}>
                        <SelectTrigger aria-label="Validation level" className="h-6 w-28 text-xxs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="strict" className="text-xxs">Strict</SelectItem>
                          <SelectItem value="moderate" className="text-xxs">Moderate</SelectItem>
                        </SelectContent>
                      </Select>
                    </label>
                    <label className="flex items-center gap-1.5 text-xxs text-muted-foreground">
                      When a document fails
                      <Select value={spec.validationAction} onValueChange={(v) => set({ validationAction: v as CollectionSpec['validationAction'] })}>
                        <SelectTrigger aria-label="Validation action" className="h-6 w-32 text-xxs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="error" className="text-xxs">Reject it</SelectItem>
                          <SelectItem value="warn" className="text-xxs">Allow, log a warning</SelectItem>
                        </SelectContent>
                      </Select>
                    </label>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="indexes" className="space-y-2 pt-2">
                {spec.indexes.length === 0 && (
                  <p className="py-2 text-xxs text-muted-foreground">No extra indexes. Every collection gets an index on _id.</p>
                )}
                {spec.indexes.map((ix, i) => (
                  <div key={i} className="space-y-1.5 rounded-md border border-border p-2">
                    {ix.keys.map((k, kIndex) => (
                      <div key={kIndex} className="flex items-center gap-1.5">
                        <Input
                          aria-label="Index field"
                          value={k.field}
                          placeholder="field"
                          onChange={(e) => updateIndex(i, { keys: ix.keys.map((x, j) => (j === kIndex ? { ...x, field: e.target.value } : x)) })}
                          className="w-52 font-mono text-xxs"
                        />
                        <Select
                          value={k.direction}
                          onValueChange={(v) => updateIndex(i, { keys: ix.keys.map((x, j) => (j === kIndex ? { ...x, direction: v as IndexDirection } : x)) })}
                        >
                          <SelectTrigger aria-label="Direction" className="w-32 text-xxs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {DIRECTIONS.map((d) => (
                              <SelectItem key={d.value} value={d.value} className="text-xxs">
                                {d.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {ix.keys.length > 1 && (
                          <Button variant="quiet" size="icon-sm" aria-label="Remove field" onClick={() => updateIndex(i, { keys: ix.keys.filter((_, j) => j !== kIndex) })}>
                            <Trash2 />
                          </Button>
                        )}
                      </div>
                    ))}
                    <div className="flex flex-wrap items-center gap-3">
                      <Button variant="quiet" size="sm" onClick={() => updateIndex(i, { keys: [...ix.keys, { field: '', direction: '1' }] })}>
                        <Plus /> Field
                      </Button>
                      <Input
                        aria-label="Index name"
                        value={ix.name}
                        placeholder="Name (generated if empty)"
                        onChange={(e) => updateIndex(i, { name: e.target.value })}
                        className="h-6 w-48 font-mono text-2xs"
                      />
                      <label className="flex cursor-pointer items-center gap-1 text-xxs text-muted-foreground">
                        <Checkbox checked={ix.unique} onChange={(e) => updateIndex(i, { unique: e.target.checked })} /> Unique
                      </label>
                      <label className="flex cursor-pointer items-center gap-1 text-xxs text-muted-foreground">
                        <Checkbox checked={ix.sparse} onChange={(e) => updateIndex(i, { sparse: e.target.checked })} /> Sparse
                      </label>
                      <label className="flex items-center gap-1 text-xxs text-muted-foreground">
                        Expire after
                        <Input
                          aria-label="Expire after seconds"
                          value={ix.ttlSeconds}
                          placeholder="seconds"
                          onChange={(e) => updateIndex(i, { ttlSeconds: e.target.value })}
                          className="h-6 w-20 font-mono text-2xs"
                        />
                      </label>
                      <Button variant="quiet" size="icon-sm" className="ml-auto" aria-label="Remove index" onClick={() => set({ indexes: spec.indexes.filter((_, j) => j !== i) })}>
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => set({ indexes: [...spec.indexes, newIndex()] })}>
                  <Plus /> Add index
                </Button>
              </TabsContent>

              <TabsContent value="preview" className="space-y-2 pt-2">
                {preview ? (
                  <pre className="max-h-80 overflow-auto rounded-md border border-border bg-muted/40 p-3 font-mono text-xxs leading-5">{preview}</pre>
                ) : (
                  <p className="py-3 text-xxs text-muted-foreground">Enter a collection name to see the commands.</p>
                )}
                {spec.indexes.length > 0 && (
                  <p className="text-2xs text-muted-foreground">The commands run in order. If an index fails, the collection has already been created.</p>
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
            <Button type="submit">Review collection</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
