import crypto from 'node:crypto';
import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ChatOllama } from '@langchain/ollama';
import { ChatOpenAI } from '@langchain/openai';
import type { AiChatRequest, AiEvent, WorkspaceSettings } from '../../../shared/types';
import { AiService } from '../AiService';
import type { ConnectionManager } from '../ConnectionManager';
import { engineInfo } from '../../../shared/engines';
import { SqlClassifier } from '../SqlClassifier';
import { type AgentModel, runAgentTurn } from './agent';
import { ChatMemoryStore } from './memory';

interface ActiveRequest {
  controller: AbortController;
  /** Reviews waiting on a person, by query id. */
  reviews: Map<string, (approved: boolean) => void>;
  queries: { profileId: string; cancelled: Set<string> };
}

function createModel(settings: WorkspaceSettings) {
  if (settings.aiProvider === 'openai') {
    const model = settings.aiModel || 'gpt-4o-mini';
    return new ChatOpenAI({
      model,
      apiKey: settings.aiApiKey || 'not-needed',
      configuration: { baseURL: settings.aiEndpoint || 'https://api.openai.com/v1' },
      // These models accept only their default temperature.
      ...(/^(o\d|gpt-5)/i.test(model) ? {} : { temperature: 0.2 }),
      useResponsesApi: false,
      maxRetries: 1,
    });
  }
  return new ChatOllama({
    model: settings.aiModel || 'codellama',
    baseUrl: settings.aiEndpoint || 'http://localhost:11434',
    temperature: 0.2,
    maxRetries: 1,
  });
}

/** Connects the agent to the app: the model, the database, memory and the review UI. */
export class ChatAgentService {
  private active = new Map<string, ActiveRequest>();
  private memory: ChatMemoryStore;
  /** Models found not to support tool calling, so later turns skip the failed attempt. */
  private noToolModels = new Set<string>();

  constructor(
    private readonly connections: ConnectionManager,
    private readonly getSettings: () => WorkspaceSettings,
    memoryPath: string
  ) {
    this.memory = new ChatMemoryStore(memoryPath);
  }

  public async chat(request: AiChatRequest, send: (event: AiEvent) => void): Promise<void> {
    const settings = this.getSettings();
    const controller = new AbortController();
    const active: ActiveRequest = {
      controller,
      reviews: new Map(),
      queries: { profileId: request.profileId ?? '', cancelled: new Set() },
    };
    this.active.set(request.requestId, active);

    const { conversationId, turnId, prompt, profileId } = request;
    const profile = profileId ? this.connections.getProfile(profileId) : undefined;
    // Only databases whose query language the assistant is prepared for get the query tools.
    const canQuery = Boolean(profileId && this.connections.isConnected(profileId) && engineInfo(profile?.engine).features.aiQueries);
    const modelKey = `${settings.aiProvider}:${settings.aiModel}`;
    const model = createModel(settings);

    // Conversations from before this memory existed bring their words along once.
    if (!this.memory.has(conversationId) && request.seedHistory?.length) {
      this.memory.appendTurn(
        conversationId,
        'seed',
        request.seedHistory.map((m) => (m.role === 'user' ? new HumanMessage(m.content) : new AIMessage(m.content)))
      );
    }

    let replyStarted = false;
    const emit = (event: AiEvent) => {
      if (event.type === 'text' || event.type === 'query-start') replyStarted = true;
      send(event);
    };

    const deps = {
      model: model as unknown as AgentModel,
      toolsSupported: !this.noToolModels.has(modelKey),
      onToolsUnsupported: () => this.noToolModels.add(modelKey),
      signal: controller.signal,
      emit,
      createId: () => crypto.randomUUID(),
      checkSafe: (sql: string) =>
        profileId && this.connections.isConnected(profileId)
          ? this.connections.checkStrictReadOnly(profileId, sql)
          : SqlClassifier.checkStrictReadOnly(sql),
      runReadOnly: (sql: string, queryId: string) => this.connections.executeReadOnly(profileId!, sql, queryId),
      runApproved: (sql: string, queryId: string) => {
        // The token is issued at the moment of approval and is bound to this exact statement.
        const prepared = this.connections.prepareQuery(profileId!, sql);
        return this.connections.executeQuery(profileId!, sql, prepared.proposal?.approvalToken, queryId);
      },
      requestReview: (queryId: string) =>
        new Promise<boolean>((resolve) => {
          if (controller.signal.aborted) {
            resolve(false);
            return;
          }
          active.reviews.set(queryId, resolve);
        }),
      wasCancelled: (queryId: string) => active.queries.cancelled.has(queryId),
      describeTable: async (table: string, schema?: string) => {
        if (!profileId) return 'No database is connected.';
        const structure = await this.connections.getTableStructure(profileId, table, schema);
        return JSON.stringify({
          table: structure.tableName,
          columns: structure.columns.map((c) => ({ name: c.name, type: c.typeName, nullable: c.nullable, primaryKey: c.primaryKey })),
          foreignKeys: structure.foreignKeys,
          indexes: structure.indexes.map((i) => ({ name: i.name, columns: i.columns, unique: i.isUnique })),
        });
      },
    };

    const turn = {
      prompt,
      history: this.memory.messages(conversationId),
      summary: this.memory.summary(conversationId),
      schemaContext: request.schemaContext,
      connectionName: profile?.name ?? null,
      engineName: profile ? engineInfo(profile.engine).label : null,
      canQuery,
      queryUnsupported: Boolean(profileId && this.connections.isConnected(profileId) && !canQuery),
      autoRun: request.autoRun,
      shareResults: Boolean(settings.aiShareResults),
      queryLanguage: engineInfo(profile?.engine).queryLanguage,
    };

    try {
      const outcome = await runAgentTurn(turn, deps);
      this.memory.appendTurn(conversationId, turnId, outcome.memory);
      send({ type: 'done' });
      // Happens after the reply so a slow summary never holds it up.
      this.compact(conversationId, model).catch((err) =>
        console.error(`Could not summarize conversation memory: ${err.message}`)
      );
    } catch (err: any) {
      if (controller.signal.aborted) {
        send({ type: 'done' });
        return;
      }
      // The model is unreachable. For a question that maps to a simple read, the local engine can still help.
      const fallback = !replyStarted && canQuery ? AiService.heuristicSql(prompt, request.schemaContext) : undefined;
      if (fallback) {
        const reason = this.describeModelError(err, settings);
        send({ type: 'text', delta: `*The AI model could not be reached (${reason}). Here is a query from the local engine instead.*\n\n` });
        const offline = await runAgentTurn(
          { ...turn, canQuery: true },
          { ...deps, toolsSupported: false, model: staticModel(`\`\`\`sql\n${fallback}\n\`\`\``) }
        );
        this.memory.appendTurn(conversationId, turnId, offline.memory);
        send({ type: 'done' });
        return;
      }
      throw new Error(this.describeModelError(err, settings));
    } finally {
      for (const resolve of active.reviews.values()) resolve(false);
      this.active.delete(request.requestId);
    }
  }

  private describeModelError(err: any, settings: WorkspaceSettings): string {
    const message = String(err?.message ?? err);
    if (settings.aiProvider === 'ollama' && /fetch failed|ECONNREFUSED|not found/i.test(message)) {
      return `Could not use Ollama model "${settings.aiModel}" at ${settings.aiEndpoint}. Check that Ollama is running and the model is pulled, or change the provider in Settings. (${message})`;
    }
    return message;
  }

  private compact(conversationId: string, model: ReturnType<typeof createModel>): Promise<void> {
    return this.memory.compact(conversationId, async (previous, transcript) => {
      const response = await model.invoke([
        new SystemMessage(
          'Condense this conversation between a user and a database assistant into a short factual summary for the assistant to use later. Keep the goals, decisions, tables involved, assumptions and preferences. Do not include data values.'
        ),
        new HumanMessage(`${previous ? `Existing summary:\n${previous}\n\n` : ''}Conversation to add:\n${transcript}`),
      ]);
      return typeof response.content === 'string' ? response.content : '';
    });
  }

  /** A decision from the review card. This is the only way a pending statement can proceed. */
  public review(requestId: string, queryId: string, approved: boolean): void {
    const active = this.active.get(requestId);
    const resolve = active?.reviews.get(queryId);
    if (!active || !resolve) return;
    active.reviews.delete(queryId);
    resolve(approved);
  }

  public cancel(requestId: string): void {
    const active = this.active.get(requestId);
    if (!active) return;
    active.controller.abort();
    for (const resolve of active.reviews.values()) resolve(false);
    active.reviews.clear();
    if (active.queries.profileId) {
      this.connections.cancelQuery(active.queries.profileId).catch(() => undefined);
    }
  }

  public async cancelQuery(requestId: string, queryId: string): Promise<void> {
    const active = this.active.get(requestId);
    if (!active) return;
    active.queries.cancelled.add(queryId);
    await this.connections.cancelQuery(active.queries.profileId, queryId);
  }

  public forget(conversationId: string, fromTurnId?: string): void {
    if (fromTurnId) this.memory.forgetFrom(conversationId, fromTurnId);
    else this.memory.clear(conversationId);
  }
}

/** Stands in for the model when it is unreachable, so offline answers take the same checked route. */
function staticModel(text: string): AgentModel {
  let served = false;
  return {
    stream: async () =>
      (async function* () {
        if (served) return;
        served = true;
        yield { content: text, tool_calls: [], concat: (other: any) => other } as any;
      })(),
  };
}
