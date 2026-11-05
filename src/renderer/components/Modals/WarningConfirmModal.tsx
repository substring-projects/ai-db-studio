import React, { useMemo, useState } from 'react';
import { AlertTriangle, Database, ShieldAlert } from 'lucide-react';
import { MutationProposal } from '../../../shared/types';
import { assessRisk, engineLabel } from '../../lib/sql';
import { SqlCode } from '../Workbench/SqlCode';
import { Badge } from '../ui/badge';
import { Checkbox } from '../ui/input';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, DialogFooter } from '../ui/dialog';

interface WarningConfirmModalProps {
  proposal: MutationProposal;
  onConfirm: (token: string) => void;
  onClose: () => void;
  onCancel: () => void;
}

/** The last stop before a write. Destructive statements also need an explicit acknowledgement. */
export const WarningConfirmModal: React.FC<WarningConfirmModalProps> = ({ proposal, onConfirm, onClose, onCancel }) => {
  const risk = useMemo(() => assessRisk(proposal.sql), [proposal.sql]);
  const [acknowledged, setAcknowledged] = useState(false);
  const { profile } = proposal;

  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onCancel();
          onClose();
        }
      }}
    >
      <AlertDialogContent
        title={risk.high ? 'This statement is destructive' : 'Run this statement?'}
        description="Changes commit immediately. DDL statements cannot be rolled back."
        icon={risk.high ? <ShieldAlert className="text-destructive" /> : <AlertTriangle className="text-warning" />}
        className="max-w-xl"
      >
        <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-4 pb-3 pt-2.5">
          <div className="flex items-center gap-2 text-xs">
            <Database className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 truncate">
              <span className="font-medium">{profile.name}</span>
              <span className="text-muted-foreground">
                {' '}
                · {engineLabel(profile.engine)} · {profile.host}:{profile.port}/{profile.database}
              </span>
            </span>
            <Badge mono variant={risk.high ? 'destructive' : 'warning'} className="ml-auto">
              {proposal.kind}
            </Badge>
          </div>
          <pre className="max-h-48 overflow-auto rounded-sm border border-border bg-muted p-2.5">
            <SqlCode sql={proposal.sql} />
          </pre>
          {risk.high && (
            <div className="space-y-1.5 rounded-sm border border-destructive/30 bg-destructive/[0.06] p-2.5 text-xs">
              {risk.reasons.map((reason) => (
                <p key={reason} className="text-destructive">
                  {reason}
                </p>
              ))}
              <label className="flex cursor-pointer items-center gap-2 pt-0.5">
                <Checkbox checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} />
                I understand this cannot be undone
              </label>
            </div>
          )}
        </div>
        <DialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            destructive={risk.high}
            disabled={risk.high && !acknowledged}
            onClick={() => {
              if (proposal.approvalToken) onConfirm(proposal.approvalToken);
            }}
          >
            Run statement
          </AlertDialogAction>
        </DialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
