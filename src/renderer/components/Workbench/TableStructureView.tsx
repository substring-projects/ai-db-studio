import React, { useCallback, useEffect, useState } from 'react';
import { Cable, FileCode2, KeyRound, Layers, Link2, ListTree, RefreshCw, Rows3, ShieldCheck, Table2 } from 'lucide-react';
import { cleanError, useStudio } from '../../context/StudioContext';
import { useSchema } from '../../context/SchemaContext';
import { useWorkspace, WorkspaceTab } from '../../context/WorkspaceContext';
import { TableStructure } from '../../../shared/types';
import { qualifiedName } from '../../lib/sql';
import { formatBytes, formatCount } from '../../lib/utils';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { CopyButton, EmptyState, ErrorNotice, Skeleton } from '../ui/feedback';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Tooltip } from '../ui/tooltip';
import { SqlCode } from './SqlCode';

const SimpleTable: React.FC<{ headers: string[]; rows: React.ReactNode[][]; empty: string }> = ({ headers, rows, empty }) =>
  rows.length === 0 ? (
    <EmptyState title={empty} />
  ) : (
    <table className="w-full border-collapse text-left text-xs">
      <thead className="sticky top-0 z-10 bg-chrome">
        <tr>
          {headers.map((h) => (
            <th key={h} className="h-[27px] whitespace-nowrap border-b border-r border-border px-2.5 text-xxs font-medium last:border-r-0">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="selectable">
        {rows.map((row, r) => (
          <tr key={r} className="transition-colors duration-75 hover:bg-accent/60">
            {row.map((cell, c) => (
              <td key={c} className="h-6 whitespace-nowrap border-b border-r border-border/50 px-2.5 last:border-r-0">
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );

const Mono: React.FC<React.PropsWithChildren<{ muted?: boolean }>> = ({ children, muted }) => (
  <span className={`font-mono text-xxs ${muted ? 'text-muted-foreground' : ''}`}>{children}</span>
);

export const TableStructureView: React.FC<{ tab: Extract<WorkspaceTab, { kind: 'structure' }> }> = ({ tab }) => {
  const { profiles, connectionStates, connectProfile } = useStudio();
  const { loadStructure } = useSchema();
  const { openTableData, newQuery } = useWorkspace();
  const [structure, setStructure] = useState<TableStructure | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const profile = profiles.find((p) => p.id === tab.profileId);
  const connected = connectionStates[tab.profileId]?.state === 'connected';

  const load = useCallback(
    async (force = false) => {
      if (!connected) return;
      setLoading(true);
      setError(null);
      try {
        setStructure(await loadStructure(tab.profileId, tab.table, tab.schema, force));
      } catch (err) {
        setError(cleanError(err, 'Could not read this table'));
      } finally {
        setLoading(false);
      }
    },
    [connected, loadStructure, tab.profileId, tab.schema, tab.table]
  );

  useEffect(() => {
    load();
  }, [load]);

  if (!connected) {
    return (
      <EmptyState
        icon={<Cable />}
        title={profile ? `Connect to ${profile.name} to see this table` : 'This connection no longer exists'}
        action={profile && <Button size="sm" onClick={() => connectProfile(profile)}>Connect</Button>}
      />
    );
  }
  if (error) {
    return (
      <div className="p-3">
        <ErrorNotice
          title={`Could not read ${tab.table}`}
          message={error}
          action={<Button variant="outline" size="sm" onClick={() => load(true)}><RefreshCw /> Try again</Button>}
        />
      </div>
    );
  }
  if (!structure) {
    return (
      <div className="space-y-2 p-4">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-64" />
        <Skeleton className="mt-4 h-48 w-full" />
      </div>
    );
  }

  const fkByColumn = new Map(structure.foreignKeys.map((fk) => [fk.column, fk]));
  const { metadata } = structure;
  const metaRows: [string, string | undefined][] = [
    ['Schema', metadata?.schema],
    ['Owner', metadata?.owner],
    ['Storage engine', metadata?.engine],
    ['Collation', metadata?.collation],
    ['Estimated rows', metadata?.rowEstimate !== undefined ? formatCount(metadata.rowEstimate) : undefined],
    ['Total size', metadata?.totalBytes !== undefined ? formatBytes(metadata.totalBytes) : undefined],
    ['Comment', metadata?.comment],
  ];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2.5 px-3 py-2">
        <Table2 className="size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <h1 className="selectable truncate font-mono text-sm font-medium">{structure.tableName}</h1>
          <p className="text-xxs text-muted-foreground">
            {[
              metadata?.schema,
              `${formatCount(structure.columns.length)} columns`,
              metadata?.rowEstimate !== undefined ? `~${formatCount(metadata.rowEstimate)} rows` : null,
              metadata?.totalBytes !== undefined ? formatBytes(metadata.totalBytes) : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          <Button
            variant="quiet"
            size="sm"
            onClick={() => openTableData(tab.profileId, { name: tab.table, schema: tab.schema, type: 'TABLE' })}
          >
            <Rows3 /> View data
          </Button>
          <Button
            variant="quiet"
            size="sm"
            onClick={() =>
              newQuery(`SELECT *\nFROM ${qualifiedName(profile?.engine, tab.table, tab.schema)}\nLIMIT 100;`, tab.table, tab.profileId)
            }
          >
            <FileCode2 /> New query
          </Button>
          <Tooltip content="Refresh">
            <Button variant="quiet" size="icon-sm" aria-label="Refresh" onClick={() => load(true)}>
              <RefreshCw className={loading ? 'animate-spin' : undefined} />
            </Button>
          </Tooltip>
        </div>
      </div>

      <Tabs defaultValue="columns" className="flex min-h-0 flex-1 flex-col">
        <TabsList>
          <TabsTrigger value="columns"><ListTree /> Columns <Badge>{structure.columns.length}</Badge></TabsTrigger>
          <TabsTrigger value="indexes"><Layers /> Indexes <Badge>{structure.indexes.length}</Badge></TabsTrigger>
          <TabsTrigger value="fks"><Link2 /> Foreign keys <Badge>{structure.foreignKeys.length}</Badge></TabsTrigger>
          <TabsTrigger value="constraints"><ShieldCheck /> Constraints <Badge>{structure.constraints?.length ?? 0}</Badge></TabsTrigger>
          <TabsTrigger value="info"><KeyRound /> Metadata</TabsTrigger>
          <TabsTrigger value="ddl"><FileCode2 /> DDL</TabsTrigger>
        </TabsList>

        <TabsContent value="columns" className="min-h-0 flex-1 overflow-auto">
          <SimpleTable
            empty="This table has no columns"
            headers={['Column', 'Type', 'Nullable', 'Default', 'Keys']}
            rows={structure.columns.map((c) => [
              <Mono>{c.name}</Mono>,
              <Mono muted>{c.typeName}</Mono>,
              c.nullable ? <span className="text-muted-foreground">Yes</span> : 'No',
              c.defaultValue ? <Mono muted>{c.defaultValue}</Mono> : <span className="text-muted-foreground/60">—</span>,
              <span className="flex gap-1">
                {c.primaryKey && <Badge variant="warning">PK</Badge>}
                {fkByColumn.has(c.name) && (
                  <Badge variant="info" title={`References ${fkByColumn.get(c.name)!.refTable}.${fkByColumn.get(c.name)!.refColumn}`}>
                    FK
                  </Badge>
                )}
              </span>,
            ])}
          />
        </TabsContent>
        <TabsContent value="indexes" className="min-h-0 flex-1 overflow-auto">
          <SimpleTable
            empty="No indexes on this table"
            headers={['Index', 'Columns', 'Kind']}
            rows={structure.indexes.map((idx) => [
              <Mono>{idx.name}</Mono>,
              <Mono muted>{idx.columns.join(', ')}</Mono>,
              <span className="flex gap-1">
                {idx.isPrimary && <Badge variant="warning">Primary</Badge>}
                {idx.isUnique && !idx.isPrimary && <Badge variant="info">Unique</Badge>}
                {!idx.isUnique && !idx.isPrimary && <Badge>Index</Badge>}
              </span>,
            ])}
          />
        </TabsContent>
        <TabsContent value="fks" className="min-h-0 flex-1 overflow-auto">
          <SimpleTable
            empty="No foreign keys on this table"
            headers={['Constraint', 'Column', 'References']}
            rows={structure.foreignKeys.map((fk) => [
              <Mono>{fk.name}</Mono>,
              <Mono muted>{fk.column}</Mono>,
              <Mono muted>{fk.refTable}.{fk.refColumn}</Mono>,
            ])}
          />
        </TabsContent>
        <TabsContent value="constraints" className="min-h-0 flex-1 overflow-auto">
          <SimpleTable
            empty="No constraints on this table"
            headers={['Constraint', 'Type', 'Definition']}
            rows={(structure.constraints ?? []).map((c) => [
              <Mono>{c.name}</Mono>,
              <Badge>{c.type}</Badge>,
              <Mono muted>{c.definition ?? '—'}</Mono>,
            ])}
          />
        </TabsContent>
        <TabsContent value="info" className="min-h-0 flex-1 overflow-auto p-3">
          <dl className="selectable grid w-fit grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-1 text-xs">
            {metaRows.filter(([, value]) => value).map(([label, value]) => (
              <React.Fragment key={label}>
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-mono text-xxs leading-4">{value}</dd>
              </React.Fragment>
            ))}
          </dl>
        </TabsContent>
        <TabsContent value="ddl" className="relative min-h-0 flex-1 overflow-auto p-3">
          <div className="absolute right-3 top-3">
            <CopyButton text={structure.ddl} label="Copy DDL" />
          </div>
          <SqlCode sql={structure.ddl} wrap={false} />
        </TabsContent>
      </Tabs>
    </div>
  );
};
