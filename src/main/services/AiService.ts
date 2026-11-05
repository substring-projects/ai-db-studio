import { WorkspaceSettings } from '../../shared/types';

export class AiService {
  public static async ask(
    prompt: string,
    schemaContext: string,
    settings: WorkspaceSettings
  ): Promise<{ content: string; sql?: string }> {
    const systemPrompt = `You are an expert SQL database assistant for AI DB Studio.
Your role is to write clean, optimized, syntactically correct SQL queries based on the provided schema definitions.

STRICT PRIVACY & ACCURACY RULES:
1. ONLY reference tables and columns listed in the Database Schema below. Do not invent columns.
2. Provide the recommended SQL query inside a fenced \`\`\`sql ... \`\`\` block.
3. Keep your textual explanation concise, direct, and actionable.

Database Schema:
${schemaContext || 'No schema metadata provided.'}`;

    if (settings.aiProvider === 'openai') {
      const endpoint = settings.aiEndpoint || 'https://api.openai.com/v1';
      const url = `${endpoint.replace(/\/+$/, '')}/chat/completions`;
      const model = settings.aiModel || 'gpt-4o-mini';

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${settings.aiApiKey || ''}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt },
          ],
          temperature: 0.2,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`OpenAI API error (${res.status}): ${errorText}`);
      }

      const data = await res.json();
      const content = data.choices?.[0]?.message?.content || 'No response generated.';
      const sqlMatch = content.match(/```sql\s*([\s\S]*?)\s*```/i);
      return {
        content,
        sql: sqlMatch ? sqlMatch[1].trim() : undefined,
      };
    } else {
      // Ollama
      const endpoint = settings.aiEndpoint || 'http://localhost:11434';
      const url = `${endpoint.replace(/\/+$/, '')}/api/generate`;
      const model = settings.aiModel || 'codellama';

      const fullPrompt = `${systemPrompt}\n\nUser Question:\n${prompt}\n\nSQL Answer:`;

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt: fullPrompt,
          stream: false,
          options: { temperature: 0.2 },
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Ollama API error (${res.status}): ${errorText}. Make sure Ollama is running at ${endpoint}`);
      }

      const data = await res.json();
      const content = data.response || 'No response generated.';
      const sqlMatch = content.match(/```sql\s*([\s\S]*?)\s*```/i);
      return {
        content,
        sql: sqlMatch ? sqlMatch[1].trim() : undefined,
      };
    }
  }
}
