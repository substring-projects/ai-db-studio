import React, { useCallback, useRef, useState } from 'react';
import { AlignLeft, Binary, FileText, Loader2, Play, Save, Square } from 'lucide-react';
import { cleanError, useStudio } from '../../context/StudioContext';
import { useSchema } from '../../context/SchemaContext';
import { useWorkspace, WorkspaceTab } from '../../context/WorkspaceContext';
import { engineInfo } from '../../../shared/engines';
import { formatSql } from '../../lib/sql';
import { shortcutLabel } from '../../lib/utils';
import { Button } from '../ui/button';
import { EmptyState } from '../ui/feedback';
import { Tooltip } from '../ui/tooltip';
import { ConnectionSelect } from './ConnectionSelect';
import { SqlEditor, SqlEditorHandle } from './SqlEditor';

const Divider = () => <span className="mx-1 h-3.5 w-px bg-border" />;

export const SqlTab: React.FC<{ tab: Extract<WorkspaceTab, { kind: 'sql' }>; active: boolean }> = ({ tab, active }) => {
  const { drafts, updateDraft, profiles, activeProfile, connectionStates, connectProfile, showToast } = useStudio();
  const { schemas } = useSchema();
  const { runSql, cancelRun, runs } = useWorkspace();
  const editorRef = useRef<SqlEditorHandle>(null);
  const [hasSelection, setHasSelection] = useState(false);

  const draft = drafts.find((d) => d.id === tab.draftId);
  const profileId = draft?.connectionId ?? activeProfile?.id ?? null;
  const profile = profiles.find((p) => p.id === profileId);
  const engine = engineInfo(profile?.engine);
  const run = runs[tab.id];
  const running = run?.status === 'running';

  const schemasRef = useRef(schemas);
  schemasRef.current = schemas;
  const profileIdRef = useRef(profileId);
  profileIdRef.current = profileId;
  const getSchema = useCallback(
    () => (profileIdRef.current ? schemasRef.current[profileIdRef.current] : undefined),
    []
  );

  const execute = async (mode: 'selection' | 'all', explain = false) => {
    if (!draft) return;
    const text = mode === 'selection' ? editorRef.current?.getSelection() ?? draft.sql : draft.sql;
    if (!text.trim()) return;
    if (!profile) {
      showToast('Add a connection to run queries.', 'warning');
      return;
    }
    if (connectionStates[profile.id]?.state !== 'connected') {
      const connected = await connectProfile(profile);
      if (!connected) return;
    }
    if (draft.connectionId !== profile.id) updateDraft({ ...draft, connectionId: profile.id });
    await runSql(tab.id, profile.id, text, { explain });
  };

  const format = async () => {
    if (!draft?.sql.trim() || !engine.features.format) return;
    try {
      updateDraft({ ...draft, sql: await formatSql(draft.sql, profile?.engine) });
    } catch (err) {
      showToast(`Could not format: ${cleanError(err)}`, 'warning');
    }
  };

  if (!draft) {
    return <EmptyState icon={<FileText />} title="This query no longer exists" description="It may have been deleted." />;
  }

  const dirty = draft.sql !== draft.savedSql;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-8 shrink-0 items-center gap-0.5 border-b border-border px-1.5">
        {running ? (
          <Tooltip content="Cancel the running query">
            <Button variant="outline" size="sm" onClick={() => cancelRun(tab.id)}>
              <Square className="fill-current" /> Cancel
            </Button>
          </Tooltip>
        ) : (
          <Tooltip content={hasSelection ? 'Run the selected SQL' : 'Run this query'} shortcut="Mod+Enter">
            <Button size="sm" onClick={() => execute('selection')} disabled={!draft.sql.trim()}>
              <Play className="fill-current" /> {hasSelection ? 'Run selection' : 'Run'}
            </Button>
          </Tooltip>
        )}
        {hasSelection && !running && (
          <Tooltip content="Run the whole query, ignoring the selection" shortcut="Mod+Shift+Enter">
            <Button variant="quiet" size="sm" onClick={() => execute('all')}>
              Run all
            </Button>
          </Tooltip>
        )}
        <Tooltip content="Show the execution plan without running the query" shortcut="Mod+E">
          <Button variant="quiet" size="sm" onClick={() => execute('selection', true)} disabled={running || !draft.sql.trim()}>
            <Binary /> Explain
          </Button>
        </Tooltip>
        <Divider />
        {engine.features.format && (
          <Tooltip content="Format SQL" shortcut="Shift+Alt+F">
            <Button variant="quiet" size="sm" onClick={format} disabled={!draft.sql.trim()}>
              <AlignLeft /> Format
            </Button>
          </Tooltip>
        )}
        <Tooltip content={dirty ? 'Save as the version to revert to' : 'No unsaved changes'} shortcut="Mod+S">
          <Button
            variant="quiet"
            size="icon-sm"
            aria-label="Save query"
            disabled={!dirty}
            onClick={() => updateDraft({ ...draft, savedSql: draft.sql })}
          >
            <Save />
          </Button>
        </Tooltip>
        <div className="ml-auto flex min-w-0 items-center gap-1.5">
          {running && (
            <span className="flex items-center gap-1 text-xxs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" /> Running…
            </span>
          )}
          <ConnectionSelect value={profileId} onChange={(id) => updateDraft({ ...draft, connectionId: id })} />
        </div>
      </div>
      <div className="min-h-0 flex-1" aria-label={`SQL editor. Press ${shortcutLabel('Mod+Enter')} to run.`}>
        <SqlEditor
          ref={editorRef}
          documentId={draft.id}
          value={draft.sql}
          active={active}
          onChange={(sql) => updateDraft({ ...draft, sql })}
          onRun={() => execute('selection')}
          onRunAll={() => execute('all')}
          onExplain={() => execute('selection', true)}
          onFormat={format}
          onSelectionChange={setHasSelection}
          getSchema={getSchema}
          language={engine.queryLanguage}
        />
      </div>
    </div>
  );
};
