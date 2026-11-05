import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { shortcutLabel } from '../../lib/utils';

export const TooltipProvider = TooltipPrimitive.Provider;

interface TooltipProps {
  content: React.ReactNode;
  shortcut?: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
  children: React.ReactElement;
}

export const Tooltip: React.FC<TooltipProps> = ({ content, shortcut, side = 'bottom', children }) => (
  <TooltipPrimitive.Root>
    <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        side={side}
        sideOffset={6}
        className="z-[60] flex max-w-72 items-center gap-2 rounded-sm border border-border bg-popover px-1.5 py-1 text-xxs text-popover-foreground shadow-overlay animate-menu-in"
      >
        <span>{content}</span>
        {shortcut && <span className="tracking-wide text-muted-foreground">{shortcutLabel(shortcut)}</span>}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  </TooltipPrimitive.Root>
);
