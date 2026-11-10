import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '../../lib/utils';

export const Tabs = TabsPrimitive.Root;
export const TabsContent = TabsPrimitive.Content;

export const TabsList: React.FC<React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>> = ({
  className,
  ...props
}) => (
  <TabsPrimitive.List
    className={cn('flex h-9 shrink-0 items-stretch gap-4 border-b border-border px-3', className)}
    {...props}
  />
);

export const TabsTrigger: React.FC<React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>> = ({
  className,
  ...props
}) => (
  <TabsPrimitive.Trigger
    className={cn(
      '-mb-px flex items-center gap-1.5 border-b-2 border-transparent px-0.5 text-xs font-medium text-muted-foreground transition-colors duration-100 hover:text-foreground data-[state=active]:border-primary data-[state=active]:text-foreground focus-visible:outline-offset-0 [&_svg]:size-3.5',
      className
    )}
    {...props}
  />
);
