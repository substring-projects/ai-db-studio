import electron from 'electron';
const { app, BrowserWindow, ipcMain, Menu } = electron;
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { StorageService } from './services/StorageService';
import { ConnectionManager } from './services/ConnectionManager';
import { ChatAgentService } from './services/ai/ChatAgentService';
import { AiChatRequest, ConnectionProfile, FilterRule, SqlDraft, WorkspaceSettings } from '../shared/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;
const storage = new StorageService();
const connections = new ConnectionManager();
let chatAgent: ChatAgentService;

const WINDOW_THEME = {
  dark: { background: '#111318', symbols: '#98A1AD' },
  light: { background: '#FFFFFF', symbols: '#667085' },
} as const;
const TITLE_BAR_HEIGHT = 36;

/**
 * Native menu. Its main job is keeping the standard Edit and Window roles while routing
 * Cmd/Ctrl+W to "close tab": the default menu would close the whole window instead.
 */
function setupMenu() {
  const send = (command: string) => () => mainWindow?.webContents.send('menu:command', command);
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' as const }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Query', accelerator: 'CmdOrCtrl+T', click: send('new-query') },
        { label: 'Save Query', accelerator: 'CmdOrCtrl+S', click: send('save-query') },
        { type: 'separator' },
        { label: 'Close Tab', accelerator: 'CmdOrCtrl+W', click: send('close-tab') },
        ...(process.platform === 'darwin' ? [] : [{ role: 'quit' as const }]),
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { label: 'Command Palette', accelerator: 'CmdOrCtrl+K', click: send('command-palette') },
        { label: 'Toggle Sidebar', accelerator: 'CmdOrCtrl+B', click: send('toggle-sidebar') },
        { label: 'Toggle Bottom Panel', accelerator: 'CmdOrCtrl+J', click: send('toggle-panel') },
        { label: 'Toggle AI Panel', accelerator: 'CmdOrCtrl+L', click: send('toggle-ai-panel') },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(process.env.VITE_DEV_SERVER_URL ? [{ role: 'reload' as const }, { role: 'toggleDevTools' as const }] : []),
      ],
    },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function resolveAppIcon(): string | undefined {
  const candidates = [
    path.join(__dirname, '../build/icon.png'),
    path.join(__dirname, '../build/icon.ico'),
    path.join(__dirname, '../build/icon.icns'),
    path.join(__dirname, '../src/renderer/assets/logo.png'),
    path.join(process.resourcesPath, 'build/icon.png'),
    path.join(process.resourcesPath, 'icon.png'),
  ];
  return candidates.find((p) => fs.existsSync(p));
}

function createWindow() {
  const iconPath = resolveAppIcon();
  const palette = WINDOW_THEME[storage.getSettings().theme === 'light' ? 'light' : 'dark'];

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    trafficLightPosition: { x: 12, y: 11 },
    // Without an overlay, Windows and Linux would have no window controls in a hidden title bar.
    ...(process.platform === 'darwin'
      ? {}
      : { titleBarOverlay: { color: palette.background, symbolColor: palette.symbols, height: TITLE_BAR_HEIGHT } }),
    icon: iconPath,
    backgroundColor: palette.background,
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
  chatAgent = new ChatAgentService(connections, () => storage.getSettings(), path.join(app.getPath('userData'), 'ai-memory.json'));
  setupIpc();
  setupMenu();
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
  ipcMain.handle('db:columns', (_, id: string, table: string, schema?: string) =>
    connections.getColumns(id, table, schema)
  );
  ipcMain.handle('db:all-columns', (_, id: string) => connections.getAllTableColumns(id));
  ipcMain.handle('db:structure', (_, id: string, table: string, schema?: string) =>
    connections.getTableStructure(id, table, schema)
  );
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
      matchAny?: boolean,
      schema?: string
    ) => connections.getTableData(id, table, limit, offset, sortCol, sortDesc, rules, matchAny, schema)
  );
  ipcMain.handle('db:count', (_, id: string, table: string, rules?: FilterRule[], matchAny?: boolean, schema?: string) =>
    connections.getTableCount(id, table, rules, matchAny, schema)
  );

  // Queries
  ipcMain.handle('query:prepare', (_, id: string, sql: string) => connections.prepareQuery(id, sql));
  ipcMain.handle('query:execute', (_, id: string, sql: string, token?: string, runId?: string) =>
    connections.executeQuery(id, sql, token, runId)
  );
  ipcMain.handle('query:execute-read-only', (_, id: string, sql: string, runId?: string) =>
    connections.executeReadOnly(id, sql, runId)
  );
  ipcMain.handle('query:explain', (_, id: string, sql: string) => connections.explainQuery(id, sql));
  ipcMain.handle('ai:chat', (event, request: AiChatRequest) =>
    chatAgent.chat(request, (update) => {
      if (!event.sender.isDestroyed()) event.sender.send('ai:event', request.requestId, update);
    })
  );
  ipcMain.handle('ai:cancel', (_, requestId: string) => chatAgent.cancel(requestId));
  ipcMain.handle('ai:review', (_, requestId: string, queryId: string, approved: boolean) =>
    chatAgent.review(requestId, queryId, approved === true)
  );
  ipcMain.handle('ai:cancel-query', (_, requestId: string, queryId: string) => chatAgent.cancelQuery(requestId, queryId));
  ipcMain.handle('ai:forget', (_, conversationId: string, fromTurnId?: string) =>
    chatAgent.forget(conversationId, fromTurnId)
  );
  ipcMain.handle('query:cancel', (_, id: string, runId?: string) => connections.cancelQuery(id, runId));

  // Window
  ipcMain.handle('window:set-theme', (_, theme: 'dark' | 'light') => {
    const palette = WINDOW_THEME[theme === 'light' ? 'light' : 'dark'];
    mainWindow?.setBackgroundColor(palette.background);
    if (process.platform !== 'darwin') {
      mainWindow?.setTitleBarOverlay({
        color: palette.background,
        symbolColor: palette.symbols,
        height: TITLE_BAR_HEIGHT,
      });
    }
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
