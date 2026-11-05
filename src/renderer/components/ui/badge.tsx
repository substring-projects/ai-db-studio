import * as React from 'react';
import { cn } from '../../lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info' | 'accent';
}

export const Badge: React.FC<BadgeProps> = ({ className, variant = 'default', ...props }) => {
  const variants = {
    default: 'border-transparent bg-primary text-primary-foreground shadow',
    secondary: 'border-transparent bg-secondary text-secondary-foreground',
    destructive: 'border-transparent bg-destructive/15 text-destructive border border-destructive/30',
    outline: 'text-foreground border border-border',
    success: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    warning: 'border-amber-500/30 bg-amber-500/15 text-amber-600 dark:text-amber-400',
    info: 'border-blue-500/30 bg-blue-500/15 text-blue-600 dark:text-blue-400',
    accent: 'border-studio-accent/30 bg-studio-accent/15 text-studio-accent',
  };

  return (
    <div
      className={cn(
        'inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold transition-colors focus:outline-none select-none font-mono',
        variants[variant],
        className
      )}
      {...props}
    />
  );
};
