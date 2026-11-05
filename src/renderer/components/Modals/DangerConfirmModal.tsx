import React from 'react';
import { Trash2, X } from 'lucide-react';

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
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-md bg-studio-surface border border-studio-border rounded-xl shadow-2xl overflow-hidden animate-pop-in">
        {/* Header */}
        <div className="flex items-center gap-4 px-6 py-5 border-b border-studio-border bg-studio-surface/50">
          <div className="w-11 h-11 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center justify-center shrink-0 shadow-sm animate-badge-bounce">
            <Trash2 className="w-5 h-5 text-red-500" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-studio-text leading-tight">{title}</h3>
            <p className="text-xs text-studio-muted truncate mt-0.5">{subtitle}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-studio-muted hover:text-studio-text rounded-lg hover:bg-white/5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          <p className="text-sm text-studio-text/90 leading-relaxed">{message}</p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-studio-bg border-t border-studio-border">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-studio-muted hover:text-studio-text hover:bg-white/5 rounded-lg transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className="px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 active:bg-red-800 rounded-lg shadow-md shadow-red-900/20 transition-all cursor-pointer"
          >
            {actionText}
          </button>
        </div>
      </div>
    </div>
  );
};
