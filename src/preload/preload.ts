import electron from 'electron';
const { contextBridge, ipcRenderer, clipboard } = electron;
import {
  ConnectionProfile,
  FilterRule,
  SqlDraft,
  WorkspaceSettings,
} from "../shared/types";

contextBridge.exposeInMainWorld("electronAPI", {
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
  getColumns: (id: string, table: string) =>
    ipcRenderer.invoke("db:columns", id, table),
  getTableData: (
    id: string,
    table: string,
    limit: number,
    offset: number,
    sortCol?: string,
    sortDesc?: boolean,
    rules?: FilterRule[],
    matchAny?: boolean,
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
    ),

  // Queries
  prepareQuery: (id: string, sql: string) =>
    ipcRenderer.invoke("query:prepare", id, sql),
  executeQuery: (id: string, sql: string, token?: string) =>
    ipcRenderer.invoke("query:execute", id, sql, token),
  cancelQuery: (id: string) => ipcRenderer.invoke("query:cancel", id),

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

  // Clipboard
  copyToClipboard: async (text: string) => {
    clipboard.writeText(text);
  },
});
