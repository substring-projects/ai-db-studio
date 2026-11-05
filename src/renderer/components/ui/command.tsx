import * as React from 'react';
import { Command as CommandPrimitive } from 'cmdk';
import { Search } from 'lucide-react';
import { cn } from '../../lib/utils';
import { MenuShortcut } from './menu';

export const Command = CommandPrimitive;

export const CommandInput: React.FC<React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input>> = ({
  className,
  ...props
}) => (
  <div className="flex h-9 items-center gap-2 border-b border-border px-3">
    <Search className="size-3.5 shrink-0 text-muted-foreground" />
    <CommandPrimitive.Input
      className={cn('h-full w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/80', className)}
      {...props}
    />
  </div>
);

export const CommandList: React.FC<React.ComponentPropsWithoutRef<typeof CommandPrimitive.List>> = ({
  className,
  ...props
}) => <CommandPrimitive.List className={cn('max-h-80 overflow-y-auto p-1', className)} {...props} />;

export const CommandEmpty: React.FC<React.ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>> = (props) => (
  <CommandPrimitive.Empty className="py-6 text-center text-xs text-muted-foreground" {...props} />
);

export const CommandGroup: React.FC<React.ComponentPropsWithoutRef<typeof CommandPrimitive.Group>> = ({
  className,
  ...props
}) => (
  <CommandPrimitive.Group
    className={cn(
      '[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.06em] [&_[cmdk-group-heading]]:text-muted-foreground',
      className
    )}
    {...props}
  />
);

export const CommandItem: React.FC<
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item> & { shortcut?: string }
> = ({ className, children, shortcut, ...props }) => (
  <CommandPrimitive.Item
    className={cn(
      'flex h-7 cursor-default items-center gap-2 rounded-sm px-2 text-xs data-[selected=true]:bg-accent [&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-muted-foreground',
      className
    )}
    {...props}
  >
    {children}
    {shortcut && <MenuShortcut keys={shortcut} />}
  </CommandPrimitive.Item>
);
