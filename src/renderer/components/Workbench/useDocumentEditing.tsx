import React, { useState } from 'react';
import type { QueryResult, TableColumn } from '../../../shared/types';
import { collectionRef, deleteStatement, toShell } from '../../../shared/mongoShell';
import { cleanError } from '../../context/StudioContext';
import { MongoDocumentModal, MongoEditFieldModal, documentTemplate } from '../Modals/MongoDocumentModals';

interface Options {
  profileId: string;
  /** Collection the rows came from; editing is off without one. */
  collection: string | null;
  result: QueryResult | null | undefined;
  /** Known fields of the collection, used to prefill new documents. */
  fields?: TableColumn[];
  /** Sends a statement through the normal review and run flow. */
  runWrite: (statement: string) => void;
  showToast: (message: string, tone: 'info' | 'success' | 'warning' | 'danger') => void;
}

/**
 * Editing for document databases, shared by the collection view and query results: every
 * change addresses one document by its _id and goes through the same review as typed writes.
 */
export function useDocumentEditing({ profileId, collection, result, fields, runWrite, showToast }: Options) {
  const [editingField, setEditingField] = useState<{ column: string; value: unknown; row: unknown[] } | null>(null);
  const [documentEdit, setDocumentEdit] = useState<{ mode: 'insert' | 'replace'; text: string; id?: unknown } | null>(null);

  const idOf = (row: unknown[]) => {
    const index = result?.columns.indexOf('_id') ?? -1;
    return index >= 0 ? row[index] : undefined;
  };

  /** Loads the stored document, so fields missing from it don't come back as nulls. */
  const editWholeDocument = async (row: unknown[]) => {
    const id = idOf(row);
    if (!collection || id === undefined) return;
    try {
      const found = await window.electronAPI.executeReadOnlyQuery(profileId, `${collectionRef(collection)}.findOne({ _id: ${toShell(id)} })`);
      if (found.rows.length === 0) {
        showToast('This document no longer exists. Refresh to see the current data.', 'warning');
        return;
      }
      const doc = Object.fromEntries(found.columns.map((c, i) => [c, found.rows[0][i]]));
      setDocumentEdit({ mode: 'replace', text: toShell(doc, 2), id });
    } catch (err) {
      showToast(`Could not load the document: ${cleanError(err)}`, 'danger');
    }
  };

  const onEditCell = (column: string, value: unknown, row: unknown[]) => {
    if (column === '_id') {
      showToast('_id can’t be changed. Insert a copy with a new _id and delete this one instead.', 'warning');
      return;
    }
    if (idOf(row) === undefined || idOf(row) === null) {
      showToast('Editing needs the _id field in the results.', 'warning');
      return;
    }
    setEditingField({ column, value, row });
  };

  const onDeleteRows = (rows: unknown[][]) => {
    if (!collection || rows.length === 0) return;
    const ids = rows.map(idOf);
    if (ids.some((id) => id === undefined || id === null)) {
      showToast('Deleting needs the _id field in the results.', 'warning');
      return;
    }
    runWrite(deleteStatement(collection, ids));
  };

  const onInsertRow = () => setDocumentEdit({ mode: 'insert', text: documentTemplate(fields ?? []) });

  const modals = collection ? (
    <>
      {editingField && (
        <MongoEditFieldModal
          collection={collection}
          field={editingField.column}
          initialValue={editingField.value}
          id={idOf(editingField.row)}
          onSave={runWrite}
          onEditDocument={() => editWholeDocument(editingField.row)}
          onClose={() => setEditingField(null)}
        />
      )}
      {documentEdit && (
        <MongoDocumentModal
          collection={collection}
          mode={documentEdit.mode}
          initialText={documentEdit.text}
          id={documentEdit.id}
          onSave={runWrite}
          onClose={() => setDocumentEdit(null)}
        />
      )}
    </>
  ) : null;

  return { onEditCell, onDeleteRows, onInsertRow, modals, editingField: Boolean(editingField) };
}
