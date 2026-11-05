import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ColumnDef,
  ColumnFiltersState,
  ColumnSizingState,
  SortingState,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  ArrowDown,
  ArrowUp,
  Binary,
  Braces,
  CalendarClock,
  CheckCircle2,
  CircleHelp,
  Copy,
  Download,
  ExternalLink,
  Eye,
  Filter,
  Hash,
  Key,
  Pencil,
  Plus,
  RefreshCw,
  Rows3,
  Search,
  Square,
  ToggleLeft,
  Trash2,
  Type,
  X,
} from 'lucide-react';
import { FilterOperator, FilterRule, QueryResult, TableColumn } from '../../../shared/types';
import {
  ColumnKind,
  FILTER_OPERATORS,
  compareCells,
  exportResult,
  formatCell,
  inferColumnKind,
  kindFromTypeName,
  matchesRule,
  toDelimited,
  toJsonRecords,
} from '../../lib/grid';
import { cn, formatCount, formatDuration, isMac, pluralize } from '../../lib/utils';
import { Button } from '../ui/button';
import { CopyButton, EmptyState, ErrorNotice, Skeleton } from '../ui/feedback';
import { Dialog, DialogBody, DialogContent } from '../ui/dialog';
import { Input } from '../ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Tooltip } from '../ui/tooltip';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/menu';

const ROW_HEIGHT = 24;
const HEADER_HEIGHT = 27;
const ROW_NUMBER_WIDTH = 48;
const MIN_COLUMN_WIDTH = 56;

type Row = unknown[];

// TanStack Table resets its state whenever `data` changes identity, which re-renders the grid.
// A new empty array on each render would therefore loop forever, so "no result" has fixed values.
const NO_COLUMNS: string[] = [];
const NO_ROWS: Row[] = [];
const NO_SORTING: SortingState = [];

export interface ServerControls {
  sort: { column: string; desc: boolean } | null;
  onSortChange: (sort: { column: string; desc: boolean } | null) => void;
  rules: FilterRule[];
  onRulesChange: (rules: FilterRule[]) => void;
}

interface QueryResultsGridProps {
  result: QueryResult | null;
  loading?: boolean;
  error?: string | null;
  notice?: string;
  /** Column metadata when the rows come from a known table. */
  columnMeta?: TableColumn[];
  /** Base name for exported files. */
  fileBase: string;
  /** Sorting and filtering happen on the server; otherwise on the rows in memory. */
  server?: ServerControls;
  onEditCell?: (column: string, value: unknown, row: Row) => void;
  onInsertRow?: () => void;
  onDeleteRows?: (rows: Row[]) => void;
  onRefresh?: () => void;
  onCancel?: () => void;
  onOpenInTab?: () => void;
  toolbarExtra?: React.ReactNode;
  footer?: React.ReactNode;
  /** Slimmer chrome for grids embedded in a chat message. */
  embedded?: boolean;
  summary?: string;
}

const KIND_ICON: Record<ColumnKind, React.ElementType> = {
  number: Hash,
  text: Type,
  boolean: ToggleLeft,
  date: CalendarClock,
  json: Braces,
  binary: Binary,
  unknown: CircleHelp,
};

const copyText = (text: string) => window.electronAPI.copyToClipboard(text);

const ColumnFilterForm: React.FC<{
  column: string;
  rule?: FilterRule;
  onApply: (rule: FilterRule | null) => void;
}> = ({ column, rule, onApply }) => {
  const [operator, setOperator] = useState<FilterOperator>(rule?.operator ?? 'CONTAINS');
  const [value, setValue] = useState(rule?.value ?? '');
  const needsValue = FILTER_OPERATORS.find((o) => o.value === operator)?.needsValue ?? true;

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (needsValue && !value.trim()) onApply(null);
        else onApply({ column, operator, value: needsValue ? value : '' });
      }}
    >
      <p className="truncate font-mono text-xxs text-muted-foreground">{column}</p>
      <Select value={operator} onValueChange={(v) => setOperator(v as FilterOperator)}>
        <SelectTrigger aria-label="Filter operator">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {FILTER_OPERATORS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {needsValue && (
        <Input autoFocus value={value} onChange={(e) => setValue(e.target.value)} placeholder="Value" aria-label="Filter value" />
      )}
      <div className="flex justify-end gap-1.5">
        {rule && (
          <Button variant="quiet" size="sm" onClick={() => onApply(null)}>
            Clear
          </Button>
        )}
        <Button type="submit" size="sm">
          Apply
        </Button>
      </div>
    </form>
  );
};

const LoadingRows: React.FC = () => (
  <div aria-label="Loading results" className="h-full overflow-hidden">
    <div className="flex h-[27px] items-center gap-6 border-b border-border bg-chrome px-3">
      {[64, 120, 90, 140, 70, 110].map((w, i) => (
        <Skeleton key={i} className="h-2.5" style={{ width: w }} />
      ))}
    </div>
    {Array.from({ length: 12 }).map((_, row) => (
      <div key={row} className="flex h-6 items-center gap-6 border-b border-border/50 px-3">
        {[64, 120, 90, 140, 70, 110].map((w, i) => (
          <Skeleton key={i} className="h-2" style={{ width: w - ((row * 7 + i * 13) % 28), animationDelay: `${row * 40}ms` }} />
        ))}
      </div>
    ))}
  </div>
);

export const QueryResultsGrid: React.FC<QueryResultsGridProps> = React.memo(
  ({
    result,
    loading = false,
    error,
    notice,
    columnMeta,
    fileBase,
    server,
    onEditCell,
    onInsertRow,
    onDeleteRows,
    onRefresh,
    onCancel,
    onOpenInTab,
    toolbarExtra,
    footer,
    embedded = false,
    summary,
  }) => {
    const [sorting, setSorting] = useState<SortingState>([]);
    const [clientRules, setClientRules] = useState<FilterRule[]>([]);
    const [search, setSearch] = useState('');
    const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [anchor, setAnchor] = useState<number | null>(null);
    const [activeCell, setActiveCell] = useState<{ row: number; col: number } | null>(null);
    const [menuTarget, setMenuTarget] = useState<{ row: number; col: number } | null>(null);
    const [inspect, setInspect] = useState<{ column: string; text: string } | null>(null);
    const [openFilter, setOpenFilter] = useState<number | null>(null);
    const scrollerRef = useRef<HTMLDivElement>(null);

    const rules = server ? server.rules : clientRules;
    const setRules = server ? server.onRulesChange : setClientRules;
    const columns = result?.columns ?? NO_COLUMNS;
    const rows = (result?.rows ?? NO_ROWS) as Row[];

    const metaByName = useMemo(() => {
      const map = new Map<string, TableColumn>();
      columnMeta?.forEach((c) => map.set(c.name.toLowerCase(), c));
      return map;
    }, [columnMeta]);

    const columnInfo = useMemo(
      () =>
        columns.map((name, i) => {
          const meta = metaByName.get(name.toLowerCase());
          const kind = meta ? kindFromTypeName(meta.typeName) : inferColumnKind(rows, i);
          // Width from the header and a sample of values, so most columns need no resizing.
          // The header also holds a type icon, a sort arrow and a filter button.
          let longest = 0;
          for (let r = 0; r < Math.min(rows.length, 40); r += 1) {
            longest = Math.max(longest, formatCell(rows[r][i]).length);
          }
          const width = Math.max(name.length * 6.8 + 72, longest * 7 + 22);
          return { name, meta, kind, width: Math.min(360, Math.max(MIN_COLUMN_WIDTH + 24, width)) };
        }),
      [columns, metaByName, rows]
    );

    const tableColumns = useMemo<ColumnDef<Row>[]>(
      () =>
        columnInfo.map((info, i) => ({
          id: String(i),
          accessorFn: (row: Row) => row[i],
          header: info.name,
          size: info.width,
          minSize: MIN_COLUMN_WIDTH,
          maxSize: 1600,
          sortingFn: (a, b, id) => compareCells(a.getValue(id), b.getValue(id)),
          sortUndefined: false,
          filterFn: (row, id, rule: FilterRule) => matchesRule(row.getValue(id), rule),
        })),
      [columnInfo]
    );

    const columnFilters = useMemo<ColumnFiltersState>(() => {
      if (server) return [];
      return rules.flatMap((rule) => {
        const index = columns.indexOf(rule.column);
        return index >= 0 ? [{ id: String(index), value: rule }] : [];
      });
    }, [server, rules, columns]);

    const table = useReactTable<Row>({
      data: rows,
      columns: tableColumns,
      state: { sorting: server ? NO_SORTING : sorting, columnFilters, globalFilter: search, columnSizing },
      onSortingChange: setSorting,
      onColumnSizingChange: setColumnSizing,
      // Paging is done by the server or by virtualization, so TanStack's own page state is unused.
      autoResetAll: false,
      columnResizeMode: 'onChange',
      enableColumnResizing: true,
      globalFilterFn: (row, id, value: string) => {
        const cell = row.getValue(id);
        return cell !== null && cell !== undefined && formatCell(cell).toLowerCase().includes(String(value).toLowerCase());
      },
      getColumnCanGlobalFilter: () => true,
      getCoreRowModel: getCoreRowModel(),
      getFilteredRowModel: getFilteredRowModel(),
      getSortedRowModel: getSortedRowModel(),
    });

    const visibleRows = table.getRowModel().rows;

    const rowVirtualizer = useVirtualizer({
      count: visibleRows.length,
      getScrollElement: () => scrollerRef.current,
      estimateSize: () => ROW_HEIGHT,
      overscan: 16,
    });

    useEffect(() => {
      setSelected(new Set());
      setAnchor(null);
      setActiveCell(null);
    }, [result]);

    // Column widths are CSS variables, so a resize drag updates styles without re-rendering every cell.
    const headers = table.getFlatHeaders();
    const columnVars = useMemo(() => {
      const vars: Record<string, string> = {};
      headers.forEach((h) => {
        vars[`--col-${h.id}`] = `${h.getSize()}px`;
      });
      return vars as React.CSSProperties;
    }, [headers, columnSizing]);
    const totalWidth = ROW_NUMBER_WIDTH + table.getTotalSize();

    const sortState = (i: number): 'asc' | 'desc' | null => {
      if (server) {
        if (server.sort?.column !== columns[i]) return null;
        return server.sort.desc ? 'desc' : 'asc';
      }
      const entry = sorting.find((s) => s.id === String(i));
      return entry ? (entry.desc ? 'desc' : 'asc') : null;
    };
    const toggleSort = (i: number) => {
      const current = sortState(i);
      if (server) {
        if (current === null) server.onSortChange({ column: columns[i], desc: false });
        else if (current === 'asc') server.onSortChange({ column: columns[i], desc: true });
        else server.onSortChange(null);
      } else {
        if (current === null) setSorting([{ id: String(i), desc: false }]);
        else if (current === 'asc') setSorting([{ id: String(i), desc: true }]);
        else setSorting([]);
      }
    };

    const applyRule = (column: string, rule: FilterRule | null) => {
      const others = rules.filter((r) => r.column !== column);
      setRules(rule ? [...others, rule] : others);
      setOpenFilter(null);
    };

    const selectRow = useCallback(
      (visual: number, event: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) => {
        const toggle = isMac ? event.metaKey : event.ctrlKey;
        setSelected((prev) => {
          if (event.shiftKey && anchor !== null) {
            const [from, to] = anchor < visual ? [anchor, visual] : [visual, anchor];
            const next = new Set<number>();
            for (let i = from; i <= to; i += 1) next.add(i);
            return next;
          }
          if (toggle) {
            const next = new Set(prev);
            if (next.has(visual)) next.delete(visual);
            else next.add(visual);
            return next;
          }
          return prev.size === 1 && prev.has(visual) ? new Set() : new Set([visual]);
        });
        if (!event.shiftKey) setAnchor(visual);
      },
      [anchor]
    );

    const selectedRows = () =>
      [...selected].sort((a, b) => a - b).flatMap((i) => (visibleRows[i] ? [visibleRows[i].original] : []));

    const copySelection = () => {
      if (selected.size > 0) {
        copyText(toDelimited(columns, selectedRows(), '\t'));
      } else if (activeCell && visibleRows[activeCell.row]) {
        copyText(formatCell(visibleRows[activeCell.row].original[activeCell.col]));
      }
    };

    const editCell = (rowIndex: number, col: number) => {
      const row = visibleRows[rowIndex]?.original;
      if (row && onEditCell) onEditCell(columns[col], row[col], row);
    };

    const onKeyDown = (e: React.KeyboardEvent) => {
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        copySelection();
        return;
      }
      if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setSelected(new Set(visibleRows.map((_, i) => i)));
        return;
      }
      if (e.key === 'Escape') {
        setSelected(new Set());
        return;
      }
      if (e.key === 'Enter' && activeCell && onEditCell) {
        e.preventDefault();
        editCell(activeCell.row, activeCell.col);
        return;
      }
      if (columns.length === 0 || visibleRows.length === 0) return;
      const current = activeCell ?? { row: 0, col: 0 };
      const page = Math.max(1, Math.floor((scrollerRef.current?.clientHeight ?? 240) / ROW_HEIGHT) - 1);
      const moves: Record<string, { row: number; col: number }> = {
        ArrowDown: { row: current.row + 1, col: current.col },
        ArrowUp: { row: current.row - 1, col: current.col },
        ArrowRight: { row: current.row, col: current.col + 1 },
        ArrowLeft: { row: current.row, col: current.col - 1 },
        PageDown: { row: current.row + page, col: current.col },
        PageUp: { row: current.row - page, col: current.col },
        Home: { row: mod ? 0 : current.row, col: 0 },
        End: { row: mod ? visibleRows.length - 1 : current.row, col: columns.length - 1 },
      };
      const move = moves[e.key];
      if (!move) return;
      e.preventDefault();
      const next = {
        row: Math.max(0, Math.min(visibleRows.length - 1, move.row)),
        col: Math.max(0, Math.min(columns.length - 1, move.col)),
      };
      setActiveCell(next);
      rowVirtualizer.scrollToIndex(next.row);
      // Keep the active column in view, clear of the sticky row-number column.
      const scroller = scrollerRef.current;
      if (scroller) {
        const leading = table.getFlatHeaders().slice(0, next.col).reduce((sum, h) => sum + h.getSize(), 0);
        const width = table.getFlatHeaders()[next.col]?.getSize() ?? 0;
        const left = leading;
        const right = leading + width + ROW_NUMBER_WIDTH;
        if (left < scroller.scrollLeft) scroller.scrollLeft = left;
        else if (right > scroller.scrollLeft + scroller.clientWidth) scroller.scrollLeft = right - scroller.clientWidth;
      }
    };

    const captureMenuTarget = (e: React.MouseEvent) => {
      const cell = (e.target as HTMLElement).closest<HTMLElement>('[data-r]');
      if (!cell) {
        setMenuTarget(null);
        return;
      }
      const target = { row: Number(cell.dataset.r), col: Number(cell.dataset.c) };
      setMenuTarget(target);
      setActiveCell(target);
      if (!selected.has(target.row)) {
        setSelected(new Set());
      }
    };

    const targetRow = menuTarget ? visibleRows[menuTarget.row]?.original : undefined;
    const targetValue = menuTarget && targetRow ? targetRow[menuTarget.col] : undefined;
    const targetColumn = menuTarget ? columns[menuTarget.col] : undefined;
    const rowsForDelete = selected.size > 0 && menuTarget && selected.has(menuTarget.row) ? selectedRows() : targetRow ? [targetRow] : [];

    if (error) {
      return (
        <div className="h-full overflow-auto p-3">
          <ErrorNotice
            title="The query failed"
            message={error}
            action={
              onRefresh && (
                <Button variant="outline" size="sm" onClick={onRefresh}>
                  <RefreshCw /> Try again
                </Button>
              )
            }
          />
        </div>
      );
    }

    if (loading && !result) {
      return (
        <div className="relative h-full">
          {onCancel && (
            <div className="absolute right-2 top-1 z-10">
              <Button variant="outline" size="sm" className="bg-background" onClick={onCancel}>
                <Square className="fill-current" /> Cancel
              </Button>
            </div>
          )}
          <LoadingRows />
        </div>
      );
    }

    if (!result) {
      return <EmptyState icon={<Rows3 />} title="No results yet" description="Run a query to see its results here." />;
    }

    if (result.isCommand) {
      return (
        <EmptyState
          icon={<CheckCircle2 className="text-success" />}
          title={`${pluralize(result.rowCount, 'row')} affected`}
          description={`Completed in ${formatDuration(result.executionTimeMs)}.`}
        />
      );
    }

    const filterCount = rules.length + (search ? 1 : 0);
    const filtered = visibleRows.length !== rows.length;

    return (
      <div className="relative flex h-full min-h-0 flex-col bg-background">
        {loading && (
          <div className="absolute inset-x-0 top-0 z-30 h-0.5 overflow-hidden" role="progressbar" aria-label="Loading">
            <div className="h-full w-1/4 animate-progress bg-primary" />
          </div>
        )}
        <div className="flex h-7 shrink-0 items-center gap-1.5 border-b border-border bg-background px-2 text-xxs">
          <span className="flex shrink-0 items-center gap-1.5 tabular-nums text-muted-foreground">
            {summary ?? (
              <>
                <span>
                  <span className="text-foreground">{filtered ? `${formatCount(visibleRows.length)} of ` : ''}{formatCount(rows.length)}</span>{' '}
                  {rows.length === 1 ? 'row' : 'rows'}
                </span>
                <span>·</span>
                <span>{formatDuration(result.executionTimeMs)}</span>
              </>
            )}
          </span>
          {result.truncated && (
            <Tooltip content="The query matched more rows than are kept in memory. Add a LIMIT or narrow it down.">
              <span className="shrink-0 cursor-help text-warning">Truncated</span>
            </Tooltip>
          )}
          {notice && <span className="min-w-0 truncate text-warning">{notice}</span>}
          {selected.size > 0 && (
            <span className="shrink-0 text-muted-foreground">
              · <span className="text-foreground">{formatCount(selected.size)}</span> selected
            </span>
          )}

          <div className="ml-auto flex min-w-0 items-center gap-0.5">
            {rules.length > 0 && (
              <Button variant="quiet" size="sm" onClick={() => setRules([])} className="text-primary hover:text-primary">
                <X /> {pluralize(rules.length, 'filter')}
              </Button>
            )}
            <div className="relative mr-0.5 w-32 min-w-16 shrink">
              <Search className="pointer-events-none absolute left-1.5 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={server ? 'Find on this page' : 'Find in results'}
                aria-label={server ? 'Find on this page' : 'Find in results'}
                className="h-5 w-full rounded-sm border border-transparent bg-muted pl-5 pr-1 text-xxs outline-none placeholder:text-muted-foreground/80 focus:border-ring"
              />
            </div>
            {toolbarExtra}
            {onInsertRow && (
              <Tooltip content="Insert a row">
                <Button variant="quiet" size="icon-sm" aria-label="Insert a row" onClick={onInsertRow}>
                  <Plus />
                </Button>
              </Tooltip>
            )}
            {onDeleteRows && selected.size > 0 && (
              <Tooltip content={`Delete ${pluralize(selected.size, 'selected row')}`}>
                <Button variant="quiet" size="icon-sm" aria-label="Delete selected rows" onClick={() => onDeleteRows(selectedRows())}>
                  <Trash2 className="text-destructive" />
                </Button>
              </Tooltip>
            )}
            {onRefresh && (
              <Tooltip content={embedded ? 'Run again' : 'Refresh'}>
                <Button variant="quiet" size="icon-sm" aria-label="Refresh" onClick={onRefresh}>
                  <RefreshCw className={cn(loading && 'animate-spin')} />
                </Button>
              </Tooltip>
            )}
            {onOpenInTab && (
              <Tooltip content="Open in its own tab">
                <Button variant="quiet" size="icon-sm" aria-label="Open in its own tab" onClick={onOpenInTab}>
                  <ExternalLink />
                </Button>
              </Tooltip>
            )}
            <DropdownMenu>
              <Tooltip content="Copy or export">
                <DropdownMenuTrigger asChild>
                  <Button variant="quiet" size="icon-sm" aria-label="Copy or export">
                    <Download />
                  </Button>
                </DropdownMenuTrigger>
              </Tooltip>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>{server ? 'This page' : 'Result'}</DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => copyText(toDelimited(columns, visibleRows.map((r) => r.original), '\t'))}>
                  <Copy /> Copy as TSV
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => copyText(toJsonRecords(columns, visibleRows.map((r) => r.original)))}>
                  <Braces /> Copy as JSON
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => exportResult({ columns, rows: visibleRows.map((r) => r.original) }, fileBase, 'csv')}>
                  <Download /> Export CSV
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => exportResult({ columns, rows: visibleRows.map((r) => r.original) }, fileBase, 'json')}>
                  <Download /> Export JSON
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {onCancel && loading && (
              <Button variant="outline" size="sm" onClick={onCancel}>
                <Square className="fill-current" /> Cancel
              </Button>
            )}
          </div>
        </div>

        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div
              ref={scrollerRef}
              role="grid"
              aria-rowcount={visibleRows.length + 1}
              aria-colcount={columns.length}
              tabIndex={0}
              onKeyDown={onKeyDown}
              onContextMenuCapture={captureMenuTarget}
              className="min-h-0 flex-1 overflow-auto font-mono text-xxs outline-none focus-visible:outline-none"
            >
              <div style={{ ...columnVars, width: totalWidth, minWidth: '100%' }} className="relative">
                {/* Header */}
                <div role="row" className="sticky top-0 z-20 flex border-b border-border bg-chrome" style={{ height: HEADER_HEIGHT }}>
                  <div
                    className="sticky left-0 z-10 shrink-0 border-r border-border bg-chrome"
                    style={{ width: ROW_NUMBER_WIDTH }}
                    aria-hidden
                  />
                  {table.getHeaderGroups()[0]?.headers.map((header) => {
                    const i = Number(header.column.id);
                    const info = columnInfo[i];
                    const Icon = KIND_ICON[info.kind];
                    const sort = sortState(i);
                    const rule = rules.find((r) => r.column === info.name);
                    return (
                      <div
                        key={header.id}
                        role="columnheader"
                        aria-sort={sort === 'asc' ? 'ascending' : sort === 'desc' ? 'descending' : 'none'}
                        title={info.meta ? `${info.name} — ${info.meta.typeName}${info.meta.nullable ? '' : ', not null'}` : info.name}
                        style={{ width: `var(--col-${header.id})` }}
                        className="group/header relative flex shrink-0 items-center border-r border-border font-sans text-xxs"
                      >
                        <button
                          type="button"
                          onClick={() => toggleSort(i)}
                          className="flex h-full min-w-0 flex-1 items-center gap-1 pl-2 pr-1 text-left font-medium transition-colors duration-75 hover:bg-accent focus-visible:outline-offset-[-2px]"
                        >
                          {info.meta?.primaryKey ? (
                            <Key aria-label="Primary key" className="size-3 shrink-0 text-warning" />
                          ) : (
                            <Icon aria-label={info.kind} className="size-3 shrink-0 text-muted-foreground/80" />
                          )}
                          <span className="min-w-0 truncate">{info.name}</span>
                          {sort === 'asc' && <ArrowUp aria-hidden className="size-3 shrink-0 text-primary" />}
                          {sort === 'desc' && <ArrowDown aria-hidden className="size-3 shrink-0 text-primary" />}
                        </button>
                        <Popover open={openFilter === i} onOpenChange={(open) => setOpenFilter(open ? i : null)}>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              aria-label={`Filter ${info.name}`}
                              className={cn(
                                'mr-1.5 flex size-4 shrink-0 items-center justify-center rounded-sm transition-opacity duration-75 hover:bg-secondary focus-visible:opacity-100',
                                rule ? 'text-primary opacity-100' : 'text-muted-foreground opacity-0 group-hover/header:opacity-100 data-[state=open]:opacity-100'
                              )}
                            >
                              <Filter className={cn('size-3', rule && 'fill-current')} />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-56 font-sans">
                            <ColumnFilterForm column={info.name} rule={rule} onApply={(next) => applyRule(info.name, next)} />
                          </PopoverContent>
                        </Popover>
                        <div
                          role="separator"
                          aria-orientation="vertical"
                          aria-label={`Resize ${info.name}`}
                          onMouseDown={header.getResizeHandler()}
                          onDoubleClick={() => header.column.resetSize()}
                          className={cn(
                            'absolute -right-1 top-0 z-10 h-full w-2 cursor-col-resize after:absolute after:inset-y-0 after:left-[3px] after:w-0.5 after:bg-primary after:opacity-0 hover:after:opacity-100',
                            header.column.getIsResizing() && 'after:opacity-100'
                          )}
                        />
                      </div>
                    );
                  })}
                </div>

                {/* Rows */}
                {visibleRows.length > 0 ? (
                  <div style={{ height: rowVirtualizer.getTotalSize() }} className="relative">
                    {rowVirtualizer.getVirtualItems().map((virtual) => {
                      const row = visibleRows[virtual.index];
                      const isSelected = selected.has(virtual.index);
                      return (
                        <div
                          key={row.id}
                          role="row"
                          aria-rowindex={virtual.index + 2}
                          aria-selected={isSelected}
                          style={{ transform: `translateY(${virtual.start}px)`, height: ROW_HEIGHT }}
                          className={cn(
                            'group/row absolute left-0 top-0 flex w-full border-b border-border/50',
                            isSelected ? 'bg-selection/15' : 'hover:bg-accent/60'
                          )}
                        >
                          <button
                            type="button"
                            tabIndex={-1}
                            aria-label={`Select row ${virtual.index + 1}`}
                            onClick={(e) => selectRow(virtual.index, e)}
                            style={{ width: ROW_NUMBER_WIDTH }}
                            className={cn(
                              'sticky left-0 z-10 shrink-0 cursor-default border-r border-border px-1.5 text-right text-2xs tabular-nums text-muted-foreground transition-colors duration-75 hover:text-foreground',
                              isSelected ? 'bg-selection/15 text-foreground' : 'bg-chrome'
                            )}
                          >
                            {formatCount(virtual.index + 1)}
                          </button>
                          {row.getVisibleCells().map((cell) => {
                            const col = Number(cell.column.id);
                            const value = cell.getValue();
                            const isNull = value === null || value === undefined;
                            const info = columnInfo[col];
                            const isActive = activeCell?.row === virtual.index && activeCell.col === col;
                            return (
                              <div
                                key={cell.id}
                                role="gridcell"
                                data-r={virtual.index}
                                data-c={col}
                                style={{ width: `var(--col-${cell.column.id})` }}
                                onClick={() => setActiveCell({ row: virtual.index, col })}
                                onDoubleClick={() => onEditCell && editCell(virtual.index, col)}
                                className={cn(
                                  'flex shrink-0 items-center truncate border-r border-border/50 px-2',
                                  info.kind === 'number' && !isNull && 'justify-end tabular-nums',
                                  isActive && 'outline outline-1 -outline-offset-1 outline-primary'
                                )}
                              >
                                {isNull ? (
                                  <span className="select-none font-sans text-2xs italic text-muted-foreground/70">NULL</span>
                                ) : (
                                  <span className="truncate">{formatCell(value)}</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="sticky left-0 w-[min(100%,420px)]">
                    <EmptyState
                      icon={<Rows3 />}
                      title={filterCount > 0 ? 'No rows match these filters' : 'No rows returned'}
                      description={filterCount > 0 ? 'Change or clear the filters to see more.' : 'The query ran, and the result is empty.'}
                      action={
                        filterCount > 0 && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setRules([]);
                              setSearch('');
                            }}
                          >
                            Clear filters
                          </Button>
                        )
                      }
                    />
                  </div>
                )}
              </div>
            </div>
          </ContextMenuTrigger>
          {targetRow && (
            <ContextMenuContent className="font-sans">
              <ContextMenuLabel>{targetColumn}</ContextMenuLabel>
              <ContextMenuItem shortcut="Mod+C" onSelect={() => copyText(formatCell(targetValue))}>
                <Copy /> Copy cell
              </ContextMenuItem>
              <ContextMenuItem onSelect={() => copyText(toDelimited(columns, [targetRow], '\t', false))}>
                <Rows3 /> Copy row
              </ContextMenuItem>
              {selected.size > 1 && (
                <ContextMenuItem onSelect={() => copyText(toDelimited(columns, selectedRows(), '\t'))}>
                  <Rows3 /> Copy {formatCount(selected.size)} selected rows
                </ContextMenuItem>
              )}
              <ContextMenuSub>
                <ContextMenuSubTrigger>
                  <Download /> Copy result as
                </ContextMenuSubTrigger>
                <ContextMenuSubContent>
                  <ContextMenuItem onSelect={() => copyText(toDelimited(columns, visibleRows.map((r) => r.original), '\t'))}>TSV</ContextMenuItem>
                  <ContextMenuItem onSelect={() => copyText(toDelimited(columns, visibleRows.map((r) => r.original)))}>CSV</ContextMenuItem>
                  <ContextMenuItem onSelect={() => copyText(toJsonRecords(columns, visibleRows.map((r) => r.original)))}>JSON</ContextMenuItem>
                </ContextMenuSubContent>
              </ContextMenuSub>
              <ContextMenuItem onSelect={() => setInspect({ column: targetColumn!, text: formatCell(targetValue) })}>
                <Eye /> View full value
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem
                onSelect={() =>
                  applyRule(
                    targetColumn!,
                    targetValue === null || targetValue === undefined
                      ? { column: targetColumn!, operator: 'IS_NULL', value: '' }
                      : { column: targetColumn!, operator: 'EQUALS', value: formatCell(targetValue) }
                  )
                }
              >
                <Filter /> Filter by this value
              </ContextMenuItem>
              {(onEditCell || onDeleteRows) && <ContextMenuSeparator />}
              {onEditCell && (
                <ContextMenuItem onSelect={() => onEditCell(targetColumn!, targetValue, targetRow)}>
                  <Pencil /> Edit cell…
                </ContextMenuItem>
              )}
              {onDeleteRows && (
                <ContextMenuItem destructive onSelect={() => onDeleteRows(rowsForDelete)}>
                  <Trash2 /> Delete {rowsForDelete.length > 1 ? `${formatCount(rowsForDelete.length)} rows` : 'row'}…
                </ContextMenuItem>
              )}
            </ContextMenuContent>
          )}
        </ContextMenu>

        {footer}

        <Dialog open={inspect !== null} onOpenChange={(open) => !open && setInspect(null)}>
          {inspect && (
            <DialogContent title={inspect.column} className="max-w-2xl">
              <DialogBody>
                <div className="mb-1.5 flex justify-end">
                  <CopyButton text={inspect.text} label="Copy value" />
                </div>
                <pre className="selectable max-h-[60vh] overflow-auto whitespace-pre-wrap break-words rounded-sm bg-muted p-2.5 font-mono text-xxs leading-[18px]">
                  {(() => {
                    try {
                      return JSON.stringify(JSON.parse(inspect.text), null, 2);
                    } catch {
                      return inspect.text;
                    }
                  })()}
                </pre>
              </DialogBody>
            </DialogContent>
          )}
        </Dialog>
      </div>
    );
  }
);
QueryResultsGrid.displayName = 'QueryResultsGrid';
