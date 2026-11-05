import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button, buttonVariants } from './button';

const overlayClasses = 'fixed inset-0 z-50 bg-black/45 animate-overlay-in';
const contentClasses =
  'fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] w-[calc(100vw-48px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-overlay animate-content-in';

export const Dialog = DialogPrimitive.Root;
export const DialogClose = DialogPrimitive.Close;

interface DialogContentProps extends Omit<React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>, 'title'> {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
}

export const DialogContent: React.FC<DialogContentProps> = ({
  className,
  children,
  title,
  description,
  icon,
  ...props
}) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className={overlayClasses} />
    <DialogPrimitive.Content
      className={cn(contentClasses, 'max-w-md', className)}
      {...props}
    >
      <div className="flex shrink-0 items-start gap-2.5 border-b border-border px-4 py-3">
        {icon && <span className="mt-0.5 text-muted-foreground [&_svg]:size-4">{icon}</span>}
        <div className="min-w-0 flex-1">
          <DialogPrimitive.Title className="truncate text-sm font-semibold leading-5">{title}</DialogPrimitive.Title>
          {description ? (
            <DialogPrimitive.Description className="mt-0.5 text-xxs text-muted-foreground">
              {description}
            </DialogPrimitive.Description>
          ) : (
            <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
          )}
        </div>
        <DialogPrimitive.Close asChild>
          <Button variant="quiet" size="icon-sm" aria-label="Close" className="-mr-1 -mt-0.5">
            <X />
          </Button>
        </DialogPrimitive.Close>
      </div>
      {children}
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
);

export const DialogBody: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => (
  <div className={cn('min-h-0 flex-1 overflow-y-auto px-4 py-3', className)} {...props} />
);

export const DialogFooter: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => (
  <div
    className={cn('flex shrink-0 items-center justify-end gap-2 border-t border-border bg-chrome px-4 py-2.5', className)}
    {...props}
  />
);

export const AlertDialog = AlertDialogPrimitive.Root;

interface AlertDialogContentProps
  extends Omit<React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Content>, 'title'> {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
}

export const AlertDialogContent: React.FC<AlertDialogContentProps> = ({
  className,
  children,
  title,
  description,
  icon,
  ...props
}) => (
  <AlertDialogPrimitive.Portal>
    <AlertDialogPrimitive.Overlay className={overlayClasses} />
    <AlertDialogPrimitive.Content className={cn(contentClasses, 'max-w-md', className)} {...props}>
      <div className="flex shrink-0 items-start gap-2.5 px-4 pt-3.5">
        {icon && <span className="mt-0.5 [&_svg]:size-4">{icon}</span>}
        <div className="min-w-0 flex-1">
          <AlertDialogPrimitive.Title className="text-sm font-semibold leading-5">{title}</AlertDialogPrimitive.Title>
          <AlertDialogPrimitive.Description className="mt-0.5 text-xs leading-5 text-muted-foreground">
            {description}
          </AlertDialogPrimitive.Description>
        </div>
      </div>
      {children}
    </AlertDialogPrimitive.Content>
  </AlertDialogPrimitive.Portal>
);

export const AlertDialogCancel = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Cancel>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Cancel
    ref={ref}
    className={cn(buttonVariants({ variant: 'outline' }), className)}
    {...props}
  />
));
AlertDialogCancel.displayName = 'AlertDialogCancel';

export const AlertDialogAction = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Action> & { destructive?: boolean }
>(({ className, destructive, ...props }, ref) => (
  <AlertDialogPrimitive.Action
    ref={ref}
    className={cn(buttonVariants({ variant: destructive ? 'destructive' : 'default' }), className)}
    {...props}
  />
));
AlertDialogAction.displayName = 'AlertDialogAction';
