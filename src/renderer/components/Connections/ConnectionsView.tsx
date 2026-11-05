import React, { useState } from 'react';
import { Cable, CheckCircle2, Copy, FileCode2, Loader2, MoreHorizontal, Pencil, Plus, Trash2, Unplug, Zap } from 'lucide-react';
import { ConnectionProfile } from '../../../shared/types';
import { cleanError, useStudio } from '../../context/StudioContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { engineLabel } from '../../lib/sql';
import { createId } from '../../lib/utils';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { EmptyState, StatusDot } from '../ui/feedback';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/menu';

const STATE_LABEL = { connected: 'Connected', connecting: 'Connecting…', failed: 'Failed', offline: 'Disconnected' };

const ConnectionRow: React.FC<{ profile: ConnectionProfile }> = ({ profile }) => {
  const {
    connectionStates,
    connectProfile,
    disconnectProfile,
    deleteProfile,
    saveProfile,
    openEditProfileModal,
    openDangerModal,
    openPromptModal,
    showToast,
  } = useStudio();
  const { newQuery, tabs, closeTab } = useWorkspace();
  const [testing, setTesting] = useState(false);

  const entry = connectionStates[profile.id];
  const state = entry?.state ?? 'offline';

  const test = async () => {
    setTesting(true);
    try {
      const result = await window.electronAPI.testConnection(profile);
      showToast(result.message, result.success ? 'success' : 'danger');
    } catch (err) {
      showToast(cleanError(err, 'Connection test failed'), 'danger');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="group flex items-center gap-3 border-b border-border px-3 py-2 transition-colors duration-75 hover:bg-accent/40">
      <span className="flex w-24 shrink-0 items-center gap-1.5 text-xxs text-muted-foreground">
        <StatusDot status={state} />
        {STATE_LABEL[state]}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-xs font-medium">{profile.name}</span>
          <Badge variant="outline">{engineLabel(profile.engine)}</Badge>
        </div>
        <p className="selectable truncate font-mono text-2xs text-muted-foreground">
          {profile.username}@{profile.host}:{profile.port}/{profile.database}
        </p>
        {state === 'failed' && entry?.error && (
          <p className="selectable mt-0.5 break-words text-xxs text-destructive">{entry.error}</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {state === 'connected' ? (
          <Button variant="outline" size="sm" onClick={() => disconnectProfile(profile.id)}>
            <Unplug /> Disconnect
          </Button>
        ) : (
          <Button size="sm" disabled={state === 'connecting'} onClick={() => connectProfile(profile)}>
            {state === 'connecting' ? <Loader2 className="animate-spin" /> : <Zap />}
            {state === 'failed' ? 'Retry' : 'Connect'}
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="quiet" size="icon-sm" aria-label={`More actions for ${profile.name}`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => newQuery('', undefined, profile.id)}>
              <FileCode2 /> New query
            </DropdownMenuItem>
            <DropdownMenuItem disabled={testing} onSelect={test}>
              {testing ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Test connection
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => openEditProfileModal(profile)}>
              <Pencil /> Edit…
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                openPromptModal({
                  title: 'Duplicate connection',
                  subtitle: 'Creates a copy with the same settings.',
                  fieldLabel: 'Name',
                  initialValue: `${profile.name} copy`,
                  onConfirm: (name) => saveProfile({ ...profile, id: createId('profile'), name }),
                })
              }
            >
              <Copy /> Duplicate…
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              destructive
              onSelect={() =>
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
                })
              }
            >
              <Trash2 /> Remove…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
};

export const ConnectionsView: React.FC = () => {
  const { profiles, openEditProfileModal } = useStudio();

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-6">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h1 className="text-sm font-semibold">Connections</h1>
            <p className="text-xxs text-muted-foreground">PostgreSQL and MySQL databases saved on this device.</p>
          </div>
          <Button size="sm" onClick={() => openEditProfileModal(null)}>
            <Plus /> Add connection
          </Button>
        </div>
        {profiles.length === 0 ? (
          <div className="rounded-md border border-dashed border-border">
            <EmptyState
              icon={<Cable />}
              title="No connections yet"
              description="Add a connection to browse tables, run queries and ask the assistant about your data."
              action={
                <Button size="sm" onClick={() => openEditProfileModal(null)}>
                  <Plus /> Add connection
                </Button>
              }
            />
          </div>
        ) : (
          <div className="overflow-hidden rounded-md border border-b-0 border-border">
            {profiles.map((p) => (
              <ConnectionRow key={p.id} profile={p} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
