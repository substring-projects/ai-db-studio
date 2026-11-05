import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const badgeVariants = cva(
  'inline-flex h-4 shrink-0 items-center gap-1 rounded-sm px-1 text-2xs font-medium leading-none whitespace-nowrap',
  {
    variants: {
      variant: {
        default: 'bg-primary/15 text-primary',
        secondary: 'bg-secondary text-muted-foreground',
        outline: 'border border-border text-muted-foreground',
        destructive: 'bg-destructive/15 text-destructive',
        success: 'bg-success/15 text-success',
        warning: 'bg-warning/15 text-warning',
        info: 'bg-info/15 text-info',
      },
      mono: { true: 'font-mono', false: '' },
    },
    defaultVariants: { variant: 'secondary', mono: false },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export const Badge: React.FC<BadgeProps> = ({ className, variant, mono, ...props }) => (
  <span className={cn(badgeVariants({ variant, mono }), className)} {...props} />
);
