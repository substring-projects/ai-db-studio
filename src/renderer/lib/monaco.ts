// Only the parts of Monaco a SQL editor needs. Importing editor.main would also pull in the
// TypeScript, CSS, HTML and JSON language services, which this app has no use for.
import * as monaco from 'monaco-editor/editor/editor.api.js';
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker';
import 'monaco-editor/editor/browser/coreCommands.js';
import 'monaco-editor/editor/browser/widget/codeEditor/codeEditorWidget.js';
import 'monaco-editor/editor/contrib/bracketMatching/browser/bracketMatching.js';
import 'monaco-editor/editor/contrib/clipboard/browser/clipboard.js';
import 'monaco-editor/editor/contrib/comment/browser/comment.js';
import 'monaco-editor/editor/contrib/contextmenu/browser/contextmenu.js';
import 'monaco-editor/editor/contrib/cursorUndo/browser/cursorUndo.js';
import 'monaco-editor/editor/contrib/find/browser/findController.js';
import 'monaco-editor/editor/contrib/folding/browser/folding.js';
import 'monaco-editor/editor/contrib/fontZoom/browser/fontZoom.js';
import 'monaco-editor/editor/contrib/hover/browser/hoverContribution.js';
import 'monaco-editor/editor/contrib/indentation/browser/indentation.js';
import 'monaco-editor/editor/contrib/linesOperations/browser/linesOperations.js';
import 'monaco-editor/editor/contrib/multicursor/browser/multicursor.js';
import 'monaco-editor/editor/contrib/placeholderText/browser/placeholderText.contribution.js';
import 'monaco-editor/editor/contrib/smartSelect/browser/smartSelect.js';
import 'monaco-editor/editor/contrib/snippet/browser/snippetController2.js';
import 'monaco-editor/editor/contrib/suggest/browser/suggestController.js';
import 'monaco-editor/editor/contrib/tokenization/browser/tokenization.js';
import 'monaco-editor/editor/contrib/wordHighlighter/browser/wordHighlighter.js';
import 'monaco-editor/editor/contrib/wordOperations/browser/wordOperations.js';
import 'monaco-editor/languages/definitions/sql/register.js';
// MongoDB shell statements are JavaScript-shaped; only the lightweight tokenizer is loaded.
import 'monaco-editor/languages/definitions/javascript/register.js';
import { MONGO_COLLECTION_METHODS, MONGO_CURSOR_METHODS, MONGO_DATABASE_METHODS, MONGO_OPERATORS } from '../../shared/mongoShell';
import type { DbTable, TableColumn } from '../../shared/types';
import { columnKey } from './sql';

self.MonacoEnvironment = { getWorker: () => new EditorWorker() };

export { monaco };

const THEMES = {
  'studio-dark': {
    base: 'vs-dark' as const,
    keyword: '7fa9ff',
    string: '93cf8e',
    number: 'e3b36a',
    comment: '7b8491',
    predefined: 'c8a2f0',
    operator: '98a1ad',
    colors: {
      'editor.background': '#181A20',
      'editor.foreground': '#E7EAEF',
      'editorLineNumber.foreground': '#50545E',
      'editorLineNumber.activeForeground': '#949CA8',
      'editor.lineHighlightBackground': '#1F2128',
      'editor.lineHighlightBorder': '#00000000',
      'editor.selectionBackground': '#4F8CFF40',
      'editor.inactiveSelectionBackground': '#4F8CFF22',
      'editorCursor.foreground': '#4F8CFF',
      'editorIndentGuide.background1': '#262A32',
      'editorWidget.background': '#1F2228',
      'editorWidget.border': '#2B2E36',
      'editorSuggestWidget.background': '#1F2228',
      'editorSuggestWidget.border': '#2B2E36',
      'editorSuggestWidget.selectedBackground': '#292C33',
      'list.hoverBackground': '#262A32',
      'scrollbarSlider.background': '#98A1AD33',
      'scrollbarSlider.hoverBackground': '#98A1AD55',
      focusBorder: '#4F8CFF',
    },
  },
  'studio-light': {
    base: 'vs' as const,
    keyword: '2456c7',
    string: '2b7a30',
    number: 'a85400',
    comment: '717c8b',
    predefined: '7b3fb5',
    operator: '5a6478',
    colors: {
      'editor.background': '#FFFFFF',
      'editor.foreground': '#20242B',
      'editorLineNumber.foreground': '#B0B7C3',
      'editorLineNumber.activeForeground': '#667085',
      'editor.lineHighlightBackground': '#F7F8FA',
      'editor.lineHighlightBorder': '#00000000',
      'editor.selectionBackground': '#346DE033',
      'editor.inactiveSelectionBackground': '#346DE01A',
      'editorCursor.foreground': '#346DE0',
      'editorIndentGuide.background1': '#E9EBEF',
      'editorWidget.background': '#FFFFFF',
      'editorWidget.border': '#E3E6EB',
      'editorSuggestWidget.background': '#FFFFFF',
      'editorSuggestWidget.border': '#E3E6EB',
      'editorSuggestWidget.selectedBackground': '#EDF0F4',
      'list.hoverBackground': '#F1F3F6',
      'scrollbarSlider.background': '#66708533',
      'scrollbarSlider.hoverBackground': '#66708555',
      focusBorder: '#346DE0',
    },
  },
};

for (const [name, theme] of Object.entries(THEMES)) {
  monaco.editor.defineTheme(name, {
    base: theme.base,
    inherit: true,
    // The base themes define `<token>.sql` rules, which outrank anything less specific.
    rules: [
      { token: 'keyword', foreground: theme.keyword },
      { token: 'keyword.sql', foreground: theme.keyword },
      { token: 'operator.sql', foreground: theme.operator },
      { token: 'string.sql', foreground: theme.string },
      { token: 'number', foreground: theme.number },
      { token: 'number.sql', foreground: theme.number },
      { token: 'comment', foreground: theme.comment },
      { token: 'comment.sql', foreground: theme.comment },
      { token: 'comment.quote.sql', foreground: theme.comment },
      { token: 'predefined.sql', foreground: theme.predefined },
      { token: 'delimiter.sql', foreground: theme.operator },
      // MongoDB shell (JavaScript tokenizer)
      { token: 'string', foreground: theme.string },
      { token: 'regexp', foreground: theme.string },
      { token: 'delimiter', foreground: theme.operator },
    ],
    colors: {
      ...theme.colors,
      ...Object.fromEntries(
        [1, 2, 3, 4, 5, 6].map((n) => [`editorBracketHighlight.foreground${n}`, theme.colors['editor.foreground']])
      ),
    },
  });
}

export const monacoTheme = (theme: 'dark' | 'light') => (theme === 'dark' ? 'studio-dark' : 'studio-light');

export interface CompletionSchema {
  tables: DbTable[];
  columns: Record<string, TableColumn[]>;
}

/** Each editor registers how to find its connection's schema, keyed by model URI. */
const schemaSources = new Map<string, () => CompletionSchema | undefined>();

export function registerSchemaSource(uri: string, source: () => CompletionSchema | undefined): () => void {
  schemaSources.set(uri, source);
  return () => schemaSources.delete(uri);
}

const KEYWORDS = `SELECT FROM WHERE GROUP BY ORDER BY HAVING LIMIT OFFSET JOIN LEFT JOIN RIGHT JOIN INNER JOIN FULL JOIN CROSS JOIN ON AND OR NOT IN IS NULL AS DISTINCT CASE WHEN THEN ELSE END INSERT INTO VALUES UPDATE SET DELETE CREATE TABLE ALTER DROP TRUNCATE PRIMARY KEY FOREIGN KEY REFERENCES EXPLAIN UNION ALL WITH LIKE BETWEEN EXISTS ASC DESC COUNT SUM AVG MIN MAX COALESCE`;
const KEYWORD_LIST = [
  ...new Set(
    KEYWORDS.replace(/(GROUP|ORDER|LEFT|RIGHT|INNER|FULL|CROSS|PRIMARY|FOREIGN) (BY|JOIN|KEY)/g, '$1_$2')
      .split(' ')
      .map((k) => k.replace('_', ' '))
  ),
];

/** Maps aliases to tables from the FROM and JOIN clauses, so `o.` completes the columns of orders. */
function resolveAliases(text: string): Map<string, string> {
  const aliases = new Map<string, string>();
  const pattern = /\b(?:FROM|JOIN|UPDATE|INTO)\s+(?:["`]?\w+["`]?\.)?["`]?(\w+)["`]?(?:\s+(?:AS\s+)?(\w+))?/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    aliases.set(match[1].toLowerCase(), match[1]);
    if (match[2]) aliases.set(match[2].toLowerCase(), match[1]);
  }
  return aliases;
}

monaco.languages.registerCompletionItemProvider('sql', {
  triggerCharacters: ['.'],
  provideCompletionItems(model, position) {
    const schema = schemaSources.get(model.uri.toString())?.();
    const word = model.getWordUntilPosition(position);
    const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
    const { Keyword, Class, Field } = monaco.languages.CompletionItemKind;
    const before = model.getLineContent(position.lineNumber).slice(0, word.startColumn - 1);
    const qualifier = before.match(/["`]?(\w+)["`]?\.$/)?.[1];

    const tables = schema?.tables ?? [];
    const columnsOf = (name: string): TableColumn[] => {
      const table = tables.find((t) => t.name.toLowerCase() === name.toLowerCase());
      return table ? schema?.columns[columnKey(table.name, table.schema)] ?? [] : [];
    };
    const columnItem = (c: TableColumn, sortText = '0') => ({
      label: c.name,
      kind: Field,
      detail: c.typeName,
      insertText: c.name,
      range,
      sortText: sortText + c.name,
    });

    if (qualifier) {
      const table = resolveAliases(model.getValue()).get(qualifier.toLowerCase()) ?? qualifier;
      return { suggestions: columnsOf(table).map((c) => columnItem(c)) };
    }

    const inScope = [...new Set(resolveAliases(model.getValue()).values())];
    return {
      suggestions: [
        ...inScope.flatMap((t) => columnsOf(t).map((c) => columnItem(c))),
        ...tables.map((t) => ({
          label: t.name,
          kind: Class,
          detail: t.type === 'VIEW' ? 'view' : 'table',
          insertText: t.name,
          range,
          sortText: `1${t.name}`,
        })),
        ...KEYWORD_LIST.map((k) => ({ label: k, kind: Keyword, insertText: k, range, sortText: `2${k}` })),
      ],
    };
  },
});

/** Editor language for a query language: MongoDB shell statements use the JavaScript tokenizer. */
export const editorLanguage = (queryLanguage: 'sql' | 'mongodb') => (queryLanguage === 'mongodb' ? 'javascript' : 'sql');

/** The collection a `db.name.` or `db.getCollection("name").` chain before the cursor refers to. */
function chainCollection(text: string): string | undefined {
  const matches = [...text.matchAll(/\bdb\.(?:getCollection\(\s*["']([^"']+)["']\s*\)|([A-Za-z_$][\w$]*))/g)];
  const last = matches[matches.length - 1];
  return last ? last[1] ?? last[2] : undefined;
}

monaco.languages.registerCompletionItemProvider('javascript', {
  triggerCharacters: ['.', '$', '"'],
  provideCompletionItems(model, position) {
    const source = schemaSources.get(model.uri.toString());
    // Only query editors register a schema source; other JavaScript models get nothing.
    if (!source) return { suggestions: [] };
    const schema = source();
    const word = model.getWordUntilPosition(position);
    const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
    const { Method, Class, Field, Operator } = monaco.languages.CompletionItemKind;
    const textBefore = model.getValueInRange(new monaco.Range(1, 1, position.lineNumber, word.startColumn));
    const tables = schema?.tables ?? [];
    const method = (name: string, sortText: string) => ({
      label: name,
      kind: Method,
      insertText: `${name}($0)`,
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      range,
      sortText: `${sortText}${name}`,
    });

    // db.|
    if (/\bdb\.$/.test(textBefore)) {
      return {
        suggestions: [
          ...tables.map((t) => ({
            label: t.name,
            kind: Class,
            detail: t.type === 'VIEW' ? 'view' : 'collection',
            insertText: /^[A-Za-z_$][\w$]*$/.test(t.name) ? t.name : `getCollection(${JSON.stringify(t.name)})`,
            range,
            sortText: `0${t.name}`,
          })),
          ...MONGO_DATABASE_METHODS.map((m) => method(m, '1')),
        ],
      };
    }
    // db.users.|  or  db.getCollection("x").|
    if (/\bdb\.(?:[A-Za-z_$][\w$]*|getCollection\([^)]*\))\.$/.test(textBefore)) {
      return { suggestions: MONGO_COLLECTION_METHODS.map((m) => method(m, '0')) };
    }
    // ...find({...}).|
    if (/\)\s*\.$/.test(textBefore)) {
      return { suggestions: MONGO_CURSOR_METHODS.map((m) => method(m, '0')) };
    }
    // Inside a document: field names of the collection, and $operators.
    const collection = chainCollection(textBefore);
    const columns = collection ? schema?.columns[columnKey(collection)] ?? [] : [];
    const typingOperator = textBefore.endsWith('$') || model.getLineContent(position.lineNumber)[word.startColumn - 2] === '$';
    return {
      suggestions: [
        ...(typingOperator
          ? []
          : columns.map((c) => ({ label: c.name, kind: Field, detail: c.typeName, insertText: c.name, range, sortText: `0${c.name}` }))),
        ...[...new Set(MONGO_OPERATORS)].map((op) => ({
          label: op,
          kind: Operator,
          insertText: typingOperator ? op.slice(1) : op,
          range,
          sortText: `1${op}`,
        })),
      ],
    };
  },
});
