import React from 'react';
import { Cable, Check, CircleSlash, Plus } from 'lucide-react';
import { useStudio } from '../../context/StudioContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { StatusDot } from '../ui/feedback';
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '../ui/menu';
import { cn } from '../../lib/utils';

export const ConnectionDropdownContent: React.FC<{
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  className?: string;
}> = ({ side = 'bottom', align = 'start', className }) => {
  const {
    profiles,
    activeProfile,
    setActiveProfileId,
    connectionStates,
    connectProfile,
    disconnectProfile,
    openEditProfileModal,
  } = useStudio();
  const { openSingleton } = useWorkspace();

  const state = activeProfile ? connectionStates[activeProfile.id]?.state ?? 'offline' : 'offline';

  return (
    <DropdownMenuContent side={side} align={align} className={cn('min-w-56', className)}>
      <DropdownMenuLabel>Connections</DropdownMenuLabel>
      {profiles.length === 0 ? (
        <div className="px-2 py-1.5 text-2xs text-muted-foreground">No connections saved</div>
      ) : (
        profiles.map((p) => (
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
        ))
      )}
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
  );
};
