import React, { useEffect, useMemo, useState } from 'react';
import { WorkspaceTab, useWorkspace } from '../../context/WorkspaceContext';
import { useStudio } from '../../context/StudioContext';
import { useSchema } from '../../context/SchemaContext';
import { ForeignKey, QueryResult } from '../../../shared/types';
import { columnKey, extractTableNameFromSql, qualifiedName, rowWhereClause } from '../../lib/sql';
import { pluralize } from '../../lib/utils';
import { QueryResultsGrid } from './QueryResultsGrid';
import { EditCellModal } from '../Modals/EditCellModal';

/** A result pinned to its own tab: a snapshot that a later query run does not replace. */
export const ResultTab: React.FC<{ tab: Extract<WorkspaceTab, { kind: 'result' }> }> = ({ tab }) => {
  const { profiles, openDangerModal, showToast } = useStudio();
  const { schemas, loadStructure } = useSchema();
  const { openTableData, runSql } = useWorkspace();

  const [currentResult, setCurrentResult] = useState<QueryResult>(tab.result);
  const [editing, setEditing] = useState<{ column: string; value: unknown; row: unknown[] } | null>(null);
  const [foreignKeys, setForeignKeys] = useState<ForeignKey[]>([]);

  const profile = tab.profileId ? profiles.find((p) => p.id === tab.profileId) : undefined;
  const tableInfo = useMemo(() => (tab.sql ? extractTableNameFromSql(tab.sql) : null), [tab.sql]);
  const columnMeta =
    tableInfo && tab.profileId
      ? schemas[tab.profileId]?.columns[columnKey(tableInfo.table, tableInfo.schema)]
      : undefined;

  useEffect(() => {
    if (!tab.profileId || !tableInfo) {
      setForeignKeys([]);
      return;
    }
    loadStructure(tab.profileId, tableInfo.table, tableInfo.schema)
      .then((s) => setForeignKeys(s.foreignKeys || []))
      .catch(() => undefined);
  }, [loadStructure, tab.profileId, tableInfo]);

  const qualifiedTable = tableInfo ? qualifiedName(profile?.engine, tableInfo.table, tableInfo.schema) : '';

  const runWrite = (sql: string, onSuccess?: () => void) => {
    if (!tab.profileId) return;
    runSql(tab.id, tab.profileId, sql, {
      background: true,
      onSuccess: () => {
        onSuccess?.();
      },
    });
  };

  const handleEditCell = (column: string, value: unknown, row: unknown[]) => {
    if (!tableInfo) {
      showToast('Cannot detect table from query.', 'warning');
      return;
    }
    setEditing({ column, value, row });
  };

  const handleDeleteRows = (rows: unknown[][]) => {
    if (!tableInfo || !tab.profileId || rows.length === 0) {
      showToast('Cannot detect table from query.', 'warning');
      return;
    }
    const clauses = rows.map((row) => rowWhereClause(profile?.engine, currentResult.columns, row, columnMeta ?? []));
    const where =
      clauses.length === 1
        ? clauses[0].where
        : `WHERE ${clauses.map((c) => `(${c.where.replace(/^WHERE /, '')})`).join('\n   OR ')}`;
    runWrite(`DELETE FROM ${qualifiedTable}\n${where};`, () => {
      showToast(`Deleted ${pluralize(rows.length, 'row')}`, 'success');
      setCurrentResult((prev) => ({
        ...prev,
        rows: prev.rows.filter((r) => !rows.includes(r)),
        rowCount: Math.max(0, prev.rowCount - rows.length),
      }));
    });
  };

  return (
    <div className="h-full min-h-0">
      <QueryResultsGrid
        result={currentResult}
        fileBase={tab.title}
        columnMeta={columnMeta}
        foreignKeys={foreignKeys}
        onEditCell={tableInfo && tab.profileId ? handleEditCell : undefined}
        onDeleteRows={tableInfo && tab.profileId ? handleDeleteRows : undefined}
        onOpenReferencedRow={(refTable) =>
          tab.profileId &&
          openTableData(tab.profileId, { name: refTable, schema: tableInfo?.schema, type: 'TABLE' })
        }
      />
      {editing && tableInfo && tab.profileId && (
        <EditCellModal
          tableName={tableInfo.table}
          qualifiedTable={qualifiedTable}
          columnName={editing.column}
          initialValue={editing.value}
          target={rowWhereClause(profile?.engine, currentResult.columns, editing.row, columnMeta ?? [])}
          engine={profile?.engine}
          columnType={columnMeta?.find((c) => c.name.toLowerCase() === editing.column.toLowerCase())?.typeName}
          onSave={(sql) => {
            runWrite(sql, () => {
              showToast('Row updated', 'success');
              if (tab.sql && tab.profileId) {
                window.electronAPI.executeQuery(tab.profileId, tab.sql).then(setCurrentResult).catch(() => undefined);
              }
            });
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
};
