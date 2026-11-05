import React, { useEffect, useRef } from 'react';
import { useDefaultLayout, type PanelImperativeHandle } from 'react-resizable-panels';
import { useStudio } from '../../context/StudioContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useChat } from '../../context/ChatContext';
import { isMac } from '../../lib/utils';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '../ui/resizable';
import { ToastContainer } from '../ToastContainer';
import { TitleBar } from './TitleBar';
import { ActivityBar, useSelectActivity } from './ActivityBar';
import { SidePanel } from './SidePanel';
import { Workspace } from './Workspace';
import { StatusBar } from './StatusBar';
import { CommandPalette } from './CommandPalette';

const useGlobalCommands = () => {
  const { drafts, updateDraft, showToast } = useStudio();
  const workspace = useWorkspace();
  const { openNewConversation } = useChat();
  const selectActivity = useSelectActivity();

  const handler = useRef<(command: string) => void>(() => undefined);
  handler.current = (command: string) => {
    const { activeTab } = workspace;
    switch (command) {
      case 'command-palette':
        workspace.setPaletteOpen(!workspace.paletteOpen);
        break;
      case 'toggle-sidebar':
        workspace.toggleSidebar();
        break;
      case 'toggle-panel':
        workspace.togglePanel();
        break;
      case 'new-query':
        workspace.newQuery();
        break;
      case 'new-chat':
        openNewConversation();
        break;
      case 'close-tab':
        if (activeTab) workspace.closeTab(activeTab.id);
        break;
      case 'save-query':
        if (activeTab?.kind === 'sql') {
          const draft = drafts.find((d) => d.id === activeTab.draftId);
          if (draft) {
            updateDraft({ ...draft, savedSql: draft.sql });
            showToast(`Saved “${draft.title}”`, 'success');
          }
        }
        break;
      case 'settings':
        workspace.openSingleton('settings');
        break;
      case 'next-tab':
        workspace.cycleTab(1);
        break;
      case 'previous-tab':
        workspace.cycleTab(-1);
        break;
      case 'activity-explorer':
        selectActivity('explorer');
        break;
      case 'activity-sql':
        selectActivity('sql');
        break;
      case 'activity-ai':
        selectActivity('ai');
        break;
      case 'activity-history':
        selectActivity('history');
        break;
    }
  };

  useEffect(() => {
    // A key press can reach both the renderer and the native menu; run the command once.
    let last = { command: '', at: 0 };
    const dispatch = (command: string) => {
      const now = Date.now();
      if (last.command === command && now - last.at < 150) return;
      last = { command, at: now };
      handler.current(command);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault();
        dispatch(e.shiftKey ? 'previous-tab' : 'next-tab');
        return;
      }
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (!mod || e.altKey) return;

      const key = e.key.toLowerCase();
      const plain: Record<string, string> = {
        k: 'command-palette',
        b: 'toggle-sidebar',
        j: 'toggle-panel',
        t: 'new-query',
        w: 'close-tab',
        s: 'save-query',
        ',': 'settings',
        '1': 'activity-explorer',
        '2': 'activity-sql',
        '3': 'activity-ai',
        '4': 'activity-history',
      };
      const command = e.shiftKey ? (key === 'l' ? 'new-chat' : undefined) : plain[key];
      if (command) {
        e.preventDefault();
        dispatch(command);
      }
    };

    // Monaco consumes these keys itself, so the editor forwards them as an event.
    const onEditorCommand = (e: Event) => dispatch((e as CustomEvent<string>).detail);
    window.addEventListener('studio:command', onEditorCommand);
    window.addEventListener('keydown', onKeyDown);
    const unsubscribe = window.electronAPI.onMenuCommand(dispatch);
    return () => {
      window.removeEventListener('studio:command', onEditorCommand);
      window.removeEventListener('keydown', onKeyDown);
      unsubscribe();
    };
  }, []);
};

export const AppShell: React.FC = () => {
  const { sidebarOpen, setSidebarOpen } = useWorkspace();
  const sidebarRef = useRef<PanelImperativeHandle>(null);
  useGlobalCommands();

  const { defaultLayout, onLayoutChanged } = useDefaultLayout({ id: 'studio-shell', storage: localStorage });

  useEffect(() => {
    const panel = sidebarRef.current;
    if (!panel) return;
    if (sidebarOpen && panel.isCollapsed()) panel.expand();
    if (!sidebarOpen && !panel.isCollapsed()) panel.collapse();
  }, [sidebarOpen]);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background text-foreground">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <ActivityBar />
        <ResizablePanelGroup
          id="studio-shell"
          orientation="horizontal"
          defaultLayout={defaultLayout}
          onLayoutChanged={onLayoutChanged}
          className="min-w-0 flex-1"
        >
          <ResizablePanel
            id="sidebar"
            panelRef={sidebarRef}
            collapsible
            collapsedSize={0}
            minSize={200}
            maxSize={520}
            defaultSize={272}
            groupResizeBehavior="preserve-pixel-size"
            onResize={(size) => setSidebarOpen(size.inPixels > 0)}
          >
            <SidePanel />
          </ResizablePanel>
          <ResizableHandle orientation="vertical" />
          <ResizablePanel id="workspace" minSize={420}>
            <Workspace />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
      <StatusBar />
      <CommandPalette />
      <ToastContainer />
    </div>
  );
};
