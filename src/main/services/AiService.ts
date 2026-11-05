/** Helpers around model replies, and the offline query engine used when no model is reachable. */
export class AiService {
  /**
   * Extracts clean SQL from markdown fences or raw query text.
   */
  public static extractSql(content: string): string | undefined {
    // 1. Check ```sql ... ```
    const sqlMatch = content.match(/```sql\s*([\s\S]*?)\s*```/i);
    if (sqlMatch && sqlMatch[1].trim()) return sqlMatch[1].trim();

    // 2. Check generic ``` ... ```
    const codeMatch = content.match(/```\s*([\s\S]*?)\s*```/);
    if (codeMatch && codeMatch[1].trim()) {
      const code = codeMatch[1].trim();
      if (/\b(SELECT|WITH|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|SHOW|EXPLAIN)\b/i.test(code)) {
        return code;
      }
    }

    // 3. Check for standalone statement starting with major SQL verb
    const rawSqlMatch = content.match(
      /\b(SELECT[\s\S]+?;|WITH[\s\S]+?;|INSERT\s+INTO[\s\S]+?;|UPDATE[\s\S]+?;|DELETE\s+FROM[\s\S]+?;)/i
    );
    if (rawSqlMatch && rawSqlMatch[1].trim()) {
      return rawSqlMatch[1].trim();
    }

    return undefined;
  }

  /**
   * Fast offline heuristic query synthesizer grounded in the schema metadata.
   */
  public static heuristicSql(prompt: string, schemaContext: string): string | undefined {
    const sql = this.synthesizeSql(prompt, schemaContext);
    // Double quotes are string literals in MySQL, so identifiers need backticks there.
    return sql && /dialect:\s*mysql/i.test(schemaContext) ? sql.replace(/"/g, '`') : sql;
  }

  private static synthesizeSql(prompt: string, schemaContext: string): string | undefined {
    const p = prompt.toLowerCase();

    // Extract table definitions and known column names from schemaContext
    // Matches e.g.: TABLE "users" (id integer PRIMARY KEY NOT NULL, email character varying NOT NULL);
    const tableRegex = /TABLE\s+["`]?([a-zA-Z0-9_]+)["`]?\s*\(([\s\S]*?)\);/gi;
    const tableNames: string[] = [];
    const schemaColumnsMap: Record<string, string[]> = {};

    let match: RegExpExecArray | null;
    while ((match = tableRegex.exec(schemaContext)) !== null) {
      const tableName = match[1];
      tableNames.push(tableName);

      const colsRaw = match[2];
      if (colsRaw && !colsRaw.includes('columns unknown')) {
        // Split by comma outside parentheses so types like numeric(10,2) aren't broken
        const cols = colsRaw
          .split(/,(?![^(]*\))/)
          .map((c) => {
            const trimmed = c.trim().replace(/^["`]|["`]/g, '');
            const colNameMatch = trimmed.match(/^([a-zA-Z0-9_]+)/);
            return colNameMatch ? colNameMatch[1] : '';
          })
          .filter(Boolean);
        schemaColumnsMap[tableName] = cols;
      } else {
        schemaColumnsMap[tableName] = [];
      }
    }

    const firstTable = tableNames[0];

    // Check if prompt specifically mentions any known table (or plural/singular)
    const matchedTable =
      tableNames.find((t) => {
        const tLower = t.toLowerCase();
        return p.includes(tLower) || (tLower.endsWith('s') && p.includes(tLower.slice(0, -1)));
      }) || firstTable;

    const matchedCols = matchedTable ? schemaColumnsMap[matchedTable] || [] : [];

    // Check for row counts
    if (p.includes('count') || p.includes('how many')) {
      if (matchedTable) {
        return `SELECT COUNT(*) AS total_count FROM "${matchedTable}";`;
      }
      return `SELECT table_name, table_rows FROM information_schema.tables WHERE table_schema = 'public';`;
    }

    // Check for recent/latest records: prefer exact timestamp/date/id column if present
    if (p.includes('recent') || p.includes('latest') || p.includes('newest')) {
      if (matchedTable) {
        const orderCol =
          matchedCols.find((c) => /^(created_at|created_on|inserted_at|timestamp|updated_at|date)$/i.test(c)) ||
          matchedCols.find((c) => /^id$/i.test(c)) ||
          '1';
        const colExpr = orderCol === '1' ? '1' : `"${orderCol}"`;
        return `SELECT * FROM "${matchedTable}" ORDER BY ${colExpr} DESC LIMIT 25;`;
      }
    }

    // Check for primary keys
    if (p.includes('primary key') || p.includes('pk')) {
      if (matchedTable) {
        const pkCol = matchedCols.find((c) => /^(id|uuid|pk|_id)$/i.test(c)) || matchedCols[0];
        if (pkCol) {
          return `SELECT "${pkCol}" FROM "${matchedTable}" LIMIT 50;`;
        }
      }
    }

    // Check for specific columns requested (e.g. "show user email and name")
    if (matchedTable && matchedCols.length > 0) {
      const referencedCols = matchedCols.filter((col) => {
        const colLower = col.toLowerCase();
        return p.includes(colLower);
      });
      if (referencedCols.length > 0 && referencedCols.length < matchedCols.length) {
        const colsFormatted = referencedCols.map((c) => `"${c}"`).join(', ');
        return `SELECT ${colsFormatted} FROM "${matchedTable}" LIMIT 50;`;
      }
    }

    if (p.includes('top') || p.includes('first') || p.includes('sample') || p.includes('preview')) {
      const limitMatch = p.match(/\b(\d+)\b/);
      const limit = limitMatch ? limitMatch[1] : '10';
      if (matchedTable) {
        return `SELECT * FROM "${matchedTable}" LIMIT ${limit};`;
      }
    }

    if (p.includes('tables') || p.includes('list all') || p.includes('show tables')) {
      return `SELECT table_name, table_type FROM information_schema.tables WHERE table_schema NOT IN ('information_schema', 'pg_catalog') ORDER BY table_name;`;
    }

    if (matchedTable) {
      return `SELECT * FROM "${matchedTable}" LIMIT 50;`;
    }

    return undefined;
  }
}
