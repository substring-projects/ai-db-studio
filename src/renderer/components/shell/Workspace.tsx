import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useDefaultLayout, type PanelImperativeHandle } from 'react-resizable-panels';
import { Cable, FileCode2, Sparkles } from 'lucide-react';
import { useWorkspace, WorkspaceTab } from '../../context/WorkspaceContext';
import { useStudio } from '../../context/StudioContext';
import { useChat } from '../../context/ChatContext';
import { cn, shortcutLabel } from '../../lib/utils';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '../ui/resizable';
import { Button } from '../ui/button';
import { Kbd, Skeleton } from '../ui/feedback';
import { TableDataTab } from '../Workbench/TableDataTab';
import { TableStructureView } from '../Workbench/TableStructureView';
import { ErDiagramView } from '../Workbench/ErDiagramView';
import { ResultTab } from '../Workbench/ResultTab';
import { ConnectionsView } from '../Connections/ConnectionsView';
import { SettingsView } from '../Settings/SettingsView';
import { AiChatView } from '../ai/AiChatView';
import { WorkspaceTabs } from './WorkspaceTabs';
import { BottomPanel, PANEL_HEADER_HEIGHT } from './BottomPanel';
import logoImg from '../../assets/logo.png';

// Monaco is large: the SQL tab loads it on demand so the app itself opens instantly.
const SqlTab = lazy(() => import('../Workbench/SqlTab').then((m) => ({ default: m.SqlTab })));

const TabView: React.FC<{ tab: WorkspaceTab; active: boolean }> = ({ tab, active }) => {
  switch (tab.kind) {
    case 'sql':
      return (
        <Suspense
          fallback={
            <div className="space-y-2 p-4">
              <Skeleton className="h-3 w-2/5" />
              <Skeleton className="h-3 w-3/5" />
            </div>
          }
        >
          <SqlTab tab={tab} active={active} />
        </Suspense>
      );
    case 'table':
      return <TableDataTab tab={tab} active={active} />;
    case 'structure':
      return <TableStructureView tab={tab} />;
    case 'er':
      return <ErDiagramView tab={tab} />;
    case 'ai':
      return <AiChatView conversationId={tab.conversationId} active={active} />;
    case 'result':
      return <ResultTab tab={tab} />;
    case 'connections':
      return <ConnectionsView />;
    case 'settings':
      return <SettingsView />;
  }
};

const Welcome: React.FC = () => {
  const { newQuery } = useWorkspace();
  const { openNewConversation } = useChat();
  const { openEditProfileModal, profiles, activeProfile } = useStudio();

  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <img src={logoImg} alt="" className="mb-3 size-8 rounded-md" />
        <h1 className="text-base font-semibold">AI DB Studio</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">Query your databases by hand, or ask in plain language.</p>
        <div className="mt-4 flex flex-col">
          {profiles.length === 0 && (
            <Button variant="ghost" className="justify-start" onClick={() => openEditProfileModal(null)}>
              <Cable /> Add a database connection
            </Button>
          )}
          <Button variant="ghost" className="justify-start" onClick={() => newQuery('', undefined, activeProfile?.id)}>
            <FileCode2 /> New query
            <Kbd className="ml-auto">{shortcutLabel('Mod+T')}</Kbd>
          </Button>
          <Button variant="ghost" className="justify-start" onClick={openNewConversation}>
            <Sparkles /> New AI conversation
            <Kbd className="ml-auto">{shortcutLabel('Mod+Shift+L')}</Kbd>
          </Button>
        </div>
      </div>
    </div>
  );
};

export const Workspace: React.FC = () => {
  const { tabs, activeTab, panelOpen, setPanelOpen } = useWorkspace();
  const panelRef = useRef<PanelImperativeHandle>(null);
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({ id: 'studio-workspace', storage: localStorage });

  // Tabs mount on first visit and then stay mounted, so scroll, sort, page and editor state survive switching.
  const [visited, setVisited] = useState<Set<string>>(() => new Set(activeTab ? [activeTab.id] : []));
  useEffect(() => {
    if (activeTab && !visited.has(activeTab.id)) setVisited((prev) => new Set(prev).add(activeTab.id));
  }, [activeTab, visited]);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    if (panelOpen && panel.isCollapsed()) panel.expand();
    if (!panelOpen && !panel.isCollapsed()) panel.collapse();
  }, [panelOpen]);

  return (
    <div className="flex h-full min-w-0 flex-col">
      <WorkspaceTabs />
      <ResizablePanelGroup
        id="studio-workspace"
        orientation="vertical"
        defaultLayout={defaultLayout}
        onLayoutChanged={onLayoutChanged}
        className="min-h-0 flex-1"
      >
        <ResizablePanel id="content" minSize={120}>
          <div className="relative h-full min-h-0 bg-background">
            {tabs.length === 0 && <Welcome />}
            {tabs.map((tab) =>
              visited.has(tab.id) || tab.id === activeTab?.id ? (
                <div
                  key={tab.id}
                  role="tabpanel"
                  className={cn('h-full min-h-0 min-w-0', tab.id === activeTab?.id ? 'block' : 'hidden')}
                >
                  <TabView tab={tab} active={tab.id === activeTab?.id} />
                </div>
              ) : null
            )}
          </div>
        </ResizablePanel>
        <ResizableHandle orientation="horizontal" />
        <ResizablePanel
          id="bottom"
          panelRef={panelRef}
          collapsible
          collapsedSize={PANEL_HEADER_HEIGHT}
          minSize={110}
          defaultSize={300}
          groupResizeBehavior="preserve-pixel-size"
          onResize={(size) => setPanelOpen(size.inPixels > PANEL_HEADER_HEIGHT + 1)}
        >
          <BottomPanel />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
};
