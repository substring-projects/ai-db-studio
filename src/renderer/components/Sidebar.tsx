import React from 'react';
import { Terminal, Database, Settings, Sun, Moon } from 'lucide-react';
import { useStudio } from '../context/StudioContext';
import { cn } from '../lib/utils';

export const Sidebar: React.FC = () => {
  const { activeView, setActiveView, theme, toggleTheme } = useStudio();

  const navItems = [
    { id: 'workbench', label: 'Workbench', icon: Terminal },
    { id: 'connections', label: 'Connections', icon: Database },
    { id: 'settings', label: 'Settings', icon: Settings },
  ] as const;

  return (
    <aside className="w-16 flex flex-col items-center justify-between py-4 bg-studio-sidebar border-r border-border shrink-0 select-none z-20">
      {/* Brand logo & Nav */}
      <div className="flex flex-col items-center gap-6 w-full">
        <div className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shadow-md shadow-primary/25 transition-transform hover:scale-105 cursor-pointer">
          <Database className="w-5 h-5" />
        </div>

        {/* Navigation items */}
        <nav className="flex flex-col gap-1.5 w-full items-center">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveView(item.id)}
                title={item.label}
                className={cn(
                  'w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer relative group',
                  active
                    ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/20 font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/80'
                )}
              >
                <Icon className="w-5 h-5 transition-transform group-hover:scale-110" />
                {active && (
                  <span className="absolute -left-1 top-2.5 bottom-2.5 w-1 bg-primary rounded-r-full" />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Theme toggle */}
      <button
        onClick={toggleTheme}
        title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
        className="w-10 h-10 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/80 transition-all cursor-pointer hover:rotate-12"
      >
        {theme === 'dark' ? (
          <Sun className="w-5 h-5 text-amber-400 transition-transform" />
        ) : (
          <Moon className="w-5 h-5 text-indigo-500 transition-transform" />
        )}
      </button>
    </aside>
  );
};
