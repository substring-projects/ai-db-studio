import React from 'react';
import { Database, Circle, ChevronRight } from 'lucide-react';
import { useStudio } from '../context/StudioContext';
import logoImg from '../assets/logo.png';

export const TopBar: React.FC = () => {
  const { activeView, activeProfile, connectedProfileIds, profiles, setActiveProfile } = useStudio();

  const isConnected = activeProfile && connectedProfileIds.includes(activeProfile.id);

  return (
    <header
      style={{ WebkitAppRegion: 'drag' } as any}
      className="h-12 border-b border-border bg-card/60 backdrop-blur-xs flex items-center justify-between px-5 shrink-0 select-none z-10"
    >
      {/* Breadcrumb Title */}
      <div className="flex items-center gap-2 text-xs">
        <div className="w-5 h-5 rounded-md overflow-hidden bg-card border border-border shrink-0 flex items-center justify-center">
          <img src={logoImg} alt="AI DB Studio" className="w-full h-full object-cover" />
        </div>
        <span className="font-semibold tracking-wide text-foreground">
          AI DB Studio
        </span>
        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/60" />
        <span className="text-muted-foreground font-medium capitalize">
          {activeView}
        </span>
      </div>

      {/* Active profile badge / switcher */}
      {activeView === 'workbench' && (
        <div
          style={{ WebkitAppRegion: 'no-drag' } as any}
          className="flex items-center gap-2"
        >
          <div className="flex items-center gap-2 px-3 py-1.5 bg-background border border-border rounded-lg text-xs shadow-2xs">
            <Circle
              className={`w-2 h-2 ${
                isConnected
                  ? 'fill-emerald-500 text-emerald-500 animate-pulse'
                  : 'fill-muted-foreground text-muted-foreground'
              }`}
            />
            <Database className="w-3.5 h-3.5 text-muted-foreground" />
            <select
              value={activeProfile?.id || ''}
              onChange={(e) => {
                const found = profiles.find((p) => p.id === e.target.value);
                if (found) setActiveProfile(found);
              }}
              className="bg-transparent text-foreground font-medium text-xs focus:outline-none cursor-pointer"
            >
              {profiles.length === 0 ? (
                <option value="">No profiles configured</option>
              ) : (
                profiles.map((p) => (
                  <option key={p.id} value={p.id} className="bg-popover text-popover-foreground">
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
