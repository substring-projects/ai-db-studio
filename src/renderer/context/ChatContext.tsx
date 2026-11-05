import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AiMessage, QueryResult } from '../../shared/types';
import { cleanError, useStudio } from './StudioContext';
import { useSchema } from './SchemaContext';
import { useWorkspace } from './WorkspaceContext';
import { buildSchemaContext } from '../lib/sql';
import { createId, formatCount, formatDuration, prefs } from '../lib/utils';

export interface SqlExecution {
  status: 'idle' | 'running' | 'success' | 'error' | 'blocked' | 'cancelled';
  runId?: string;
  profileId?: string;
  error?: string;
  durationMs?: number;
  rowCount?: number;
  columnCount?: number;
  /** Rows stay in memory on this device: never persisted and never sent to the model. */
  result?: QueryResult;
}

export interface ChatMessage extends AiMessage {
  status: 'streaming' | 'done' | 'error' | 'stopped';
  requestId?: string;
  execution?: SqlExecution;
}

export interface Conversation {
  id: string;
  title: string;
  profileId: string | null;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

interface ChatContextType {
  conversations: Conversation[];
  openNewConversation: () => void;
  deleteConversation: (id: string) => void;
  renameConversation: (id: string, title: string) => void;
  setConversationProfile: (id: string, profileId: string | null) => void;
  clearConversation: (id: string) => void;
  ask: (conversationId: string, text: string) => Promise<void>;
  regenerate: (conversationId: string, messageId: string) => void;
  stop: (conversationId: string) => void;
  runMessageSql: (conversationId: string, messageId: string) => Promise<void>;
  cancelMessageSql: (conversationId: string, messageId: string) => void;
  autoRun: boolean;
  setAutoRun: (value: boolean) => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

const STORAGE_KEY = 'studio:conversations';
const MAX_CONVERSATIONS = 50;

/** What gets persisted: the conversation and run statistics, but no result rows. */
function serialize(conversations: Conversation[]): Conversation[] {
  return conversations
    .filter((c) => c.messages.length > 0)
    .slice(0, MAX_CONVERSATIONS)
    .map((c) => ({
      ...c,
      messages: c.messages.map(({ execution, requestId, ...m }) => ({
        ...m,
        status: m.status === 'streaming' ? ('stopped' as const) : m.status,
        execution: execution && {
          status: execution.status === 'running' ? ('idle' as const) : execution.status,
          error: execution.error,
          durationMs: execution.durationMs,
          rowCount: execution.rowCount,
          columnCount: execution.columnCount,
          profileId: execution.profileId,
        },
      })),
    }));
}

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { profiles, activeProfile, connectedProfileIds, settings, showToast } = useStudio();
  const { schemas } = useSchema();
  const { openChat, appendLog, addHistory, tabs } = useWorkspace();

  const [conversations, setConversationsState] = useState<Conversation[]>(() => prefs.get(STORAGE_KEY, []));
  const [autoRun, setAutoRunState] = useState<boolean>(() => prefs.get('studio:ai:autoRun', true));
  const setAutoRun = useCallback((value: boolean) => {
    setAutoRunState(value);
    prefs.set('studio:ai:autoRun', value);
  }, []);

  // The ref is the source of truth for async flows: they must see updates made a moment ago.
  const conversationsRef = useRef(conversations);
  const setConversations = useCallback((update: (prev: Conversation[]) => Conversation[]) => {
    conversationsRef.current = update(conversationsRef.current);
    setConversationsState(conversationsRef.current);
  }, []);

  const schemasRef = useRef(schemas);
  schemasRef.current = schemas;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const connectedRef = useRef(connectedProfileIds);
  connectedRef.current = connectedProfileIds;
  const autoRunRef = useRef(autoRun);
  autoRunRef.current = autoRun;

  // Persist quietly; a burst of stream chunks collapses into one write.
  useEffect(() => {
    const handle = setTimeout(() => prefs.set(STORAGE_KEY, serialize(conversations)), 400);
    return () => clearTimeout(handle);
  }, [conversations]);

  // Restored tabs can point at a blank conversation that was not persisted: recreate it.
  useEffect(() => {
    const missing = tabs.filter(
      (t) => t.kind === 'ai' && !conversationsRef.current.some((c) => c.id === t.conversationId)
    );
    if (missing.length === 0) return;
    const now = Date.now();
    setConversations((prev) => [
      ...missing.map((t) => ({
        id: (t as { conversationId: string }).conversationId,
        title: 'New conversation',
        profileId: activeProfile?.id ?? null,
        messages: [],
        createdAt: now,
        updatedAt: now,
      })),
      ...prev,
    ]);
  }, [tabs, activeProfile?.id, setConversations]);

  const patchConversation = useCallback(
    (id: string, patch: (c: Conversation) => Conversation) => {
      setConversations((prev) => prev.map((c) => (c.id === id ? patch(c) : c)));
    },
    [setConversations]
  );

  const patchMessage = useCallback(
    (conversationId: string, messageId: string, patch: (m: ChatMessage) => ChatMessage) => {
      patchConversation(conversationId, (c) => ({
        ...c,
        messages: c.messages.map((m) => (m.id === messageId ? patch(m) : m)),
      }));
    },
    [patchConversation]
  );

  useEffect(
    () =>
      window.electronAPI.onAiChunk((requestId, delta) => {
        setConversations((prev) =>
          prev.map((c) =>
            c.messages.some((m) => m.requestId === requestId)
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.requestId === requestId ? { ...m, content: m.content + delta } : m
                  ),
                }
              : c
          )
        );
      }),
    [setConversations]
  );

  const openNewConversation = useCallback(() => {
    // Reuse an empty conversation rather than piling up blank ones.
    const blank = conversationsRef.current.find((c) => c.messages.length === 0);
    if (blank) {
      openChat(blank.id);
      return;
    }
    const id = createId('chat');
    const now = Date.now();
    setConversations((prev) => [
      { id, title: 'New conversation', profileId: activeProfile?.id ?? null, messages: [], createdAt: now, updatedAt: now },
      ...prev,
    ]);
    openChat(id);
  }, [activeProfile?.id, openChat, setConversations]);

  const deleteConversation = useCallback(
    (id: string) => setConversations((prev) => prev.filter((c) => c.id !== id)),
    [setConversations]
  );
  const renameConversation = useCallback(
    (id: string, title: string) => patchConversation(id, (c) => ({ ...c, title })),
    [patchConversation]
  );
  const setConversationProfile = useCallback(
    (id: string, profileId: string | null) => patchConversation(id, (c) => ({ ...c, profileId })),
    [patchConversation]
  );
  const clearConversation = useCallback(
    (id: string) => patchConversation(id, (c) => ({ ...c, messages: [], title: 'New conversation' })),
    [patchConversation]
  );

  const runMessageSql = useCallback(
    async (conversationId: string, messageId: string) => {
      const conversation = conversationsRef.current.find((c) => c.id === conversationId);
      const message = conversation?.messages.find((m) => m.id === messageId);
      const profileId = conversation?.profileId;
      if (!message?.sql || !profileId) return;
      if (!connectedRef.current.includes(profileId)) {
        showToast('Connect to the database to run this query.', 'warning');
        return;
      }
      const profile = profiles.find((p) => p.id === profileId);
      const runId = createId('run');
      const sql = message.sql;
      patchMessage(conversationId, messageId, (m) => ({
        ...m,
        execution: { status: 'running', runId, profileId },
      }));

      try {
        // Only this read-only path is ever used for AI SQL. It accepts no approval token.
        const result = await window.electronAPI.executeReadOnlyQuery(profileId, sql, runId);
        patchMessage(conversationId, messageId, (m) =>
          m.execution?.runId === runId && m.execution.status === 'running'
            ? {
                ...m,
                execution: {
                  status: 'success',
                  profileId,
                  result,
                  durationMs: result.executionTimeMs,
                  rowCount: result.rowCount,
                  columnCount: result.columns.length,
                },
              }
            : m
        );
        appendLog({
          level: 'success',
          source: 'ai',
          sql,
          message: `AI query: ${formatCount(result.rowCount)} rows in ${formatDuration(result.executionTimeMs)}`,
        });
        addHistory({
          sql,
          durationMs: result.executionTimeMs,
          rowCount: result.rowCount,
          connectionName: profile?.name ?? 'AI assistant',
        });
      } catch (err) {
        const text = cleanError(err, 'Query failed');
        const blocked = text.startsWith('Blocked:');
        patchMessage(conversationId, messageId, (m) =>
          m.execution?.runId === runId && m.execution.status === 'running'
            ? { ...m, execution: { status: blocked ? 'blocked' : 'error', profileId, error: text } }
            : m
        );
        appendLog({ level: blocked ? 'warning' : 'error', source: 'ai', sql, message: text });
      }
    },
    [addHistory, appendLog, patchMessage, profiles, showToast]
  );

  const cancelMessageSql = useCallback(
    (conversationId: string, messageId: string) => {
      const conversation = conversationsRef.current.find((c) => c.id === conversationId);
      const execution = conversation?.messages.find((m) => m.id === messageId)?.execution;
      if (execution?.status !== 'running' || !execution.profileId) return;
      patchMessage(conversationId, messageId, (m) => ({
        ...m,
        execution: { ...m.execution!, status: 'cancelled' },
      }));
      window.electronAPI.cancelQuery(execution.profileId, execution.runId).catch(() => undefined);
    },
    [patchMessage]
  );

  const requestReply = useCallback(
    async (conversationId: string, text: string, priorMessages: ChatMessage[]) => {
      const conversation = conversationsRef.current.find((c) => c.id === conversationId);
      const profileId = conversation?.profileId ?? null;
      const profile = profiles.find((p) => p.id === profileId);
      const schema = profileId ? schemasRef.current[profileId] : undefined;
      const requestId = createId('ai');
      const replyId = createId('msg');

      patchConversation(conversationId, (c) => ({
        ...c,
        updatedAt: Date.now(),
        messages: [
          ...c.messages,
          { id: replyId, role: 'assistant', content: '', timestamp: Date.now(), status: 'streaming', requestId },
        ],
      }));

      try {
        const context = schema ? buildSchemaContext(profile?.engine, schema.tables, schema.columns) : '';
        // Only the words of the conversation are sent. Results and rows never are.
        const history = priorMessages
          .filter((m) => m.status === 'done' || m.role === 'user')
          .map((m) => ({ role: m.role, content: m.content }));
        const res = await window.electronAPI.askAi(text, context, settingsRef.current, history, requestId);

        const current = conversationsRef.current
          .find((c) => c.id === conversationId)
          ?.messages.find((m) => m.id === replyId);
        if (!current || current.status === 'stopped') return;

        patchMessage(conversationId, replyId, (m) => ({
          ...m,
          content: res.content,
          sql: res.sql,
          status: 'done',
          requestId: undefined,
          execution: res.sql ? { status: 'idle' } : undefined,
        }));

        if (res.sql && autoRunRef.current && profileId && connectedRef.current.includes(profileId)) {
          await runMessageSql(conversationId, replyId);
        }
      } catch (err) {
        const current = conversationsRef.current
          .find((c) => c.id === conversationId)
          ?.messages.find((m) => m.id === replyId);
        // Stop already settled the message; the abort surfacing here is not an error.
        if (!current || current.status === 'stopped') return;
        const message = cleanError(err, 'The AI request failed.');
        patchMessage(conversationId, replyId, (m) => ({
          ...m,
          content: message,
          status: 'error',
          requestId: undefined,
        }));
        appendLog({ level: 'error', source: 'ai', message });
      }
    },
    [appendLog, patchConversation, patchMessage, profiles, runMessageSql]
  );

  const ask = useCallback(
    async (conversationId: string, text: string) => {
      const conversation = conversationsRef.current.find((c) => c.id === conversationId);
      if (!conversation || conversation.messages.some((m) => m.status === 'streaming')) return;
      const userMessage: ChatMessage = {
        id: createId('msg'),
        role: 'user',
        content: text,
        timestamp: Date.now(),
        status: 'done',
      };
      const prior = conversation.messages;
      patchConversation(conversationId, (c) => ({
        ...c,
        title: c.messages.length === 0 ? text.slice(0, 60) : c.title,
        updatedAt: Date.now(),
        messages: [...c.messages, userMessage],
      }));
      await requestReply(conversationId, text, prior);
    },
    [patchConversation, requestReply]
  );

  const regenerate = useCallback(
    (conversationId: string, messageId: string) => {
      const conversation = conversationsRef.current.find((c) => c.id === conversationId);
      if (!conversation) return;
      const index = conversation.messages.findIndex((m) => m.id === messageId);
      const question = conversation.messages.slice(0, index).reverse().find((m) => m.role === 'user');
      if (!question) return;
      const questionIndex = conversation.messages.indexOf(question);
      patchConversation(conversationId, (c) => ({ ...c, messages: c.messages.slice(0, questionIndex + 1) }));
      requestReply(conversationId, question.content, conversation.messages.slice(0, questionIndex));
    },
    [patchConversation, requestReply]
  );

  const stop = useCallback(
    (conversationId: string) => {
      const conversation = conversationsRef.current.find((c) => c.id === conversationId);
      const streaming = conversation?.messages.find((m) => m.status === 'streaming');
      if (!streaming?.requestId) return;
      window.electronAPI.cancelAi(streaming.requestId).catch(() => undefined);
      patchMessage(conversationId, streaming.id, (m) => ({ ...m, status: 'stopped', requestId: undefined }));
    },
    [patchMessage]
  );

  const value = useMemo<ChatContextType>(
    () => ({
      conversations,
      openNewConversation,
      deleteConversation,
      renameConversation,
      setConversationProfile,
      clearConversation,
      ask,
      regenerate,
      stop,
      runMessageSql,
      cancelMessageSql,
      autoRun,
      setAutoRun,
    }),
    [
      conversations,
      openNewConversation,
      deleteConversation,
      renameConversation,
      setConversationProfile,
      clearConversation,
      ask,
      regenerate,
      stop,
      runMessageSql,
      cancelMessageSql,
      autoRun,
      setAutoRun,
    ]
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};

export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) throw new Error('useChat must be used within a ChatProvider');
  return context;
};
