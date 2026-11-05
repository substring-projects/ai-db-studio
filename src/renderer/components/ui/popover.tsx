import * as React from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { cn } from '../../lib/utils';

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;
export const PopoverClose = PopoverPrimitive.Close;

export const PopoverContent: React.FC<React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>> = ({
  className,
  align = 'start',
  sideOffset = 4,
  ...props
}) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      align={align}
      sideOffset={sideOffset}
      className={cn(
        'z-50 w-60 rounded-md border border-border bg-popover p-2.5 text-popover-foreground shadow-overlay animate-menu-in',
        className
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
);
