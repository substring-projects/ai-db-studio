import React, { useState } from 'react';
import { Bot, Send, Sparkles, CornerDownLeft, Play, X, Shield, Loader2, ArrowRight } from 'lucide-react';
import { useStudio } from '../../context/StudioContext';
import { DbTable, TableColumn } from '../../../shared/types';

interface AiAssistantPanelProps {
  tables: DbTable[];
  columnsMap: Record<string, TableColumn[]>;
  onInsertSql: (sql: string) => void;
  onExecuteSql: (sql: string) => void;
  onClose: () => void;
}

export const AiAssistantPanel: React.FC<AiAssistantPanelProps> = ({
  tables,
  columnsMap,
  onInsertSql,
  onExecuteSql,
  onClose,
}) => {
  const { settings, showToast } = useStudio();
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<{ content: string; sql?: string } | null>(null);

  // Build grounded schema string (Strictly table & column names, ZERO row data)
  const buildSchemaContext = (): string => {
    return tables
      .map((t) => {
        const cols = columnsMap[t.name] || [];
        const colDefs = cols.map((c) => `${c.name} ${c.typeName}${c.primaryKey ? ' (PK)' : ''}`).join(', ');
        return `TABLE ${t.name} (${colDefs || 'columns unknown'});`;
      })
      .join('\n');
  };

  const handleAsk = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!prompt.trim() || loading) return;

    setLoading(true);
    setResponse(null);

    try {
      const schema = buildSchemaContext();
      const res = await window.electronAPI.askAi(prompt.trim(), schema, settings);
      setResponse(res);
    } catch (err: any) {
      showToast(err.message || 'AI request failed', 'danger');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-88 h-full flex flex-col bg-studio-sidebar border-l border-studio-border shrink-0 select-none animate-slide-right">
      {/* Header */}
      <div className="h-11 px-4 flex items-center justify-between border-b border-studio-border bg-studio-surface/40 shrink-0">
        <div className="flex items-center gap-2 text-xs font-semibold text-studio-text">
          <Sparkles className="w-4 h-4 text-purple-400" />
          <span>AI SQL Copilot</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/20">
            {settings.aiProvider === 'ollama' ? 'Ollama' : 'OpenAI'}
          </span>
          <button
            onClick={onClose}
            className="p-1 text-studio-muted hover:text-studio-text rounded hover:bg-white/5 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Privacy Badge */}
      <div className="p-3 bg-purple-500/5 border-b border-purple-500/15 flex items-start gap-2 text-[11px] text-purple-300/80 leading-tight">
        <Shield className="w-3.5 h-3.5 text-purple-400 shrink-0 mt-0.5" />
        <span>Grounded on {tables.length} tables. Zero database row values are ever sent to AI.</span>
      </div>

      {/* Conversation Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
        {response ? (
          <div className="space-y-3 animate-pop-in">
            <div className="p-3 bg-studio-surface border border-studio-border rounded-xl space-y-2">
              <div className="text-studio-text leading-relaxed whitespace-pre-wrap">{response.content}</div>

              {response.sql && (
                <div className="space-y-2 pt-2 border-t border-studio-border">
                  <pre className="p-3 bg-[#0a0a0c] text-studio-text rounded-lg border border-studio-border font-mono text-[11px] overflow-x-auto leading-relaxed">
                    {response.sql}
                  </pre>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => {
                        onInsertSql(response.sql!);
                        showToast('Inserted into draft', 'info');
                      }}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-studio-bg hover:bg-white/5 text-studio-text border border-studio-border rounded-lg font-medium transition-colors cursor-pointer"
                    >
                      <ArrowRight className="w-3 h-3 text-studio-accent" />
                      <span>Insert into Draft</span>
                    </button>
                    <button
                      onClick={() => onExecuteSql(response.sql!)}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-semibold shadow-xs transition-colors cursor-pointer"
                    >
                      <Play className="w-3 h-3 fill-current" />
                      <span>Run SQL</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center text-studio-muted space-y-2 p-6">
            <Bot className="w-8 h-8 text-studio-muted/50" />
            <p className="text-xs leading-relaxed">
              Ask in natural language to generate SQL queries grounded strictly in your database schema.
            </p>
            <div className="pt-2 text-[11px] space-y-1.5 text-studio-accent/80 font-mono">
              <button
                onClick={() => setPrompt('Show all tables with their estimated row counts')}
                className="w-full text-left p-1.5 rounded hover:bg-white/5 border border-dashed border-studio-border/50 truncate cursor-pointer"
              >
                "Show all tables with row counts"
              </button>
              <button
                onClick={() => setPrompt('Find the top 10 most recent records created')}
                className="w-full text-left p-1.5 rounded hover:bg-white/5 border border-dashed border-studio-border/50 truncate cursor-pointer"
              >
                "Find the top 10 most recent records"
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Input Form */}
      <form onSubmit={handleAsk} className="p-3 border-t border-studio-border bg-studio-surface/50">
        <div className="relative flex items-center">
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Ask AI to write SQL…"
            disabled={loading}
            className="w-full pl-3 pr-10 py-2 text-xs bg-studio-bg border border-studio-border rounded-lg text-studio-text placeholder-studio-muted focus:outline-none focus:border-purple-400 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!prompt.trim() || loading}
            className="absolute right-1.5 p-1.5 text-purple-400 hover:text-purple-300 disabled:opacity-40 transition-colors cursor-pointer"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          </button>
        </div>
      </form>
    </div>
  );
};
