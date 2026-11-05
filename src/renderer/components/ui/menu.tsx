import * as React from 'react';
import * as DropdownPrimitive from '@radix-ui/react-dropdown-menu';
import * as ContextPrimitive from '@radix-ui/react-context-menu';
import { Check, ChevronRight } from 'lucide-react';
import { cn, shortcutLabel } from '../../lib/utils';

const surface =
  'z-50 min-w-40 overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-overlay animate-menu-in';
const item =
  'relative flex h-6 cursor-default select-none items-center gap-2 rounded-sm px-1.5 text-xs outline-none transition-colors duration-75 data-[highlighted]:bg-accent data-[disabled]:opacity-45 data-[disabled]:pointer-events-none [&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-muted-foreground';
const destructiveItem =
  'text-destructive data-[highlighted]:bg-destructive/10 data-[highlighted]:text-destructive [&_svg]:text-destructive';
const separator = '-mx-1 my-1 h-px bg-border';
const label = 'px-1.5 py-1 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground';

export const MenuShortcut: React.FC<{ keys: string }> = ({ keys }) => (
  <span className="ml-auto pl-4 font-sans text-2xs tracking-wide text-muted-foreground">{shortcutLabel(keys)}</span>
);

interface ItemExtras {
  destructive?: boolean;
  shortcut?: string;
}

// ---------- Dropdown ----------
export const DropdownMenu = DropdownPrimitive.Root;
export const DropdownMenuTrigger = DropdownPrimitive.Trigger;

export const DropdownMenuContent: React.FC<
  React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Content>
> = ({ className, sideOffset = 4, align = 'start', ...props }) => (
  <DropdownPrimitive.Portal>
    <DropdownPrimitive.Content
      sideOffset={sideOffset}
      align={align}
      className={cn(surface, 'max-h-[60vh] overflow-y-auto', className)}
      {...props}
    />
  </DropdownPrimitive.Portal>
);

export const DropdownMenuItem: React.FC<
  React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Item> & ItemExtras
> = ({ className, destructive, shortcut, children, ...props }) => (
  <DropdownPrimitive.Item className={cn(item, destructive && destructiveItem, className)} {...props}>
    {children}
    {shortcut && <MenuShortcut keys={shortcut} />}
  </DropdownPrimitive.Item>
);

export const DropdownMenuCheckboxItem: React.FC<
  React.ComponentPropsWithoutRef<typeof DropdownPrimitive.CheckboxItem>
> = ({ className, children, ...props }) => (
  <DropdownPrimitive.CheckboxItem className={cn(item, 'pl-6', className)} {...props}>
    <span className="absolute left-1.5 flex size-3.5 items-center justify-center">
      <DropdownPrimitive.ItemIndicator>
        <Check />
      </DropdownPrimitive.ItemIndicator>
    </span>
    {children}
  </DropdownPrimitive.CheckboxItem>
);

export const DropdownMenuSeparator: React.FC = () => <DropdownPrimitive.Separator className={separator} />;
export const DropdownMenuLabel: React.FC<React.PropsWithChildren> = ({ children }) => (
  <DropdownPrimitive.Label className={label}>{children}</DropdownPrimitive.Label>
);

// ---------- Context menu ----------
export const ContextMenu = ContextPrimitive.Root;
export const ContextMenuTrigger = ContextPrimitive.Trigger;

export const ContextMenuContent: React.FC<
  React.ComponentPropsWithoutRef<typeof ContextPrimitive.Content>
> = ({ className, ...props }) => (
  <ContextPrimitive.Portal>
    <ContextPrimitive.Content className={cn(surface, 'min-w-48', className)} {...props} />
  </ContextPrimitive.Portal>
);

export const ContextMenuItem: React.FC<
  React.ComponentPropsWithoutRef<typeof ContextPrimitive.Item> & ItemExtras
> = ({ className, destructive, shortcut, children, ...props }) => (
  <ContextPrimitive.Item className={cn(item, destructive && destructiveItem, className)} {...props}>
    {children}
    {shortcut && <MenuShortcut keys={shortcut} />}
  </ContextPrimitive.Item>
);

export const ContextMenuSeparator: React.FC = () => <ContextPrimitive.Separator className={separator} />;
export const ContextMenuLabel: React.FC<React.PropsWithChildren> = ({ children }) => (
  <ContextPrimitive.Label className={cn(label, 'max-w-64 truncate normal-case tracking-normal')}>
    {children}
  </ContextPrimitive.Label>
);

export const ContextMenuSub = ContextPrimitive.Sub;
export const ContextMenuSubTrigger: React.FC<
  React.ComponentPropsWithoutRef<typeof ContextPrimitive.SubTrigger>
> = ({ className, children, ...props }) => (
  <ContextPrimitive.SubTrigger className={cn(item, 'data-[state=open]:bg-accent', className)} {...props}>
    {children}
    <ChevronRight className="ml-auto" />
  </ContextPrimitive.SubTrigger>
);
export const ContextMenuSubContent: React.FC<
  React.ComponentPropsWithoutRef<typeof ContextPrimitive.SubContent>
> = ({ className, ...props }) => (
  <ContextPrimitive.Portal>
    <ContextPrimitive.SubContent className={cn(surface, className)} {...props} />
  </ContextPrimitive.Portal>
);
