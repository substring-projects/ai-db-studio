import React from 'react';
import { AlertOctagon, X, Database } from 'lucide-react';
import { MutationProposal } from '../../../shared/types';

interface WarningConfirmModalProps {
  proposal: MutationProposal;
  onConfirm: (token: string) => void;
  onClose: () => void;
  onCancel: () => void;
}

export const WarningConfirmModal: React.FC<WarningConfirmModalProps> = ({
  proposal,
  onConfirm,
  onClose,
  onCancel,
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-xl bg-studio-surface border border-studio-border rounded-xl shadow-2xl overflow-hidden animate-slide-down">
        {/* Header */}
        <div className="flex items-center gap-4 px-6 py-5 border-b border-studio-border bg-studio-surface/50">
          <div className="w-11 h-11 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0 shadow-sm animate-badge-bounce">
            <AlertOctagon className="w-5 h-5 text-amber-500" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-studio-text leading-tight">Review SQL Execution</h3>
            <p className="text-xs text-studio-muted truncate mt-0.5">
              Confirm statement and destination before continuing.
            </p>
          </div>
          <button
            onClick={() => {
              onCancel();
              onClose();
            }}
            className="p-1.5 text-studio-muted hover:text-studio-text rounded-lg hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Target Database Info */}
          <div className="flex items-center gap-3 p-3.5 bg-studio-bg rounded-lg border border-studio-border text-xs">
            <Database className="w-4 h-4 text-studio-accent shrink-0" />
            <div className="flex-1">
              <span className="font-semibold text-studio-text">{proposal.profile.name}</span>
              <span className="text-studio-muted"> · {proposal.profile.host}:{proposal.profile.port}/{proposal.profile.database}</span>
            </div>
            <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20">
              {proposal.kind}
            </span>
          </div>

          {/* SQL Preview */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-studio-text">SQL Statement</label>
            <pre className="p-3 bg-studio-editorBg text-studio-text rounded-lg border border-studio-border font-mono text-xs overflow-x-auto whitespace-pre-wrap max-h-48 leading-relaxed">
              {proposal.sql}
            </pre>
          </div>

          <p className="text-xs text-studio-muted p-3 bg-studio-bg rounded-lg border border-studio-border">
            ⚠️ Changes commit immediately. DDL statements may not be rolled back.
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-studio-bg border-t border-studio-border">
          <button
            onClick={() => {
              onCancel();
              onClose();
            }}
            className="px-4 py-2 text-xs font-medium text-studio-muted hover:text-studio-text hover:bg-accent rounded-lg transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              if (proposal.approvalToken) {
                onConfirm(proposal.approvalToken);
              }
              onClose();
            }}
            className="px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 active:bg-amber-800 rounded-lg shadow-md shadow-amber-900/20 transition-all cursor-pointer"
          >
            Confirm Execution
          </button>
        </div>
      </div>
    </div>
  );
};
