import React, { useState } from 'react';
import { Button } from '../ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '../ui/dialog';
import { Input, Label } from '../ui/input';

interface PromptModalProps {
  title: string;
  subtitle: string;
  fieldLabel: string;
  initialValue?: string;
  placeholder?: string;
  validate?: (val: string) => boolean;
  errorMsg?: string;
  onConfirm: (val: string) => void;
  onClose: () => void;
}

export const PromptModal: React.FC<PromptModalProps> = ({
  title,
  subtitle,
  fieldLabel,
  initialValue = '',
  placeholder = '',
  validate,
  errorMsg = 'Enter a value to continue.',
  onConfirm,
  onClose,
}) => {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (validate ? !validate(trimmed) : !trimmed) {
      setError(errorMsg);
      return;
    }
    onConfirm(trimmed);
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title={title} description={subtitle} className="max-w-sm">
        <form onSubmit={submit}>
          <DialogBody className="space-y-1">
            <Label htmlFor="prompt-field">{fieldLabel}</Label>
            <Input
              id="prompt-field"
              autoFocus
              onFocus={(e) => e.target.select()}
              value={value}
              placeholder={placeholder}
              aria-invalid={Boolean(error)}
              onChange={(e) => {
                setValue(e.target.value);
                setError(null);
              }}
            />
            {error && <p className="text-xxs text-destructive">{error}</p>}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
