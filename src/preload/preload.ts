import electron from 'electron';
const { contextBridge, ipcRenderer, clipboard } = electron;
import {
  AiChatRequest,
  AiEvent,
  ConnectionProfile,
  FilterRule,
  SqlDraft,
  WorkspaceSettings,
} from "../shared/types";

contextBridge.exposeInMainWorld("electronAPI", {
  isSecureStorageAvailable: () => ipcRenderer.invoke("storage:secure-available"),

  // Profiles
  getProfiles: () => ipcRenderer.invoke("profiles:get"),
  saveProfile: (p: ConnectionProfile) => ipcRenderer.invoke("profiles:save", p),
  deleteProfile: (id: string) => ipcRenderer.invoke("profiles:delete", id),
  testConnection: (p: ConnectionProfile) =>
    ipcRenderer.invoke("profiles:test", p),

  // Database Sessions
  connect: (p: ConnectionProfile, pwd?: string) =>
    ipcRenderer.invoke("db:connect", p, pwd),
  disconnect: (id: string) => ipcRenderer.invoke("db:disconnect", id),
  getTables: (id: string) => ipcRenderer.invoke("db:tables", id),
  getColumns: (id: string, table: string, schema?: string) =>
    ipcRenderer.invoke("db:columns", id, table, schema),
  getAllColumns: (id: string) => ipcRenderer.invoke("db:all-columns", id),
  getTableStructure: (id: string, table: string, schema?: string) =>
    ipcRenderer.invoke("db:structure", id, table, schema),
  getTableData: (
    id: string,
    table: string,
    limit: number,
    offset: number,
    sortCol?: string,
    sortDesc?: boolean,
    rules?: FilterRule[],
    matchAny?: boolean,
    schema?: string,
  ) =>
    ipcRenderer.invoke(
      "db:data",
      id,
      table,
      limit,
      offset,
      sortCol,
      sortDesc,
      rules,
      matchAny,
      schema,
    ),
  getTableCount: (
    id: string,
    table: string,
    rules?: FilterRule[],
    matchAny?: boolean,
    schema?: string,
  ) => ipcRenderer.invoke("db:count", id, table, rules, matchAny, schema),

  // Queries
  prepareQuery: (id: string, sql: string) =>
    ipcRenderer.invoke("query:prepare", id, sql),
  executeQuery: (id: string, sql: string, token?: string, runId?: string) =>
    ipcRenderer.invoke("query:execute", id, sql, token, runId),
  executeReadOnlyQuery: (id: string, sql: string, runId?: string) =>
    ipcRenderer.invoke("query:execute-read-only", id, sql, runId),
  explainQuery: (id: string, sql: string) =>
    ipcRenderer.invoke("query:explain", id, sql),
  cancelQuery: (id: string, runId?: string) =>
    ipcRenderer.invoke("query:cancel", id, runId),

  // Drafts
  getDrafts: () => ipcRenderer.invoke("drafts:get"),
  saveDraft: (d: SqlDraft) => ipcRenderer.invoke("drafts:save", d),
  deleteDraft: (id: string) => ipcRenderer.invoke("drafts:delete", id),

  // History
  getHistory: () => ipcRenderer.invoke("history:get"),
  addHistory: (item: any) => ipcRenderer.invoke("history:add", item),
  clearHistory: () => ipcRenderer.invoke("history:clear"),

  // Settings
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (s: Partial<WorkspaceSettings>) =>
    ipcRenderer.invoke("settings:save", s),

  // AI Assistant
  aiChat: (request: AiChatRequest) => ipcRenderer.invoke("ai:chat", request),
  onAiEvent: (listener: (requestId: string, event: AiEvent) => void) => {
    const handler = (_: unknown, requestId: string, event: AiEvent) => listener(requestId, event);
    ipcRenderer.on("ai:event", handler);
    return () => ipcRenderer.removeListener("ai:event", handler);
  },
  cancelAi: (requestId: string) => ipcRenderer.invoke("ai:cancel", requestId),
  reviewAiQuery: (requestId: string, queryId: string, approved: boolean) =>
    ipcRenderer.invoke("ai:review", requestId, queryId, approved),
  cancelAiQuery: (requestId: string, queryId: string) =>
    ipcRenderer.invoke("ai:cancel-query", requestId, queryId),
  forgetAiMemory: (conversationId: string, fromTurnId?: string) =>
    ipcRenderer.invoke("ai:forget", conversationId, fromTurnId),

  // Clipboard
  copyToClipboard: async (text: string) => {
    clipboard.writeText(text);
  },

  // System
  platform: process.platform,
  setWindowTheme: (theme: "dark" | "light") =>
    ipcRenderer.invoke("window:set-theme", theme),
  onMenuCommand: (listener: (command: string) => void) => {
    const handler = (_: unknown, command: string) => listener(command);
    ipcRenderer.on("menu:command", handler);
    return () => ipcRenderer.removeListener("menu:command", handler);
  },
});
