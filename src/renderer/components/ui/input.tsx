import * as React from 'react';
import { cn } from '../../lib/utils';

const fieldClasses =
  'w-full rounded-md border border-input bg-background text-xs text-foreground transition-colors duration-100 placeholder:text-muted-foreground/80 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      spellCheck={false}
      autoComplete="off"
      className={cn(fieldClasses, 'h-7 px-2', className)}
      {...props}
    />
  )
);
Input.displayName = 'Input';

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(fieldClasses, 'px-2 py-1.5 leading-5', className)} {...props} />
));
Textarea.displayName = 'Textarea';

export const Label: React.FC<React.LabelHTMLAttributes<HTMLLabelElement>> = ({ className, ...props }) => (
  <label className={cn('block text-xxs font-medium text-muted-foreground', className)} {...props} />
);

export const Checkbox = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      type="checkbox"
      className={cn('size-3.5 shrink-0 accent-[hsl(var(--primary))]', className)}
      {...props}
    />
  )
);
Checkbox.displayName = 'Checkbox';
