import { engineInfo } from '../../shared/engines.ts';
import { browseStatement, collectionRef, dropStatement } from '../../shared/mongoShell.ts';
import type { Engine } from '../../shared/types';
import { qualifiedName } from './sql.ts';

/**
 * Statements the interface writes for a table or collection, in the connection's own query
 * language. New databases add a branch here (or reuse the SQL one) instead of every caller
 * checking the engine.
 */

/** A starter query that shows the first rows. */
export function browseQuery(engine: Engine | undefined, table: string, schema?: string): string {
  if (engineInfo(engine).queryLanguage === 'mongodb') return browseStatement(table);
  return `SELECT *\nFROM ${qualifiedName(engine, table, schema)}\nLIMIT 100;`;
}

/** Removes every row but keeps the table, or null when the database has no such statement. */
export function truncateStatement(engine: Engine | undefined, table: string, schema?: string): string | null {
  if (engineInfo(engine).queryLanguage === 'mongodb') return `${collectionRef(table)}.deleteMany({})`;
  if (!engineInfo(engine).features.truncate) return null;
  return `TRUNCATE TABLE ${qualifiedName(engine, table, schema)};`;
}

/** Menu label for truncateStatement. */
export function truncateLabel(engine: Engine | undefined): string {
  return engineInfo(engine).queryLanguage === 'mongodb' ? 'Delete all documents…' : 'Truncate table…';
}

export function dropTableStatement(engine: Engine | undefined, table: string, schema?: string): string {
  if (engineInfo(engine).queryLanguage === 'mongodb') return dropStatement(table);
  return `DROP TABLE ${qualifiedName(engine, table, schema)};`;
}

/** Text shown in the log for a table view's data request. */
export function tableReadDescription(engine: Engine | undefined, table: string, schema?: string): string {
  if (engineInfo(engine).queryLanguage === 'mongodb') return `${browseStatement(table).replace(/\.limit\(\d+\)$/, '')}`;
  return `SELECT * FROM ${qualifiedName(engine, table, schema)}`;
}
