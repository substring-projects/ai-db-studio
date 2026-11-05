import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { ToastItem, useStudio } from '../context/StudioContext';
import { cn } from '../lib/utils';
import { Button } from './ui/button';

const ICONS: Record<ToastItem['type'], { icon: React.ElementType; className: string }> = {
  success: { icon: CheckCircle2, className: 'text-success' },
  danger: { icon: AlertTriangle, className: 'text-destructive' },
  warning: { icon: AlertCircle, className: 'text-warning' },
  info: { icon: Info, className: 'text-muted-foreground' },
};

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useStudio();
  if (toasts.length === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed right-3 top-[76px] z-[70] flex w-80 flex-col items-end gap-1.5"
    >
      {toasts.map((toast) => {
        const { icon: Icon, className } = ICONS[toast.type];
        return (
          <div
            key={toast.id}
            className="pointer-events-auto flex max-w-full items-start gap-2 rounded-md border border-border bg-popover py-1.5 pl-2.5 pr-1.5 text-xs text-popover-foreground shadow-overlay animate-menu-in"
          >
            <Icon className={cn('mt-px size-3.5 shrink-0', className)} />
            <span className="selectable min-w-0 break-words leading-4">{toast.message}</span>
            <Button variant="quiet" size="icon-xs" aria-label="Dismiss" onClick={() => removeToast(toast.id)}>
              <X />
            </Button>
          </div>
        );
      })}
    </div>
  );
};
