import { Cable, FileCode2, Layers, MessageSquare, Network, Rows3, Settings, Table2 } from 'lucide-react';
import type { WorkspaceTab } from '../../context/WorkspaceContext';
import type { SqlDraft } from '../../../shared/types';
import type { Conversation } from '../../context/ChatContext';

export function tabIcon(tab: WorkspaceTab): React.ElementType {
  switch (tab.kind) {
    case 'sql':
      return FileCode2;
    case 'table':
      return Table2;
    case 'structure':
      return Layers;
    case 'er':
      return Network;
    case 'ai':
      return MessageSquare;
    case 'result':
      return Rows3;
    case 'connections':
      return Cable;
    case 'settings':
      return Settings;
  }
}

/** Same-named tables can exist in different schemas, so tabs outside the default say which. */
const qualified = (table: string, schema?: string) => (schema && schema !== 'public' ? `${schema}.${table}` : table);

export function tabTitle(tab: WorkspaceTab, drafts: SqlDraft[], conversations: Conversation[]): string {
  switch (tab.kind) {
    case 'sql':
      return drafts.find((d) => d.id === tab.draftId)?.title ?? 'Query';
    case 'table':
      return qualified(tab.table, tab.schema);
    case 'structure':
      return `${qualified(tab.table, tab.schema)} · structure`;
    case 'er':
      return tab.schema ? `ER Diagram · ${tab.schema}` : 'ER Diagram';
    case 'ai':
      return conversations.find((c) => c.id === tab.conversationId)?.title ?? 'AI Assistant';
    case 'result':
      return tab.title;
    case 'connections':
      return 'Connections';
    case 'settings':
      return 'Settings';
  }
}
