import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// Registers the custom font sizes so they merge with other text-* classes correctly.


const merge = extendTailwindMerge({
  extend: { classGroups: { 'font-size': [{ text: ['2xs', 'xxs'] }] } },
});

export type { ClassValue };

export function cn(...inputs: ClassValue[]): string {
  return merge(clsx(inputs));
}

export const isMac =
  typeof window !== 'undefined' &&
  (window.electronAPI?.platform === 'darwin' || navigator.userAgent.includes('Mac'));

/** Platform-correct label for a shortcut, written as e.g. "Mod+Shift+Enter". */
export function shortcutLabel(shortcut: string): string {
  if (!isMac) return shortcut.replace(/Mod/g, 'Ctrl');
  return shortcut
    .replace(/Mod\+?/g, '⌘')
    .replace(/Shift\+?/g, '⇧')
    .replace(/Alt\+?/g, '⌥')
    .replace(/Ctrl\+?/g, '⌃')
    .replace(/Enter/g, '↵');
}

/** localStorage access that survives blocked storage and malformed values. */
export const prefs = {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : (JSON.parse(raw) as T);
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Preferences are a convenience: losing one must never break the app.
    }
  },
};

export function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function formatDuration(ms: number | undefined | null): string {
  if (ms === undefined || ms === null) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(2)} s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

export function formatCount(n: number): string {
  return n.toLocaleString('en-US');
}

export function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined || Number.isNaN(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

export function formatRelativeTime(timestamp: number): string {
  const seconds = Math.round((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604_800) return `${Math.floor(seconds / 86_400)}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${formatCount(count)} ${count === 1 ? singular : plural}`;
}
