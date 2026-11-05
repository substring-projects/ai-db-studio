import React from 'react';
import { Check, ChevronDown, Eraser, ExternalLink, Plus, X } from 'lucide-react';
import { useChat } from '../../context/ChatContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { formatRelativeTime } from '../../lib/utils';
import { AiChatView } from '../ai/AiChatView';
import { Button } from '../ui/button';
import { Tooltip } from '../ui/tooltip';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '../ui/menu';

/** The AI chat docked beside the workspace, sharing its conversations with the AI tabs. */
export const AiPanel: React.FC = () => {
  const { conversations, panelConversationId, setPanelConversationId, newPanelConversation, clearConversation } = useChat();
  const { setAiPanelOpen, openChat } = useWorkspace();

  const conversation = conversations.find((c) => c.id === panelConversationId);
  const streaming = conversation?.messages.some((m) => m.status === 'streaming') ?? false;
  const recent = conversations.filter((c) => c.messages.length > 0).sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <aside aria-label="AI assistant" className="flex h-full min-w-0 flex-col bg-background">
      <div className="flex h-[33px] shrink-0 items-center gap-0.5 border-b border-border bg-chrome pl-1 pr-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="quiet" size="sm" aria-label="Choose a conversation" className="min-w-0 flex-1 justify-start text-xs text-foreground">
              <span className="min-w-0 truncate">{conversation?.title ?? 'AI assistant'}</span>
              <ChevronDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-72">
            <DropdownMenuItem onSelect={newPanelConversation}>
              <Plus /> New conversation
            </DropdownMenuItem>
            {recent.length > 0 && <DropdownMenuLabel>Recent</DropdownMenuLabel>}
            {recent.slice(0, 15).map((c) => (
              <DropdownMenuItem key={c.id} onSelect={() => setPanelConversationId(c.id)}>
                <span className="min-w-0 flex-1 truncate">{c.title}</span>
                <span className="shrink-0 text-2xs text-muted-foreground">{formatRelativeTime(c.updatedAt)}</span>
                {c.id === panelConversationId && <Check />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Tooltip content="New conversation">
          <Button variant="quiet" size="icon-sm" aria-label="New conversation in panel" onClick={newPanelConversation}>
            <Plus />
          </Button>
        </Tooltip>
        <Tooltip content="Clear this conversation">
          <Button
            variant="quiet"
            size="icon-sm"
            aria-label="Clear conversation in panel"
            disabled={streaming || !conversation?.messages.length}
            onClick={() => conversation && clearConversation(conversation.id)}
          >
            <Eraser />
          </Button>
        </Tooltip>
        <Tooltip content="Open as a tab">
          <Button
            variant="quiet"
            size="icon-sm"
            aria-label="Open conversation as a tab"
            disabled={!conversation}
            onClick={() => {
              if (!conversation) return;
              openChat(conversation.id);
              setAiPanelOpen(false);
            }}
          >
            <ExternalLink />
          </Button>
        </Tooltip>
        <Tooltip content="Hide AI panel" shortcut="Mod+L">
          <Button variant="quiet" size="icon-sm" aria-label="Hide AI panel" onClick={() => setAiPanelOpen(false)}>
            <X />
          </Button>
        </Tooltip>
      </div>
      <div className="min-h-0 flex-1">
        {conversation && <AiChatView key={conversation.id} conversationId={conversation.id} active docked />}
      </div>
    </aside>
  );
};
