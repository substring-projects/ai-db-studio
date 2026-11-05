import type { StatementClassification } from '../../shared/types';

export interface ReadOnlyVerdict {
  ok: boolean;
  reason?: string;
}

/** Kinds of statement that only ever read. Everything else needs human approval. */
const READ_VERBS = new Set(['SELECT', 'SHOW', 'DESCRIBE', 'DESC']);

/** Verbs allowed through the strict gate that guards AI-generated SQL. */
const STRICT_LEADING_VERBS = new Set(['SELECT', 'WITH', 'SHOW', 'DESCRIBE', 'DESC', 'EXPLAIN']);

const MUTATION_KEYWORDS = /\b(INSERT|UPDATE|DELETE|MERGE|UPSERT|DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE)\b/i;

/**
 * Functions that have side effects or reach outside the database even inside a
 * read-only transaction, so the database cannot be relied on to stop them.
 */
const UNSAFE_FUNCTIONS =
  /\b(pg_terminate_backend|pg_cancel_backend|pg_reload_conf|pg_rotate_logfile|pg_read_file|pg_read_binary_file|pg_ls_dir|pg_stat_file|pg_sleep\w*|pg_advisory\w*|lo_\w+|dblink\w*|set_config|setval|nextval|load_file|sleep|benchmark|get_lock|release_lock)\s*\(/i;

export class SqlClassifier {
  /**
   * Reduces SQL to its code: comments are removed, string literals and quoted
   * identifiers are blanked, and it is split on statement-terminating semicolons.
   * Keyword checks must run on this form so that text inside a string can neither
   * hide a statement nor trigger a false match.
   */
  public static analyze(sql: string): { statements: string[]; hasExecutableComment: boolean } {
    const statements: string[] = [];
    let current = '';
    let hasExecutableComment = false;
    let i = 0;

    while (i < sql.length) {
      const ch = sql[i];
      const next = sql[i + 1];

      if ((ch === '-' && next === '-') || ch === '#') {
        const end = sql.indexOf('\n', i);
        i = end === -1 ? sql.length : end;
        continue;
      }

      if (ch === '/' && next === '*') {
        // MySQL runs the body of /*! ... */ and /*M! ... */ as real SQL.
        if (sql[i + 2] === '!' || (sql[i + 2] === 'M' && sql[i + 3] === '!')) {
          hasExecutableComment = true;
        }
        const end = sql.indexOf('*/', i + 2);
        i = end === -1 ? sql.length : end + 2;
        current += ' ';
        continue;
      }

      if (ch === "'" || ch === '"' || ch === '`') {
        let j = i + 1;
        while (j < sql.length) {
          if (sql[j] === '\\' && ch === "'") {
            j += 2;
          } else if (sql[j] === ch && sql[j + 1] === ch) {
            j += 2;
          } else if (sql[j] === ch) {
            break;
          } else {
            j += 1;
          }
        }
        current += ch === "'" ? "''" : '""';
        i = j + 1;
        continue;
      }

      if (ch === '$') {
        const tag = sql.slice(i).match(/^\$[A-Za-z_]*\$/);
        if (tag) {
          const end = sql.indexOf(tag[0], i + tag[0].length);
          i = end === -1 ? sql.length : end + tag[0].length;
          current += "''";
          continue;
        }
      }

      if (ch === ';') {
        if (current.trim()) statements.push(current.trim());
        current = '';
        i += 1;
        continue;
      }

      current += ch;
      i += 1;
    }

    if (current.trim()) statements.push(current.trim());
    return { statements, hasExecutableComment };
  }

  private static classifyStatement(code: string): Pick<StatementClassification, 'isReadOnly' | 'kind'> {
    const firstWord = (code.match(/^[a-zA-Z]+/)?.[0] || '').toUpperCase();

    if (firstWord === 'EXPLAIN') {
      // EXPLAIN ANALYZE really executes its statement, so it is only as safe as that statement.
      const executes = /^EXPLAIN\s*(\([^)]*\banalyze\b[^)]*\)|(\s*(VERBOSE)\s+)?ANALY[ZS]E\b)/i.test(code);
      if (!executes) return { isReadOnly: true, kind: 'SELECT' };
      const inner = code
        .replace(/^EXPLAIN\s*(\([^)]*\))?/i, '')
        .replace(/^\s*(VERBOSE\s+)?ANALY[ZS]E\s*/i, '')
        .replace(/^\s*VERBOSE\s*/i, '');
      return this.classifyStatement(inner);
    }

    if (firstWord === 'WITH') {
      const hasMutation = /\b(INSERT|UPDATE|DELETE|MERGE)\b/i.test(code) || /\bINTO\b/i.test(code);
      return { isReadOnly: !hasMutation, kind: hasMutation ? 'UPDATE' : 'SELECT' };
    }

    if (READ_VERBS.has(firstWord)) {
      // SELECT ... INTO creates a table (PostgreSQL) or writes a file (MySQL).
      if (firstWord === 'SELECT' && /\bINTO\b/i.test(code)) {
        return { isReadOnly: false, kind: 'DDL' };
      }
      return { isReadOnly: true, kind: 'SELECT' };
    }

    if (firstWord === 'INSERT') return { isReadOnly: false, kind: 'INSERT' };
    if (firstWord === 'UPDATE') return { isReadOnly: false, kind: 'UPDATE' };
    if (firstWord === 'DELETE') return { isReadOnly: false, kind: 'DELETE' };
    if (['CREATE', 'ALTER', 'DROP', 'TRUNCATE', 'RENAME'].includes(firstWord)) {
      return { isReadOnly: false, kind: 'DDL' };
    }
    return { isReadOnly: false, kind: 'OTHER' };
  }

  /** Classifies a whole script: it is read-only only if every statement in it is. */
  public static classify(sql: string): StatementClassification {
    const { statements, hasExecutableComment } = this.analyze(sql);
    if (statements.length === 0) {
      return { isReadOnly: !hasExecutableComment, kind: 'OTHER', statementCount: 0 };
    }

    const results = statements.map((s) => this.classifyStatement(s));
    const firstWrite = results.find((r) => !r.isReadOnly);
    if (hasExecutableComment) {
      return { isReadOnly: false, kind: firstWrite?.kind ?? 'OTHER', statementCount: statements.length };
    }
    return {
      isReadOnly: !firstWrite,
      kind: firstWrite?.kind ?? results[0].kind,
      statementCount: statements.length,
    };
  }

  /**
   * The gate for AI-generated SQL: exactly one statement, a read verb, and nothing
   * that writes or has side effects. Deliberately stricter than classify(), which
   * only decides whether a human must approve.
   */
  public static checkStrictReadOnly(sql: string): ReadOnlyVerdict {
    const { statements, hasExecutableComment } = this.analyze(sql);

    if (hasExecutableComment) return { ok: false, reason: 'Executable comments are not allowed.' };
    if (statements.length === 0) return { ok: false, reason: 'There is no statement to run.' };
    if (statements.length > 1) return { ok: false, reason: 'Only a single statement can be run.' };

    const code = statements[0];
    const verb = (code.match(/^[a-zA-Z]+/)?.[0] || '').toUpperCase();

    if (!STRICT_LEADING_VERBS.has(verb)) {
      return { ok: false, reason: `${verb || 'This statement'} is not a read-only statement.` };
    }
    const mutation = code.match(MUTATION_KEYWORDS);
    if (mutation) return { ok: false, reason: `${mutation[1].toUpperCase()} is not allowed.` };
    if (/\bINTO\b/i.test(code)) return { ok: false, reason: 'INTO is not allowed.' };

    const unsafe = code.match(UNSAFE_FUNCTIONS);
    if (unsafe) return { ok: false, reason: `${unsafe[1]}() is not allowed.` };

    return { ok: true };
  }
}
