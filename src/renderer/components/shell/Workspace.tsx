import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useDefaultLayout, type PanelImperativeHandle } from 'react-resizable-panels';
import { Cable, FileCode2, Search, Sparkles } from 'lucide-react';
import { useWorkspace, WorkspaceTab } from '../../context/WorkspaceContext';
import { useStudio } from '../../context/StudioContext';
import { useChat } from '../../context/ChatContext';
import { cn, shortcutLabel } from '../../lib/utils';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '../ui/resizable';
import { Button } from '../ui/button';
import { Kbd, Skeleton } from '../ui/feedback';
import { EngineMark } from '../ui/engine-mark';
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
  const { newQuery, setPaletteOpen } = useWorkspace();
  const { openNewConversation } = useChat();
  const { openEditProfileModal, profiles, activeProfile, setActiveProfileId, connectedProfileIds } = useStudio();

  const actions: { icon: React.ReactNode; label: string; shortcut: string; run: () => void }[] = [
    { icon: <FileCode2 />, label: 'New query', shortcut: 'Mod+T', run: () => newQuery('', undefined, activeProfile?.id) },
    { icon: <Sparkles />, label: 'New AI conversation', shortcut: 'Mod+Shift+L', run: openNewConversation },
    { icon: <Search />, label: 'Search tables and commands', shortcut: 'Mod+K', run: () => setPaletteOpen(true) },
  ];

  return (
    <div className="flex h-full items-center justify-center overflow-auto p-8">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3">
          <img src={logoImg} alt="" className="size-9 rounded-lg shadow-raised" />
          <div>
            <h1 className="text-base font-semibold tracking-tight">AI DB Studio</h1>
            <p className="text-xs text-muted-foreground">Query your databases by hand, or ask in plain language.</p>
          </div>
        </div>

        <section className="mt-7">
          <h2 className="section-label mb-1.5 px-2">Start</h2>
          <div className="flex flex-col">
            {actions.map((a) => (
              <Button key={a.label} variant="ghost" className="justify-start" onClick={a.run}>
                {a.icon} {a.label}
                <Kbd className="ml-auto">{shortcutLabel(a.shortcut)}</Kbd>
              </Button>
            ))}
          </div>
        </section>

        <section className="mt-5">
          <div className="mb-1.5 flex items-center justify-between px-2">
            <h2 className="section-label">Connections</h2>
            {profiles.length > 0 && (
              <button
                type="button"
                className="text-2xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => openEditProfileModal(null)}
              >
                Add
              </button>
            )}
          </div>
          {profiles.length === 0 ? (
            <button
              type="button"
              onClick={() => openEditProfileModal(null)}
              className="flex w-full items-center gap-3 rounded-lg border border-dashed border-input px-3 py-3 text-left transition-colors hover:border-primary/50 hover:bg-accent/50"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Cable className="size-4" />
              </span>
              <span>
                <span className="block text-xs font-medium">Add a database connection</span>
                <span className="block text-2xs text-muted-foreground">PostgreSQL, MySQL or MongoDB, saved on this device.</span>
              </span>
            </button>
          ) : (
            <div className="flex flex-col">
              {profiles.slice(0, 6).map((p) => {
                const connected = connectedProfileIds.includes(p.id);
                return (
                  <Button
                    key={p.id}
                    variant="ghost"
                    className="h-auto justify-start py-1.5"
                    title={`New query on ${p.name}`}
                    onClick={() => {
                      setActiveProfileId(p.id);
                      newQuery('', undefined, p.id);
                    }}
                  >
                    <span
                      aria-label={connected ? 'Connected' : 'Not connected'}
                      className={cn('size-1.5 shrink-0 rounded-full', connected ? 'bg-success' : 'bg-muted-foreground/40')}
                    />
                    <EngineMark engine={p.engine} size="xs" />
                    <span className="min-w-0 truncate">{p.name}</span>
                    <span className="ml-auto min-w-0 truncate pl-3 font-mono text-2xs font-normal text-muted-foreground">
                      {p.host}
                    </span>
                  </Button>
                );
              })}
            </div>
          )}
        </section>
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
