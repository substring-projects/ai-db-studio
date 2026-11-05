import React from 'react';
import { WorkspaceTab } from '../../context/WorkspaceContext';
import { QueryResultsGrid } from './QueryResultsGrid';

/** A result pinned to its own tab: a snapshot that a later query run does not replace. */
export const ResultTab: React.FC<{ tab: Extract<WorkspaceTab, { kind: 'result' }> }> = ({ tab }) => (
  <QueryResultsGrid result={tab.result} fileBase={tab.title} />
);
