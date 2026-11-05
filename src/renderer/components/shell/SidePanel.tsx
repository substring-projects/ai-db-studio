import React, { useMemo, useState } from 'react';
import {
  Check,
  Copy,
  FileCode2,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { useStudio } from '../../context/StudioContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useChat } from '../../context/ChatContext';
import { cn, formatDuration, formatRelativeTime, pluralize } from '../../lib/utils';
import { DatabaseExplorer } from '../Workbench/DatabaseExplorer';
import { Button } from '../ui/button';
import { EmptyState } from '../ui/feedback';
import { Input } from '../ui/input';
import { Tooltip } from '../ui/tooltip';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '../ui/menu';

export const SidebarHeader: React.FC<{ title: string; children?: React.ReactNode }> = ({ title, children }) => (
  <div className="flex h-8 shrink-0 items-center justify-between pl-3 pr-1.5">
    <h2 className="section-label">{title}</h2>
    <div className="flex items-center gap-0.5">{children}</div>
  </div>
);

const SearchField: React.FC<{ value: string; onChange: (v: string) => void; placeholder: string }> = ({
  value,
  onChange,
  placeholder,
}) => (
  <div className="relative mx-2 mb-1.5 shrink-0">
    <Search className="pointer-events-none absolute left-1.5 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="h-6 pl-5 text-xxs"
    />
  </div>
);

const ListRow: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }
> = ({ active, className, ...props }) => (
  <button
    type="button"
    className={cn(
      'flex w-full items-start gap-2 px-3 py-1.5 text-left transition-colors duration-75 hover:bg-accent focus-visible:outline-offset-[-2px]',
      active && 'bg-accent',
      className
    )}
    {...props}
  />
);

const DraftsSidebar: React.FC = () => {
  const { drafts, updateDraft, deleteDraft, openPromptModal, openDangerModal } = useStudio();
  const { openDraft, newQuery, activeTab, tabs, closeTab } = useWorkspace();
  const [search, setSearch] = useState('');
  const visible = drafts.filter((d) => d.title.toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      <SidebarHeader title="Saved Queries">
        <Tooltip content="New query" shortcut="Mod+T">
          <Button variant="quiet" size="icon-sm" aria-label="New query" onClick={() => newQuery()}>
            <Plus />
          </Button>
        </Tooltip>
      </SidebarHeader>
      <SearchField value={search} onChange={setSearch} placeholder="Filter queries" />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {visible.length === 0 ? (
          <EmptyState
            icon={<FileCode2 />}
            title={search ? 'No matching queries' : 'No saved queries'}
            description={search ? undefined : 'Queries you write are kept here automatically.'}
          />
        ) : (
          visible.map((draft) => (
            <ContextMenu key={draft.id}>
              <ContextMenuTrigger asChild>
                <ListRow
                  active={activeTab?.kind === 'sql' && activeTab.draftId === draft.id}
                  onClick={() => openDraft(draft.id)}
                >
                  <FileCode2 className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-xs">{draft.title}</span>
                      {draft.sql !== draft.savedSql && (
                        <span title="Unsaved changes" className="size-1.5 shrink-0 rounded-full bg-primary" />
                      )}
                    </span>
                    <span className="block truncate font-mono text-2xs text-muted-foreground">
                      {draft.sql.trim().split('\n').pop() || 'Empty'}
                    </span>
                  </span>
                </ListRow>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem onSelect={() => openDraft(draft.id)}>
                  <FileCode2 /> Open
                </ContextMenuItem>
                <ContextMenuItem
                  onSelect={() =>
                    openPromptModal({
                      title: 'Rename query',
                      subtitle: 'Choose a name that says what this query is for.',
                      fieldLabel: 'Name',
                      initialValue: draft.title,
                      onConfirm: (title) => updateDraft({ ...draft, title }),
                    })
                  }
                >
                  <Pencil /> Rename…
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem
                  destructive
                  onSelect={() =>
                    openDangerModal({
                      title: `Delete “${draft.title}”?`,
                      subtitle: 'This removes the saved query from this device.',
                      message: 'The query text cannot be recovered afterwards.',
                      actionText: 'Delete query',
                      onConfirm: () => {
                        tabs
                          .filter((t) => t.kind === 'sql' && t.draftId === draft.id)
                          .forEach((t) => closeTab(t.id));
                        deleteDraft(draft.id);
                      },
                    })
                  }
                >
                  <Trash2 /> Delete…
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          ))
        )}
      </div>
    </>
  );
};

const ChatSidebar: React.FC = () => {
  const { conversations, openNewConversation, deleteConversation, renameConversation } = useChat();
  const { openChat, activeTab, tabs, closeTab } = useWorkspace();
  const { openPromptModal, openDangerModal } = useStudio();
  const [search, setSearch] = useState('');
  const visible = conversations.filter(
    (c) => c.messages.length > 0 && c.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <SidebarHeader title="Conversations">
        <Tooltip content="New conversation" shortcut="Mod+Shift+L">
          <Button variant="quiet" size="icon-sm" aria-label="New conversation" onClick={openNewConversation}>
            <Plus />
          </Button>
        </Tooltip>
      </SidebarHeader>
      <SearchField value={search} onChange={setSearch} placeholder="Filter conversations" />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {visible.length === 0 ? (
          <EmptyState
            icon={<MessageSquare />}
            title={search ? 'No matching conversations' : 'No conversations yet'}
            description={search ? undefined : 'Ask a question about your database to start one.'}
          />
        ) : (
          visible.map((conversation) => (
            <ContextMenu key={conversation.id}>
              <ContextMenuTrigger asChild>
                <ListRow
                  active={activeTab?.kind === 'ai' && activeTab.conversationId === conversation.id}
                  onClick={() => openChat(conversation.id)}
                >
                  <MessageSquare className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs">{conversation.title}</span>
                    <span className="block text-2xs text-muted-foreground">
                      {pluralize(conversation.messages.filter((m) => m.role === 'user').length, 'question')} ·{' '}
                      {formatRelativeTime(conversation.updatedAt)}
                    </span>
                  </span>
                </ListRow>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem
                  onSelect={() =>
                    openPromptModal({
                      title: 'Rename conversation',
                      subtitle: 'Shown in the conversation list and on its tab.',
                      fieldLabel: 'Name',
                      initialValue: conversation.title,
                      onConfirm: (title) => renameConversation(conversation.id, title),
                    })
                  }
                >
                  <Pencil /> Rename…
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem
                  destructive
                  onSelect={() =>
                    openDangerModal({
                      title: 'Delete this conversation?',
                      subtitle: conversation.title,
                      message: 'Its messages cannot be recovered afterwards.',
                      actionText: 'Delete conversation',
                      onConfirm: () => {
                        tabs
                          .filter((t) => t.kind === 'ai' && t.conversationId === conversation.id)
                          .forEach((t) => closeTab(t.id));
                        deleteConversation(conversation.id);
                      },
                    })
                  }
                >
                  <Trash2 /> Delete…
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          ))
        )}
      </div>
    </>
  );
};

const HistorySidebar: React.FC = () => {
  const { history, clearHistory, newQuery } = useWorkspace();
  const { openDangerModal, showToast, activeProfile } = useStudio();
  const [search, setSearch] = useState('');
  const visible = useMemo(() => {
    const q = search.toLowerCase();
    return q ? history.filter((h) => h.sql.toLowerCase().includes(q) || h.connectionName.toLowerCase().includes(q)) : history;
  }, [history, search]);

  return (
    <>
      <SidebarHeader title="Query History">
        <Tooltip content="Clear history">
          <Button
            variant="quiet"
            size="icon-sm"
            aria-label="Clear history"
            disabled={history.length === 0}
            onClick={() =>
              openDangerModal({
                title: 'Clear query history?',
                subtitle: `${pluralize(history.length, 'entry', 'entries')} on this device`,
                message: 'This only removes the list of past queries. It does not touch any database.',
                actionText: 'Clear history',
                onConfirm: clearHistory,
              })
            }
          >
            <Trash2 />
          </Button>
        </Tooltip>
      </SidebarHeader>
      <SearchField value={search} onChange={setSearch} placeholder="Filter history" />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {visible.length === 0 ? (
          <EmptyState
            icon={<MoreHorizontal />}
            title={search ? 'Nothing matches that filter' : 'No queries run yet'}
            description={search ? undefined : 'Every query you run is listed here.'}
          />
        ) : (
          visible.map((item) => (
            <ContextMenu key={item.id}>
              <ContextMenuTrigger asChild>
                <ListRow onClick={() => newQuery(item.sql, 'From history', activeProfile?.id)} title={item.sql}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-xxs text-foreground">{item.sql}</span>
                    <span className="mt-0.5 flex items-center gap-1.5 truncate text-2xs text-muted-foreground">
                      <span className="truncate">{item.connectionName}</span>
                      <span>·</span>
                      <span className="shrink-0">{pluralize(item.rowCount, 'row')}</span>
                      <span>·</span>
                      <span className="shrink-0">{formatDuration(item.durationMs)}</span>
                      <span>·</span>
                      <span className="shrink-0">{formatRelativeTime(item.executedAt)}</span>
                    </span>
                  </span>
                </ListRow>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem onSelect={() => newQuery(item.sql, 'From history', activeProfile?.id)}>
                  <Check /> Open in new query
                </ContextMenuItem>
                <ContextMenuItem
                  onSelect={() => {
                    window.electronAPI.copyToClipboard(item.sql);
                    showToast('Query copied', 'info');
                  }}
                >
                  <Copy /> Copy SQL
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          ))
        )}
      </div>
    </>
  );
};

export const SidePanel: React.FC = () => {
  const { activity } = useWorkspace();
  return (
    <aside className="flex h-full min-w-0 flex-col bg-sidebar">
      {activity === 'explorer' && <DatabaseExplorer />}
      {activity === 'sql' && <DraftsSidebar />}
      {activity === 'ai' && <ChatSidebar />}
      {activity === 'history' && <HistorySidebar />}
    </aside>
  );
};
