import React from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, CircleSlash, Info, ListTree, Rows3, Terminal, Timer, Trash2 } from 'lucide-react';
import { LogEntry, PanelView, RunState, useWorkspace } from '../../context/WorkspaceContext';
import { useStudio } from '../../context/StudioContext';
import { cn, formatCount, formatDuration, pluralize } from '../../lib/utils';
import { engineLabel } from '../../lib/sql';
import { QueryResultsGrid } from '../Workbench/QueryResultsGrid';
import { SqlCode } from '../Workbench/SqlCode';
import { Button } from '../ui/button';
import { EmptyState } from '../ui/feedback';
import { Tooltip } from '../ui/tooltip';

export const PANEL_HEADER_HEIGHT = 29;

const VIEWS: { id: PanelView; label: string; icon: React.ElementType }[] = [
  { id: 'results', label: 'Results', icon: Rows3 },
  { id: 'messages', label: 'Messages', icon: Info },
  { id: 'log', label: 'Log', icon: Terminal },
  { id: 'stats', label: 'Statistics', icon: Timer },
];

const LEVEL: Record<LogEntry['level'], { icon: React.ElementType; className: string }> = {
  success: { icon: CheckCircle2, className: 'text-success' },
  error: { icon: AlertTriangle, className: 'text-destructive' },
  warning: { icon: CircleSlash, className: 'text-warning' },
  info: { icon: Info, className: 'text-muted-foreground' },
};

const LogView: React.FC = () => {
  const { logs, clearLogs } = useWorkspace();
  if (logs.length === 0) {
    return <EmptyState icon={<Terminal />} title="Nothing logged yet" description="Everything this session runs is recorded here." />;
  }
  return (
    <div className="h-full overflow-auto">
      <div className="sticky top-0 z-10 flex h-6 items-center justify-end bg-background px-2">
        <Button variant="quiet" size="sm" onClick={clearLogs}>
          <Trash2 /> Clear
        </Button>
      </div>
      {logs.map((entry) => {
        const { icon: Icon, className } = LEVEL[entry.level];
        return (
          <div key={entry.id} className="selectable flex items-start gap-2 border-b border-border/60 px-3 py-1 text-xxs">
            <span className="shrink-0 font-mono tabular-nums text-muted-foreground">
              {new Date(entry.time).toLocaleTimeString()}
            </span>
            <Icon className={cn('mt-px size-3 shrink-0', className)} />
            <span className="w-11 shrink-0 text-muted-foreground">{entry.source}</span>
            <span className="min-w-0 flex-1">
              <span className="break-words">{entry.message}</span>
              {entry.sql && <span className="block truncate font-mono text-muted-foreground">{entry.sql}</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
};

const describeRun = (run: RunState): { level: LogEntry['level']; text: string } => {
  switch (run.status) {
    case 'running':
      return { level: 'info', text: 'Query is running…' };
    case 'cancelled':
      return { level: 'warning', text: `Cancelled after ${formatDuration(run.durationMs)}.` };
    case 'error':
      return { level: 'error', text: run.error ?? 'The query failed.' };
    case 'success':
      return {
        level: 'success',
        text: run.result?.isCommand
          ? `${pluralize(run.result.rowCount, 'row')} affected in ${formatDuration(run.durationMs)}.`
          : `${pluralize(run.result?.rowCount ?? 0, 'row')} returned in ${formatDuration(run.durationMs)}.`,
      };
  }
};

const NoRun: React.FC<{ tabIsQuery: boolean }> = ({ tabIsQuery }) => (
  <EmptyState
    icon={<ListTree />}
    title={tabIsQuery ? 'No results yet' : 'No query in this tab'}
    description={tabIsQuery ? 'Run a query to see its results here.' : 'Results appear here for SQL tabs.'}
  />
);

const MessagesView: React.FC<{ run?: RunState; tabIsQuery: boolean }> = ({ run, tabIsQuery }) => {
  if (!run) return <NoRun tabIsQuery={tabIsQuery} />;
  const { level, text } = describeRun(run);
  const { icon: Icon, className } = LEVEL[level];
  return (
    <div className="selectable h-full space-y-2 overflow-auto p-3 text-xs">
      <div className="flex items-start gap-2">
        <Icon className={cn('mt-0.5 size-3.5 shrink-0', className)} />
        <span className="whitespace-pre-wrap break-words font-mono text-xxs leading-[18px]">{text}</span>
      </div>
      {run.result?.truncated && (
        <div className="flex items-start gap-2 text-warning">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span className="text-xxs">
            Only the first {formatCount(run.result.rowCount)} rows were kept. Add a LIMIT or narrow the query to see the rest.
          </span>
        </div>
      )}
      <div className="rounded-sm bg-muted p-2">
        <SqlCode sql={run.sql} />
      </div>
    </div>
  );
};

const StatsView: React.FC<{ run?: RunState; tabIsQuery: boolean }> = ({ run, tabIsQuery }) => {
  const { profiles } = useStudio();
  if (!run) return <NoRun tabIsQuery={tabIsQuery} />;
  const profile = profiles.find((p) => p.id === run.profileId);
  const rows: [string, React.ReactNode][] = [
    ['Status', run.status[0].toUpperCase() + run.status.slice(1)],
    ['Connection', profile ? `${profile.name} (${engineLabel(profile.engine)})` : '—'],
    ['Started', new Date(run.startedAt).toLocaleTimeString()],
    ['Duration', formatDuration(run.durationMs)],
    [run.result?.isCommand ? 'Rows affected' : 'Rows returned', run.result ? formatCount(run.result.rowCount) : '—'],
    ['Columns', run.result && !run.result.isCommand ? formatCount(run.result.columns.length) : '—'],
  ];
  return (
    <div className="h-full overflow-auto p-3">
      <dl className="selectable grid w-fit grid-cols-[auto_auto] gap-x-6 gap-y-1 text-xs">
        {rows.map(([label, value]) => (
          <React.Fragment key={label}>
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-mono tabular-nums">{value}</dd>
          </React.Fragment>
        ))}
      </dl>
    </div>
  );
};

export const BottomPanel: React.FC = () => {
  const { panelOpen, togglePanel, setPanelOpen, panelView, setPanelView, activeTab, runs, tabs, runSql, cancelRun, openResultTab, activateTab } = useWorkspace();
  const run = activeTab ? runs[activeTab.id] : undefined;
  const tabIsQuery = activeTab?.kind === 'sql';
  const sqlTabs = tabs.filter((t) => t.kind === 'sql' && runs[t.id]);

  return (
    <section aria-label="Bottom panel" className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <div
        style={{ height: PANEL_HEADER_HEIGHT - 1 }}
        className="flex shrink-0 items-stretch justify-between border-b border-border bg-chrome pl-1.5 pr-1"
        role="tablist"
        aria-label="Bottom panel views"
      >
        <div className="flex items-stretch">
          {VIEWS.map((view) => {
            const selected = panelOpen && panelView === view.id;
            return (
              <button
                key={view.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => {
                  setPanelView(view.id);
                  setPanelOpen(true);
                }}
                className={cn(
                  '-mb-px flex items-center gap-1.5 border-b-[1.5px] border-transparent px-2 text-xxs transition-colors duration-75 focus-visible:outline-offset-[-2px]',
                  selected ? 'border-primary text-foreground' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {view.label}
                {view.id === 'messages' && run?.status === 'error' && (
                  <span aria-label="Has an error" className="size-1.5 rounded-full bg-destructive" />
                )}
              </button>
            );
          })}
        </div>
        <div className="flex items-center">
          <Tooltip content={panelOpen ? 'Collapse panel' : 'Expand panel'} shortcut="Mod+J">
            <Button variant="quiet" size="icon-xs" aria-label={panelOpen ? 'Collapse panel' : 'Expand panel'} onClick={togglePanel}>
              {panelOpen ? <ChevronDown /> : <ChevronUp />}
            </Button>
          </Tooltip>
        </div>
      </div>

      <div className={cn('min-h-0 flex-1', !panelOpen && 'invisible')}>
        <div className={cn('h-full', panelView === 'results' ? 'block' : 'hidden')}>
          {!tabIsQuery && <NoRun tabIsQuery={false} />}
          {tabIsQuery && !run && <NoRun tabIsQuery />}
          {/* One grid per SQL tab stays mounted so its sort, filter and scroll survive tab switches. */}
          {sqlTabs.map((tab) => {
            const tabRun = runs[tab.id];
            const visible = tab.id === activeTab?.id;
            return (
              <div key={tab.id} className={cn('h-full', visible ? 'block' : 'hidden')}>
                <QueryResultsGrid
                  result={tabRun.result ?? null}
                  loading={tabRun.status === 'running'}
                  error={tabRun.status === 'error' ? tabRun.error ?? 'Query failed' : null}
                  notice={tabRun.status === 'cancelled' ? 'Query cancelled. Showing the previous result.' : undefined}
                  fileBase="query-results"
                  onCancel={() => cancelRun(tab.id)}
                  onRefresh={() => runSql(tab.id, tabRun.profileId, tabRun.sql)}
                  onOpenInTab={
                    tabRun.result && !tabRun.result.isCommand
                      ? () => openResultTab('Result', tabRun.result!, tabRun.sql, tabRun.profileId)
                      : undefined
                  }
                />
              </div>
            );
          })}
        </div>
        {panelView === 'messages' && <MessagesView run={run} tabIsQuery={tabIsQuery} />}
        {panelView === 'log' && <LogView />}
        {panelView === 'stats' && <StatsView run={run} tabIsQuery={tabIsQuery} />}
      </div>
    </section>
  );
};
