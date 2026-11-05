import React, { useState } from 'react';
import { Settings, Bot, Shield, Save, Moon, Sun, CheckCircle2 } from 'lucide-react';
import { useStudio } from '../../context/StudioContext';

export const SettingsView: React.FC = () => {
  const { settings, updateSettings, theme, toggleTheme, showToast } = useStudio();

  const [aiProvider, setAiProvider] = useState(settings.aiProvider || 'ollama');
  const [aiEndpoint, setAiEndpoint] = useState(settings.aiEndpoint || 'http://localhost:11434');
  const [aiModel, setAiModel] = useState(settings.aiModel || 'codellama');
  const [aiApiKey, setAiApiKey] = useState(settings.aiApiKey || '');
  const [maxHistory, setMaxHistory] = useState(settings.maxHistory || 200);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateSettings({
      aiProvider,
      aiEndpoint,
      aiModel,
      aiApiKey,
      maxHistory: Number(maxHistory),
    });
    showToast('Settings saved successfully', 'success');
  };

  return (
    <div className="flex-1 overflow-y-auto p-8 bg-studio-bg select-none">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h2 className="text-xl font-bold text-studio-text">Settings</h2>
          <p className="text-xs text-studio-muted mt-1">
            Configure AI privacy gateway, model endpoints, and workspace preferences.
          </p>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          {/* AI Privacy Notice Card */}
          <div className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-start gap-3">
            <Shield className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-xs font-semibold text-purple-300">Local Privacy Gateway Active</h4>
              <p className="text-xs text-purple-200/80 leading-relaxed">
                AI DB Studio never sends your database cell values, query results, or credentials to AI endpoints.
                Only metadata schema definitions (table & column names) are grounded for query assistance.
              </p>
            </div>
          </div>

          {/* AI Configuration Section */}
          <div className="bg-studio-surface border border-studio-border rounded-xl p-6 space-y-4 shadow-xs">
            <div className="flex items-center gap-2 pb-3 border-b border-studio-border text-sm font-semibold text-studio-text">
              <Bot className="w-4 h-4 text-studio-accent" />
              <span>AI Provider & Models</span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-studio-text">Provider</label>
                <select
                  value={aiProvider}
                  onChange={(e) => {
                    const p = e.target.value as 'ollama' | 'openai';
                    setAiProvider(p);
                    if (p === 'ollama') {
                      setAiEndpoint('http://localhost:11434');
                      setAiModel('codellama');
                    } else {
                      setAiEndpoint('https://api.openai.com/v1');
                      setAiModel('gpt-4o-mini');
                    }
                  }}
                  className="w-full px-3 py-2 text-xs bg-studio-bg text-studio-text border border-studio-border rounded-lg focus:outline-none focus:border-studio-accent cursor-pointer"
                >
                  <option value="ollama">Ollama (Local & Private)</option>
                  <option value="openai">OpenAI</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-studio-text">Model Name</label>
                <input
                  type="text"
                  value={aiModel}
                  onChange={(e) => setAiModel(e.target.value)}
                  placeholder="e.g. codellama, sqlcoder, gpt-4o"
                  className="w-full px-3 py-2 text-xs bg-studio-bg text-studio-text border border-studio-border rounded-lg focus:outline-none focus:border-studio-accent font-mono"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-studio-text">API Endpoint</label>
              <input
                type="text"
                value={aiEndpoint}
                onChange={(e) => setAiEndpoint(e.target.value)}
                placeholder="http://localhost:11434"
                className="w-full px-3 py-2 text-xs bg-studio-bg text-studio-text border border-studio-border rounded-lg focus:outline-none focus:border-studio-accent font-mono"
              />
            </div>

            {aiProvider === 'openai' && (
              <div className="space-y-1.5 animate-pop-in">
                <label className="text-xs font-semibold text-studio-text">API Key</label>
                <input
                  type="password"
                  value={aiApiKey}
                  onChange={(e) => setAiApiKey(e.target.value)}
                  placeholder="sk-••••••••"
                  className="w-full px-3 py-2 text-xs bg-studio-bg text-studio-text border border-studio-border rounded-lg focus:outline-none focus:border-studio-accent font-mono"
                />
              </div>
            )}
          </div>

          {/* Workspace Preferences Section */}
          <div className="bg-studio-surface border border-studio-border rounded-xl p-6 space-y-4 shadow-xs">
            <div className="flex items-center gap-2 pb-3 border-b border-studio-border text-sm font-semibold text-studio-text">
              <Settings className="w-4 h-4 text-studio-accent" />
              <span>Workspace Preferences</span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-studio-text">Theme</label>
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="w-full flex items-center justify-between px-3.5 py-2 text-xs bg-studio-bg border border-studio-border rounded-lg text-studio-text hover:border-studio-muted transition-colors cursor-pointer"
                >
                  <span className="capitalize">{theme} Theme</span>
                  {theme === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                </button>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-studio-text">Max Query History</label>
                <input
                  type="number"
                  min="50"
                  max="1000"
                  value={maxHistory}
                  onChange={(e) => setMaxHistory(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs bg-studio-bg text-studio-text border border-studio-border rounded-lg focus:outline-none focus:border-studio-accent font-mono"
                />
              </div>
            </div>
          </div>

          {/* Submit */}
          <div className="flex justify-end">
            <button
              type="submit"
              className="flex items-center gap-2 px-5 py-2 text-xs font-semibold text-studio-sidebar bg-studio-accent hover:bg-studio-accentHover rounded-xl shadow-md shadow-studio-accent/20 transition-all cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>Save Settings</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
