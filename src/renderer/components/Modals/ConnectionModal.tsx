import React, { useEffect, useState } from 'react';
import { AlertTriangle, Cable, CheckCircle2, Loader2 } from 'lucide-react';
import { ENGINE_LIST, engineInfo, splitConnectionString } from '../../../shared/engines';
import { ConnectionProfile, Engine, TlsMode } from '../../../shared/types';
import { cleanError } from '../../context/StudioContext';
import { cn, createId } from '../../lib/utils';
import { Button } from '../ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '../ui/dialog';
import { Input, Label } from '../ui/input';
import { EngineMark } from '../ui/engine-mark';

interface ConnectionModalProps {
  profile?: ConnectionProfile | null;
  onSave: (profile: ConnectionProfile) => Promise<void>;
  onClose: () => void;
}

const SegmentedControl = <T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) => (
  <div role="radiogroup" aria-label={label} className="flex h-8 rounded-lg border border-input bg-muted/50 p-0.5">
    {options.map((option) => (
      <button
        key={option.value}
        type="button"
        role="radio"
        aria-checked={value === option.value}
        onClick={() => onChange(option.value)}
        className={cn(
          'flex-1 rounded-md text-xxs transition-colors duration-75',
          value === option.value ? 'bg-card font-medium text-foreground shadow-raised ring-1 ring-border' : 'text-muted-foreground hover:text-foreground'
        )}
      >
        {option.label}
      </button>
    ))}
  </div>
);

const Field: React.FC<React.PropsWithChildren<{ label: string; htmlFor?: string; className?: string }>> = ({
  label,
  htmlFor,
  className,
  children,
}) => (
  <div className={cn('space-y-1', className)}>
    <Label htmlFor={htmlFor}>{label}</Label>
    {children}
  </div>
);

export const ConnectionModal: React.FC<ConnectionModalProps> = ({ profile, onSave, onClose }) => {
  const isEditing = Boolean(profile);

  const [name, setName] = useState(profile?.name ?? '');
  const [engine, setEngine] = useState<Engine>(profile?.engine ?? 'POSTGRESQL');
  const [host, setHost] = useState(profile?.host ?? 'localhost');
  const [port, setPort] = useState(profile?.port ?? 5432);
  const [database, setDatabase] = useState(profile?.database ?? 'postgres');
  const [username, setUsername] = useState(profile?.username ?? 'postgres');
  const [password, setPassword] = useState(profile?.password ?? '');
  const [tlsMode, setTlsMode] = useState<TlsMode>(profile?.tlsMode ?? 'PREFER');
  const [connectionString, setConnectionString] = useState(profile?.connectionString ?? '');
  const [authSource, setAuthSource] = useState(profile?.authSource ?? '');
  const info = engineInfo(engine);
  const usesConnectionString = info.features.connectionString && connectionString.trim() !== '';
  /** MongoDB servers often run without authentication, so a username is optional there. */
  const usernameRequired = info.family === 'sql';

  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [secureStorage, setSecureStorage] = useState(true);

  useEffect(() => {
    window.electronAPI.isSecureStorageAvailable().then(setSecureStorage).catch(() => setSecureStorage(false));
  }, []);

  const changeEngine = (next: Engine) => {
    setEngine(next);
    setTestResult(null);
    if (!profile) {
      const { defaults } = engineInfo(next);
      setPort(defaults.port);
      setDatabase(defaults.database);
      setUsername(defaults.username);
    }
  };

  /** A pasted connection string keeps its credentials out of the string, so the password is encrypted. */
  const changeConnectionString = (value: string) => {
    const split = splitConnectionString(value);
    setConnectionString(split.uri);
    if (split.username) setUsername(split.username);
    if (split.password) setPassword(split.password);
    const host = split.uri.match(/^mongodb(?:\+srv)?:\/\/([^/?,:]+)/i)?.[1];
    if (host) setHost(host);
    const db = split.uri.match(/^mongodb(?:\+srv)?:\/\/[^/]+\/([^?]+)/i)?.[1];
    if (db) setDatabase(decodeURIComponent(db));
    setTestResult(null);
  };

  const candidate = (): ConnectionProfile => ({
    id: profile?.id ?? createId('profile'),
    name: name.trim() || `${database.trim()} on ${host.trim()}`,
    engine,
    host: host.trim(),
    port: Number(port),
    database: database.trim(),
    username: username.trim(),
    tlsMode,
    password,
    ...(info.features.connectionString
      ? { connectionString: connectionString.trim() || undefined, authSource: authSource.trim() || undefined }
      : {}),
  });

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      setTestResult(await window.electronAPI.testConnection(candidate()));
    } catch (err) {
      setTestResult({ success: false, message: cleanError(err, 'Connection test failed') });
    } finally {
      setTesting(false);
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(candidate());
      onClose();
    } catch (err) {
      setTestResult({ success: false, message: cleanError(err, 'Could not save this connection') });
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={isEditing ? `Edit ${profile!.name}` : 'Add connection'}
        description="Stored on this device. Passwords are encrypted with your system's keychain."
        className="max-w-lg"
        icon={<Cable />}
      >
        <form onSubmit={save} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="space-y-3">
            <Field label="Database type">
              <div role="radiogroup" aria-label="Database type" className="grid grid-cols-3 gap-2">
                {ENGINE_LIST.map((e) => {
                  const selected = engine === e.id;
                  return (
                    <button
                      key={e.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => changeEngine(e.id)}
                      className={cn(
                        'flex items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors duration-75',
                        selected
                          ? 'border-primary bg-primary/5 ring-1 ring-primary/40'
                          : 'border-border bg-card hover:border-input hover:bg-accent/50'
                      )}
                    >
                      <EngineMark engine={e.id} size="sm" />
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-medium text-foreground">{e.label}</span>
                        <span className="block text-2xs text-muted-foreground">Port {e.defaults.port}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </Field>
            <div className="grid grid-cols-1 gap-3">
              <Field label="Name" htmlFor="conn-name">
                <Input
                  id="conn-name"
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={`${database || 'database'} on ${host || 'host'}`}
                />
              </Field>
            </div>
            {info.features.connectionString && (
              <Field label="Connection string (optional)" htmlFor="conn-uri">
                <Input
                  id="conn-uri"
                  value={connectionString}
                  onChange={(e) => changeConnectionString(e.target.value)}
                  placeholder="mongodb+srv://cluster0.example.mongodb.net/?retryWrites=true"
                  className="font-mono"
                />
                <p className="text-2xs leading-[14px] text-muted-foreground">
                  {usesConnectionString
                    ? 'Host and port come from the connection string. A username and password in it are moved to the fields below.'
                    : 'For Atlas and replica sets. Leave empty to use host and port.'}
                </p>
              </Field>
            )}
            <div className="grid grid-cols-[1fr_88px] gap-3">
              <Field label="Host" htmlFor="conn-host">
                <Input id="conn-host" required={!usesConnectionString} disabled={usesConnectionString} value={host} onChange={(e) => setHost(e.target.value)} className="font-mono" />
              </Field>
              <Field label="Port" htmlFor="conn-port">
                <Input
                  id="conn-port"
                  required={!usesConnectionString}
                  disabled={usesConnectionString}
                  type="number"
                  min={1}
                  max={65535}
                  value={port}
                  onChange={(e) => setPort(Number(e.target.value))}
                  className="font-mono"
                />
              </Field>
            </div>
            <div className={cn('grid gap-3', info.features.connectionString ? 'grid-cols-2' : 'grid-cols-1')}>
              <Field label="Database" htmlFor="conn-db">
                <Input id="conn-db" required value={database} onChange={(e) => setDatabase(e.target.value)} className="font-mono" />
              </Field>
              {info.features.connectionString && (
                <Field label="Auth database" htmlFor="conn-auth-source">
                  <Input
                    id="conn-auth-source"
                    value={authSource}
                    onChange={(e) => setAuthSource(e.target.value)}
                    placeholder="admin"
                    className="font-mono"
                  />
                </Field>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Username" htmlFor="conn-user">
                <Input
                  id="conn-user"
                  required={usernameRequired}
                  placeholder={usernameRequired ? undefined : 'none'}
                  value={username} onChange={(e) => setUsername(e.target.value)} className="font-mono" />
              </Field>
              <Field label="Password" htmlFor="conn-password">
                <Input id="conn-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
                {!secureStorage && (
                  <p className="text-2xs leading-[14px] text-warning">
                    This system has no secure storage, so the password won't be saved after you quit.
                  </p>
                )}
              </Field>
            </div>
            <Field label="TLS">
              <SegmentedControl
                label="TLS mode"
                value={tlsMode}
                onChange={setTlsMode}
                options={[
                  { value: 'PREFER', label: 'Prefer' },
                  { value: 'REQUIRE', label: 'Require' },
                  { value: 'DISABLE', label: 'Disable' },
                ]}
              />
            </Field>
            {testResult && (
              <div
                role="status"
                className={cn(
                  'flex items-start gap-2 rounded-sm border p-2 text-xs',
                  testResult.success ? 'border-success/30 bg-success/[0.07]' : 'border-destructive/30 bg-destructive/[0.06]'
                )}
              >
                {testResult.success ? (
                  <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" />
                ) : (
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
                )}
                <span className="selectable min-w-0 break-words leading-4">{testResult.message}</span>
              </div>
            )}
          </DialogBody>
          <DialogFooter className="justify-between">
            <Button
              variant="outline"
              onClick={test}
              disabled={testing || (!host && !usesConnectionString) || !database || (usernameRequired && !username)}
            >
              {testing && <Loader2 className="animate-spin" />}
              {testing ? 'Testing…' : 'Test connection'}
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="quiet" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {isEditing ? 'Save changes' : 'Add connection'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
