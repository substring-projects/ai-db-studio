import React from 'react';
import { Database, Circle } from 'lucide-react';
import { useStudio } from '../context/StudioContext';

export const TopBar: React.FC = () => {
  const { activeView, activeProfile, connectedProfileIds, profiles, setActiveProfile } = useStudio();

  const isConnected = activeProfile && connectedProfileIds.includes(activeProfile.id);

  return (
    <header className="h-12 border-b border-studio-border bg-studio-bg flex items-center justify-between px-6 shrink-0 select-none">
      {/* Title */}
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold tracking-wider uppercase text-studio-muted">
          AI DB Studio
        </span>
        <span className="text-studio-border">/</span>
        <span className="text-xs font-medium text-studio-text capitalize">
          {activeView}
        </span>
      </div>

      {/* Active profile badge / switcher */}
      {activeView === 'workbench' && (
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-1 bg-studio-surface border border-studio-border rounded-lg text-xs">
            <Circle
              className={`w-2 h-2 ${
                isConnected
                  ? 'fill-emerald-500 text-emerald-500 animate-pulse'
                  : 'fill-studio-muted text-studio-muted'
              }`}
            />
            <Database className="w-3.5 h-3.5 text-studio-muted" />
            <select
              value={activeProfile?.id || ''}
              onChange={(e) => {
                const found = profiles.find((p) => p.id === e.target.value);
                if (found) setActiveProfile(found);
              }}
              className="bg-transparent text-studio-text font-medium focus:outline-none cursor-pointer"
            >
              {profiles.length === 0 ? (
                <option value="">No profiles configured</option>
              ) : (
                profiles.map((p) => (
                  <option key={p.id} value={p.id} className="bg-studio-surface text-studio-text">
                    {p.name} ({p.database})
                  </option>
                ))
              )}
            </select>
          </div>
        </div>
      )}
    </header>
  );
};
