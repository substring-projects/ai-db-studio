import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { ConnectionProfile, Engine, TlsMode } from '../../../shared/types';
import { cleanError } from '../../context/StudioContext';
import { cn, createId } from '../../lib/utils';
import { Button } from '../ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '../ui/dialog';
import { Input, Label } from '../ui/input';

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
  <div role="radiogroup" aria-label={label} className="flex h-7 rounded-md border border-input p-0.5">
    {options.map((option) => (
      <button
        key={option.value}
        type="button"
        role="radio"
        aria-checked={value === option.value}
        onClick={() => onChange(option.value)}
        className={cn(
          'flex-1 rounded-sm text-xxs transition-colors duration-75',
          value === option.value ? 'bg-secondary font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'
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

  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const changeEngine = (next: Engine) => {
    setEngine(next);
    setTestResult(null);
    if (!profile) {
      setPort(next === 'POSTGRESQL' ? 5432 : 3306);
      setDatabase(next === 'POSTGRESQL' ? 'postgres' : 'mysql');
      setUsername(next === 'POSTGRESQL' ? 'postgres' : 'root');
    }
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
        description="Connections are stored on this device."
        className="max-w-md"
      >
        <form onSubmit={save} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Database type">
                <SegmentedControl
                  label="Database type"
                  value={engine}
                  onChange={changeEngine}
                  options={[
                    { value: 'POSTGRESQL', label: 'PostgreSQL' },
                    { value: 'MYSQL', label: 'MySQL' },
                  ]}
                />
              </Field>
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
            <div className="grid grid-cols-[1fr_88px] gap-3">
              <Field label="Host" htmlFor="conn-host">
                <Input id="conn-host" required value={host} onChange={(e) => setHost(e.target.value)} className="font-mono" />
              </Field>
              <Field label="Port" htmlFor="conn-port">
                <Input
                  id="conn-port"
                  required
                  type="number"
                  min={1}
                  max={65535}
                  value={port}
                  onChange={(e) => setPort(Number(e.target.value))}
                  className="font-mono"
                />
              </Field>
            </div>
            <Field label="Database" htmlFor="conn-db">
              <Input id="conn-db" required value={database} onChange={(e) => setDatabase(e.target.value)} className="font-mono" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Username" htmlFor="conn-user">
                <Input id="conn-user" required value={username} onChange={(e) => setUsername(e.target.value)} className="font-mono" />
              </Field>
              <Field label="Password" htmlFor="conn-password">
                <Input id="conn-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
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
            <Button variant="outline" onClick={test} disabled={testing || !host || !database || !username}>
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
