import { StatementClassification } from '../../shared/types';

export class SqlClassifier {
  public static classify(sql: string): StatementClassification {
    const trimmed = sql.trim();
    if (!trimmed) {
      return { isReadOnly: true, kind: 'OTHER', statementCount: 0 };
    }

    // Remove comments
    const stripped = trimmed
      .replace(/--.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .trim();

    // Check statement count (rough semicolon split outside quotes)
    const statements = stripped
      .split(/;(?=(?:[^'"]*['"][^'"]*['"])*[^'"]*$)/)
      .map(s => s.trim())
      .filter(Boolean);

    const statementCount = statements.length;
    const firstStatement = statements[0] || stripped;
    const firstWordMatch = firstStatement.match(/^[a-zA-Z]+/);
    const firstWord = firstWordMatch ? firstWordMatch[0].toUpperCase() : '';

    if (firstWord === 'SELECT' || firstWord === 'SHOW' || firstWord === 'DESCRIBE' || firstWord === 'EXPLAIN') {
      return { isReadOnly: true, kind: 'SELECT', statementCount };
    }

    if (firstWord === 'WITH') {
      // Check if it's WITH ... SELECT or WITH ... INSERT/UPDATE/DELETE
      const hasMutation = /\b(INSERT|UPDATE|DELETE)\b/i.test(firstStatement);
      return {
        isReadOnly: !hasMutation,
        kind: hasMutation ? 'UPDATE' : 'SELECT',
        statementCount
      };
    }

    if (firstWord === 'INSERT') return { isReadOnly: false, kind: 'INSERT', statementCount };
    if (firstWord === 'UPDATE') return { isReadOnly: false, kind: 'UPDATE', statementCount };
    if (firstWord === 'DELETE') return { isReadOnly: false, kind: 'DELETE', statementCount };

    if (['CREATE', 'ALTER', 'DROP', 'TRUNCATE', 'RENAME'].includes(firstWord)) {
      return { isReadOnly: false, kind: 'DDL', statementCount };
    }

    return { isReadOnly: false, kind: 'OTHER', statementCount };
  }
}
