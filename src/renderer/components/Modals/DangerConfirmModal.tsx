import React from 'react';
import { Trash2 } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, DialogFooter } from '../ui/dialog';

interface DangerConfirmModalProps {
  title: string;
  subtitle: string;
  message: string;
  actionText?: string;
  onConfirm: () => void;
  onClose: () => void;
}

export const DangerConfirmModal: React.FC<DangerConfirmModalProps> = ({
  title,
  subtitle,
  message,
  actionText = 'Delete',
  onConfirm,
  onClose,
}) => (
  <AlertDialog open onOpenChange={(open) => !open && onClose()}>
    <AlertDialogContent
      title={title}
      description={subtitle}
      icon={<Trash2 className="text-destructive" />}
      className="max-w-sm"
    >
      <p className="selectable whitespace-pre-wrap break-words px-4 pb-3 pl-[42px] pt-1.5 text-xs leading-5">{message}</p>
      <DialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction destructive onClick={onConfirm}>
          {actionText}
        </AlertDialogAction>
      </DialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);
