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
  ShieldAlert,
  Square,
  Table2,
} from 'lucide-react';
import { QueryPart, useChat } from '../../context/ChatContext';
import { useStudio } from '../../context/StudioContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { chooseChart } from '../../lib/chart';
import { engineInfo } from '../../../shared/engines';
import { assessRisk, engineLabel } from '../../lib/sql';
import { cn, formatDuration, pluralize } from '../../lib/utils';
import { QueryResultsGrid } from '../Workbench/QueryResultsGrid';
import { SqlCode } from '../Workbench/SqlCode';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/input';
import { CopyButton } from '../ui/feedback';
import { Tooltip } from '../ui/tooltip';
import { ResultChart } from './ResultChart';

const COLLAPSE_AFTER_LINES = 8;
const ROW_PX = 24;
const GRID_CHROME_PX = 62;
const GRID_MAX_HEIGHT = 320;

interface SqlBlockProps {
  conversationId: string;
  messageId: string;
  query: QueryPart;
}

const ExecutionStatus: React.FC<{ query: QueryPart }> = ({ query }) => {
  const base = 'flex items-center gap-1 text-xxs tabular-nums';
  switch (query.status) {
    case 'running':
      return (
        <span className={cn(base, 'text-muted-foreground')}>
          <Loader2 className="size-3 animate-spin" /> Running…
        </span>
      );
    case 'review':
      return (
        <span className={cn(base, 'font-medium text-warning')}>
          <ShieldAlert className="size-3" /> Waiting for your review
        </span>
      );
    case 'success':
      return (
        <span className={cn(base, 'text-muted-foreground')}>
          <CheckCircle2 className="size-3 text-success" />
          {pluralize(query.rowCount ?? 0, 'row')}
          {query.isCommand ? ' affected' : ''} · {formatDuration(query.durationMs)}
        </span>
      );
    case 'error':
      return (
        <span className={cn(base, 'text-destructive')}>
          <AlertTriangle className="size-3" /> Failed
        </span>
      );
    case 'declined':
      return (
        <span className={cn(base, 'text-muted-foreground')}>
          <CircleSlash className="size-3" /> Not run: you declined it
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

/** The one place AI-written statements that can change data are approved. */
const ReviewCard: React.FC<SqlBlockProps> = ({ conversationId, messageId, query }) => {
  const { reviewQuery, conversations } = useChat();
  const { profiles } = useStudio();
  const [acknowledged, setAcknowledged] = useState(false);
  const risk = useMemo(() => assessRisk(query.sql), [query.sql]);
  const conversation = conversations.find((c) => c.id === conversationId);
  const profile = profiles.find((p) => p.id === conversation?.profileId);

  return (
    <div className={cn('border-t p-2.5', risk.high ? 'border-destructive/30 bg-destructive/[0.06]' : 'border-warning/30 bg-warning/[0.06]')}>
      <p className="text-xs font-medium">{risk.high ? 'This statement is destructive' : query.readOnly ? 'Run this query?' : 'This statement can change your database'}</p>
      {profile && (
        <p className="mt-0.5 text-xxs text-muted-foreground">
          Runs on <span className="font-medium text-foreground">{profile.name}</span> · {engineLabel(profile.engine)} · {profile.host}:{profile.port}/{profile.database}
          {query.readOnly ? '' : '. Changes commit immediately.'}
        </p>
      )}
      {risk.reasons.map((reason) => (
        <p key={reason} className="mt-1 text-xs text-destructive">
          {reason}
        </p>
      ))}
      {!risk.high && !query.readOnly && query.reason && <p className="mt-1 text-xxs text-muted-foreground">{query.reason}</p>}
      {risk.high && (
        <label className="mt-1.5 flex cursor-pointer items-center gap-2 text-xs">
          <Checkbox checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} />
          I understand this cannot be undone
        </label>
      )}
      <div className="mt-2 flex items-center gap-1.5">
        <Button
          size="sm"
          variant={risk.high ? 'destructive' : 'default'}
          disabled={risk.high && !acknowledged}
          onClick={() => reviewQuery(conversationId, messageId, query.id, true)}
        >
          Run statement
        </Button>
        <Button size="sm" variant="outline" onClick={() => reviewQuery(conversationId, messageId, query.id, false)}>
          Don't run
        </Button>
      </div>
    </div>
  );
};

const ResultView: React.FC<SqlBlockProps> = ({ conversationId, messageId, query }) => {
  const { rerunQuery } = useChat();
  const { openResultTab } = useWorkspace();
  const result = query.result!;
  const chart = useMemo(() => chooseChart(result), [result]);
  const [view, setView] = useState<'chart' | 'table'>(chart ? 'chart' : 'table');

  if (result.isCommand) return null;

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
            onRefresh={query.readOnly ? () => rerunQuery(conversationId, messageId, query.id) : undefined}
            onOpenInTab={() => openResultTab('AI result', result, query.sql, query.profileId)}
          />
        </div>
      )}
    </div>
  );
};

/** One statement from the assistant: what it is, whether it ran, and what came back. */
export const SqlBlock: React.FC<SqlBlockProps> = ({ conversationId, messageId, query }) => {
  const { rerunQuery, cancelQuery, conversations } = useChat();
  const { newQuery } = useWorkspace();
  const { connectionStates, connectProfile, profiles } = useStudio();
  const lineCount = query.sql.split('\n').length;
  const [expanded, setExpanded] = useState(lineCount <= COLLAPSE_AFTER_LINES);

  const conversation = conversations.find((c) => c.id === conversationId);
  const profile = profiles.find((p) => p.id === conversation?.profileId);
  const connected = profile ? connectionStates[profile.id]?.state === 'connected' : false;
  const languageLabel = engineInfo(profile?.engine).queryLanguage === 'mongodb' ? 'MongoDB' : 'SQL';
  const { status } = query;
  // Only a read can be re-run from here. A write has to come back through review.
  const canRerun = query.readOnly && connected && status !== 'running' && status !== 'review';

  return (
    <div className="mt-2 overflow-hidden rounded-md border border-border bg-background">
      <div className="flex h-7 items-center gap-1.5 border-b border-border bg-chrome pl-2 pr-1">
        <Database className="size-3 shrink-0 text-muted-foreground" />
        <span className="text-xxs font-medium">{languageLabel}</span>
        <span className="mx-0.5 h-3 w-px bg-border" />
        <ExecutionStatus query={query} />
        <div className="ml-auto flex items-center gap-0.5">
          {status === 'running' && (
            <Tooltip content="Cancel this query">
              <Button variant="quiet" size="icon-xs" aria-label="Cancel query" onClick={() => cancelQuery(conversationId, messageId, query.id)}>
                <Square className="fill-current" />
              </Button>
            </Tooltip>
          )}
          {query.readOnly && !connected && profile && status !== 'running' && status !== 'review' && (
            <Button variant="quiet" size="sm" onClick={() => connectProfile(profile)}>
              <Play /> Connect
            </Button>
          )}
          {canRerun && (
            <Tooltip content={status === 'idle' ? 'Run read-only' : 'Run again, read-only'}>
              <Button
                variant="quiet"
                size="icon-xs"
                aria-label={status === 'idle' ? 'Run read-only' : 'Run again'}
                onClick={() => rerunQuery(conversationId, messageId, query.id)}
              >
                {status === 'idle' ? <Play /> : <RefreshCw />}
              </Button>
            </Tooltip>
          )}
          <Tooltip content="Open in a new query tab">
            <Button variant="quiet" size="icon-xs" aria-label="Open in a new query tab" onClick={() => newQuery(query.sql, 'From AI', conversation?.profileId)}>
              <FileCode2 />
            </Button>
          </Tooltip>
          <CopyButton text={query.sql} label={`Copy ${languageLabel}`} />
          {lineCount > COLLAPSE_AFTER_LINES && (
            <Tooltip content={expanded ? 'Collapse' : 'Expand'}>
              <Button variant="quiet" size="icon-xs" aria-label={expanded ? 'Collapse SQL' : 'Expand SQL'} aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
                <ChevronDown className={cn('transition-transform duration-75', expanded && 'rotate-180')} />
              </Button>
            </Tooltip>
          )}
        </div>
      </div>

      {/* A statement under review is always shown in full: nobody should approve what they cannot see. */}
      <pre className={cn('overflow-auto px-2.5 py-2', !expanded && status !== 'review' && 'max-h-[98px]')}>
        <SqlCode sql={query.sql} wrap={status === 'review'} />
      </pre>

      {status === 'review' && <ReviewCard conversationId={conversationId} messageId={messageId} query={query} />}
      {status === 'error' && (
        <div className="selectable whitespace-pre-wrap break-words border-t border-destructive/30 bg-destructive/[0.06] px-2.5 py-2 font-mono text-xxs leading-[18px]">
          {query.error}
        </div>
      )}
      {status === 'success' && query.result && <ResultView conversationId={conversationId} messageId={messageId} query={query} />}
      {status === 'success' && !query.result && !query.isCommand && (
        <p className="border-t border-border px-2.5 py-1.5 text-xxs text-muted-foreground">
          Rows are not kept between sessions. Run the query again to see them.
        </p>
      )}
      {status === 'success' && query.result?.truncated && (
        <p className="border-t border-border px-2.5 py-1.5 text-xxs text-warning">
          Only the first {pluralize(query.result.rowCount, 'row')} were kept. Ask a narrower question or add a LIMIT.
        </p>
      )}
    </div>
  );
};
