import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { DbTable, TableColumn, TableStructure } from '../../shared/types';
import { cleanError, useStudio } from './StudioContext';
import { columnKey } from '../lib/sql';

export interface SchemaEntry {
  status: 'loading' | 'ready' | 'error';
  error?: string;
  tables: DbTable[];
  columns: Record<string, TableColumn[]>;
}

interface SchemaContextType {
  schemas: Record<string, SchemaEntry>;
  /** Structures fetched so far, keyed by `${profileId}:${columnKey}`. */
  structures: Record<string, TableStructure>;
  loadSchema: (profileId: string) => Promise<void>;
  loadStructure: (profileId: string, table: string, schema?: string, force?: boolean) => Promise<TableStructure>;
}

const SchemaContext = createContext<SchemaContextType | undefined>(undefined);

export const structureKey = (profileId: string, table: string, schema?: string) =>
  `${profileId}:${columnKey(table, schema)}`;

export const SchemaProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { connectedProfileIds } = useStudio();
  const [schemas, setSchemas] = useState<Record<string, SchemaEntry>>({});
  const [structures, setStructures] = useState<Record<string, TableStructure>>({});
  const structuresRef = useRef(structures);
  structuresRef.current = structures;

  const loadSchema = useCallback(async (profileId: string) => {
    setSchemas((prev) => ({
      ...prev,
      [profileId]: { tables: prev[profileId]?.tables ?? [], columns: prev[profileId]?.columns ?? {}, status: 'loading' },
    }));
    try {
      const [tables, columns] = await Promise.all([
        window.electronAPI.getTables(profileId),
        window.electronAPI.getAllColumns(profileId).catch(() => ({})),
      ]);
      setSchemas((prev) => ({ ...prev, [profileId]: { status: 'ready', tables, columns } }));
      setStructures((prev) =>
        Object.fromEntries(Object.entries(prev).filter(([key]) => !key.startsWith(`${profileId}:`)))
      );
    } catch (err) {
      setSchemas((prev) => ({
        ...prev,
        [profileId]: { tables: prev[profileId]?.tables ?? [], columns: prev[profileId]?.columns ?? {}, status: 'error', error: cleanError(err) },
      }));
    }
  }, []);

  const loadStructure = useCallback(async (profileId: string, table: string, schema?: string, force = false) => {
    const key = structureKey(profileId, table, schema);
    const cached = structuresRef.current[key];
    if (cached && !force) return cached;
    const structure = await window.electronAPI.getTableStructure(profileId, table, schema);
    setStructures((prev) => ({ ...prev, [key]: structure }));
    return structure;
  }, []);

  // Load a schema when its connection opens; forget it when the connection closes.
  const loaded = useRef(new Set<string>());
  useEffect(() => {
    for (const id of connectedProfileIds) {
      if (!loaded.current.has(id)) {
        loaded.current.add(id);
        loadSchema(id);
      }
    }
    for (const id of [...loaded.current]) {
      if (!connectedProfileIds.includes(id)) {
        loaded.current.delete(id);
        setSchemas((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }
    }
  }, [connectedProfileIds, loadSchema]);

  const value = useMemo(
    () => ({ schemas, structures, loadSchema, loadStructure }),
    [schemas, structures, loadSchema, loadStructure]
  );
  return <SchemaContext.Provider value={value}>{children}</SchemaContext.Provider>;
};

export const useSchema = () => {
  const context = useContext(SchemaContext);
  if (!context) throw new Error('useSchema must be used within a SchemaProvider');
  return context;
};
