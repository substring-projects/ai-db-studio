import React from 'react';
import { useStudio } from '../../context/StudioContext';
import { engineLabel } from '../../lib/sql';
import { StatusDot } from '../ui/feedback';
import { Select, SelectContent, SelectItem, SelectTrigger } from '../ui/select';

/** Compact connection picker used in the SQL toolbar and the AI composer. */
export const ConnectionSelect: React.FC<{
  value: string | null | undefined;
  onChange: (profileId: string) => void;
  side?: 'top' | 'bottom';
}> = ({ value, onChange, side }) => {
  const { profiles, connectionStates } = useStudio();
  const statusOf = (id: string) => {
    const state = connectionStates[id]?.state;
    return state === 'connected' || state === 'connecting' || state === 'failed' ? state : 'offline';
  };
  const selected = profiles.find((p) => p.id === value);

  return (
    <Select value={value ?? undefined} onValueChange={onChange} disabled={profiles.length === 0}>
      <SelectTrigger quiet aria-label="Connection" className="max-w-52 text-xxs">
        <span className="flex min-w-0 items-center gap-1.5">
          {selected && <StatusDot status={statusOf(selected.id)} />}
          <span className="truncate">{selected?.name ?? 'No connection'}</span>
        </span>
      </SelectTrigger>
      <SelectContent side={side} className="min-w-56">
        {profiles.map((p) => (
          <SelectItem key={p.id} value={p.id} textValue={p.name}>
            <span className="flex items-center gap-1.5">
              <StatusDot status={statusOf(p.id)} />
              <span className="truncate">{p.name}</span>
              <span className="text-2xs text-muted-foreground">{engineLabel(p.engine)}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

