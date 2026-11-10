import * as React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

export const Select = SelectPrimitive.Root;
export const SelectValue = SelectPrimitive.Value;

export const SelectTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger> & { quiet?: boolean }
>(({ className, children, quiet, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      'flex h-7 w-full min-w-0 items-center justify-between gap-1.5 rounded-md border border-input bg-background px-2 text-xs text-foreground transition-colors duration-100 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 data-[placeholder]:text-muted-foreground [&>span]:truncate',
      quiet && 'h-6 w-auto border-transparent bg-transparent px-1.5 hover:bg-accent data-[state=open]:bg-accent',
      className
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = 'SelectTrigger';

export const SelectContent: React.FC<React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>> = ({
  className,
  children,
  position = 'popper',
  ...props
}) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      position={position}
      sideOffset={4}
      className={cn(
        'z-[55] max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-overlay animate-menu-in',
        className
      )}
      {...props}
    >
      <SelectPrimitive.Viewport className="p-1">{children}</SelectPrimitive.Viewport>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
);

export const SelectItem: React.FC<React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>> = ({
  className,
  children,
  ...props
}) => (
  <SelectPrimitive.Item
    className={cn(
      'relative flex h-6 cursor-default select-none items-center rounded-sm pl-6 pr-2 text-xs outline-none data-[highlighted]:bg-accent data-[disabled]:opacity-45',
      className
    )}
    {...props}
  >
    <span className="absolute left-1.5 flex size-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="size-3" />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
);

export const SelectGroup = SelectPrimitive.Group;

export const SelectLabel: React.FC<React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>> = ({ className, ...props }) => (
  <SelectPrimitive.Label
    className={cn('px-2 pb-0.5 pt-1.5 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground', className)}
    {...props}
  />
);

export const SelectSeparator: React.FC = () => <SelectPrimitive.Separator className="-mx-1 my-1 h-px bg-border" />;
