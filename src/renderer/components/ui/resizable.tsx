import * as React from 'react';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { cn } from '../../lib/utils';

export const ResizablePanelGroup = Group;
export const ResizablePanel = Panel;

/** A hairline divider with a wider invisible grab area; it lights up on hover and drag. */
export const ResizableHandle: React.FC<
  React.ComponentPropsWithoutRef<typeof Separator> & { orientation: 'horizontal' | 'vertical' }
> = ({ className, orientation, ...props }) => (
  <Separator
    className={cn(
      'group/handle relative z-10 shrink-0 bg-border outline-none',
      orientation === 'vertical' ? 'w-px' : 'h-px',
      className
    )}
    {...props}
  >
    <span
      className={cn(
        'absolute bg-primary opacity-0 transition-opacity delay-100 duration-100 group-hover/handle:opacity-100 group-focus-visible/handle:opacity-100 group-data-[separator=active]/handle:opacity-100 group-data-[separator=active]/handle:delay-0',
        orientation === 'vertical' ? 'inset-y-0 -left-px w-[3px]' : 'inset-x-0 -top-px h-[3px]'
      )}
    />
  </Separator>
);
