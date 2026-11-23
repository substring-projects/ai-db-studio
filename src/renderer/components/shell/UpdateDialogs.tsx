import React from 'react';
import { ArrowDownToLine, ExternalLink, Gift, Loader2, RotateCw } from 'lucide-react';
import { useUpdates } from '../../context/UpdateContext';
import { Button } from '../ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '../ui/dialog';
import { MessageContent } from '../ai/MessageContent';

const Notes: React.FC<{ notes: string }> = ({ notes }) =>
  notes.trim() ? (
    <div className="max-h-72 overflow-y-auto rounded-md border border-border bg-muted/40 px-3.5 py-2.5 [&_.text-sm]:text-xs [&_.text-sm]:leading-5">
      <MessageContent content={notes} />
    </div>
  ) : (
    <p className="text-xs text-muted-foreground">No release notes were published for this version.</p>
  );

const ProgressBar: React.FC<{ value: number | null }> = ({ value }) => (
  <div
    role="progressbar"
    aria-label="Download progress"
    aria-valuemin={0}
    aria-valuemax={100}
    aria-valuenow={value ?? undefined}
    className="relative h-1.5 overflow-hidden rounded-full bg-secondary"
  >
    {value === null ? (
      <div className="absolute inset-y-0 w-1/4 animate-progress rounded-full bg-primary" />
    ) : (
      <div className="h-full rounded-full bg-primary transition-[width] duration-200" style={{ width: `${value}%` }} />
    )}
  </div>
);

/** Offers a new release: notes, download with progress, then restart to finish. */
export const UpdateDialog: React.FC = () => {
  const { status, version, dialogOpen, setDialogOpen, download, install, skip } = useUpdates();
  if (status.state !== 'available' && status.state !== 'downloading' && status.state !== 'ready') return null;

  const busy = status.state === 'downloading';
  const openRelease = () => window.electronAPI.openReleasePage(status.version);

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogContent
        title={status.state === 'ready' ? 'Ready to install' : `AI DB Studio ${status.version} is available`}
        description={
          status.state === 'ready'
            ? `AI DB Studio will close and reopen on ${status.version}.`
            : `You have ${version || 'an older version'}.`
        }
        icon={status.state === 'ready' ? <RotateCw /> : <ArrowDownToLine />}
        className="max-w-lg"
      >
        <DialogBody className="space-y-3">
          {status.state === 'downloading' && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xxs text-muted-foreground">
                <span>Downloading and verifying…</span>
                {status.progress !== null && <span className="tabular-nums">{status.progress}%</span>}
              </div>
              <ProgressBar value={status.progress} />
            </div>
          )}
          {status.state === 'available' && status.reason && (
            <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xxs text-foreground">{status.reason}</p>
          )}
          <Notes notes={status.notes} />
        </DialogBody>
        <DialogFooter className="justify-between">
          {status.state === 'available' ? (
            <Button variant="quiet" size="sm" onClick={() => skip(status.version)}>
              Skip this version
            </Button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            {status.state === 'ready' ? (
              <>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Later
                </Button>
                <Button onClick={install}>
                  <RotateCw /> Restart now
                </Button>
              </>
            ) : status.state === 'available' && !status.canInstall ? (
              <>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Later
                </Button>
                <Button onClick={openRelease}>
                  <ExternalLink /> Download from GitHub
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  {busy ? 'Hide' : 'Later'}
                </Button>
                <Button disabled={busy} onClick={download}>
                  {busy ? <Loader2 className="animate-spin" /> : <ArrowDownToLine />}
                  {busy ? 'Downloading…' : 'Download and install'}
                </Button>
              </>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/** Shown once, on the first launch after an update. */
export const WhatsNewDialog: React.FC = () => {
  const { whatsNew, closeWhatsNew } = useUpdates();
  if (!whatsNew) return null;
  return (
    <Dialog open onOpenChange={(open) => !open && closeWhatsNew()}>
      <DialogContent title={`What’s new in ${whatsNew.version}`} description="AI DB Studio was updated." icon={<Gift />} className="max-w-lg">
        <DialogBody>
          <Notes notes={whatsNew.notes} />
        </DialogBody>
        <DialogFooter>
          <Button onClick={closeWhatsNew}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
