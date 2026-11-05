import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors duration-100 focus-visible:outline focus-visible:outline-[1.5px] focus-visible:outline-offset-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-45 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive/80',
        outline: 'border border-input bg-transparent text-foreground hover:bg-accent active:bg-secondary',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/70',
        ghost: 'text-foreground hover:bg-accent active:bg-secondary',
        quiet: 'text-muted-foreground hover:bg-accent hover:text-foreground active:bg-secondary',
        link: 'text-primary underline-offset-2 hover:underline',
      },
      size: {
        default: 'h-7 px-2.5 text-xs [&_svg]:size-3.5',
        sm: 'h-6 px-2 text-xxs [&_svg]:size-3',
        lg: 'h-8 px-3.5 text-xs [&_svg]:size-3.5',
        icon: 'size-7 [&_svg]:size-3.5',
        'icon-sm': 'size-6 [&_svg]:size-3.5',
        'icon-xs': 'size-5 [&_svg]:size-3',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, type, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        type={asChild ? undefined : (type ?? 'button')}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';
