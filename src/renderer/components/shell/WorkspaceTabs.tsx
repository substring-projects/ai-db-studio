import React, { useEffect, useRef, useState } from 'react';
import { Plus, Sparkles, FileCode2, X } from 'lucide-react';
import { useStudio } from '../../context/StudioContext';
import { useWorkspace, WorkspaceTab } from '../../context/WorkspaceContext';
import { useChat } from '../../context/ChatContext';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import { Tooltip } from '../ui/tooltip';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/menu';
import { tabIcon, tabTitle } from './tabMeta';

const TabButton: React.FC<{ tab: WorkspaceTab; index: number; count: number }> = ({ tab, index, count }) => {
  const { drafts, profiles, updateDraft, openPromptModal } = useStudio();
  const { conversations } = useChat();
  const { activeTab, activateTab, closeTab, closeOtherTabs, closeTabsToRight, closeAllTabs, moveTab, runs } = useWorkspace();
  const ref = useRef<HTMLDivElement>(null);
  const [dropTarget, setDropTarget] = useState(false);

  const active = activeTab?.id === tab.id;
  const Icon = tabIcon(tab);
  const title = tabTitle(tab, drafts, conversations);
  const draft = tab.kind === 'sql' ? drafts.find((d) => d.id === tab.draftId) : undefined;
  const dirty = Boolean(draft && draft.sql !== draft.savedSql);
  const running = runs[tab.id]?.status === 'running';
  const profileId = tab.kind === 'table' || tab.kind === 'structure' || tab.kind === 'result' ? tab.profileId : draft?.connectionId;
  const connection = profiles.find((p) => p.id === profileId)?.name;

  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [active]);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={ref}
          role="tab"
          tabIndex={active ? 0 : -1}
          aria-selected={active}
          draggable
          title={connection ? `${title} — ${connection}` : title}
          onClick={() => activateTab(tab.id)}
          onAuxClick={(e) => {
            if (e.button === 1) closeTab(tab.id);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') activateTab(tab.id);
          }}
          onDragStart={(e) => e.dataTransfer.setData('text/studio-tab', tab.id)}
          onDragOver={(e) => {
            e.preventDefault();
            setDropTarget(true);
          }}
          onDragLeave={() => setDropTarget(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDropTarget(false);
            moveTab(e.dataTransfer.getData('text/studio-tab'), tab.id);
          }}
          className={cn(
            'group relative flex h-full min-w-28 max-w-56 shrink-0 items-center gap-2 border-r border-border pl-3 pr-1.5 text-xs transition-colors duration-75 focus-visible:outline-offset-[-2px]',
            active ? 'bg-background font-medium text-foreground' : 'bg-chrome text-muted-foreground hover:bg-sidebar hover:text-foreground',
            dropTarget && 'bg-accent'
          )}
        >
          {active && <span className="absolute inset-x-0 top-0 h-[2px] bg-primary" />}
          {active && <span className="absolute inset-x-0 -bottom-px h-px bg-background" />}
          <Icon className={cn('size-3.5 shrink-0', active ? 'text-primary' : 'text-muted-foreground')} />
          <span className="min-w-0 flex-1 truncate">{title}</span>
          <span className="relative ml-0.5 flex size-5 shrink-0 items-center justify-center">
            {(dirty || running) && (
              <span
                aria-label={running ? 'Running' : 'Unsaved changes'}
                className={cn(
                  'absolute size-2 rounded-full group-hover:hidden',
                  running ? 'animate-shimmer bg-warning' : 'bg-foreground/70'
                )}
              />
            )}
            <Button
              variant="quiet"
              size="icon-xs"
              aria-label={`Close ${title}`}
              tabIndex={-1}
              className={cn(
                'absolute',
                dirty || running ? 'hidden group-hover:inline-flex' : active ? '' : 'opacity-0 group-hover:opacity-100'
              )}
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.id);
              }}
            >
              <X />
            </Button>
          </span>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        {draft && (
          <>
            <ContextMenuItem
              onSelect={() =>
                openPromptModal({
                  title: 'Rename query',
                  subtitle: 'Choose a name that says what this query is for.',
                  fieldLabel: 'Name',
                  initialValue: draft.title,
                  onConfirm: (next) => updateDraft({ ...draft, title: next }),
                })
              }
            >
              Rename…
            </ContextMenuItem>
            <ContextMenuItem disabled={!dirty} onSelect={() => updateDraft({ ...draft, sql: draft.savedSql ?? draft.sql })}>
              Revert to saved
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        )}
        <ContextMenuItem shortcut="Mod+W" onSelect={() => closeTab(tab.id)}>
          Close
        </ContextMenuItem>
        <ContextMenuItem disabled={count < 2} onSelect={() => closeOtherTabs(tab.id)}>
          Close others
        </ContextMenuItem>
        <ContextMenuItem disabled={index === count - 1} onSelect={() => closeTabsToRight(tab.id)}>
          Close to the right
        </ContextMenuItem>
        <ContextMenuItem onSelect={closeAllTabs}>Close all</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};

export const WorkspaceTabs: React.FC = () => {
  const { tabs, newQuery } = useWorkspace();
  const { openNewConversation } = useChat();
  const { activeProfile } = useStudio();

  return (
    <div className="flex h-9 shrink-0 items-stretch border-b border-border bg-chrome">
      <div
        role="tablist"
        aria-label="Open tabs"
        className="flex min-w-0 items-stretch overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onWheel={(e) => {
          if (e.deltaY !== 0 && e.deltaX === 0) e.currentTarget.scrollLeft += e.deltaY;
        }}
      >
        {tabs.map((tab, index) => (
          <TabButton key={tab.id} tab={tab} index={index} count={tabs.length} />
        ))}
      </div>
      <div className="flex shrink-0 items-center px-1">
        <DropdownMenu>
          <Tooltip content="New tab">
            <DropdownMenuTrigger asChild>
              <Button variant="quiet" size="icon-sm" aria-label="New tab">
                <Plus />
              </Button>
            </DropdownMenuTrigger>
          </Tooltip>
          <DropdownMenuContent>
            <DropdownMenuItem shortcut="Mod+T" onSelect={() => newQuery('', undefined, activeProfile?.id)}>
              <FileCode2 /> New query
            </DropdownMenuItem>
            <DropdownMenuItem shortcut="Mod+Shift+L" onSelect={openNewConversation}>
              <Sparkles /> New AI conversation
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
};
