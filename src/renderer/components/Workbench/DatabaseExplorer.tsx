import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  AlertTriangle,
  Cable,
  ChevronRight,
  Columns3,
  Copy,
  Eye,
  FileCode2,
  FolderTree,
  Key,
  Layers,
  Link2,
  ListTree,
  Loader2,
  Network,
  Pencil,
  Plus,
  RefreshCw,
  Rows3,
  Search,
  Table2,
  Trash2,
  Unplug,
} from 'lucide-react';
import { ConnectionProfile, DbTable } from '../../../shared/types';
import { cleanError, useStudio } from '../../context/StudioContext';
import { SchemaEntry, structureKey, useSchema } from '../../context/SchemaContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { engineInfo } from '../../../shared/engines';
import { columnKey, engineLabel } from '../../lib/sql';
import { browseQuery, dropTableStatement, truncateLabel, truncateStatement } from '../../lib/statements';
import { cn, createId, formatCount, prefs } from '../../lib/utils';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { EmptyState, StatusDot } from '../ui/feedback';
import { Input } from '../ui/input';
import { Tooltip } from '../ui/tooltip';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
  DropdownMenu,
  DropdownMenuTrigger,
} from '../ui/menu';
import { ConnectionDropdownContent } from '../shell/ConnectionDropdownContent';
import { CreateTableModal } from '../Modals/CreateTableModal';
import { CreateCollectionModal } from '../Modals/CreateCollectionModal';

const ROW_HEIGHT = 22;
const INDENT = 12;
const BACKGROUND_TAB = 'explorer';

type Node =
  | { kind: 'connection'; id: string; depth: number; profile: ConnectionProfile }
  | { kind: 'status'; id: string; depth: number; profile: ConnectionProfile; tone: 'muted' | 'error'; text: string }
  | { kind: 'schema'; id: string; depth: number; profile: ConnectionProfile; name: string; count: number }
  | { kind: 'group'; id: string; depth: number; profile: ConnectionProfile; label: string; count: number; icon: React.ElementType; schema?: string }
  | { kind: 'table'; id: string; depth: number; profile: ConnectionProfile; table: DbTable }
  | { kind: 'section'; id: string; depth: number; label: string; count?: number; icon: React.ElementType; leaf?: boolean }
  | { kind: 'item'; id: string; depth: number; label: string; detail?: string; icon: React.ElementType; iconClass?: string; copy: string };

const IndentGuides: React.FC<{ depth: number }> = ({ depth }) => (
  <>
    {Array.from({ length: depth }).map((_, i) => (
      <span key={i} aria-hidden className="absolute inset-y-0 w-px bg-border/60" style={{ left: 13 + i * INDENT }} />
    ))}
  </>
);

export const DatabaseExplorer: React.FC = () => {
  const {
    profiles,
    activeProfile,
    setActiveProfileId,
    connectionStates,
    connectProfile,
    disconnectProfile,
    deleteProfile,
    openEditProfileModal,
    openDangerModal,
    showToast,
  } = useStudio();
  const { schemas, structures, loadSchema, loadStructure } = useSchema();
  const { openTableData, openStructure, openErDiagram, newQuery, runSql, tabs, closeTab, openSingleton } = useWorkspace();

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(prefs.get<string[]>('studio:tree', [])));
  const [search, setSearch] = useState('');
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [menuNode, setMenuNode] = useState<Node | null>(null);
  const [createFor, setCreateFor] = useState<{ profile: ConnectionProfile; schema?: string } | null>(null);
  const [createCollectionFor, setCreateCollectionFor] = useState<ConnectionProfile | null>(null);
  const [structureErrors, setStructureErrors] = useState<Record<string, string>>({});
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => prefs.set('studio:tree', [...expanded]), [expanded]);

  const setOpen = useCallback((id: string, open: boolean) => {
    setExpanded((prev) => {
      if (prev.has(id) === open) return prev;
      const next = new Set(prev);
      if (open) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const query = search.trim().toLowerCase();

  const nodes = useMemo<Node[]>(() => {
    const out: Node[] = [];

    const addTable = (profile: ConnectionProfile, schema: SchemaEntry, table: DbTable, depth: number) => {
      const id = `t:${profile.id}:${table.schema ?? ''}:${table.name}`;
      out.push({ kind: 'table', id, depth, profile, table });
      if (!expanded.has(id)) return;

      const columns = schema.columns[columnKey(table.name, table.schema)] ?? [];
      const structure = structures[structureKey(profile.id, table.name, table.schema)];
      const fkColumns = new Set(structure?.foreignKeys.map((fk) => fk.column));

      const columnsId = `${id}:columns`;
      const columnsLabel = engineInfo(profile.engine).terms.columns;
      out.push({
        kind: 'section',
        id: columnsId,
        depth: depth + 1,
        label: columnsLabel.charAt(0).toUpperCase() + columnsLabel.slice(1),
        count: columns.length,
        icon: Columns3,
      });
      if (expanded.has(columnsId)) {
        for (const column of columns) {
          out.push({
            kind: 'item',
            id: `${columnsId}:${column.name}`,
            depth: depth + 2,
            label: column.name,
            detail: `${column.typeName}${column.nullable ? '' : ' not null'}`,
            icon: column.primaryKey ? Key : fkColumns.has(column.name) ? Link2 : Columns3,
            iconClass: column.primaryKey ? 'text-warning' : fkColumns.has(column.name) ? 'text-info' : undefined,
            copy: column.name,
          });
        }
      }

      const errorText = structureErrors[id];
      if (errorText) {
        out.push({ kind: 'status', id: `${id}:error`, depth: depth + 1, profile, tone: 'error', text: errorText });
        return;
      }
      if (!structure) {
        out.push({ kind: 'status', id: `${id}:loading`, depth: depth + 1, profile, tone: 'muted', text: 'Loading keys and indexes…' });
        return;
      }

      const keysId = `${id}:keys`;
      const pkColumns = structure.columns.filter((c) => c.primaryKey);
      out.push({
        kind: 'section',
        id: keysId,
        depth: depth + 1,
        label: 'Keys',
        count: (pkColumns.length > 0 ? 1 : 0) + structure.foreignKeys.length,
        icon: Key,
      });
      if (expanded.has(keysId)) {
        if (pkColumns.length > 0) {
          out.push({
            kind: 'item',
            id: `${keysId}:pk`,
            depth: depth + 2,
            label: 'Primary key',
            detail: pkColumns.map((c) => c.name).join(', '),
            icon: Key,
            iconClass: 'text-warning',
            copy: pkColumns.map((c) => c.name).join(', '),
          });
        }
        for (const fk of structure.foreignKeys) {
          out.push({
            kind: 'item',
            id: `${keysId}:${fk.name}:${fk.column}`,
            depth: depth + 2,
            label: fk.column,
            detail: `→ ${fk.refTable}.${fk.refColumn}`,
            icon: Link2,
            iconClass: 'text-info',
            copy: fk.name,
          });
        }
      }

      const indexesId = `${id}:indexes`;
      out.push({ kind: 'section', id: indexesId, depth: depth + 1, label: 'Indexes', count: structure.indexes.length, icon: ListTree });
      if (expanded.has(indexesId)) {
        for (const index of structure.indexes) {
          out.push({
            kind: 'item',
            id: `${indexesId}:${index.name}`,
            depth: depth + 2,
            label: index.name,
            detail: index.columns.join(', '),
            icon: ListTree,
            copy: index.name,
          });
        }
      }
    };

    for (const profile of profiles) {
      const connId = `c:${profile.id}`;
      out.push({ kind: 'connection', id: connId, depth: 0, profile });
      const state = connectionStates[profile.id];
      if (state?.state === 'failed' && expanded.has(connId)) {
        out.push({ kind: 'status', id: `${connId}:error`, depth: 1, profile, tone: 'error', text: state.error ?? 'Connection failed' });
      }
      const schema = schemas[profile.id];
      if (!schema || !(expanded.has(connId) || query)) continue;

      if (schema.status === 'loading' && schema.tables.length === 0) {
        out.push({ kind: 'status', id: `${connId}:loading`, depth: 1, profile, tone: 'muted', text: 'Reading schema…' });
        continue;
      }
      if (schema.status === 'error') {
        out.push({ kind: 'status', id: `${connId}:schema-error`, depth: 1, profile, tone: 'error', text: schema.error ?? 'Could not read the schema' });
        continue;
      }

      const matches = (t: DbTable) =>
        !query ||
        t.name.toLowerCase().includes(query) ||
        (schema.columns[columnKey(t.name, t.schema)] ?? []).some((c) => c.name.toLowerCase().includes(query));

      const schemaNames = [...new Set(schema.tables.map((t) => t.schema ?? profile.database))];
      for (const name of schemaNames) {
        const inSchema = schema.tables.filter((t) => (t.schema ?? profile.database) === name && matches(t));
        if (query && inSchema.length === 0) continue;
        const schemaId = `s:${profile.id}:${name}`;
        // A brand-new connection shows its first schema open rather than a single closed row.
        const schemaOpen = query || !expanded.has(`${schemaId}:closed`);
        out.push({ kind: 'schema', id: schemaId, depth: 1, profile, name, count: inSchema.length });
        if (!schemaOpen) continue;

        const tablesLabel = engineInfo(profile.engine).terms.tables;
        for (const [type, label, icon] of [
          ['TABLE', tablesLabel.charAt(0).toUpperCase() + tablesLabel.slice(1), Table2],
          ['VIEW', 'Views', Eye],
        ] as const) {
          const objects = inSchema.filter((t) => t.type === type);
          if (objects.length === 0) continue;
          const groupId = `g:${profile.id}:${name}:${type}`;
          const groupOpen = query || !expanded.has(`${groupId}:closed`);
          out.push({
            kind: 'group',
            id: groupId,
            depth: 2,
            profile,
            label,
            count: objects.length,
            icon,
            schema: name,
          });
          if (groupOpen) objects.forEach((t) => addTable(profile, schema, t, 3));
        }
      }
    }
    return out;
  }, [profiles, connectionStates, schemas, structures, structureErrors, expanded, query]);

  const virtualizer = useVirtualizer({
    count: nodes.length,
    getScrollElement: () => scrollerRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  /** Schemas and groups default to open, so their state is stored as an explicit "closed" flag. */
  const isDefaultOpen = (node: Node) => node.kind === 'schema' || node.kind === 'group';
  const isOpen = (node: Node) => {
    if (isDefaultOpen(node)) return Boolean(query) || !expanded.has(`${node.id}:closed`);
    // A connection remembered as open from last session has nothing to show until it reconnects.
    if (node.kind === 'connection' && (connectionStates[node.profile.id]?.state ?? 'offline') === 'offline') return false;
    return expanded.has(node.id);
  };
  const isExpandable = (node: Node) =>
    node.kind === 'connection' || node.kind === 'schema' || node.kind === 'group' || node.kind === 'table' || (node.kind === 'section' && !node.leaf);

  const ensureStructure = useCallback(
    async (profile: ConnectionProfile, table: DbTable) => {
      const id = `t:${profile.id}:${table.schema ?? ''}:${table.name}`;
      try {
        await loadStructure(profile.id, table.name, table.schema);
        setStructureErrors((prev) => {
          if (!prev[id]) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
      } catch (err) {
        setStructureErrors((prev) => ({ ...prev, [id]: cleanError(err, 'Could not read this table') }));
      }
    },
    [loadStructure]
  );

  // Tables restored open from a previous session need their structure once connected.
  useEffect(() => {
    for (const node of nodes) {
      if (node.kind === 'table' && expanded.has(node.id) && !structures[structureKey(node.profile.id, node.table.name, node.table.schema)] && !structureErrors[node.id]) {
        ensureStructure(node.profile, node.table);
      }
    }
    // Only needs to react to the visible set of open tables.
  }, [nodes]);

  const toggle = async (node: Node, force?: boolean) => {
    const open = force ?? !isOpen(node);
    if (isDefaultOpen(node)) {
      setOpen(`${node.id}:closed`, !open);
      return;
    }
    setOpen(node.id, open);
    if (open && node.kind === 'table') ensureStructure(node.profile, node.table);
    if (open && node.kind === 'connection') {
      setActiveProfileId(node.profile.id);
      const state = connectionStates[node.profile.id]?.state;
      if (state !== 'connected' && state !== 'connecting') {
        const connected = await connectProfile(node.profile);
        if (!connected) setOpen(node.id, true);
      }
    }
  };

  const activate = (node: Node) => {
    if (node.kind === 'table') openTableData(node.profile.id, node.table);
    else if (isExpandable(node)) toggle(node);
    else if (node.kind === 'item') window.electronAPI.copyToClipboard(node.copy);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const index = nodes.findIndex((n) => n.id === focusedId);
    const current = nodes[index];
    const focus = (next: number) => {
      const target = nodes[Math.max(0, Math.min(nodes.length - 1, next))];
      if (target) {
        setFocusedId(target.id);
        virtualizer.scrollToIndex(nodes.indexOf(target));
      }
    };
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        focus(index + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        focus(index - 1);
        break;
      case 'Home':
        e.preventDefault();
        focus(0);
        break;
      case 'End':
        e.preventDefault();
        focus(nodes.length - 1);
        break;
      case 'ArrowRight':
        e.preventDefault();
        if (current && isExpandable(current)) {
          if (isOpen(current)) focus(index + 1);
          else toggle(current, true);
        }
        break;
      case 'ArrowLeft':
        e.preventDefault();
        if (current && isExpandable(current) && isOpen(current)) {
          toggle(current, false);
        } else if (current) {
          for (let i = index - 1; i >= 0; i -= 1) {
            if (nodes[i].depth < current.depth) {
              focus(i);
              break;
            }
          }
        }
        break;
      case 'Enter':
        e.preventDefault();
        if (current) activate(current);
        break;
    }
  };

  const copy = (text: string) => {
    window.electronAPI.copyToClipboard(text);
    showToast(`Copied ${text.length > 40 ? 'to clipboard' : `“${text}”`}`, 'info');
  };

  const runBackground = (profile: ConnectionProfile, sql: string) => {
    runSql(`${BACKGROUND_TAB}-${createId('run')}`, profile.id, sql, {
      background: true,
      onSuccess: () => showToast('Statement completed', 'success'),
    });
  };

  const removeConnection = (profile: ConnectionProfile) => {
    openDangerModal({
      title: `Remove “${profile.name}”?`,
      subtitle: 'This removes the saved connection, not the database.',
      message: `${profile.host}:${profile.port}/${profile.database} will no longer appear in AI DB Studio.`,
      actionText: 'Remove connection',
      onConfirm: async () => {
        tabs
          .filter((t) => (t.kind === 'table' || t.kind === 'structure') && t.profileId === profile.id)
          .forEach((t) => closeTab(t.id));
        await deleteProfile(profile.id);
      },
    });
  };

  const totalObjects = Object.values(schemas).reduce((sum, s) => sum + s.tables.length, 0);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-8 shrink-0 items-center justify-between pl-3 pr-1.5">
        <h2 className="section-label">Database Explorer</h2>
        <div className="flex items-center gap-0.5">
          <Tooltip content="Add connection">
            <Button variant="quiet" size="icon-sm" aria-label="Add connection" onClick={() => openEditProfileModal(null)}>
              <Plus />
            </Button>
          </Tooltip>
          <Tooltip content="Refresh schema">
            <Button
              variant="quiet"
              size="icon-sm"
              aria-label="Refresh schema"
              disabled={!activeProfile || connectionStates[activeProfile.id]?.state !== 'connected'}
              onClick={() => activeProfile && loadSchema(activeProfile.id)}
            >
              <RefreshCw className={cn(activeProfile && schemas[activeProfile.id]?.status === 'loading' && 'animate-spin')} />
            </Button>
          </Tooltip>
          <Tooltip content="View ER diagram">
            <Button
              variant="quiet"
              size="icon-sm"
              aria-label="View ER diagram"
              disabled={
                !activeProfile ||
                connectionStates[activeProfile.id]?.state !== 'connected' ||
                !engineInfo(activeProfile.engine).features.erDiagram
              }
              onClick={() => activeProfile && openErDiagram(activeProfile.id)}
            >
              <Network />
            </Button>
          </Tooltip>
          <DropdownMenu>
            <Tooltip content="Manage connections">
              <DropdownMenuTrigger asChild>
                <Button variant="quiet" size="icon-sm" aria-label="Manage connections">
                  <Cable />
                </Button>
              </DropdownMenuTrigger>
            </Tooltip>
            <ConnectionDropdownContent align="end" side="bottom" />
          </DropdownMenu>
        </div>
      </div>

      {totalObjects > 0 && (
        <div className="relative mx-2 mb-1.5 shrink-0">
          <Search className="pointer-events-none absolute left-1.5 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter tables and columns"
            aria-label="Filter tables and columns"
            className="h-6 pl-5 text-xxs"
          />
        </div>
      )}

      {profiles.length === 0 ? (
        <EmptyState
          icon={<Cable />}
          title="No connections yet"
          description="Add a PostgreSQL or MySQL connection to browse its tables."
          action={
            <Button size="sm" onClick={() => openEditProfileModal(null)}>
              <Plus /> Add connection
            </Button>
          }
        />
      ) : (
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div
              ref={scrollerRef}
              role="tree"
              aria-label="Database objects"
              tabIndex={0}
              onKeyDown={onKeyDown}
              onFocus={() => {
                if (!focusedId && nodes[0]) setFocusedId(nodes[0].id);
              }}
              onContextMenuCapture={(e) => {
                const id = (e.target as HTMLElement).closest<HTMLElement>('[data-node]')?.dataset.node;
                const node = nodes.find((n) => n.id === id) ?? null;
                setMenuNode(node);
                if (node) setFocusedId(node.id);
              }}
              aria-activedescendant={focusedId ? `tree-${focusedId}` : undefined}
              className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-2 outline-none"
            >
              <div style={{ height: virtualizer.getTotalSize() }} className="relative">
                {virtualizer.getVirtualItems().map((virtual) => {
                  const node = nodes[virtual.index];
                  const expandable = isExpandable(node);
                  const open = expandable && isOpen(node);
                  const focused = focusedId === node.id;
                  const isActiveConnection = node.kind === 'connection' && node.profile.id === activeProfile?.id;
                  const left = 6 + node.depth * INDENT;

                  let body: React.ReactNode = null;
                  if (node.kind === 'connection') {
                    const state = connectionStates[node.profile.id]?.state ?? 'offline';
                    body = (
                      <>
                        <StatusDot status={state} className="mx-[4px]" />
                        <span className={cn('min-w-0 truncate', isActiveConnection && 'font-medium')}>{node.profile.name}</span>
                        <Badge mono variant="outline" title={engineLabel(node.profile.engine)} className="px-0.5">
                          {engineInfo(node.profile.engine).badge}
                        </Badge>
                        {state === 'connecting' && <Loader2 className="ml-auto mr-1 size-3 shrink-0 animate-spin text-muted-foreground" />}
                        {state === 'connected' && schemas[node.profile.id]?.status === 'ready' && (
                          <span className="ml-auto pl-1 pr-2 text-2xs tabular-nums text-muted-foreground">
                            {formatCount(schemas[node.profile.id].tables.length)}
                          </span>
                        )}
                      </>
                    );
                  } else if (node.kind === 'status') {
                    body = (
                      <>
                        {node.tone === 'error' ? (
                          <AlertTriangle className="size-3 shrink-0 text-destructive" />
                        ) : (
                          <Loader2 className="size-3 shrink-0 animate-spin text-muted-foreground" />
                        )}
                        <span
                          title={node.text}
                          className={cn('min-w-0 truncate text-xxs', node.tone === 'error' ? 'text-destructive' : 'text-muted-foreground')}
                        >
                          {node.text}
                        </span>
                      </>
                    );
                  } else if (node.kind === 'schema') {
                    body = (
                      <>
                        <FolderTree className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 truncate">{node.name}</span>
                      </>
                    );
                  } else if (node.kind === 'group' || node.kind === 'section') {
                    const Icon = node.icon;
                    body = (
                      <>
                        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 truncate text-muted-foreground">{node.label}</span>
                        {node.count !== undefined && (
                          <span className="pl-0.5 text-2xs tabular-nums text-muted-foreground/70">{formatCount(node.count)}</span>
                        )}
                      </>
                    );
                  } else if (node.kind === 'table') {
                    const Icon = node.table.type === 'VIEW' ? Eye : Table2;
                    body = (
                      <>
                        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 truncate">{node.table.name}</span>
                      </>
                    );
                  } else if (node.kind === 'item') {
                    const Icon = node.icon;
                    body = (
                      <>
                        <Icon className={cn('size-3 shrink-0 text-muted-foreground/70', node.iconClass)} />
                        <span className="shrink-0 font-mono text-xxs">{node.label}</span>
                        {node.detail && (
                          <span title={node.detail} className="min-w-0 truncate pl-0.5 font-mono text-2xs text-muted-foreground">
                            {node.detail}
                          </span>
                        )}
                      </>
                    );
                  }

                  return (
                    <div
                      key={node.id}
                      id={`tree-${node.id}`}
                      data-node={node.id}
                      role="treeitem"
                      aria-level={node.depth + 1}
                      aria-expanded={expandable ? open : undefined}
                      aria-selected={focused}
                      title={node.kind === 'connection' ? `${node.profile.username}@${node.profile.host}:${node.profile.port}/${node.profile.database}` : undefined}
                      style={{ transform: `translateY(${virtual.start}px)`, height: ROW_HEIGHT, paddingLeft: left }}
                      onClick={() => {
                        setFocusedId(node.id);
                        if (node.kind === 'connection') setActiveProfileId(node.profile.id);
                        if (node.kind !== 'table' && expandable) toggle(node);
                      }}
                      onDoubleClick={() => {
                        if (node.kind === 'table') openTableData(node.profile.id, node.table);
                      }}
                      className={cn(
                        'absolute left-0 top-0 flex w-full items-center gap-1 pr-1 text-xs transition-colors duration-75',
                        focused ? 'bg-accent' : 'hover:bg-accent/60'
                      )}
                    >
                      <IndentGuides depth={node.depth} />
                      <span
                        className="relative flex size-4 shrink-0 items-center justify-center"
                        onClick={(e) => {
                          if (expandable) {
                            e.stopPropagation();
                            setFocusedId(node.id);
                            toggle(node);
                          }
                        }}
                      >
                        {expandable && (
                          <ChevronRight
                            className={cn('size-3 text-muted-foreground transition-transform duration-75', open && 'rotate-90')}
                          />
                        )}
                      </span>
                      {body}
                    </div>
                  );
                })}
              </div>
            </div>
          </ContextMenuTrigger>
          {menuNode?.kind === 'connection' && (
            <ContextMenuContent>
              <ContextMenuLabel>{menuNode.profile.name}</ContextMenuLabel>
              {connectionStates[menuNode.profile.id]?.state === 'connected' ? (
                <>
                  <ContextMenuItem onSelect={() => newQuery('', undefined, menuNode.profile.id)}>
                    <FileCode2 /> New query
                  </ContextMenuItem>
                  <ContextMenuItem onSelect={() => loadSchema(menuNode.profile.id)}>
                    <RefreshCw /> Refresh schema
                  </ContextMenuItem>
                  {engineInfo(menuNode.profile.engine).features.erDiagram && (
                    <ContextMenuItem onSelect={() => openErDiagram(menuNode.profile.id)}>
                      <Network /> View ER diagram
                    </ContextMenuItem>
                  )}
                  {engineInfo(menuNode.profile.engine).features.createTable && (
                    <ContextMenuItem onSelect={() => setCreateFor({ profile: menuNode.profile })}>
                      <Plus /> Create table…
                    </ContextMenuItem>
                  )}
                  {engineInfo(menuNode.profile.engine).features.createCollection && (
                    <ContextMenuItem onSelect={() => setCreateCollectionFor(menuNode.profile)}>
                      <Plus /> Create collection…
                    </ContextMenuItem>
                  )}
                  <ContextMenuSeparator />
                  <ContextMenuItem onSelect={() => disconnectProfile(menuNode.profile.id)}>
                    <Unplug /> Disconnect
                  </ContextMenuItem>
                </>
              ) : (
                <ContextMenuItem onSelect={() => toggle(menuNode, true)}>
                  <Cable /> Connect
                </ContextMenuItem>
              )}
              <ContextMenuItem onSelect={() => openEditProfileModal(menuNode.profile)}>
                <Pencil /> Edit…
              </ContextMenuItem>
              <ContextMenuItem onSelect={() => openSingleton('connections')}>
                <Cable /> Manage connections…
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem destructive onSelect={() => removeConnection(menuNode.profile)}>
                <Trash2 /> Remove connection…
              </ContextMenuItem>
            </ContextMenuContent>
          )}
          {menuNode?.kind === 'table' && (
            <ContextMenuContent>
              <ContextMenuLabel>{menuNode.table.name}</ContextMenuLabel>
              <ContextMenuItem onSelect={() => openTableData(menuNode.profile.id, menuNode.table)}>
                <Rows3 /> View data
              </ContextMenuItem>
              <ContextMenuItem onSelect={() => openStructure(menuNode.profile.id, menuNode.table)}>
                <Layers /> View structure
              </ContextMenuItem>
              <ContextMenuItem
                onSelect={() =>
                  newQuery(
                    browseQuery(menuNode.profile.engine, menuNode.table.name, menuNode.table.schema),
                    menuNode.table.name,
                    menuNode.profile.id
                  )
                }
              >
                <FileCode2 /> New query
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem onSelect={() => copy(menuNode.table.name)}>
                <Copy /> Copy name
              </ContextMenuItem>
              {menuNode.table.type === 'TABLE' && (
                <>
                  <ContextMenuSeparator />
                  {truncateStatement(menuNode.profile.engine, menuNode.table.name, menuNode.table.schema) && (
                    <ContextMenuItem
                      destructive
                      onSelect={() =>
                        runBackground(
                          menuNode.profile,
                          truncateStatement(menuNode.profile.engine, menuNode.table.name, menuNode.table.schema)!
                        )
                      }
                    >
                      <AlertTriangle /> {truncateLabel(menuNode.profile.engine)}
                    </ContextMenuItem>
                  )}
                  <ContextMenuItem
                    destructive
                    onSelect={() =>
                      runBackground(
                        menuNode.profile,
                        dropTableStatement(menuNode.profile.engine, menuNode.table.name, menuNode.table.schema)
                      )
                    }
                  >
                    <Trash2 /> Drop {engineInfo(menuNode.profile.engine).terms.table}…
                  </ContextMenuItem>
                </>
              )}
            </ContextMenuContent>
          )}
          {(menuNode?.kind === 'schema' || menuNode?.kind === 'group') && (
            <ContextMenuContent>
              {engineInfo(menuNode.profile.engine).features.createTable && (
                <ContextMenuItem
                  onSelect={() =>
                    setCreateFor({
                      profile: menuNode.profile,
                      schema: menuNode.kind === 'schema' ? menuNode.name : menuNode.schema,
                    })
                  }
                >
                  <Plus /> Create table…
                </ContextMenuItem>
              )}
              {engineInfo(menuNode.profile.engine).features.createCollection && (
                <ContextMenuItem onSelect={() => setCreateCollectionFor(menuNode.profile)}>
                  <Plus /> Create collection…
                </ContextMenuItem>
              )}
              <ContextMenuItem onSelect={() => loadSchema(menuNode.profile.id)}>
                <RefreshCw /> Refresh schema
              </ContextMenuItem>
              {menuNode.kind === 'schema' && engineInfo(menuNode.profile.engine).features.erDiagram && (
                <ContextMenuItem onSelect={() => openErDiagram(menuNode.profile.id, menuNode.name)}>
                  <Network /> View ER diagram
                </ContextMenuItem>
              )}
            </ContextMenuContent>
          )}
          {menuNode?.kind === 'item' && (
            <ContextMenuContent>
              <ContextMenuItem onSelect={() => copy(menuNode.copy)}>
                <Copy /> Copy name
              </ContextMenuItem>
            </ContextMenuContent>
          )}
          {(menuNode === null || menuNode.kind === 'section' || menuNode.kind === 'status') && (
            <ContextMenuContent>
              <ContextMenuItem onSelect={() => openEditProfileModal(null)}>
                <Plus /> Add connection…
              </ContextMenuItem>
              <ContextMenuItem onSelect={() => openSingleton('connections')}>
                <Cable /> Manage connections…
              </ContextMenuItem>
            </ContextMenuContent>
          )}
        </ContextMenu>
      )}

      {createFor && (
        <CreateTableModal
          engine={createFor.profile.engine}
          schema={createFor.schema}
          profileId={createFor.profile.id}
          onExecuteDdl={(ddl) => runBackground(createFor.profile, ddl)}
          onClose={() => setCreateFor(null)}
        />
      )}
      {createCollectionFor && (
        <CreateCollectionModal
          database={createCollectionFor.database}
          onExecute={(statements) => runBackground(createCollectionFor, statements)}
          onClose={() => setCreateCollectionFor(null)}
        />
      )}
    </div>
  );
};
