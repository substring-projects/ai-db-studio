import React from 'react';
import { Terminal, Database, Settings, Sun, Moon } from 'lucide-react';
import { useStudio } from '../context/StudioContext';

export const Sidebar: React.FC = () => {
  const { activeView, setActiveView, theme, toggleTheme } = useStudio();

  const navItems = [
    { id: 'workbench', label: 'Workbench', icon: Terminal },
    { id: 'connections', label: 'Connections', icon: Database },
    { id: 'settings', label: 'Settings', icon: Settings },
  ] as const;

  return (
    <aside className="w-16 flex flex-col items-center justify-between py-5 bg-studio-sidebar border-r border-studio-border shrink-0 select-none">
      {/* Brand icon */}
      <div className="flex flex-col items-center gap-6">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-studio-accent to-purple-600 flex items-center justify-center shadow-lg shadow-purple-900/30">
          <Database className="w-5 h-5 text-studio-sidebar" />
        </div>

        {/* Navigation items */}
        <nav className="flex flex-col gap-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveView(item.id)}
                title={item.label}
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                  active
                    ? 'bg-studio-accent text-studio-sidebar shadow-md shadow-studio-accent/20 scale-105'
                    : 'text-studio-muted hover:text-studio-text hover:bg-white/5'
                }`}
              >
                <Icon className="w-5 h-5" />
              </button>
            );
          })}
        </nav>
      </div>

      {/* Theme toggle */}
      <button
        onClick={toggleTheme}
        title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
        className="w-10 h-10 rounded-xl flex items-center justify-center text-studio-muted hover:text-studio-text hover:bg-white/5 transition-colors cursor-pointer"
      >
        {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
      </button>
    </aside>
  );
};
