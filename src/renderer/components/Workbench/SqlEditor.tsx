import React, { useEffect, useImperativeHandle, useRef } from 'react';
import { useStudio } from '../../context/StudioContext';
import { editorCursorStore } from '../../context/WorkspaceContext';
import { CompletionSchema, monaco, monacoTheme, registerSchemaSource } from '../../lib/monaco';
import { prefs } from '../../lib/utils';

export interface SqlEditorHandle {
  /** The selected text if there is a selection, otherwise null. */
  getSelection: () => string | null;
  focus: () => void;
}

interface SqlEditorProps {
  documentId: string;
  value: string;
  active: boolean;
  onChange: (value: string) => void;
  onRun: () => void;
  onRunAll: () => void;
  onExplain: () => void;
  onFormat: () => void;
  onSelectionChange: (hasSelection: boolean) => void;
  getSchema: () => CompletionSchema | undefined;
}

// Keys the app handles globally. Monaco would otherwise swallow them (Cmd+K starts a chord).
const passthrough = (key: string) => () => window.dispatchEvent(new CustomEvent('studio:command', { detail: key }));

export const SqlEditor = React.forwardRef<SqlEditorHandle, SqlEditorProps>(
  ({ documentId, value, active, onChange, onRun, onRunAll, onExplain, onFormat, onSelectionChange, getSchema }, ref) => {
    const { theme } = useStudio();
    const hostRef = useRef<HTMLDivElement>(null);
    const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
    const applyingExternal = useRef(false);
    // What the editor last reported. A `value` equal to this is just our own edit coming back,
    // possibly older than the text by now, so it must not be written over what was typed since.
    const lastEmitted = useRef(value);

    // Monaco's commands are bound once, so they read the latest callbacks through a ref.
    const callbacks = useRef({ onChange, onRun, onRunAll, onExplain, onFormat, onSelectionChange, getSchema });
    callbacks.current = { onChange, onRun, onRunAll, onExplain, onFormat, onSelectionChange, getSchema };
    const activeRef = useRef(active);
    activeRef.current = active;

    useImperativeHandle(ref, () => ({
      getSelection: () => {
        const editor = editorRef.current;
        const selection = editor?.getSelection();
        if (!editor || !selection || selection.isEmpty()) return null;
        return editor.getModel()?.getValueInRange(selection) ?? null;
      },
      focus: () => editorRef.current?.focus(),
    }));

    useEffect(() => {
      const model = monaco.editor.createModel(value, 'sql', monaco.Uri.parse(`studio://query/${documentId}.sql`));
      const unregister = registerSchemaSource(model.uri.toString(), () => callbacks.current.getSchema());
      const editor = monaco.editor.create(hostRef.current!, {
        model,
        theme: monacoTheme(theme),
        automaticLayout: true,
        minimap: { enabled: false },
        fontFamily: '"SF Mono", "JetBrains Mono", Menlo, Consolas, monospace',
        fontSize: 12.5,
        lineHeight: 20,
        mouseWheelZoom: true,
        lineNumbersMinChars: 3,
        lineDecorationsWidth: 8,
        glyphMargin: false,
        folding: false,
        renderLineHighlight: 'line',
        scrollBeyondLastLine: false,
        overviewRulerLanes: 0,
        hideCursorInOverviewRuler: true,
        overviewRulerBorder: false,
        scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10, useShadows: false },
        padding: { top: 8, bottom: 8 },
        tabSize: 2,
        wordWrap: 'off',
        fixedOverflowWidgets: true,
        contextmenu: true,
        placeholder: 'Write SQL here, or press the run shortcut to execute it',
        suggest: { showWords: false },
        quickSuggestionsDelay: 120,
        stickyScroll: { enabled: false },
        occurrencesHighlight: 'off',
        bracketPairColorization: { enabled: false },
        guides: { indentation: false },
      });
      editorRef.current = editor;

      const { CtrlCmd, Shift, Alt } = monaco.KeyMod;
      const { Enter, KeyE, KeyF, KeyK, KeyB, KeyJ, KeyW, KeyT, KeyS } = monaco.KeyCode;
      editor.addCommand(CtrlCmd | Enter, () => callbacks.current.onRun());
      editor.addCommand(CtrlCmd | Shift | Enter, () => callbacks.current.onRunAll());
      editor.addCommand(CtrlCmd | KeyE, () => callbacks.current.onExplain());
      editor.addCommand(Shift | Alt | KeyF, () => callbacks.current.onFormat());
      for (const [key, name] of [
        [KeyK, 'command-palette'],
        [KeyB, 'toggle-sidebar'],
        [KeyJ, 'toggle-panel'],
        [KeyW, 'close-tab'],
        [KeyT, 'new-query'],
        [KeyS, 'save-query'],
      ] as const) {
        editor.addCommand(CtrlCmd | key, passthrough(name));
      }
      editor.addCommand(CtrlCmd | Shift | monaco.KeyCode.KeyL, passthrough('new-chat'));
      editor.addCommand(CtrlCmd | monaco.KeyCode.KeyL, passthrough('toggle-ai-panel'));
      editor.addCommand(CtrlCmd | monaco.KeyCode.Equal, () => {
        monaco.editor.EditorZoom.setZoomLevel(monaco.editor.EditorZoom.getZoomLevel() + 1);
      });
      editor.addCommand(CtrlCmd | monaco.KeyCode.Minus, () => {
        monaco.editor.EditorZoom.setZoomLevel(monaco.editor.EditorZoom.getZoomLevel() - 1);
      });
      editor.addCommand(CtrlCmd | monaco.KeyCode.Digit0, () => {
        monaco.editor.EditorZoom.setZoomLevel(0);
      });

      const savedZoom = prefs.get<number>('studio:editorZoom', 0);
      if (typeof savedZoom === 'number' && savedZoom !== monaco.editor.EditorZoom.getZoomLevel()) {
        monaco.editor.EditorZoom.setZoomLevel(savedZoom);
      }

      const reportCursor = () => {
        if (!activeRef.current) return;
        const position = editor.getPosition();
        const selection = editor.getSelection();
        if (!position) return;
        const selected = selection && !selection.isEmpty() ? model.getValueInRange(selection).length : 0;
        editorCursorStore.set({ line: position.lineNumber, column: position.column, selected });
        callbacks.current.onSelectionChange(selected > 0);
      };

      const subscriptions = [
        model.onDidChangeContent(() => {
          if (applyingExternal.current) return;
          lastEmitted.current = model.getValue();
          callbacks.current.onChange(lastEmitted.current);
        }),
        editor.onDidChangeCursorSelection(reportCursor),
        editor.onDidFocusEditorText(reportCursor),
        monaco.editor.EditorZoom.onDidChangeZoomLevel((zoom) => {
          prefs.set('studio:editorZoom', zoom);
        }),
      ];

      return () => {
        subscriptions.forEach((s) => s.dispose());
        unregister();
        editor.dispose();
        model.dispose();
        editorRef.current = null;
      };
      // The document id is fixed for this component's lifetime: each SQL tab owns one editor.
    }, [documentId]);

    useEffect(() => {
      monaco.editor.setTheme(monacoTheme(theme));
    }, [theme]);

    // Edits from outside the editor, such as Format or Revert, keep the undo stack intact.
    useEffect(() => {
      const editor = editorRef.current;
      const model = editor?.getModel();
      if (!editor || !model || value === lastEmitted.current || model.getValue() === value) return;
      lastEmitted.current = value;
      applyingExternal.current = true;
      editor.pushUndoStop();
      editor.executeEdits('studio', [{ range: model.getFullModelRange(), text: value }]);
      editor.pushUndoStop();
      applyingExternal.current = false;
    }, [value]);

    useEffect(() => {
      if (active) {
        editorRef.current?.focus();
      }
    }, [active]);

    return <div ref={hostRef} className="h-full w-full" />;
  }
);
SqlEditor.displayName = 'SqlEditor';
