import React, { useEffect, useState } from 'react';
import { Moon, ShieldCheck, Sun } from 'lucide-react';
import { useStudio } from '../../context/StudioContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import { Input, Label } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

const Section: React.FC<React.PropsWithChildren<{ title: string; description?: string }>> = ({ title, description, children }) => (
  <section className="grid grid-cols-[180px_minmax(0,1fr)] gap-6 border-t border-border py-5 first:border-t-0">
    <div>
      <h2 className="text-xs font-medium">{title}</h2>
      {description && <p className="mt-0.5 text-xxs leading-4 text-muted-foreground">{description}</p>}
    </div>
    <div className="space-y-3">{children}</div>
  </section>
);

const THEME_OPTIONS = [
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'light', label: 'Light', icon: Sun },
] as const;

export const SettingsView: React.FC = () => {
  const { settings, updateSettings, theme, toggleTheme, showToast } = useStudio();
  const { clearLogs } = useWorkspace();

  const [aiProvider, setAiProvider] = useState(settings.aiProvider);
  const [aiEndpoint, setAiEndpoint] = useState(settings.aiEndpoint);
  const [aiModel, setAiModel] = useState(settings.aiModel);
  const [aiApiKey, setAiApiKey] = useState(settings.aiApiKey ?? '');
  const [maxHistory, setMaxHistory] = useState(settings.maxHistory);

  // Settings load after startup, and the status bar or provider menu can change them too.
  useEffect(() => {
    setAiProvider(settings.aiProvider);
    setAiEndpoint(settings.aiEndpoint);
    setAiModel(settings.aiModel);
    setAiApiKey(settings.aiApiKey ?? '');
    setMaxHistory(settings.maxHistory);
  }, [settings]);

  const dirty =
    aiProvider !== settings.aiProvider ||
    aiEndpoint !== settings.aiEndpoint ||
    aiModel !== settings.aiModel ||
    aiApiKey !== (settings.aiApiKey ?? '') ||
    Number(maxHistory) !== settings.maxHistory;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateSettings({ aiProvider, aiEndpoint, aiModel, aiApiKey, maxHistory: Number(maxHistory) });
    showToast('Settings saved', 'success');
  };

  const changeProvider = (provider: 'ollama' | 'openai') => {
    setAiProvider(provider);
    setAiEndpoint(provider === 'ollama' ? 'http://localhost:11434' : 'https://api.openai.com/v1');
    setAiModel(provider === 'ollama' ? 'codellama' : 'gpt-4o-mini');
  };

  return (
    <div className="h-full overflow-y-auto">
      <form onSubmit={save} className="mx-auto max-w-2xl px-6 py-6">
        <div className="mb-2 flex items-center justify-between">
          <h1 className="text-sm font-semibold">Settings</h1>
          <Button type="submit" size="sm" disabled={!dirty}>
            Save changes
          </Button>
        </div>

        <Section title="Appearance" description="Applies immediately.">
          <div role="radiogroup" aria-label="Theme" className="flex w-fit rounded-md border border-input p-0.5">
            {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={theme === value}
                onClick={() => theme !== value && toggleTheme()}
                className={cn(
                  'flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-xxs transition-colors duration-75',
                  theme === value ? 'bg-secondary font-medium' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className="size-3" /> {label}
              </button>
            ))}
          </div>
        </Section>

        <Section title="AI assistant" description="The model that answers questions in AI conversations.">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Provider</Label>
              <Select value={aiProvider} onValueChange={(v) => changeProvider(v as 'ollama' | 'openai')}>
                <SelectTrigger aria-label="Provider">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ollama">Ollama (runs locally)</SelectItem>
                  <SelectItem value="openai">OpenAI or compatible</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="ai-model">Model</Label>
              <Input id="ai-model" value={aiModel} onChange={(e) => setAiModel(e.target.value)} className="font-mono" />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="ai-endpoint">Endpoint</Label>
            <Input id="ai-endpoint" value={aiEndpoint} onChange={(e) => setAiEndpoint(e.target.value)} className="font-mono" />
          </div>
          {aiProvider === 'openai' && (
            <div className="space-y-1">
              <Label htmlFor="ai-key">API key</Label>
              <Input id="ai-key" type="password" value={aiApiKey} onChange={(e) => setAiApiKey(e.target.value)} className="font-mono" />
            </div>
          )}
          <div className="flex items-start gap-2 rounded-sm bg-muted p-2.5 text-xxs leading-4 text-muted-foreground">
            <ShieldCheck className="mt-px size-3.5 shrink-0" />
            <span>
              The model receives your question, earlier messages in the conversation, and table and column names with their types.
              Result rows are never sent. AI-generated SQL can only run read-only; writes must be run by hand in the SQL editor.
            </span>
          </div>
        </Section>

        <Section title="Workspace">
          <div className="max-w-40 space-y-1">
            <Label htmlFor="max-history">Query history length</Label>
            <Input
              id="max-history"
              type="number"
              min={50}
              max={1000}
              value={maxHistory}
              onChange={(e) => setMaxHistory(Number(e.target.value))}
              className="font-mono"
            />
          </div>
          <Button variant="outline" size="sm" onClick={clearLogs}>
            Clear session log
          </Button>
        </Section>
      </form>
    </div>
  );
};
