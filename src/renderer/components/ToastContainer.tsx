import React from 'react';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';
import { useStudio, ToastItem } from '../context/StudioContext';

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useStudio();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2.5 max-w-sm pointer-events-none">
      {toasts.map((toast) => {
        const Icon = getIcon(toast.type);
        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center gap-3 px-4 py-2.5 rounded-full border shadow-xl backdrop-blur-md animate-slide-up text-xs font-semibold ${getStyles(
              toast.type
            )}`}
          >
            <Icon className="w-4 h-4 shrink-0" />
            <span className="flex-1 truncate text-studio-text">{toast.message}</span>
            <button
              onClick={() => removeToast(toast.id)}
              className="p-1 hover:bg-white/10 rounded-full transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5 opacity-60 hover:opacity-100" />
            </button>
          </div>
        );
      })}
    </div>
  );
};

function getIcon(type: ToastItem['type']) {
  switch (type) {
    case 'success':
      return CheckCircle2;
    case 'danger':
      return AlertTriangle;
    case 'warning':
      return AlertCircle;
    default:
      return Info;
  }
}

function getStyles(type: ToastItem['type']): string {
  switch (type) {
    case 'success':
      return 'bg-studio-surface border-emerald-500/40 text-emerald-400 shadow-emerald-950/20';
    case 'danger':
      return 'bg-studio-surface border-red-500/40 text-red-400 shadow-red-950/20';
    case 'warning':
      return 'bg-studio-surface border-amber-500/40 text-amber-400 shadow-amber-950/20';
    default:
      return 'bg-studio-surface border-studio-border text-blue-400 shadow-black/30';
  }
}
