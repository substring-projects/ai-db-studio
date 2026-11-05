import { WorkspaceSettings } from '../../shared/types';

export interface ChatHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export class AiService {
  public static async ask(
    prompt: string,
    schemaContext: string,
    settings: WorkspaceSettings,
    history: ChatHistoryMessage[] = []
  ): Promise<{ content: string; sql?: string }> {
    const systemPrompt = `You are an expert SQL database engineer and data analyst for AI DB Studio.
Your mission is to understand user questions in natural language and generate clean, optimized, robust SQL queries.

STRICT ACCURACY & PRIVACY GUIDELINES:
1. Ground queries STRICTLY in the Database Schema provided below. Never invent table names or column names that are not in the schema.
2. If the user refers to a table or column by a synonym or singular/plural (e.g. "order" vs "orders", "user" vs "users"), map it accurately to the actual schema object.
3. ALWAYS enclose the recommended SQL query inside a single fenced \`\`\`sql ... \`\`\` code block.
4. Keep explanations concise, professional, and directly actionable.
5. Provide helpful notes on performance, indexes, or potential NULL handling when appropriate.

CURRENT DATABASE SCHEMA:
${schemaContext || 'No schema metadata provided. Write general SQL and clearly specify placeholder table names.'}`;

    // Try OpenAI or OpenAI-compatible endpoint (OpenRouter, Groq, LocalAI, vLLM, DeepSeek)
    if (settings.aiProvider === 'openai') {
      try {
        const endpoint = settings.aiEndpoint || 'https://api.openai.com/v1';
        const url = `${endpoint.replace(/\/+$/, '')}/chat/completions`;
        const model = settings.aiModel || 'gpt-4o-mini';

        const messages = [
          { role: 'system', content: systemPrompt },
          ...history.slice(-6).map((h) => ({ role: h.role, content: h.content })),
          { role: 'user', content: prompt },
        ];

        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${settings.aiApiKey || ''}`,
          },
          body: JSON.stringify({
            model,
            messages,
            temperature: 0.2,
          }),
        });

        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(`OpenAI API error (${res.status}): ${errorText}`);
        }

        const data = await res.json();
        const content = data.choices?.[0]?.message?.content || 'No response generated.';
        const sql = this.extractSql(content);

        return { content, sql };
      } catch (err: any) {
        // If API fails and user asked a natural language query, fallback to schema-grounded heuristic if applicable
        const fallback = this.heuristicSql(prompt, schemaContext);
        if (fallback) {
          return {
            content: `*Note: Remote AI request failed (${err.message}). Here is a schema-grounded query built by the local heuristic engine:*\n\n\`\`\`sql\n${fallback}\n\`\`\``,
            sql: fallback,
          };
        }
        throw err;
      }
    } else {
      // Ollama endpoint
      const endpoint = settings.aiEndpoint || 'http://localhost:11434';
      const model = settings.aiModel || 'codellama';

      try {
        // 1. Try Ollama /api/chat first (multi-turn messages format)
        const chatUrl = `${endpoint.replace(/\/+$/, '')}/api/chat`;
        const chatMessages = [
          { role: 'system', content: systemPrompt },
          ...history.slice(-6).map((h) => ({ role: h.role, content: h.content })),
          { role: 'user', content: prompt },
        ];

        const chatRes = await fetch(chatUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages: chatMessages,
            stream: false,
            options: { temperature: 0.2 },
          }),
        });

        if (chatRes.ok) {
          const chatData = await chatRes.json();
          const content = chatData.message?.content || 'No response generated.';
          const sql = this.extractSql(content);
          return { content, sql };
        }

        // 2. Fallback to Ollama /api/generate
        const genUrl = `${endpoint.replace(/\/+$/, '')}/api/generate`;
        const fullPrompt = `${systemPrompt}\n\nUser Question:\n${prompt}\n\nSQL Answer:`;

        const genRes = await fetch(genUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            prompt: fullPrompt,
            stream: false,
            options: { temperature: 0.2 },
          }),
        });

        if (!genRes.ok) {
          const errorText = await genRes.text();
          throw new Error(`Ollama API error (${genRes.status}): ${errorText}`);
        }

        const genData = await genRes.json();
        const content = genData.response || 'No response generated.';
        const sql = this.extractSql(content);

        return { content, sql };
      } catch (err: any) {
        // If Ollama is not running, provide smart schema-grounded local answer
        const fallback = this.heuristicSql(prompt, schemaContext);
        if (fallback) {
          return {
            content: `*Note: Could not reach Ollama at ${endpoint} (${err.message}). Here is a schema-grounded query generated by the local engine:*\n\n\`\`\`sql\n${fallback}\n\`\`\``,
            sql: fallback,
          };
        }
        throw new Error(
          `Ollama connection error: ${err.message}. Please verify that Ollama is running at ${endpoint} with model "${model}", or switch to OpenAI in Settings.`
        );
      }
    }
  }

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
    const p = prompt.toLowerCase();

    // Extract table names from schema context (e.g., "TABLE users (id, name)")
    const tableMatches = [...schemaContext.matchAll(/TABLE\s+([a-zA-Z0-9_]+)/gi)].map((m) => m[1]);
    const firstTable = tableMatches[0];

    // Check if prompt specifically mentions any known table
    const matchedTable = tableMatches.find((t) => p.includes(t.toLowerCase())) || firstTable;

    if (p.includes('count') || p.includes('how many')) {
      if (matchedTable) {
        return `SELECT COUNT(*) AS total_count FROM "${matchedTable}";`;
      }
      return `SELECT table_name, table_rows FROM information_schema.tables WHERE table_schema = 'public';`;
    }

    if (p.includes('recent') || p.includes('latest') || p.includes('newest')) {
      if (matchedTable) {
        return `SELECT * FROM "${matchedTable}" ORDER BY 1 DESC LIMIT 25;`;
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
