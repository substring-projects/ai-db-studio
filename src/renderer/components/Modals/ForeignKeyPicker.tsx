import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronsUpDown, Link2, Loader2, PencilLine } from 'lucide-react';
import { ForeignKey, TableColumn } from '../../../shared/types';
import { useSchema } from '../../context/SchemaContext';
import { cleanError } from '../../context/StudioContext';
import { formatCell } from '../../lib/grid';
import { columnKey } from '../../lib/sql';
import { cn } from '../../lib/utils';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '../ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';

const PAGE = 50;
const LABEL_NAMES = ['name', 'title', 'label', 'display_name', 'full_name', 'username', 'email', 'code', 'slug', 'description'];

/** The most human-readable column of the referenced table, shown next to each key. */
export function pickLabelColumn(columns: TableColumn[], refColumn: string): string | undefined {
  const others = columns.filter((c) => c.name.toLowerCase() !== refColumn.toLowerCase());
  for (const wanted of LABEL_NAMES) {
    const hit = others.find((c) => c.name.toLowerCase() === wanted);
    if (hit) return hit.name;
  }
  const partial = others.find((c) => LABEL_NAMES.some((n) => c.name.toLowerCase().endsWith(`_${n}`)));
  if (partial) return partial.name;
  return others.find((c) => !c.primaryKey && /char|text|citext/i.test(c.typeName))?.name;
}

interface Option {
  value: string;
  label?: string;
}

interface ForeignKeyPickerProps {
  profileId: string;
  foreignKey: ForeignKey;
  /** Schema of the table being edited, used when the key does not name one. */
  schema?: string;
  value: string;
  onChange: (value: string) => void;
  id?: string;
  disabled?: boolean;
  placeholder?: string;
}

/**
 * Searchable list of the rows a foreign key column can point to. Searching runs on the
 * server, matching the key and a readable label column, so large tables stay fast.
 * A typed value can still be used as-is when it is not in the list.
 */
export const ForeignKeyPicker: React.FC<ForeignKeyPickerProps> = ({
  profileId,
  foreignKey,
  schema,
  value,
  onChange,
  id,
  disabled,
  placeholder,
}) => {
  const { schemas } = useSchema();
  const refSchema = foreignKey.refSchema ?? schema;
  const refColumns = schemas[profileId]?.columns[columnKey(foreignKey.refTable, refSchema)] ?? [];
  const labelColumn = useMemo(() => pickLabelColumn(refColumns, foreignKey.refColumn), [refColumns, foreignKey.refColumn]);

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [options, setOptions] = useState<Option[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  /** Labels of values seen so far, so the trigger can show the chosen row's name. */
  const labels = useRef(new Map<string, string>());
  const seq = useRef(0);

  useEffect(() => {
    if (!open) return;
    const current = ++seq.current;
    const term = search.trim();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const rules = term
          ? [
              { column: foreignKey.refColumn, operator: 'CONTAINS' as const, value: term },
              ...(labelColumn ? [{ column: labelColumn, operator: 'CONTAINS' as const, value: term }] : []),
            ]
          : [];
        const result = await window.electronAPI.getTableData(
          profileId,
          foreignKey.refTable,
          PAGE + 1,
          0,
          foreignKey.refColumn,
          false,
          rules,
          true,
          refSchema
        );
        if (current !== seq.current) return;
        const find = (name?: string) =>
          name ? result.columns.findIndex((c) => c.toLowerCase() === name.toLowerCase()) : -1;
        const keyIndex = find(foreignKey.refColumn);
        const labelIndex = find(labelColumn);
        if (keyIndex < 0) throw new Error(`Column ${foreignKey.refColumn} not found in ${foreignKey.refTable}`);
        const seen = new Set<string>();
        const next: Option[] = [];
        for (const row of result.rows.slice(0, PAGE)) {
          const key = row[keyIndex];
          if (key === null || key === undefined) continue;
          const text = formatCell(key);
          if (seen.has(text)) continue;
          seen.add(text);
          const label = labelIndex >= 0 && row[labelIndex] !== null ? formatCell(row[labelIndex]) : undefined;
          if (label) labels.current.set(text, label);
          next.push({ value: text, label });
        }
        setOptions(next);
        setTruncated(result.rows.length > PAGE);
      } catch (err) {
        if (current !== seq.current) return;
        setOptions([]);
        setError(cleanError(err, 'Could not load rows'));
      } finally {
        if (current === seq.current) setLoading(false);
      }
    }, term ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [open, search, profileId, foreignKey.refTable, foreignKey.refColumn, refSchema, labelColumn]);

  const choose = (next: string) => {
    onChange(next);
    setOpen(false);
    setSearch('');
  };

  const typed = search.trim();
  const typedIsListed = options.some((o) => o.value === typed);
  const currentLabel = value ? labels.current.get(value) : undefined;
  const target = `${foreignKey.refTable}.${foreignKey.refColumn}`;

  return (
    <Popover open={open} onOpenChange={(next) => !disabled && setOpen(next)}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          disabled={disabled}
          aria-label={`Choose ${target}`}
          title={`References ${target}`}
          className={cn(
            'flex h-7 w-full min-w-0 items-center gap-1.5 rounded-md border border-input bg-background px-2 text-left font-mono text-xxs transition-colors duration-100 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
            open && 'border-ring'
          )}
        >
          <Link2 className="size-3 shrink-0 text-sky-500" />
          {value ? (
            <span className="min-w-0 flex-1 truncate">
              {value}
              {currentLabel && <span className="ml-1.5 font-sans text-muted-foreground">{currentLabel}</span>}
            </span>
          ) : (
            <span className="min-w-0 flex-1 truncate font-sans text-muted-foreground/80">
              {placeholder ?? `Select from ${foreignKey.refTable}…`}
            </span>
          )}
          <ChevronsUpDown className="size-3 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="z-[56] w-[var(--radix-popover-trigger-width)] min-w-72 p-0" align="start">
        <Command shouldFilter={false} loop>
          <CommandInput
            value={search}
            onValueChange={setSearch}
            placeholder={`Search ${foreignKey.refColumn}${labelColumn ? ` or ${labelColumn}` : ''}`}
          />
          <CommandList>
            {loading && options.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" /> Loading {foreignKey.refTable}…
              </div>
            ) : (
              <CommandEmpty>{error ? <span className="text-destructive">{error}</span> : 'No matching rows'}</CommandEmpty>
            )}
            {options.length > 0 && (
              <CommandGroup heading={`${target}${loading ? ' · searching…' : ''}`}>
                {options.map((o) => (
                  <CommandItem key={o.value} value={o.value} onSelect={() => choose(o.value)} className="font-mono">
                    <Check className={cn(o.value === value ? 'opacity-100' : 'opacity-0')} />
                    <span className="shrink-0">{o.value}</span>
                    {o.label && <span className="min-w-0 truncate font-sans text-muted-foreground">{o.label}</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {typed && !typedIsListed && (
              <CommandGroup heading="Manual value">
                <CommandItem value={`__typed__${typed}`} onSelect={() => choose(typed)}>
                  <PencilLine /> Use “{typed}”
                </CommandItem>
              </CommandGroup>
            )}
            {value && (
              <CommandGroup>
                <CommandItem value="__clear__" onSelect={() => choose('')} className="text-muted-foreground">
                  Clear selection
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
          {truncated && (
            <div className="border-t border-border px-3 py-1.5 text-2xs text-muted-foreground">
              Showing the first {PAGE} rows. Type to search the rest.
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
};
