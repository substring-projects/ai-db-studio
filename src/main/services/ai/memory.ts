import fs from 'node:fs';
import path from 'node:path';
import { BaseListChatMessageHistory } from '@langchain/core/chat_history';
import {
  type BaseMessage,
  type StoredMessage,
  mapChatMessagesToStoredMessages,
  mapStoredMessagesToChatMessages,
} from '@langchain/core/messages';

/** Above this much text a conversation's oldest turns are folded into its summary. */
const MAX_HISTORY_CHARS = 24_000;
const KEEP_RECENT_TURNS = 6;

interface StoredTurn {
  /** The id of the user message that started the turn, so a turn can be forgotten on regenerate. */
  id: string;
  messages: StoredMessage[];
}

interface StoredConversation {
  summary: string;
  turns: StoredTurn[];
  updatedAt: number;
}

interface MemoryFile {
  version: 1;
  conversations: Record<string, StoredConversation>;
}

const textOf = (message: BaseMessage): string =>
  typeof message.content === 'string' ? message.content : JSON.stringify(message.content);

/**
 * Durable conversation memory, one JSON file in the app's data directory.
 * It holds what was said and which queries ran, never result rows: the agent writes
 * only the words of each turn here, so rows cannot resurface in a later prompt.
 */
export class ChatMemoryStore {
  private readonly filePath: string;
  private data: MemoryFile;

  constructor(filePath: string) {
    this.filePath = filePath;
    this.data = this.read();
  }

  private read(): MemoryFile {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
      if (parsed?.version === 1 && parsed.conversations) return parsed;
    } catch {
      // Missing or unreadable: conversations just start without earlier memory.
    }
    return { version: 1, conversations: {} };
  }

  /** Writes through a temp file, so a crash mid-write cannot corrupt existing memory. */
  private write(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temp = `${this.filePath}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(this.data), 'utf-8');
    fs.renameSync(temp, this.filePath);
  }

  private conversation(id: string): StoredConversation {
    this.data.conversations[id] ??= { summary: '', turns: [], updatedAt: Date.now() };
    return this.data.conversations[id];
  }

  public has(conversationId: string): boolean {
    return Boolean(this.data.conversations[conversationId]?.turns.length || this.data.conversations[conversationId]?.summary);
  }

  public summary(conversationId: string): string {
    return this.data.conversations[conversationId]?.summary ?? '';
  }

  /** The LangChain view of one conversation. */
  public history(conversationId: string): ConversationHistory {
    return new ConversationHistory(this, conversationId);
  }

  public messages(conversationId: string): BaseMessage[] {
    const turns = this.data.conversations[conversationId]?.turns ?? [];
    return mapStoredMessagesToChatMessages(turns.flatMap((t) => t.messages));
  }

  public appendTurn(conversationId: string, turnId: string, messages: BaseMessage[]): void {
    const conversation = this.conversation(conversationId);
    conversation.turns.push({ id: turnId, messages: mapChatMessagesToStoredMessages(messages) });
    conversation.updatedAt = Date.now();
    this.write();
  }

  /** Forgets one turn and everything after it, so a regenerated answer starts clean. */
  public forgetFrom(conversationId: string, turnId: string): void {
    const conversation = this.data.conversations[conversationId];
    if (!conversation) return;
    const index = conversation.turns.findIndex((t) => t.id === turnId);
    if (index < 0) return;
    conversation.turns = conversation.turns.slice(0, index);
    this.write();
  }

  public clear(conversationId: string): void {
    if (!this.data.conversations[conversationId]) return;
    delete this.data.conversations[conversationId];
    this.write();
  }

  /**
   * Folds the oldest turns into the summary once the conversation grows too long.
   * A failed summary only delays this: nothing is removed until a new summary exists.
   */
  public async compact(
    conversationId: string,
    summarize: (previous: string, transcript: string) => Promise<string>
  ): Promise<void> {
    const conversation = this.data.conversations[conversationId];
    if (!conversation || conversation.turns.length <= KEEP_RECENT_TURNS) return;
    const size = JSON.stringify(conversation.turns).length;
    if (size <= MAX_HISTORY_CHARS) return;

    const older = conversation.turns.slice(0, -KEEP_RECENT_TURNS);
    const transcript = mapStoredMessagesToChatMessages(older.flatMap((t) => t.messages))
      .map((m) => `${m.getType() === 'human' ? 'User' : 'Assistant'}: ${textOf(m)}`)
      .join('\n');

    const summary = await summarize(conversation.summary, transcript);
    if (!summary.trim()) return;
    conversation.summary = summary.trim();
    conversation.turns = conversation.turns.slice(-KEEP_RECENT_TURNS);
    this.write();
  }
}

export class ConversationHistory extends BaseListChatMessageHistory {
  lc_namespace = ['ai_db_studio', 'memory'];
  private readonly store: ChatMemoryStore;
  private readonly conversationId: string;

  constructor(store: ChatMemoryStore, conversationId: string) {
    super();
    this.store = store;
    this.conversationId = conversationId;
  }

  async getMessages(): Promise<BaseMessage[]> {
    return this.store.messages(this.conversationId);
  }

  async addMessage(message: BaseMessage): Promise<void> {
    this.store.appendTurn(this.conversationId, `turn-${Date.now()}`, [message]);
  }

  async clear(): Promise<void> {
    this.store.clear(this.conversationId);
  }
}
