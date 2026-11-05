import React, { useEffect, useMemo, useRef } from 'react';
import { AlertTriangle, Cable, Check, ChevronDown, Eraser, MessageSquare, Plus, RefreshCw, Sparkles } from 'lucide-react';
import { ChatMessage, useChat } from '../../context/ChatContext';
import { useStudio } from '../../context/StudioContext';
import { useSchema } from '../../context/SchemaContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { cn, formatCount } from '../../lib/utils';
import { ConnectionSelect } from '../Workbench/ConnectionSelect';
import { Button } from '../ui/button';
import { CopyButton, EmptyState, Skeleton } from '../ui/feedback';
import { Tooltip } from '../ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/menu';
import { ChatComposer, composerHint } from './ChatComposer';
import { MessageContent } from './MessageContent';
import { SqlBlock } from './SqlBlock';

const Assistant: React.FC<{ conversationId: string; message: ChatMessage; isLast: boolean }> = ({ conversationId, message, isLast }) => {
  const { regenerate } = useChat();
  const waiting = message.status === 'streaming' && !message.content;
  const streaming = message.status === 'streaming';
  const summary = message.execution?.status === 'success' && message.execution.rowCount !== undefined
    ? `Returned ${formatCount(message.execution.rowCount)} ${message.execution.rowCount === 1 ? 'row' : 'rows'} across ${message.execution.columnCount} ${message.execution.columnCount === 1 ? 'column' : 'columns'}.`
    : null;

  return (
    <div className="group/message flex gap-2.5" aria-busy={streaming}>
      <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md border border-border bg-chrome">
        <Sparkles className="size-3.5 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        {waiting ? (
          <div aria-label="Generating a reply" className="space-y-2 pt-1.5">
            <Skeleton className="h-2.5 w-3/5" />
            <Skeleton className="h-2.5 w-2/5" />
          </div>
        ) : message.status === 'error' ? (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/[0.06] p-2.5">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium">The assistant could not answer</p>
              <p className="selectable mt-0.5 break-words text-xs leading-5 text-muted-foreground">{message.content}</p>
              <Button variant="outline" size="sm" className="mt-2" onClick={() => regenerate(conversationId, message.id)}>
                <RefreshCw /> Try again
              </Button>
            </div>
          </div>
        ) : (
          <MessageContent content={message.content} hideSql={message.sql} />
        )}
        {message.status === 'stopped' && <p className="mt-1 text-xxs text-muted-foreground">Stopped</p>}
        {message.sql && message.status === 'done' && <SqlBlock conversationId={conversationId} message={message} />}
        {summary && <p className="mt-1.5 text-xs text-muted-foreground">{summary}</p>}
        {!streaming && message.status !== 'error' && message.content && (
          <div className={cn('mt-1 flex items-center gap-0.5 transition-opacity duration-75', isLast ? '' : 'opacity-0 focus-within:opacity-100 group-hover/message:opacity-100')}>
            <CopyButton text={message.content} label="Copy message" />
            <Tooltip content="Regenerate">
              <Button variant="quiet" size="icon-xs" aria-label="Regenerate" onClick={() => regenerate(conversationId, message.id)}>
                <RefreshCw />
              </Button>
            </Tooltip>
          </div>
        )}
      </div>
    </div>
  );
};

const User: React.FC<{ message: ChatMessage }> = ({ message }) => (
  <div className="group/message flex items-start justify-end gap-1">
    <div className="mt-1.5 opacity-0 transition-opacity duration-75 focus-within:opacity-100 group-hover/message:opacity-100">
      <CopyButton text={message.content} label="Copy message" />
    </div>
    <div className="selectable max-w-[85%] whitespace-pre-wrap break-words rounded-lg bg-secondary px-3 py-1.5 text-sm leading-[22px]">
      {message.content}
    </div>
  </div>
);

export const AiChatView: React.FC<{ conversationId: string; active: boolean }> = ({ conversationId, active }) => {
  const { conversations, ask, stop, setConversationProfile, clearConversation, openNewConversation, autoRun, setAutoRun } = useChat();
  const { profiles, activeProfile, connectionStates, connectProfile, settings, updateSettings, setActiveProfileId } = useStudio();
  const { schemas } = useSchema();
  const { openSingleton } = useWorkspace();

  const conversation = conversations.find((c) => c.id === conversationId);
  const profileId = conversation?.profileId ?? activeProfile?.id ?? null;
  const profile = profiles.find((p) => p.id === profileId);
  const connected = profile ? connectionStates[profile.id]?.state === 'connected' : false;
  const schema = profileId ? schemas[profileId] : undefined;
  const messages = conversation?.messages ?? [];
  const streaming = messages.some((m) => m.status === 'streaming');

  useEffect(() => {
    if (conversation && !conversation.profileId && activeProfile) {
      setConversationProfile(conversation.id, activeProfile.id);
    }
  }, [conversation, activeProfile, setConversationProfile]);

  useEffect(() => {
    if (active && profileId) setActiveProfileId(profileId);
    // Only when the tab comes to the front: changing connection elsewhere must not be overridden.
  }, [active]);

  // Follow new content only while the reader is already at the bottom.
  const scrollerRef = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const lastContent = messages[messages.length - 1]?.content;
  const lastStatus = messages[messages.length - 1]?.execution?.status;
  useEffect(() => {
    const el = scrollerRef.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [messages.length, lastContent, lastStatus]);

  const suggestions = useMemo(() => {
    const tables = [...new Set(schema?.tables.filter((t) => t.type === 'TABLE').map((t) => t.name))];
    if (tables.length === 0) return [];
    const [first, second] = tables;
    return [
      `Show the 10 most recent rows in ${first}`,
      `How many rows does ${first} have?`,
      second ? `What is the relationship between ${first} and ${second}?` : `Which columns of ${first} are often empty?`,
      'List every table with its primary key',
    ];
  }, [schema?.tables]);

  if (!conversation) {
    return (
      <EmptyState
        icon={<MessageSquare />}
        title="This conversation no longer exists"
        action={
          <Button size="sm" onClick={openNewConversation}>
            <Plus /> New conversation
          </Button>
        }
      />
    );
  }

  const send = (text: string) => {
    pinned.current = true;
    if (!conversation.profileId && profileId) setConversationProfile(conversation.id, profileId);
    ask(conversation.id, text);
  };

  const composer = (
    <ChatComposer
      active={active}
      streaming={streaming}
      placeholder={messages.length === 0 ? 'Ask about your data' : 'Ask a follow-up'}
      onSend={send}
      onStop={() => stop(conversation.id)}
      footer={
        <>
          <ConnectionSelect side="top" value={profileId} onChange={(id) => setConversationProfile(conversation.id, id)} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="quiet" size="sm" aria-label="Model and run options">
                <Sparkles />
                <span className="max-w-40 truncate">{settings.aiModel}</span>
                <ChevronDown />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" className="min-w-60">
              <DropdownMenuLabel>Provider</DropdownMenuLabel>
              {(
                [
                  { value: 'ollama', label: 'Ollama (runs locally)' },
                  { value: 'openai', label: 'OpenAI or compatible' },
                ] as const
              ).map(({ value, label }) => (
                <DropdownMenuItem key={value} onSelect={() => updateSettings({ aiProvider: value })}>
                  {label}
                  {settings.aiProvider === value && <Check className="ml-auto" />}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem onSelect={() => openSingleton('settings')}>Model settings…</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem checked={autoRun} onCheckedChange={(v) => setAutoRun(Boolean(v))}>
                Run read-only queries automatically
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      }
    />
  );

  const privacyNote = (
    <p className="mt-1.5 text-center text-2xs text-muted-foreground">
      {composerHint()}. The model sees your schema, never your rows. Queries run read-only.
    </p>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {messages.length === 0 ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-6 py-8">
          <div className="w-full max-w-2xl">
            <h1 className="text-base font-semibold">
              {profile ? `Ask about ${profile.name}` : 'Ask about your database'}
            </h1>
            <p className="mb-3 mt-0.5 text-xs text-muted-foreground">
              {connected && schema?.status === 'ready'
                ? `I can see ${formatCount(schema.tables.length)} tables and views. Answers run as read-only queries, and the results appear here.`
                : 'Connect a database so answers use your real tables and columns.'}
            </p>
            {composer}
            {privacyNote}
            {!connected && profile && (
              <Button variant="outline" size="sm" className="mt-3" onClick={() => connectProfile(profile)}>
                <Cable /> Connect to {profile.name}
              </Button>
            )}
            {suggestions.length > 0 && (
              <div className="mt-4">
                <p className="section-label mb-1">Try asking</p>
                <div className="flex flex-col">
                  {suggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => send(suggestion)}
                      className="-mx-2 truncate rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors duration-75 hover:bg-accent hover:text-foreground"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="flex h-8 shrink-0 items-center justify-between border-b border-border pl-3 pr-1.5">
            <span className="min-w-0 truncate text-xs text-muted-foreground">{conversation.title}</span>
            <div className="flex shrink-0 items-center gap-0.5">
              <Tooltip content="Clear this conversation">
                <Button variant="quiet" size="icon-sm" aria-label="Clear conversation" disabled={streaming} onClick={() => clearConversation(conversation.id)}>
                  <Eraser />
                </Button>
              </Tooltip>
              <Tooltip content="New conversation" shortcut="Mod+Shift+L">
                <Button variant="quiet" size="icon-sm" aria-label="New conversation" onClick={openNewConversation}>
                  <Plus />
                </Button>
              </Tooltip>
            </div>
          </div>
          <div
            ref={scrollerRef}
            onScroll={(e) => {
              const el = e.currentTarget;
              pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
            }}
            className="min-h-0 flex-1 overflow-y-auto"
          >
            <div className="mx-auto w-full max-w-3xl space-y-5 px-5 py-5" aria-live="polite">
              {messages.map((message, i) =>
                message.role === 'user' ? (
                  <User key={message.id} message={message} />
                ) : (
                  <Assistant key={message.id} conversationId={conversation.id} message={message} isLast={i === messages.length - 1} />
                )
              )}
            </div>
          </div>
          <div className="shrink-0 px-5 pb-3">
            <div className="mx-auto w-full max-w-3xl">
              {composer}
              {privacyNote}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
