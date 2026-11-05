import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  CircleSlash,
  Database,
  FileCode2,
  Loader2,
  Play,
  RefreshCw,
  ShieldOff,
  Square,
  Table2,
} from 'lucide-react';
import { ChatMessage, useChat } from '../../context/ChatContext';
import { useStudio } from '../../context/StudioContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { chooseChart } from '../../lib/chart';
import { cn, formatDuration, pluralize } from '../../lib/utils';
import { QueryResultsGrid } from '../Workbench/QueryResultsGrid';
import { SqlCode } from '../Workbench/SqlCode';
import { Button } from '../ui/button';
import { CopyButton } from '../ui/feedback';
import { Tooltip } from '../ui/tooltip';
import { ResultChart } from './ResultChart';

const COLLAPSE_AFTER_LINES = 8;
const ROW_PX = 24;
const GRID_CHROME_PX = 62;
const GRID_MAX_HEIGHT = 320;

const ExecutionStatus: React.FC<{ message: ChatMessage }> = ({ message }) => {
  const execution = message.execution;
  if (!execution) return null;
  const base = 'flex items-center gap-1 text-xxs tabular-nums';
  switch (execution.status) {
    case 'running':
      return (
        <span className={cn(base, 'text-muted-foreground')}>
          <Loader2 className="size-3 animate-spin" /> Running read-only…
        </span>
      );
    case 'success':
      return (
        <span className={cn(base, 'text-muted-foreground')}>
          <CheckCircle2 className="size-3 text-success" />
          {pluralize(execution.rowCount ?? 0, 'row')} · {formatDuration(execution.durationMs)}
        </span>
      );
    case 'error':
      return (
        <span className={cn(base, 'text-destructive')}>
          <AlertTriangle className="size-3" /> Failed
        </span>
      );
    case 'blocked':
      return (
        <span className={cn(base, 'text-warning')}>
          <ShieldOff className="size-3" /> Blocked: not read-only
        </span>
      );
    case 'cancelled':
      return (
        <span className={cn(base, 'text-warning')}>
          <CircleSlash className="size-3" /> Cancelled
        </span>
      );
    default:
      return <span className={cn(base, 'text-muted-foreground')}>Not run</span>;
  }
};

const ResultView: React.FC<{ conversationId: string; message: ChatMessage }> = ({ conversationId, message }) => {
  const { runMessageSql } = useChat();
  const { openResultTab } = useWorkspace();
  const execution = message.execution!;
  const result = execution.result!;
  const chart = useMemo(() => chooseChart(result), [result]);
  const [view, setView] = useState<'chart' | 'table'>(chart ? 'chart' : 'table');

  const gridHeight = Math.min(GRID_MAX_HEIGHT, Math.max(128, result.rows.length * ROW_PX + GRID_CHROME_PX));

  return (
    <div className="border-t border-border">
      {chart && (
        <div role="tablist" aria-label="Result view" className="flex h-7 items-center gap-0.5 border-b border-border px-1.5">
          {[
            { id: 'chart' as const, label: chart.form === 'stat' ? 'Value' : 'Chart', icon: BarChart3 },
            { id: 'table' as const, label: 'Table', icon: Table2 },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={view === id}
              onClick={() => setView(id)}
              className={cn(
                'flex h-5 items-center gap-1 rounded-sm px-1.5 text-xxs transition-colors duration-75',
                view === id ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="size-3" /> {label}
            </button>
          ))}
        </div>
      )}
      {chart && view === 'chart' ? (
        <div className="p-3">
          <ResultChart spec={chart} />
        </div>
      ) : (
        <div style={{ height: gridHeight }}>
          <QueryResultsGrid
            embedded
            result={result}
            fileBase="ai-query"
            onRefresh={() => runMessageSql(conversationId, message.id)}
            onOpenInTab={() => openResultTab('AI result', result, message.sql, execution.profileId)}
          />
        </div>
      )}
    </div>
  );
};

/** The generated query: what it is, whether it ran, and what came back. */
export const SqlBlock: React.FC<{ conversationId: string; message: ChatMessage }> = ({ conversationId, message }) => {
  const { runMessageSql, cancelMessageSql } = useChat();
  const { newQuery } = useWorkspace();
  const { connectionStates, connectProfile, profiles } = useStudio();
  const { conversations } = useChat();
  const sql = message.sql!;
  const execution = message.execution;
  const lineCount = sql.split('\n').length;
  const [expanded, setExpanded] = useState(lineCount <= COLLAPSE_AFTER_LINES);

  const conversation = conversations.find((c) => c.id === conversationId);
  const profile = profiles.find((p) => p.id === conversation?.profileId);
  const connected = profile ? connectionStates[profile.id]?.state === 'connected' : false;
  const status = execution?.status ?? 'idle';

  return (
    <div className="mt-2 overflow-hidden rounded-md border border-border bg-background">
      <div className="flex h-7 items-center gap-1.5 border-b border-border bg-chrome pl-2 pr-1">
        <Database className="size-3 shrink-0 text-muted-foreground" />
        <span className="text-xxs font-medium">SQL</span>
        <span className="mx-0.5 h-3 w-px bg-border" />
        <ExecutionStatus message={message} />
        <div className="ml-auto flex items-center gap-0.5">
          {status === 'running' ? (
            <Tooltip content="Cancel this query">
              <Button variant="quiet" size="icon-xs" aria-label="Cancel query" onClick={() => cancelMessageSql(conversationId, message.id)}>
                <Square className="fill-current" />
              </Button>
            </Tooltip>
          ) : status === 'blocked' ? null : !connected && profile ? (
            <Button variant="quiet" size="sm" onClick={() => connectProfile(profile)}>
              <Play /> Connect
            </Button>
          ) : (
            connected && (
              <Tooltip content={status === 'idle' ? 'Run read-only' : 'Run again, read-only'}>
                <Button
                  variant="quiet"
                  size="icon-xs"
                  aria-label={status === 'idle' ? 'Run read-only' : 'Run again'}
                  onClick={() => runMessageSql(conversationId, message.id)}
                >
                  {status === 'idle' ? <Play /> : <RefreshCw />}
                </Button>
              </Tooltip>
            )
          )}
          <Tooltip content="Open in a new query tab">
            <Button
              variant="quiet"
              size="icon-xs"
              aria-label="Open in a new query tab"
              onClick={() => newQuery(sql, 'From AI', conversation?.profileId)}
            >
              <FileCode2 />
            </Button>
          </Tooltip>
          <CopyButton text={sql} label="Copy SQL" />
          {lineCount > COLLAPSE_AFTER_LINES && (
            <Tooltip content={expanded ? 'Collapse' : 'Expand'}>
              <Button variant="quiet" size="icon-xs" aria-label={expanded ? 'Collapse SQL' : 'Expand SQL'} aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
                <ChevronDown className={cn('transition-transform duration-75', expanded && 'rotate-180')} />
              </Button>
            </Tooltip>
          )}
        </div>
      </div>

      <pre className={cn('overflow-auto px-2.5 py-2', !expanded && 'max-h-[98px]')}>
        <SqlCode sql={sql} wrap={false} />
      </pre>

      {status === 'blocked' && (
        <div className="selectable border-t border-warning/30 bg-warning/[0.07] px-2.5 py-2 text-xs leading-5">
          {execution?.error?.replace(/^Blocked: /, '')} This assistant only runs read-only SQL. To make this change, open it in a
          query tab, review it, and run it yourself.
        </div>
      )}
      {status === 'error' && (
        <div className="selectable whitespace-pre-wrap break-words border-t border-destructive/30 bg-destructive/[0.06] px-2.5 py-2 font-mono text-xxs leading-[18px]">
          {execution?.error}
        </div>
      )}
      {status === 'success' && execution?.result && <ResultView conversationId={conversationId} message={message} />}
      {status === 'success' && !execution?.result && (
        <p className="border-t border-border px-2.5 py-1.5 text-xxs text-muted-foreground">
          Rows are not kept between sessions. Run the query again to see them.
        </p>
      )}
      {status === 'success' && execution?.result?.truncated && (
        <p className="border-t border-border px-2.5 py-1.5 text-xxs text-warning">
          Only the first {pluralize(execution.result.rowCount, 'row')} were kept. Ask for a narrower question or add a LIMIT.
        </p>
      )}
    </div>
  );
};
