import React from 'react';
import { Cable, Database, FileCode2, History, Settings, Sparkles } from 'lucide-react';
import { Activity, useWorkspace } from '../../context/WorkspaceContext';
import { useChat } from '../../context/ChatContext';
import { cn } from '../../lib/utils';
import { Tooltip } from '../ui/tooltip';
import { DropdownMenu, DropdownMenuTrigger } from '../ui/menu';
import { ConnectionDropdownContent } from './ConnectionDropdownContent';

const ITEMS: { id: Activity; label: string; icon: React.ElementType; shortcut: string }[] = [
  { id: 'explorer', label: 'Database Explorer', icon: Database, shortcut: 'Mod+1' },
  { id: 'sql', label: 'SQL Editor', icon: FileCode2, shortcut: 'Mod+2' },
  { id: 'ai', label: 'AI Assistant', icon: Sparkles, shortcut: 'Mod+3' },
  { id: 'history', label: 'Query History', icon: History, shortcut: 'Mod+4' },
];

const ActivityButton: React.FC<{
  label: string;
  icon: React.ElementType;
  shortcut?: string;
  active: boolean;
  onClick: () => void;
}> = ({ label, icon: Icon, shortcut, active, onClick }) => (
  <Tooltip content={label} shortcut={shortcut} side="right">
    <button
      type="button"
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
      className={cn(
        'relative flex h-10 w-full items-center justify-center transition-colors duration-100 focus-visible:outline-offset-[-3px]',
        active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
      )}
    >
      {active && <span className="absolute inset-y-2 left-0 w-0.5 rounded-r-sm bg-primary" />}
      <Icon className="size-[18px]" strokeWidth={1.6} />
    </button>
  </Tooltip>
);

/** Selects an activity. The editor and the assistant are places to work, so arriving opens one. */
export const useSelectActivity = () => {
  const { selectActivity, activeTab, tabs, activateTab, newQuery } = useWorkspace();
  const { openNewConversation } = useChat();

  return (id: Activity) => {
    selectActivity(id);
    if (id === 'sql' && activeTab?.kind !== 'sql') {
      const existing = tabs.find((t) => t.kind === 'sql');
      if (existing) activateTab(existing.id);
      else newQuery();
    }
    if (id === 'ai' && activeTab?.kind !== 'ai') {
      const existing = tabs.find((t) => t.kind === 'ai');
      if (existing) activateTab(existing.id);
      else openNewConversation();
    }
  };
};

export const ActivityBar: React.FC = () => {
  const { activity, sidebarOpen, activeTab, openSingleton } = useWorkspace();
  const select = useSelectActivity();

  return (
    <nav aria-label="Primary" className="flex w-11 shrink-0 flex-col justify-between border-r border-border bg-chrome">
      <div className="flex flex-col">
        {ITEMS.map((item) => (
          <ActivityButton
            key={item.id}
            label={item.label}
            icon={item.icon}
            shortcut={item.shortcut}
            active={sidebarOpen && activity === item.id}
            onClick={() => select(item.id)}
          />
        ))}
      </div>
      <div className="flex flex-col">
        <DropdownMenu>
          <Tooltip content="Manage connections" side="right">
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Manage connections"
                aria-current={activeTab?.kind === 'connections' ? 'page' : undefined}
                className={cn(
                  'relative flex h-10 w-full items-center justify-center transition-colors duration-100 focus-visible:outline-offset-[-3px]',
                  activeTab?.kind === 'connections' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {activeTab?.kind === 'connections' && (
                  <span className="absolute inset-y-2 left-0 w-0.5 rounded-r-sm bg-primary" />
                )}
                <Cable className="size-[18px]" strokeWidth={1.6} />
              </button>
            </DropdownMenuTrigger>
          </Tooltip>
          <ConnectionDropdownContent side="right" align="end" />
        </DropdownMenu>
        <ActivityButton
          label="Settings"
          icon={Settings}
          shortcut="Mod+,"
          active={activeTab?.kind === 'settings'}
          onClick={() => openSingleton('settings')}
        />
      </div>
    </nav>
  );
};
