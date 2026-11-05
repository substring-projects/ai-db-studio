import React, { useState } from 'react';
import { Database, X, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { ConnectionProfile, Engine, TlsMode } from '../../../shared/types';

interface ConnectionModalProps {
  profile?: ConnectionProfile | null;
  onSave: (profile: ConnectionProfile) => Promise<void>;
  onClose: () => void;
}

export const ConnectionModal: React.FC<ConnectionModalProps> = ({ profile, onSave, onClose }) => {
  const isEditing = Boolean(profile);

  const [name, setName] = useState(profile?.name || 'Local Database');
  const [engine, setEngine] = useState<Engine>(profile?.engine || 'POSTGRESQL');
  const [host, setHost] = useState(profile?.host || 'localhost');
  const [port, setPort] = useState(profile?.port || 5432);
  const [database, setDatabase] = useState(profile?.database || 'postgres');
  const [username, setUsername] = useState(profile?.username || 'postgres');
  const [password, setPassword] = useState(profile?.password || '');
  const [tlsMode, setTlsMode] = useState<TlsMode>(profile?.tlsMode || 'PREFER');

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleEngineChange = (newEngine: Engine) => {
    setEngine(newEngine);
    if (!profile) {
      if (newEngine === 'POSTGRESQL') {
        setPort(5432);
        setDatabase('postgres');
        setUsername('postgres');
      } else {
        setPort(3306);
        setDatabase('mysql');
        setUsername('root');
      }
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);

    const candidate: ConnectionProfile = {
      id: profile?.id || 'temp',
      name,
      engine,
      host,
      port: Number(port),
      database,
      username,
      tlsMode,
      password,
    };

    try {
      const res = await window.electronAPI.testConnection(candidate);
      setTestResult(res);
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || 'Connection test failed' });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const candidate: ConnectionProfile = {
      id: profile?.id || 'profile-' + Date.now(),
      name: name.trim() || 'Untitled Connection',
      engine,
      host: host.trim(),
      port: Number(port),
      database: database.trim(),
      username: username.trim(),
      tlsMode,
      password,
    };

    await onSave(candidate);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-lg bg-studio-surface border border-studio-border rounded-xl shadow-2xl overflow-hidden animate-slide-up">
        {/* Header */}
        <div className="flex items-center gap-4 px-6 py-5 border-b border-studio-border bg-studio-surface/50">
          <div className="w-11 h-11 rounded-xl bg-studio-accent/15 border border-studio-accent/30 flex items-center justify-center shrink-0 shadow-sm animate-badge-bounce">
            <Database className="w-5 h-5 text-studio-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-studio-text leading-tight">
              {isEditing ? 'Edit Connection Profile' : 'New Database Connection'}
            </h3>
            <p className="text-xs text-studio-muted truncate mt-0.5">
              Configure credentials for local or remote PostgreSQL & MySQL servers.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-studio-muted hover:text-studio-text rounded-lg hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Profile Name & Engine */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-studio-text">Profile Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full px-3 py-2 text-xs bg-studio-bg text-studio-text border border-studio-border rounded-lg focus:outline-none focus:border-studio-accent"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-studio-text">Engine</label>
              <select
                value={engine}
                onChange={(e) => handleEngineChange(e.target.value as Engine)}
                className="w-full px-3 py-2 text-xs bg-studio-bg text-studio-text border border-studio-border rounded-lg focus:outline-none focus:border-studio-accent cursor-pointer"
              >
                <option value="POSTGRESQL">PostgreSQL</option>
                <option value="MYSQL">MySQL</option>
              </select>
            </div>
          </div>

          {/* Host & Port */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1">
              <label className="text-xs font-semibold text-studio-text">Host</label>
              <input
                type="text"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                required
                className="w-full px-3 py-2 text-xs bg-studio-bg text-studio-text border border-studio-border rounded-lg focus:outline-none focus:border-studio-accent"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-studio-text">Port</label>
              <input
                type="number"
                value={port}
                onChange={(e) => setPort(Number(e.target.value))}
                required
                className="w-full px-3 py-2 text-xs bg-studio-bg text-studio-text border border-studio-border rounded-lg focus:outline-none focus:border-studio-accent font-mono"
              />
            </div>
          </div>

          {/* Database */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-studio-text">Database Name</label>
            <input
              type="text"
              value={database}
              onChange={(e) => setDatabase(e.target.value)}
              required
              className="w-full px-3 py-2 text-xs bg-studio-bg text-studio-text border border-studio-border rounded-lg focus:outline-none focus:border-studio-accent"
            />
          </div>

          {/* Username & Password */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-studio-text">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="w-full px-3 py-2 text-xs bg-studio-bg text-studio-text border border-studio-border rounded-lg focus:outline-none focus:border-studio-accent"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-studio-text">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2 text-xs bg-studio-bg text-studio-text border border-studio-border rounded-lg focus:outline-none focus:border-studio-accent"
              />
            </div>
          </div>

          {/* SSL/TLS Mode */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-studio-text">TLS / SSL Mode</label>
            <div className="flex gap-2">
              {(['PREFER', 'REQUIRE', 'DISABLE'] as TlsMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setTlsMode(mode)}
                  className={`flex-1 py-1.5 px-3 text-xs font-medium rounded-lg border transition-all cursor-pointer ${
                    tlsMode === mode
                      ? 'bg-studio-accent/20 border-studio-accent text-studio-accent'
                      : 'border-studio-border text-studio-muted hover:border-studio-muted'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          {/* Test Status Banner */}
          {testResult && (
            <div
              className={`p-3 rounded-lg border text-xs flex items-center gap-2.5 animate-pop-in ${
                testResult.success
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : 'bg-red-500/10 border-red-500/30 text-red-400'
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              )}
              <span className="flex-1 truncate">{testResult.message}</span>
            </div>
          )}

          {/* Action Footer */}
          <div className="flex items-center justify-between pt-4 border-t border-studio-border">
            <button
              type="button"
              onClick={handleTest}
              disabled={testing}
              className="px-3.5 py-2 text-xs font-medium border border-studio-border hover:border-studio-muted text-studio-text rounded-lg transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {testing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {testing ? 'Testing…' : 'Test Connection'}
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 text-xs font-medium text-studio-muted hover:text-studio-text hover:bg-accent rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-studio-accent hover:bg-studio-accentHover rounded-lg transition-all shadow-sm cursor-pointer"
              >
                {isEditing ? 'Save Changes' : 'Create Profile'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
