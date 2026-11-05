import React from 'react';
import { Moon, PanelBottom, PanelLeft, Search, Sun } from 'lucide-react';
import { useStudio } from '../../context/StudioContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { cn, isMac, shortcutLabel } from '../../lib/utils';
import { Button } from '../ui/button';
import { Tooltip } from '../ui/tooltip';
import logoImg from '../../assets/logo.png';

export const TitleBar: React.FC = () => {
  const { theme, toggleTheme } = useStudio();
  const { sidebarOpen, toggleSidebar, panelOpen, togglePanel, setPaletteOpen } = useWorkspace();

  return (
    <header
      className={cn(
        'drag-region relative flex h-9 shrink-0 items-center border-b border-border bg-chrome',
        // Leaves room for the native window controls on each platform.
        isMac ? 'pl-[76px] pr-2' : 'pl-2.5 pr-[140px]'
      )}
    >
      <div className="flex items-center gap-1.5">
        <img src={logoImg} alt="" className="size-4 rounded-[3px]" />
        <span className="text-xs font-medium text-foreground">AI DB Studio</span>
      </div>

      <div className="pointer-events-none absolute inset-x-0 flex justify-center">
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="no-drag pointer-events-auto flex h-6 w-[min(38vw,420px)] items-center gap-1.5 rounded-md border border-border bg-background px-2 text-xxs text-muted-foreground transition-colors duration-100 hover:border-input hover:text-foreground"
        >
          <Search className="size-3" />
          <span className="flex-1 truncate text-left">Search tables, queries and commands</span>
          <span className="tracking-wide">{shortcutLabel('Mod+K')}</span>
        </button>
      </div>

      <div className="no-drag ml-auto flex items-center gap-0.5">
        <Tooltip content={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'} shortcut="Mod+B">
          <Button variant="quiet" size="icon-sm" aria-label="Toggle sidebar" aria-pressed={sidebarOpen} onClick={toggleSidebar}>
            <PanelLeft className={cn(sidebarOpen && 'text-foreground')} />
          </Button>
        </Tooltip>
        <Tooltip content={panelOpen ? 'Hide bottom panel' : 'Show bottom panel'} shortcut="Mod+J">
          <Button variant="quiet" size="icon-sm" aria-label="Toggle bottom panel" aria-pressed={panelOpen} onClick={togglePanel}>
            <PanelBottom className={cn(panelOpen && 'text-foreground')} />
          </Button>
        </Tooltip>
        <Tooltip content={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}>
          <Button variant="quiet" size="icon-sm" aria-label="Toggle theme" onClick={toggleTheme}>
            {theme === 'dark' ? <Sun /> : <Moon />}
          </Button>
        </Tooltip>
      </div>
    </header>
  );
};
