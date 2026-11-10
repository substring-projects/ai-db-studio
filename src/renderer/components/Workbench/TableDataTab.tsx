import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Cable,
  ExternalLink,
  Layers,
  Link2,
  SlidersHorizontal,
} from 'lucide-react';
import { cleanError, useStudio } from '../../context/StudioContext';
import { useSchema } from '../../context/SchemaContext';
import { useWorkspace, WorkspaceTab } from '../../context/WorkspaceContext';
import { FilterRule, ForeignKey, QueryResult } from '../../../shared/types';
import { columnKey, qualifiedName, rowWhereClause } from '../../lib/sql';
import { createId, formatCount, formatDuration, pluralize, prefs } from '../../lib/utils';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { EmptyState } from '../ui/feedback';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Tooltip } from '../ui/tooltip';
import { AdvancedFilterModal } from '../Modals/AdvancedFilterModal';
import { EditCellModal } from '../Modals/EditCellModal';
import { InsertRowModal } from '../Modals/InsertRowModal';
import { QueryResultsGrid, ServerControls } from './QueryResultsGrid';

const PAGE_SIZES = [50, 100, 250, 500, 1000];

export const TableDataTab: React.FC<{ tab: Extract<WorkspaceTab, { kind: 'table' }>; active: boolean }> = ({ tab, active }) => {
  const { profiles, connectionStates, connectProfile } = useStudio();
  const { schemas, loadStructure } = useSchema();
  const { appendLog, recordRun, runSql, openStructure, openTableData } = useWorkspace();

  const profile = profiles.find((p) => p.id === tab.profileId);
  const connected = connectionStates[tab.profileId]?.state === 'connected';
  const columnMeta = schemas[tab.profileId]?.columns[columnKey(tab.table, tab.schema)];
  const isView = tab.objectType === 'VIEW';

  const [foreignKeys, setForeignKeys] = useState<ForeignKey[]>([]);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSizeState] = useState<number>(() => prefs.get('studio:pageSize', 100));
  const [sort, setSort] = useState<ServerControls['sort']>(null);
  const [rules, setRules] = useState<FilterRule[]>([]);
  const [matchAny, setMatchAny] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [total, setTotal] = useState<number | null | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [insertOpen, setInsertOpen] = useState(false);
  const [editing, setEditing] = useState<{ column: string; value: unknown; row: unknown[] } | null>(null);

  const requestSeq = useRef(0);

  useEffect(() => {
    if (!connected || isView) return;
    loadStructure(tab.profileId, tab.table, tab.schema)
      .then((s) => setForeignKeys(s.foreignKeys || []))
      .catch(() => undefined);
  }, [connected, isView, loadStructure, tab.profileId, tab.table, tab.schema]);

  const load = useCallback(async () => {
    if (!connected) return;
    const seq = ++requestSeq.current;
    const startedAt = Date.now();
    setLoading(true);
    setError(null);
    try {
      const next = await window.electronAPI.getTableData(
        tab.profileId,
        tab.table,
        pageSize,
        page * pageSize,
        sort?.column,
        sort?.desc ?? false,
        rules,
        matchAny,
        tab.schema
      );
      if (seq !== requestSeq.current) return;
      setResult(next);
      recordRun(tab.id, {
        runId: createId('run'),
        profileId: tab.profileId,
        sql: `SELECT * FROM ${qualifiedName(profile?.engine, tab.table, tab.schema)}`,
        status: 'success',
        result: next,
        startedAt,
        durationMs: next.executionTimeMs,
      });
      appendLog({
        level: 'info',
        source: 'table',
        message: `${tab.table}: loaded ${pluralize(next.rowCount, 'row')} in ${formatDuration(next.executionTimeMs)}`,
      });
    } catch (err) {
      if (seq !== requestSeq.current) return;
      const message = cleanError(err, 'Could not load this table');
      setError(message);
      appendLog({ level: 'error', source: 'table', message: `${tab.table}: ${message}` });
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [appendLog, connected, matchAny, page, pageSize, profile?.engine, recordRun, rules, sort, tab]);

  useEffect(() => {
    load();
  }, [load]);

  // The count is separate because it can take seconds: rows appear first and the pager catches up.
  const refreshCount = useCallback(async () => {
    if (!connected) return;
    setTotal(undefined);
    const count = await window.electronAPI
      .getTableCount(tab.profileId, tab.table, rules, matchAny, tab.schema)
      .catch(() => null);
    setTotal(count);
  }, [connected, matchAny, rules, tab.profileId, tab.schema, tab.table]);

  useEffect(() => {
    refreshCount();
  }, [refreshCount]);

  const reload = useCallback(() => {
    load();
    refreshCount();
  }, [load, refreshCount]);

  const setPageSize = (size: number) => {
    prefs.set('studio:pageSize', size);
    setPageSizeState(size);
    setPage(0);
  };
  const changeRules = useCallback((next: FilterRule[]) => {
    setRules(next);
    setPage(0);
  }, []);
  const server = useMemo<ServerControls>(
    () => ({
      sort,
      onSortChange: (next) => {
        setSort(next);
        setPage(0);
      },
      rules,
      onRulesChange: changeRules,
    }),
    [sort, rules, changeRules]
  );

  const tableSql = qualifiedName(profile?.engine, tab.table, tab.schema);
  const runWrite = (sql: string) => runSql(tab.id, tab.profileId, sql, { background: true, onSuccess: reload });

  const deleteRows = (rows: unknown[][]) => {
    if (!result || rows.length === 0) return;
    const clauses = rows.map((row) => rowWhereClause(profile?.engine, result.columns, row, columnMeta ?? []));
    const where =
      clauses.length === 1
        ? clauses[0].where
        : `WHERE ${clauses.map((c) => `(${c.where.replace(/^WHERE /, '')})`).join('\n   OR ')}`;
    runWrite(`DELETE FROM ${tableSql}\n${where};`);
  };

  if (!profile) {
    return <EmptyState icon={<Cable />} title="This connection no longer exists" description="Close this tab, or add the connection again." />;
  }

  if (!connected) {
    const state = connectionStates[tab.profileId];
    return (
      <EmptyState
        icon={<Cable />}
        title={state?.state === 'failed' ? `Could not connect to ${profile.name}` : `Connect to ${profile.name} to see ${tab.table}`}
        description={state?.error}
        action={
          <Button size="sm" disabled={state?.state === 'connecting'} onClick={() => connectProfile(profile)}>
            {state?.state === 'connecting' ? 'Connecting…' : state?.state === 'failed' ? 'Try again' : 'Connect'}
          </Button>
        }
      />
    );
  }

  const lastPage = total ? Math.max(0, Math.ceil(total / pageSize) - 1) : null;
  const rowsOnPage = result?.rowCount ?? 0;
  const atEnd = lastPage !== null ? page >= lastPage : rowsOnPage < pageSize;
  const first = rowsOnPage === 0 ? 0 : page * pageSize + 1;

  const footer = (
    <div className="flex h-7 shrink-0 items-center justify-between gap-2 border-t border-border bg-chrome px-2 text-xxs text-muted-foreground">
      <span className="truncate tabular-nums">
        <span className="text-foreground">
          {formatCount(first)}–{formatCount(page * pageSize + rowsOnPage)}
        </span>{' '}
        of {total === undefined ? '…' : total === null ? 'many' : formatCount(total)}
        {total === null && (
          <Tooltip content="Counting was stopped after 5 seconds. Paging still works.">
            <span className="ml-1 cursor-help underline decoration-dotted">(count timed out)</span>
          </Tooltip>
        )}
      </span>
      <div className="flex shrink-0 items-center gap-0.5">
        <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
          <SelectTrigger quiet aria-label="Rows per page" className="h-5 text-xxs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent side="top">
            {PAGE_SIZES.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size} rows
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="quiet" size="icon-xs" aria-label="First page" disabled={page === 0} onClick={() => setPage(0)}>
          <ChevronsLeft />
        </Button>
        <Button variant="quiet" size="icon-xs" aria-label="Previous page" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
          <ChevronLeft />
        </Button>
        <span className="min-w-12 text-center tabular-nums">
          {formatCount(page + 1)}
          {lastPage !== null && ` / ${formatCount(lastPage + 1)}`}
        </span>
        <Button variant="quiet" size="icon-xs" aria-label="Next page" disabled={atEnd} onClick={() => setPage((p) => p + 1)}>
          <ChevronRight />
        </Button>
        <Button
          variant="quiet"
          size="icon-xs"
          aria-label="Last page"
          disabled={lastPage === null || page >= lastPage}
          onClick={() => lastPage !== null && setPage(lastPage)}
        >
          <ChevronsRight />
        </Button>
      </div>
    </div>
  );

  const toolbarExtra = (
    <>
      {foreignKeys.length > 0 && (
        <Popover>
          <Tooltip content={`${foreignKeys.length} foreign key relationships`}>
            <PopoverTrigger asChild>
              <Button variant="quiet" size="sm" className="h-7 gap-1 text-2xs text-sky-600 dark:text-sky-400 font-medium">
                <Link2 className="size-3" /> Foreign keys
                <Badge variant="outline" className="px-1 py-0 text-[10px] text-sky-600 dark:text-sky-400 border-sky-500/30">
                  {foreignKeys.length}
                </Badge>
              </Button>
            </PopoverTrigger>
          </Tooltip>
          <PopoverContent className="w-80 p-2 font-sans text-xs">
            <p className="font-semibold text-2xs uppercase tracking-wider text-muted-foreground mb-2 px-1">Foreign Keys</p>
            <div className="space-y-1.5 max-h-60 overflow-y-auto">
              {foreignKeys.map((fk) => (
                <div key={fk.name} className="flex items-center justify-between gap-2 p-1.5 rounded-md bg-secondary/50 border border-border/50 text-xxs">
                  <div className="min-w-0">
                    <span className="font-mono font-medium text-foreground">{fk.column}</span>
                    <span className="text-muted-foreground mx-1">→</span>
                    <span className="font-mono text-primary font-medium">{fk.refTable}.{fk.refColumn}</span>
                  </div>
                  <Button
                    variant="quiet"
                    size="icon-xs"
                    title={`Open ${fk.refTable}`}
                    onClick={() => openTableData(tab.profileId, { name: fk.refTable, schema: tab.schema, type: 'TABLE' })}
                  >
                    <ExternalLink className="size-3" />
                  </Button>
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}
      <Tooltip content="Advanced filters">
        <Button
          variant="quiet"
          size="icon-sm"
          aria-label="Advanced filters"
          disabled={!columnMeta}
          onClick={() => setFilterOpen(true)}
        >
          <SlidersHorizontal className={rules.length > 0 ? 'text-primary' : undefined} />
        </Button>
      </Tooltip>
      <Tooltip content="View structure">
        <Button
          variant="quiet"
          size="icon-sm"
          aria-label="View structure"
          onClick={() => openStructure(tab.profileId, { name: tab.table, schema: tab.schema, type: tab.objectType })}
        >
          <Layers />
        </Button>
      </Tooltip>
    </>
  );

  return (
    <div className="h-full min-h-0" data-active={active}>
      <QueryResultsGrid
        result={result}
        loading={loading}
        error={error}
        columnMeta={columnMeta}
        foreignKeys={foreignKeys}
        fileBase={tab.table}
        server={server}
        onRefresh={reload}
        onEditCell={isView ? undefined : (column, value, row) => setEditing({ column, value, row })}
        onInsertRow={isView ? undefined : () => setInsertOpen(true)}
        onDeleteRows={isView ? undefined : deleteRows}
        onOpenReferencedRow={(refTable) => openTableData(tab.profileId, { name: refTable, schema: tab.schema, type: 'TABLE' })}
        toolbarExtra={toolbarExtra}
        footer={footer}
      />
      {filterOpen && (
        <AdvancedFilterModal
          tableName={tab.table}
          columns={(columnMeta ?? []).map((c) => c.name)}
          initialRules={rules}
          initialMatchAny={matchAny}
          onApply={(next, any) => {
            setMatchAny(any);
            changeRules(next);
          }}
          onClose={() => setFilterOpen(false)}
        />
      )}
      {insertOpen && columnMeta && (
        <InsertRowModal
          tableName={tab.table}
          qualifiedTable={tableSql}
          columns={columnMeta}
          engine={profile.engine}
          profileId={tab.profileId}
          foreignKeys={foreignKeys}
          schema={tab.schema}
          onInsert={runWrite}
          onClose={() => setInsertOpen(false)}
        />
      )}
      {editing && result && (
        <EditCellModal
          tableName={tab.table}
          qualifiedTable={tableSql}
          columnName={editing.column}
          initialValue={editing.value}
          target={rowWhereClause(profile.engine, result.columns, editing.row, columnMeta ?? [])}
          engine={profile.engine}
          columnType={columnMeta?.find((c) => c.name.toLowerCase() === editing.column.toLowerCase())?.typeName}
          profileId={tab.profileId}
          foreignKey={foreignKeys.find((f) => f.column.toLowerCase() === editing.column.toLowerCase())}
          schema={tab.schema}
          onSave={runWrite}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
};
