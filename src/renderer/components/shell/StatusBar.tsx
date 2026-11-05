import React, { useSyncExternalStore } from 'react';
import { AlertTriangle, Cable, Check, CircleSlash, Loader2, Plus, Sparkles } from 'lucide-react';
import { useStudio } from '../../context/StudioContext';
import { editorCursorStore, useWorkspace } from '../../context/WorkspaceContext';
import { cn, formatCount, formatDuration, pluralize } from '../../lib/utils';
import { engineLabel } from '../../lib/sql';
import { StatusDot } from '../ui/feedback';
import { Tooltip } from '../ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/menu';

const statusItem = 'flex h-full items-center gap-1 px-1.5 text-2xs text-muted-foreground';
const statusButton = cn(statusItem, 'no-drag transition-colors duration-75 hover:bg-accent hover:text-foreground focus-visible:outline-offset-[-2px]');

const CursorPosition: React.FC = () => {
  const cursor = useSyncExternalStore(editorCursorStore.subscribe, editorCursorStore.get);
  if (!cursor) return null;
  return (
    <span className={cn(statusItem, 'tabular-nums')}>
      Ln {cursor.line}, Col {cursor.column}
      {cursor.selected > 0 && ` (${formatCount(cursor.selected)} selected)`}
    </span>
  );
};

export const StatusBar: React.FC = () => {
  const { activeProfile, profiles, connectionStates, connectProfile, disconnectProfile, setActiveProfileId, openEditProfileModal, settings } = useStudio();
  const { activeTab, runs, openSingleton } = useWorkspace();

  const state = activeProfile ? connectionStates[activeProfile.id]?.state ?? 'offline' : 'offline';
  const stateLabel = { offline: 'Disconnected', connecting: 'Connecting…', connected: 'Connected', failed: 'Connection failed' }[state];
  const run = activeTab ? runs[activeTab.id] : undefined;

  return (
    <footer className="flex h-6 shrink-0 items-stretch justify-between overflow-hidden border-t border-border bg-chrome pr-1">
      <div className="flex min-w-0 items-stretch">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={cn(statusButton, 'pl-2.5')} aria-label={`Connection: ${activeProfile?.name ?? 'none'}, ${stateLabel}`}>
              <StatusDot status={state === 'connected' ? 'connected' : state === 'connecting' ? 'connecting' : state === 'failed' ? 'failed' : 'offline'} />
              <span className="max-w-44 truncate text-foreground">{activeProfile?.name ?? 'No connection'}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" className="min-w-56">
            <DropdownMenuLabel>Connections</DropdownMenuLabel>
            {profiles.map((p) => (
              <DropdownMenuItem key={p.id} onSelect={() => setActiveProfileId(p.id)}>
                <StatusDot
                  status={
                    connectionStates[p.id]?.state === 'connected'
                      ? 'connected'
                      : connectionStates[p.id]?.state === 'failed'
                        ? 'failed'
                        : 'offline'
                  }
                />
                <span className="truncate">{p.name}</span>
                {p.id === activeProfile?.id && <Check className="ml-auto" />}
              </DropdownMenuItem>
            ))}
            {profiles.length > 0 && <DropdownMenuSeparator />}
            {activeProfile && state !== 'connected' && (
              <DropdownMenuItem onSelect={() => connectProfile(activeProfile)}>
                <Cable /> Connect to {activeProfile.name}
              </DropdownMenuItem>
            )}
            {activeProfile && state === 'connected' && (
              <DropdownMenuItem onSelect={() => disconnectProfile(activeProfile.id)}>
                <CircleSlash /> Disconnect
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={() => openEditProfileModal(null)}>
              <Plus /> Add connection…
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openSingleton('connections')}>
              <Cable /> Manage connections
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {activeProfile && (
          <>
            <span className={statusItem}>{engineLabel(activeProfile.engine)}</span>
            <span className={cn(statusItem, state === 'failed' && 'text-destructive')}>{stateLabel}</span>
          </>
        )}

        {run && (
          <>
            <span className="my-1 w-px bg-border" />
            <span
              className={cn(
                statusItem,
                run.status === 'error' && 'text-destructive',
                run.status === 'cancelled' && 'text-warning'
              )}
            >
              {run.status === 'running' && <Loader2 className="size-3 animate-spin" />}
              {run.status === 'success' && <Check className="size-3 text-success" />}
              {run.status === 'error' && <AlertTriangle className="size-3" />}
              {run.status === 'cancelled' && <CircleSlash className="size-3" />}
              {{ running: 'Running…', success: 'Succeeded', error: 'Failed', cancelled: 'Cancelled' }[run.status]}
            </span>
            {run.status !== 'running' && run.durationMs !== undefined && (
              <span className={cn(statusItem, 'tabular-nums')}>{formatDuration(run.durationMs)}</span>
            )}
            {run.status === 'success' && run.result && (
              <span className={cn(statusItem, 'tabular-nums')}>
                {run.result.isCommand
                  ? `${pluralize(run.result.rowCount, 'row')} affected`
                  : pluralize(run.result.rowCount, 'row')}
              </span>
            )}
          </>
        )}
      </div>

      <div className="flex shrink-0 items-stretch">
        {activeTab?.kind === 'sql' && <CursorPosition />}
        <Tooltip content="AI provider and model" side="top">
          <button type="button" className={statusButton} onClick={() => openSingleton('settings')}>
            <Sparkles className="size-3" />
            <span className="max-w-48 truncate">
              {settings.aiProvider === 'openai' ? 'OpenAI' : 'Ollama'} · {settings.aiModel}
            </span>
          </button>
        </Tooltip>
      </div>
    </footer>
  );
};
