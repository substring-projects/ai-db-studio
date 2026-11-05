import React, { useState } from 'react';
import { Settings, Bot, Shield, Save, Moon, Sun } from 'lucide-react';
import { useStudio } from '../../context/StudioContext';
import { Button } from '../ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Input } from '../ui/input';
import logoImg from '../../assets/logo.png';

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
    <div className="flex-1 overflow-y-auto p-8 bg-background select-none">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-card border border-border shadow-xs overflow-hidden flex items-center justify-center p-0.5">
            <img src={logoImg} alt="AI DB Studio" className="w-full h-full object-cover rounded-lg" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground tracking-tight">Settings</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Configure AI privacy gateway, model endpoints, and workspace preferences.
            </p>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          {/* AI Privacy Notice Card */}
          <div className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-start gap-3">
            <Shield className="w-5 h-5 text-purple-500 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-xs font-semibold text-purple-700 dark:text-purple-300">Local Privacy Gateway Active</h4>
              <p className="text-xs text-purple-600/90 dark:text-purple-200/80 leading-relaxed">
                AI DB Studio never sends your database cell values, query results, or credentials to AI endpoints.
                Only metadata schema definitions (table & column names) are grounded for query assistance.
              </p>
            </div>
          </div>

          {/* AI Configuration Section */}
          <Card>
            <CardHeader className="pb-3 border-b border-border">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Bot className="w-4 h-4 text-primary" />
                <span>AI Provider & Models</span>
              </CardTitle>
            </CardHeader>

            <CardContent className="pt-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Provider</label>
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
                    className="w-full h-8 px-3 text-xs bg-background text-foreground border border-input rounded-lg focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
                  >
                    <option value="ollama">Ollama (Local & Private)</option>
                    <option value="openai">OpenAI</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Model Name</label>
                  <Input
                    type="text"
                    value={aiModel}
                    onChange={(e) => setAiModel(e.target.value)}
                    placeholder="e.g. codellama, sqlcoder, gpt-4o"
                    className="font-mono text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">API Endpoint</label>
                <Input
                  type="text"
                  value={aiEndpoint}
                  onChange={(e) => setAiEndpoint(e.target.value)}
                  placeholder="http://localhost:11434"
                  className="font-mono text-xs"
                />
              </div>

              {aiProvider === 'openai' && (
                <div className="space-y-1.5 animate-pop-in">
                  <label className="text-xs font-semibold text-foreground">API Key</label>
                  <Input
                    type="password"
                    value={aiApiKey}
                    onChange={(e) => setAiApiKey(e.target.value)}
                    placeholder="sk-••••••••"
                    className="font-mono text-xs"
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Workspace Preferences Section */}
          <Card>
            <CardHeader className="pb-3 border-b border-border">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Settings className="w-4 h-4 text-primary" />
                <span>Workspace Preferences</span>
              </CardTitle>
            </CardHeader>

            <CardContent className="pt-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Theme</label>
                  <Button
                    type="button"
                    onClick={toggleTheme}
                    variant="outline"
                    className="w-full justify-between font-normal text-xs h-8"
                  >
                    <span className="capitalize">{theme} Mode</span>
                    {theme === 'dark' ? <Moon className="w-4 h-4 text-indigo-400" /> : <Sun className="w-4 h-4 text-amber-500" />}
                  </Button>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Max Query History</label>
                  <Input
                    type="number"
                    min="50"
                    max="1000"
                    value={maxHistory}
                    onChange={(e) => setMaxHistory(Number(e.target.value))}
                    className="font-mono text-xs"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Submit */}
          <div className="flex justify-end">
            <Button
              type="submit"
              variant="accent"
              className="gap-2 px-5 text-xs shadow-md"
            >
              <Save className="w-4 h-4" />
              <span>Save Settings</span>
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
