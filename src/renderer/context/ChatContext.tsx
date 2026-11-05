import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AiEvent, QueryResult } from '../../shared/types';
import { cleanError, useStudio } from './StudioContext';
import { useSchema } from './SchemaContext';
import { useWorkspace } from './WorkspaceContext';
import { buildSchemaContext } from '../lib/sql';
import { createId, formatCount, formatDuration, prefs } from '../lib/utils';

export type QueryStatus = 'idle' | 'review' | 'running' | 'success' | 'error' | 'declined' | 'cancelled';

export interface QueryPart {
  type: 'query';
  id: string;
  sql: string;
  /** Passed the strict read-only check, so it could run without a person. */
  readOnly: boolean;
  /** Why the check did not pass. */
  reason?: string;
  status: QueryStatus;
  profileId?: string;
  error?: string;
  durationMs?: number;
  rowCount?: number;
  columnCount?: number;
  isCommand?: boolean;
  /** Rows stay in memory on this device and are never persisted. */
  result?: QueryResult;
}

export type MessagePart = { type: 'text'; text: string } | QueryPart;

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  /** The message's text, for copying and earlier messages. */
  content: string;
  parts: MessagePart[];
  timestamp: number;
  status: 'streaming' | 'done' | 'error' | 'stopped';
  requestId?: string;
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
  /** The conversation shown in the right side panel. */
  panelConversationId: string | null;
  setPanelConversationId: (id: string) => void;
  newPanelConversation: () => void;
  deleteConversation: (id: string) => void;
  renameConversation: (id: string, title: string) => void;
  setConversationProfile: (id: string, profileId: string | null) => void;
  clearConversation: (id: string) => void;
  ask: (conversationId: string, text: string) => Promise<void>;
  regenerate: (conversationId: string, messageId: string) => void;
  stop: (conversationId: string) => void;
  reviewQuery: (conversationId: string, messageId: string, queryId: string, approved: boolean) => void;
  rerunQuery: (conversationId: string, messageId: string, queryId: string) => Promise<void>;
  cancelQuery: (conversationId: string, messageId: string, queryId: string) => void;
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
      messages: c.messages.map(({ requestId, ...m }) => ({
        ...m,
        status: m.status === 'streaming' ? ('stopped' as const) : m.status,
        parts: m.parts.map((part) => {
          if (part.type === 'text') return part;
          const { result, ...rest } = part;
          // A statement mid-review or mid-run cannot resume after a restart.
          const interrupted = part.status === 'running' || part.status === 'review';
          return { ...rest, status: interrupted ? ('idle' as const) : part.status };
        }),
      })),
    }));
}

/** Conversations saved by earlier versions kept one query per message, in other fields. */
function migrate(saved: any[]): Conversation[] {
  return saved.map((c) => ({
    ...c,
    messages: (c.messages ?? []).map((m: any) => {
      if (m.parts) return m;
      const parts: MessagePart[] = [];
      if (m.content) parts.push({ type: 'text', text: m.content });
      if (m.sql) {
        parts.push({
          type: 'query',
          id: createId('query'),
          sql: m.sql,
          readOnly: m.execution?.status !== 'blocked',
          status: m.execution?.status === 'blocked' ? 'declined' : m.execution?.status ?? 'idle',
          profileId: m.execution?.profileId,
          error: m.execution?.error,
          durationMs: m.execution?.durationMs,
          rowCount: m.execution?.rowCount,
          columnCount: m.execution?.columnCount,
        });
      }
      return { ...m, parts };
    }),
  }));
}

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { profiles, activeProfile, showToast } = useStudio();
  const { schemas, loadSchema } = useSchema();
  const { openChat, appendLog, addHistory, tabs, activeTab, aiPanelOpen } = useWorkspace();

  const [conversations, setConversationsState] = useState<Conversation[]>(() => migrate(prefs.get<any[]>(STORAGE_KEY, [])));
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
  const autoRunRef = useRef(autoRun);
  autoRunRef.current = autoRun;
  const profilesRef = useRef(profiles);
  profilesRef.current = profiles;
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;
  const aiPanelOpenRef = useRef(aiPanelOpen);
  aiPanelOpenRef.current = aiPanelOpen;
  const panelConversationIdRef = useRef<string | null>(null);

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

  const patchQuery = useCallback(
    (conversationId: string, messageId: string, queryId: string, patch: Partial<QueryPart>) => {
      patchMessage(conversationId, messageId, (m) => ({
        ...m,
        parts: m.parts.map((part) => (part.type === 'query' && part.id === queryId ? { ...part, ...patch } : part)),
      }));
    },
    [patchMessage]
  );

  // Which message each in-flight request is writing to.
  const requests = useRef(
    new Map<string, { conversationId: string; messageId: string; profileId: string | null; onDone: () => void }>()
  );

  const applyEvent = useCallback(
    (requestId: string, event: AiEvent) => {
      const target = requests.current.get(requestId);
      if (!target) return;
      const { conversationId, messageId, profileId } = target;
      const conversation = conversationsRef.current.find((c) => c.id === conversationId);
      const message = conversation?.messages.find((m) => m.id === messageId);
      const profile = profilesRef.current.find((p) => p.id === profileId);

      switch (event.type) {
        case 'text':
          patchMessage(conversationId, messageId, (m) => {
            const last = m.parts[m.parts.length - 1];
            const parts: MessagePart[] =
              last?.type === 'text'
                ? [...m.parts.slice(0, -1), { type: 'text', text: last.text + event.delta }]
                : [...m.parts, { type: 'text', text: event.delta }];
            return { ...m, content: m.content + event.delta, parts };
          });
          break;
        case 'query-start':
          patchMessage(conversationId, messageId, (m) => ({
            ...m,
            parts: [
              ...m.parts,
              {
                type: 'query',
                id: event.id,
                sql: event.sql,
                readOnly: event.readOnly,
                reason: event.reason,
                status: event.needsReview ? 'review' : 'running',
                profileId: profileId ?? undefined,
              },
            ],
          }));
          if (event.needsReview) {
            const inTab = activeTabRef.current?.kind === 'ai' && activeTabRef.current.conversationId === conversationId;
            const inPanel = aiPanelOpenRef.current && panelConversationIdRef.current === conversationId;
            const looking = inTab || inPanel;
            if (!looking) showToast('A statement from the AI assistant is waiting for your review.', 'warning');
          }
          break;
        case 'query-approved':
          patchQuery(conversationId, messageId, event.id, { status: 'running' });
          break;
        case 'query-declined': {
          patchQuery(conversationId, messageId, event.id, { status: 'declined' });
          const sql = message?.parts.find((p): p is QueryPart => p.type === 'query' && p.id === event.id)?.sql;
          appendLog({ level: 'info', source: 'ai', sql, message: 'AI statement declined in review' });
          break;
        }
        case 'query-cancelled':
          patchQuery(conversationId, messageId, event.id, { status: 'cancelled' });
          break;
        case 'query-result': {
          const { result } = event;
          const sql = message?.parts.find((p): p is QueryPart => p.type === 'query' && p.id === event.id)?.sql ?? '';
          const wasWrite = message?.parts.some((p) => p.type === 'query' && p.id === event.id && !p.readOnly);
          patchQuery(conversationId, messageId, event.id, {
            status: 'success',
            result,
            error: undefined,
            durationMs: result.executionTimeMs,
            rowCount: result.rowCount,
            columnCount: result.columns.length,
            isCommand: result.isCommand,
          });
          appendLog({
            level: 'success',
            source: 'ai',
            sql,
            message: `AI query: ${formatCount(result.rowCount)} rows in ${formatDuration(result.executionTimeMs)}`,
          });
          addHistory({ sql, durationMs: result.executionTimeMs, rowCount: result.rowCount, connectionName: profile?.name ?? 'AI assistant' });
          if (wasWrite && profileId) loadSchema(profileId);
          break;
        }
        case 'query-error': {
          const sql = message?.parts.find((p): p is QueryPart => p.type === 'query' && p.id === event.id)?.sql;
          patchQuery(conversationId, messageId, event.id, { status: 'error', error: event.error });
          appendLog({ level: 'error', source: 'ai', sql, message: event.error });
          break;
        }
        case 'done':
          target.onDone();
          break;
      }
    },
    [addHistory, appendLog, loadSchema, patchMessage, patchQuery, showToast]
  );

  useEffect(() => window.electronAPI.onAiEvent(applyEvent), [applyEvent]);

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

  /** An empty conversation to start from: reuses a blank one rather than piling them up. */
  const blankConversation = useCallback((): string => {
    const blank = conversationsRef.current.find((c) => c.messages.length === 0);
    if (blank) return blank.id;
    const id = createId('chat');
    const now = Date.now();
    setConversations((prev) => [
      { id, title: 'New conversation', profileId: activeProfile?.id ?? null, messages: [], createdAt: now, updatedAt: now },
      ...prev,
    ]);
    return id;
  }, [activeProfile?.id, setConversations]);

  const [panelConversationId, setPanelConversationIdState] = useState<string | null>(() =>
    prefs.get<string | null>('studio:aiPanelConversation', null)
  );
  panelConversationIdRef.current = panelConversationId;
  const setPanelConversationId = useCallback((id: string) => {
    setPanelConversationIdState(id);
    prefs.set('studio:aiPanelConversation', id);
  }, []);
  const newPanelConversation = useCallback(
    () => setPanelConversationId(blankConversation()),
    [blankConversation, setPanelConversationId]
  );

  // The panel always shows a conversation: the last one it had, else the one on screen, else the latest.
  useEffect(() => {
    if (!aiPanelOpen) return;
    const known = (id: string | null) => conversationsRef.current.some((c) => c.id === id);
    if (known(panelConversationId)) return;
    const onScreen = activeTabRef.current?.kind === 'ai' ? activeTabRef.current.conversationId : null;
    if (known(onScreen)) {
      setPanelConversationId(onScreen!);
      return;
    }
    const latest = [...conversationsRef.current]
      .filter((c) => c.messages.length > 0)
      .sort((a, b) => b.updatedAt - a.updatedAt)[0];
    setPanelConversationId(latest?.id ?? blankConversation());
  }, [aiPanelOpen, conversations, panelConversationId, blankConversation, setPanelConversationId]);

  const deleteConversation = useCallback(
    (id: string) => {
      window.electronAPI.forgetAiMemory(id).catch(() => undefined);
      setConversations((prev) => prev.filter((c) => c.id !== id));
    },
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
    (id: string) => {
      window.electronAPI.forgetAiMemory(id).catch(() => undefined);
      patchConversation(id, (c) => ({ ...c, messages: [], title: 'New conversation' }));
    },
    [patchConversation]
  );

  const requestReply = useCallback(
    async (conversationId: string, turnId: string, text: string, priorMessages: ChatMessage[]) => {
      const conversation = conversationsRef.current.find((c) => c.id === conversationId);
      const profileId = conversation?.profileId ?? null;
      const profile = profilesRef.current.find((p) => p.id === profileId);
      const schema = profileId ? schemasRef.current[profileId] : undefined;
      const requestId = createId('ai');
      const replyId = createId('msg');

      // Events and the call's reply travel separately, and the reply can arrive first.
      // 'done' is always the last event, so it marks when every event has been applied.
      let onDone = () => {};
      const allEventsApplied = new Promise<void>((resolve) => {
        onDone = resolve;
      });
      requests.current.set(requestId, { conversationId, messageId: replyId, profileId, onDone });
      patchConversation(conversationId, (c) => ({
        ...c,
        updatedAt: Date.now(),
        messages: [
          ...c.messages,
          { id: replyId, role: 'assistant', content: '', parts: [], timestamp: Date.now(), status: 'streaming', requestId },
        ],
      }));

      const settle = (patch: Partial<ChatMessage>) =>
        patchMessage(conversationId, replyId, (m) => ({
          ...(m.status === 'streaming' ? { ...m, ...patch } : m),
          requestId: undefined,
          // Nothing can answer once the request is over, so no statement may stay live.
          parts: (m.status === 'streaming' && patch.parts ? patch.parts : m.parts).map((part) =>
            part.type === 'query' && (part.status === 'running' || part.status === 'review')
              ? { ...part, status: 'cancelled' as const }
              : part
          ),
        }));

      try {
        await window.electronAPI.aiChat({
          requestId,
          conversationId,
          turnId,
          prompt: text,
          profileId,
          schemaContext: schema ? buildSchemaContext(profile?.engine, schema.tables, schema.columns) : '',
          autoRun: autoRunRef.current,
          seedHistory: priorMessages
            .filter((m) => m.status === 'done')
            .map((m) => ({ role: m.role, content: m.content })),
        });
        await allEventsApplied;
        settle({ status: 'done' });
      } catch (err) {
        const message = cleanError(err, 'The AI request failed.');
        settle({ status: 'error', content: message, parts: [{ type: 'text', text: message }] });
        appendLog({ level: 'error', source: 'ai', message });
      } finally {
        requests.current.delete(requestId);
      }
    },
    [appendLog, patchConversation, patchMessage]
  );

  const ask = useCallback(
    async (conversationId: string, text: string) => {
      const conversation = conversationsRef.current.find((c) => c.id === conversationId);
      if (!conversation || conversation.messages.some((m) => m.status === 'streaming')) return;
      const userMessage: ChatMessage = {
        id: createId('msg'),
        role: 'user',
        content: text,
        parts: [{ type: 'text', text }],
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
      await requestReply(conversationId, userMessage.id, text, prior);
    },
    [patchConversation, requestReply]
  );

  const regenerate = useCallback(
    async (conversationId: string, messageId: string) => {
      const conversation = conversationsRef.current.find((c) => c.id === conversationId);
      if (!conversation) return;
      const index = conversation.messages.findIndex((m) => m.id === messageId);
      const question = conversation.messages.slice(0, index).reverse().find((m) => m.role === 'user');
      if (!question) return;
      const questionIndex = conversation.messages.indexOf(question);
      await window.electronAPI.forgetAiMemory(conversationId, question.id).catch(() => undefined);
      patchConversation(conversationId, (c) => ({ ...c, messages: c.messages.slice(0, questionIndex + 1) }));
      requestReply(conversationId, question.id, question.content, conversation.messages.slice(0, questionIndex));
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

  const reviewQuery = useCallback(
    (conversationId: string, messageId: string, queryId: string, approved: boolean) => {
      const message = conversationsRef.current.find((c) => c.id === conversationId)?.messages.find((m) => m.id === messageId);
      if (message?.requestId) window.electronAPI.reviewAiQuery(message.requestId, queryId, approved).catch(() => undefined);
    },
    []
  );

  /** Runs a finished read query again. Only statements that passed the read-only check qualify. */
  const rerunQuery = useCallback(
    async (conversationId: string, messageId: string, queryId: string) => {
      const conversation = conversationsRef.current.find((c) => c.id === conversationId);
      const part = conversation?.messages
        .find((m) => m.id === messageId)
        ?.parts.find((p): p is QueryPart => p.type === 'query' && p.id === queryId);
      const profileId = conversation?.profileId;
      if (!part?.readOnly || !profileId) return;
      patchQuery(conversationId, messageId, queryId, { status: 'running', error: undefined, profileId });
      try {
        const result = await window.electronAPI.executeReadOnlyQuery(profileId, part.sql, queryId);
        patchQuery(conversationId, messageId, queryId, {
          status: 'success',
          result,
          durationMs: result.executionTimeMs,
          rowCount: result.rowCount,
          columnCount: result.columns.length,
        });
      } catch (err) {
        patchQuery(conversationId, messageId, queryId, { status: 'error', error: cleanError(err, 'Query failed') });
      }
    },
    [patchQuery]
  );

  const cancelQuery = useCallback(
    (conversationId: string, messageId: string, queryId: string) => {
      const conversation = conversationsRef.current.find((c) => c.id === conversationId);
      const message = conversation?.messages.find((m) => m.id === messageId);
      patchQuery(conversationId, messageId, queryId, { status: 'cancelled' });
      if (message?.requestId) {
        window.electronAPI.cancelAiQuery(message.requestId, queryId).catch(() => undefined);
      } else if (conversation?.profileId) {
        window.electronAPI.cancelQuery(conversation.profileId, queryId).catch(() => undefined);
      }
    },
    [patchQuery]
  );

  const value = useMemo<ChatContextType>(
    () => ({
      conversations,
      openNewConversation,
      panelConversationId,
      setPanelConversationId,
      newPanelConversation,
      deleteConversation,
      renameConversation,
      setConversationProfile,
      clearConversation,
      ask,
      regenerate,
      stop,
      reviewQuery,
      rerunQuery,
      cancelQuery,
      autoRun,
      setAutoRun,
    }),
    [
      conversations,
      openNewConversation,
      panelConversationId,
      setPanelConversationId,
      newPanelConversation,
      deleteConversation,
      renameConversation,
      setConversationProfile,
      clearConversation,
      ask,
      regenerate,
      stop,
      reviewQuery,
      rerunQuery,
      cancelQuery,
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
