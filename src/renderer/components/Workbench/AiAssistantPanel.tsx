import React, { useState, useRef, useEffect } from 'react';
import {
  Bot,
  Send,
  Sparkles,
  Play,
  X,
  Shield,
  Loader2,
  ArrowRight,
  Copy,
  Check,
  Trash2,
  HelpCircle,
  Database,
  Cpu,
} from 'lucide-react';
import { useStudio } from '../../context/StudioContext';
import { DbTable, TableColumn, AiMessage } from '../../../shared/types';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { cn } from '../../lib/utils';

interface AiAssistantPanelProps {
  tables: DbTable[];
  columnsMap: Record<string, TableColumn[]>;
  onInsertSql: (sql: string) => void;
  onExecuteSql: (sql: string) => void;
  onClose: () => void;
  width?: number;
  onRefreshSchema?: () => void;
}

const SUGGESTIONS = [
  'Show table row counts',
  'Find top 10 most recent records',
  'List tables with their primary keys',
  'Identify tables with foreign keys',
  'Write an aggregation query',
];

export const AiAssistantPanel: React.FC<AiAssistantPanelProps> = ({
  tables,
  columnsMap,
  onInsertSql,
  onExecuteSql,
  onClose,
  width,
  onRefreshSchema,
}) => {
  const { settings, updateSettings, showToast } = useStudio();
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Total grounded columns count
  const totalGroundedColumns = Object.values(columnsMap).reduce((acc, cols) => acc + cols.length, 0);

  // Conversational message history
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll on new message
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Grounded schema generator
  const buildSchemaContext = (): string => {
    if (tables.length === 0) return '';
    return tables
      .map((t) => {
        const cols = columnsMap[t.name] || [];
        const colDefs =
          cols.length > 0
            ? cols
                .map((c) => `${c.name} ${c.typeName}${c.primaryKey ? ' (PRIMARY KEY)' : ''}${c.nullable ? '' : ' NOT NULL'}`)
                .join(', ')
            : 'columns unknown';
        return `TABLE "${t.name}" (${colDefs});`;
      })
      .join('\n');
  };

  const handleAsk = async (textToSend?: string) => {
    const text = (textToSend || prompt).trim();
    if (!text || loading) return;

    const userMsg: AiMessage = {
      id: 'msg-' + Date.now(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setPrompt('');
    setLoading(true);

    try {
      const schema = buildSchemaContext();
      const history = messages.map((m) => ({ role: m.role, content: m.content }));
      const res = await window.electronAPI.askAi(text, schema, settings, history);

      const aiMsg: AiMessage = {
        id: 'msg-' + (Date.now() + 1),
        role: 'assistant',
        content: res.content,
        sql: res.sql,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, aiMsg]);
    } catch (err: any) {
      showToast(err.message || 'AI request failed', 'danger');
      const errorMsg: AiMessage = {
        id: 'msg-' + (Date.now() + 1),
        role: 'assistant',
        content: `⚠️ ${err.message || 'Failed to generate response. Please check your AI endpoint settings.'}`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleCopySql = (sql: string, id: string) => {
    window.electronAPI.copyToClipboard(sql);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
    showToast('SQL copied to clipboard', 'info');
  };

  return (
    <div
      style={{ width: width ? `${width}px` : undefined }}
      className={`h-full flex flex-col bg-studio-sidebar border-l border-border shrink-0 select-none z-20 ${
        width ? '' : 'w-96'
      }`}
    >
      {/* Header */}
      <div className="h-11 px-3.5 flex items-center justify-between border-b border-border bg-card/60 backdrop-blur-xs shrink-0">
        <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
          <Sparkles className="w-4 h-4 text-purple-500 animate-pulse" />
          <span>AI SQL Copilot</span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Quick Provider Badge / Switcher */}
          <select
            value={settings.aiProvider || 'ollama'}
            onChange={(e) => updateSettings({ aiProvider: e.target.value as any })}
            className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted/70 text-foreground border border-border cursor-pointer focus:outline-none"
            title="Switch AI Provider"
          >
            <option value="ollama">Ollama</option>
            <option value="openai">OpenAI</option>
          </select>

          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={() => setMessages([])}
              title="Clear Conversation"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={onClose}
            title="Close Copilot"
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Schema Grounding Status Bar */}
      <div className="px-3.5 py-1.5 bg-muted/30 border-b border-border flex items-center justify-between text-[11px] text-muted-foreground select-none shrink-0">
        <div className="flex items-center gap-1.5 truncate">
          <Database className="w-3.5 h-3.5 text-primary shrink-0" />
          <span className="truncate">
            {tables.length} tables &bull; {totalGroundedColumns} columns grounded
          </span>
        </div>
        {onRefreshSchema && (
          <button
            onClick={onRefreshSchema}
            title="Sync schema metadata with database"
            className="text-[10px] text-primary hover:underline cursor-pointer font-medium ml-2 shrink-0"
          >
            Sync
          </button>
        )}
      </div>

      {/* Privacy & Schema Grounding Banner */}
      <div className="px-3.5 py-2 bg-purple-500/10 border-b border-purple-500/20 flex items-center justify-between text-[11px] text-purple-700 dark:text-purple-300">
        <div className="flex items-center gap-1.5 truncate">
          <Shield className="w-3.5 h-3.5 text-purple-500 shrink-0" />
          <span className="truncate">
            Grounded on <strong className="font-semibold">{tables.length} tables</strong>
          </span>
        </div>
        <span className="text-[9px] font-mono opacity-80 shrink-0 uppercase tracking-wider">
          Zero Row Leakage
        </span>
      </div>

      {/* Message Stream */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3.5 space-y-4 text-xs">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground space-y-3 p-4">
            <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-500 shadow-sm animate-badge-bounce">
              <Bot className="w-6 h-6" />
            </div>

            <div className="space-y-1">
              <h4 className="text-xs font-semibold text-foreground">Natural Language SQL Assistant</h4>
              <p className="text-[11px] text-muted-foreground leading-relaxed max-w-[240px]">
                Ask in plain English. Your database schema is used to generate exact queries.
              </p>
            </div>

            {/* Quick Suggestion Chips */}
            <div className="w-full pt-2 space-y-1.5 font-mono text-[11px]">
              <span className="text-[10px] text-muted-foreground/70 uppercase tracking-wider block text-left px-1">
                Suggested Prompts
              </span>
              {SUGGESTIONS.map((sug, i) => (
                <button
                  key={i}
                  onClick={() => handleAsk(sug)}
                  className="w-full text-left p-2 rounded-lg bg-card/60 hover:bg-accent border border-border text-foreground transition-all flex items-center justify-between group cursor-pointer"
                >
                  <span className="truncate">{sug}</span>
                  <ArrowRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                'flex flex-col gap-1 animate-pop-in',
                msg.role === 'user' ? 'items-end' : 'items-start'
              )}
            >
              {/* Message Header */}
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-mono px-1">
                {msg.role === 'user' ? (
                  <span>You</span>
                ) : (
                  <span className="flex items-center gap-1 text-purple-600 dark:text-purple-400 font-semibold">
                    <Sparkles className="w-2.5 h-2.5" />
                    <span>Copilot</span>
                  </span>
                )}
              </div>

              {/* Message Bubble */}
              <div
                className={cn(
                  'rounded-xl text-xs max-w-[92%]',
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground px-3.5 py-2 shadow-sm'
                    : 'bg-card border border-border p-3.5 shadow-xs w-full'
                )}
              >
                <div className="leading-relaxed whitespace-pre-wrap select-text">
                  {msg.content}
                </div>

                {/* SQL Code Action Box if query was generated */}
                {msg.sql && (
                  <div className="mt-3 pt-3 border-t border-border space-y-2">
                    <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Database className="w-3 h-3 text-primary" />
                        <span>Generated Query</span>
                      </span>
                      <button
                        onClick={() => handleCopySql(msg.sql!, msg.id)}
                        className="flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer"
                        title="Copy to clipboard"
                      >
                        {copiedId === msg.id ? (
                          <Check className="w-3 h-3 text-emerald-500" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                        <span>{copiedId === msg.id ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>

                    <pre className="p-3 bg-studio-editorBg text-foreground rounded-lg border border-border font-mono text-[11px] overflow-x-auto leading-relaxed select-text">
                      {msg.sql}
                    </pre>

                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 text-[11px] gap-1.5 h-7"
                        onClick={() => {
                          onInsertSql(msg.sql!);
                          showToast('Query inserted into SQL draft', 'info');
                        }}
                      >
                        <ArrowRight className="w-3 h-3 text-primary" />
                        <span>Insert Draft</span>
                      </Button>

                      <Button
                        variant="accent"
                        size="sm"
                        className="flex-1 text-[11px] gap-1.5 h-7 font-semibold"
                        onClick={() => onExecuteSql(msg.sql!)}
                      >
                        <Play className="w-3 h-3 fill-current" />
                        <span>Run SQL</span>
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))
        )}

        {/* Loading Indicator */}
        {loading && (
          <div className="flex items-center gap-2 p-3 bg-card border border-border rounded-xl text-xs text-muted-foreground animate-pop-in">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-500" />
            <span>Analyzing schema and synthesizing SQL…</span>
          </div>
        )}
      </div>

      {/* Input Form */}
      <form onSubmit={(e) => { e.preventDefault(); handleAsk(); }} className="p-3 border-t border-border bg-card/60 backdrop-blur-xs">
        <div className="relative flex items-center">
          <input
            ref={inputRef}
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Ask in natural language (e.g. 'Show orders from today')…"
            disabled={loading}
            className="w-full pl-3 pr-10 py-2 text-xs bg-background border border-input rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!prompt.trim() || loading}
            className="absolute right-1.5 p-1.5 text-purple-500 hover:text-purple-400 disabled:opacity-30 transition-colors cursor-pointer"
            title="Send Message"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          </button>
        </div>
      </form>
    </div>
  );
};
