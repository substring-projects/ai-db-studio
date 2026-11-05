import React, { useMemo } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import {
  Cable,
  Eye,
  FileCode2,
  Layers,
  Moon,
  PanelBottom,
  PanelLeft,
  Plus,
  Settings,
  Sparkles,
  Sun,
  Table2,
} from 'lucide-react';
import { useStudio } from '../../context/StudioContext';
import { useSchema } from '../../context/SchemaContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useChat } from '../../context/ChatContext';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '../ui/command';

export const CommandPalette: React.FC = () => {
  const { profiles, connectionStates, connectProfile, drafts, theme, toggleTheme, openEditProfileModal, activeProfile } = useStudio();
  const { schemas } = useSchema();
  const workspace = useWorkspace();
  const { openNewConversation } = useChat();
  const { paletteOpen, setPaletteOpen } = workspace;

  const run = (action: () => void) => () => {
    setPaletteOpen(false);
    action();
  };

  const tables = useMemo(
    () =>
      Object.entries(schemas).flatMap(([profileId, schema]) => {
        const profile = profiles.find((p) => p.id === profileId);
        return profile ? schema.tables.map((table) => ({ profileId, profile, table })) : [];
      }),
    [schemas, profiles]
  );

  return (
    <DialogPrimitive.Root open={paletteOpen} onOpenChange={setPaletteOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/30 animate-overlay-in" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-[12vh] z-50 w-[min(560px,calc(100vw-48px))] -translate-x-1/2 overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-overlay animate-menu-in"
        >
          <DialogPrimitive.Title className="sr-only">Command palette</DialogPrimitive.Title>
          <Command loop>
            <CommandInput placeholder="Search tables, queries and commands" />
            <CommandList>
              <CommandEmpty>No matches</CommandEmpty>

              {tables.length > 0 && (
                <CommandGroup heading="Tables">
                  {tables.map(({ profileId, profile, table }) => (
                    <CommandItem
                      key={`${profileId}:${table.schema}:${table.name}`}
                      value={`table ${table.name} ${table.schema ?? ''} ${profile.name}`}
                      onSelect={run(() => workspace.openTableData(profileId, table))}
                    >
                      {table.type === 'VIEW' ? <Eye /> : <Table2 />}
                      <span className="truncate">{table.name}</span>
                      <span className="ml-auto truncate pl-3 text-2xs text-muted-foreground">
                        {table.schema ? `${table.schema} · ` : ''}
                        {profile.name}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {drafts.length > 0 && (
                <CommandGroup heading="Saved queries">
                  {drafts.map((draft) => (
                    <CommandItem
                      key={draft.id}
                      value={`query ${draft.title} ${draft.id}`}
                      onSelect={run(() => workspace.openDraft(draft.id))}
                    >
                      <FileCode2 />
                      <span className="truncate">{draft.title}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              <CommandGroup heading="Commands">
                <CommandItem shortcut="Mod+T" onSelect={run(() => workspace.newQuery('', undefined, activeProfile?.id))}>
                  <Plus /> New query
                </CommandItem>
                <CommandItem shortcut="Mod+Shift+L" onSelect={run(openNewConversation)}>
                  <Sparkles /> New AI conversation
                </CommandItem>
                <CommandItem shortcut="Mod+B" onSelect={run(workspace.toggleSidebar)}>
                  <PanelLeft /> Toggle sidebar
                </CommandItem>
                <CommandItem shortcut="Mod+J" onSelect={run(workspace.togglePanel)}>
                  <PanelBottom /> Toggle bottom panel
                </CommandItem>
                <CommandItem shortcut="Mod+L" onSelect={run(workspace.toggleAiPanel)}>
                  <Sparkles /> Toggle AI panel
                </CommandItem>
                <CommandItem onSelect={run(toggleTheme)}>
                  {theme === 'dark' ? <Sun /> : <Moon />} Switch to {theme === 'dark' ? 'light' : 'dark'} theme
                </CommandItem>
                <CommandItem onSelect={run(() => openEditProfileModal(null))}>
                  <Plus /> Add connection
                </CommandItem>
                <CommandItem onSelect={run(() => workspace.openSingleton('connections'))}>
                  <Layers /> Manage connections
                </CommandItem>
                <CommandItem shortcut="Mod+," onSelect={run(() => workspace.openSingleton('settings'))}>
                  <Settings /> Settings
                </CommandItem>
              </CommandGroup>

              {profiles.some((p) => connectionStates[p.id]?.state !== 'connected') && (
                <CommandGroup heading="Connect">
                  {profiles
                    .filter((p) => connectionStates[p.id]?.state !== 'connected')
                    .map((p) => (
                      <CommandItem key={p.id} value={`connect ${p.name} ${p.id}`} onSelect={run(() => connectProfile(p))}>
                        <Cable /> Connect to {p.name}
                      </CommandItem>
                    ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};
