import electron from 'electron';
const { app, BrowserWindow, ipcMain } = electron;
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { StorageService } from './services/StorageService';
import { ConnectionManager } from './services/ConnectionManager';
import { AiService } from './services/AiService';
import { ConnectionProfile, FilterRule, SqlDraft, WorkspaceSettings } from '../shared/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;
const storage = new StorageService();
const connections = new ConnectionManager();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#18191c',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  setupIpc();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

function setupIpc() {
  // Profiles
  ipcMain.handle('profiles:get', () => storage.getProfiles());
  ipcMain.handle('profiles:save', (_, p: ConnectionProfile) => storage.saveProfile(p));
  ipcMain.handle('profiles:delete', (_, id: string) => storage.deleteProfile(id));
  ipcMain.handle('profiles:test', (_, p: ConnectionProfile) => connections.testConnection(p));

  // DB Sessions
  ipcMain.handle('db:connect', (_, p: ConnectionProfile, pwd?: string) => connections.connect(p, pwd));
  ipcMain.handle('db:disconnect', (_, id: string) => connections.disconnect(id));
  ipcMain.handle('db:tables', (_, id: string) => connections.getTables(id));
  ipcMain.handle('db:columns', (_, id: string, table: string) => connections.getColumns(id, table));
  ipcMain.handle('db:structure', (_, id: string, table: string) => connections.getTableStructure(id, table));
  ipcMain.handle(
    'db:data',
    (
      _,
      id: string,
      table: string,
      limit: number,
      offset: number,
      sortCol?: string,
      sortDesc?: boolean,
      rules?: FilterRule[],
      matchAny?: boolean
    ) => connections.getTableData(id, table, limit, offset, sortCol, sortDesc, rules, matchAny)
  );

  // Queries
  ipcMain.handle('query:prepare', (_, id: string, sql: string) => connections.prepareQuery(id, sql));
  ipcMain.handle('query:execute', (_, id: string, sql: string, token?: string) =>
    connections.executeQuery(id, sql, token)
  );
  ipcMain.handle('query:explain', (_, id: string, sql: string) => connections.explainQuery(id, sql));
  ipcMain.handle('ai:ask', (_, prompt: string, schema: string, settings: WorkspaceSettings) =>
    AiService.ask(prompt, schema, settings)
  );
  ipcMain.handle('query:cancel', () => {
    // Cancellation handler
  });

  // Drafts
  ipcMain.handle('drafts:get', () => storage.getDrafts());
  ipcMain.handle('drafts:save', (_, d: SqlDraft) => storage.saveDraft(d));
  ipcMain.handle('drafts:delete', (_, id: string) => storage.deleteDraft(id));

  // History
  ipcMain.handle('history:get', () => storage.getHistory());
  ipcMain.handle('history:add', (_, item: any) => storage.addHistory(item));
  ipcMain.handle('history:clear', () => storage.clearHistory());

  // Settings
  ipcMain.handle('settings:get', () => storage.getSettings());
  ipcMain.handle('settings:save', (_, s: Partial<WorkspaceSettings>) => storage.saveSettings(s));
}
