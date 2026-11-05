import * as React from 'react';
import { AlertTriangle, Check, Copy } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from './button';

export const Skeleton: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => (
  <div className={cn('animate-shimmer rounded-sm bg-secondary', className)} {...props} />
);

export const Kbd: React.FC<React.HTMLAttributes<HTMLElement>> = ({ className, ...props }) => (
  <kbd
    className={cn(
      'inline-flex h-4 min-w-4 items-center justify-center rounded-sm border border-border bg-secondary px-1 font-sans text-2xs text-muted-foreground',
      className
    )}
    {...props}
  />
);

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

/** Centered message for a surface with nothing to show: says what is missing and what to do. */
export const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, description, action, className }) => (
  <div className={cn('flex h-full min-h-24 flex-col items-center justify-center gap-1 p-6 text-center', className)}>
    {icon && <div className="mb-1.5 text-muted-foreground/70 [&_svg]:size-5">{icon}</div>}
    <p className="text-xs font-medium text-foreground">{title}</p>
    {description && <p className="max-w-80 text-xxs leading-4 text-muted-foreground">{description}</p>}
    {action && <div className="mt-2.5 flex items-center gap-2">{action}</div>}
  </div>
);

interface ErrorNoticeProps {
  title: string;
  message: string;
  action?: React.ReactNode;
  className?: string;
}

/** Shows a database or AI error verbatim and selectable, so it can be read and copied. */
export const ErrorNotice: React.FC<ErrorNoticeProps> = ({ title, message, action, className }) => (
  <div className={cn('rounded-md border border-destructive/30 bg-destructive/[0.06] p-3', className)}>
    <div className="flex items-center gap-1.5 text-xs font-medium text-destructive">
      <AlertTriangle className="size-3.5 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{title}</span>
      <CopyButton text={message} label="Copy error" />
    </div>
    <pre className="selectable mt-1.5 max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-xxs leading-[18px] text-foreground">
      {message}
    </pre>
    {action && <div className="mt-2 flex items-center gap-2">{action}</div>}
  </div>
);

export const CopyButton: React.FC<{ text: string; label?: string; className?: string }> = ({
  text,
  label = 'Copy',
  className,
}) => {
  const [copied, setCopied] = React.useState(false);
  return (
    <Button
      variant="quiet"
      size="icon-xs"
      aria-label={label}
      title={label}
      className={className}
      onClick={() => {
        window.electronAPI.copyToClipboard(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
    >
      {copied ? <Check className="text-success" /> : <Copy />}
    </Button>
  );
};

/** A small status dot. Colour is never the only signal: pair it with a label or tooltip. */
export const StatusDot: React.FC<{
  status: 'connected' | 'connecting' | 'failed' | 'offline';
  className?: string;
}> = ({ status, className }) => (
  <span
    aria-hidden
    className={cn(
      'inline-block size-1.5 shrink-0 rounded-full',
      status === 'connected' && 'bg-success',
      status === 'connecting' && 'animate-shimmer bg-warning',
      status === 'failed' && 'bg-destructive',
      status === 'offline' && 'bg-muted-foreground/45',
      className
    )}
  />
);
