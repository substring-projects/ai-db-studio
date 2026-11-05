import React from 'react';
import {
  Terminal,
  Database,
  Settings,
  Sun,
  Moon,
  Plus,
  Circle,
  Sparkles,
} from 'lucide-react';
import { useStudio } from '../context/StudioContext';
import { cn } from '../lib/utils';

export const Sidebar: React.FC = () => {
  const {
    activeView,
    setActiveView,
    theme,
    toggleTheme,
    activeProfile,
    connectedProfileIds,
    createNewDraft,
  } = useStudio();

  const isConnected = activeProfile && connectedProfileIds.includes(activeProfile.id);

  const navItems = [
    { id: 'workbench', label: 'Workbench', icon: Terminal, shortcut: '⌘1' },
    { id: 'connections', label: 'Connections', icon: Database, shortcut: '⌘2' },
    { id: 'settings', label: 'Settings', icon: Settings, shortcut: '⌘3' },
  ] as const;

  return (
    <aside className="w-16 flex flex-col items-center justify-between py-3.5 bg-studio-sidebar border-r border-border shrink-0 select-none z-30 transition-colors">
      {/* Top Group: Brand & Nav */}
      <div className="flex flex-col items-center gap-5 w-full">
        {/* Brand Icon */}
        <div className="relative group flex items-center justify-center">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-primary to-purple-500 text-white flex items-center justify-center shadow-md shadow-primary/25 transition-transform hover:scale-105 active:scale-95 cursor-pointer">
            <Sparkles className="w-5 h-5 fill-white/20" />
          </div>

          {/* Flyout Tooltip */}
          <div className="absolute left-[68px] py-1 px-2.5 bg-popover text-popover-foreground border border-border rounded-md shadow-lg text-[11px] font-semibold whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-50 flex items-center gap-1.5">
            <span>AI DB Studio</span>
            <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-muted text-muted-foreground">
              v0.2
            </span>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="flex flex-col gap-2 w-full items-center">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeView === item.id;

            return (
              <div key={item.id} className="relative group flex items-center justify-center w-full">
                <button
                  onClick={() => setActiveView(item.id)}
                  className={cn(
                    'w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer relative',
                    active
                      ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/20 font-medium'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent/80'
                  )}
                >
                  <Icon className="w-5 h-5 transition-transform group-hover:scale-105" />

                  {/* Active indicator bar */}
                  {active && (
                    <span className="absolute -left-3 top-2 bottom-2 w-1 bg-primary rounded-r-full animate-pop-in" />
                  )}
                </button>

                {/* Flyout Tooltip */}
                <div className="absolute left-[68px] py-1 px-2.5 bg-popover text-popover-foreground border border-border rounded-md shadow-lg text-[11px] font-medium whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-150 z-50 flex items-center gap-2">
                  <span>{item.label}</span>
                  <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1 rounded">
                    {item.shortcut}
                  </span>
                </div>
              </div>
            );
          })}
        </nav>

        {/* Quick New Draft Button */}
        <div className="relative group flex items-center justify-center w-full pt-1">
          <div className="w-8 h-px bg-border/80 mb-2" />
          <button
            onClick={() => {
              setActiveView('workbench');
              createNewDraft();
            }}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-accent/80 border border-dashed border-border/80 hover:border-primary/50 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
          </button>

          {/* Flyout Tooltip */}
          <div className="absolute left-[68px] py-1 px-2.5 bg-popover text-popover-foreground border border-border rounded-md shadow-lg text-[11px] font-medium whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-150 z-50">
            <span>New SQL Draft</span>
          </div>
        </div>
      </div>

      {/* Bottom Group: Connection Status & Theme Toggle */}
      <div className="flex flex-col items-center gap-3 w-full">
        {/* Active Connection Status Dot */}
        <div className="relative group flex items-center justify-center">
          <div
            className={cn(
              'w-8 h-8 rounded-lg flex items-center justify-center border transition-all cursor-default',
              isConnected
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500'
                : 'bg-muted/40 border-border text-muted-foreground'
            )}
          >
            <Circle
              className={cn(
                'w-2.5 h-2.5',
                isConnected
                  ? 'fill-emerald-500 text-emerald-500 animate-pulse'
                  : 'fill-muted-foreground/40 text-muted-foreground/40'
              )}
            />
          </div>

          {/* Flyout Tooltip */}
          <div className="absolute left-[68px] py-1 px-2.5 bg-popover text-popover-foreground border border-border rounded-md shadow-lg text-[11px] font-medium whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-150 z-50">
            {isConnected ? (
              <span className="flex items-center gap-1.5">
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">Connected:</span>{' '}
                {activeProfile?.name}
              </span>
            ) : (
              <span className="text-muted-foreground">Database Disconnected</span>
            )}
          </div>
        </div>

        {/* Theme Toggle Button */}
        <div className="relative group flex items-center justify-center w-full">
          <button
            onClick={toggleTheme}
            className="w-10 h-10 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/80 transition-all cursor-pointer hover:rotate-12"
          >
            {theme === 'dark' ? (
              <Sun className="w-5 h-5 text-amber-400 transition-transform" />
            ) : (
              <Moon className="w-5 h-5 text-indigo-500 transition-transform" />
            )}
          </button>

          {/* Flyout Tooltip */}
          <div className="absolute left-[68px] py-1 px-2.5 bg-popover text-popover-foreground border border-border rounded-md shadow-lg text-[11px] font-medium whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-150 z-50">
            <span>Switch to {theme === 'dark' ? 'Light' : 'Dark'} Mode</span>
          </div>
        </div>
      </div>
    </aside>
  );
};
