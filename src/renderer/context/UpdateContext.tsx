import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { UpdateStatus, WhatsNew } from '../../shared/update';
import { cleanError, useStudio } from './StudioContext';

interface UpdateContextType {
  status: UpdateStatus;
  version: string;
  /** The update dialog is open. */
  dialogOpen: boolean;
  setDialogOpen: (open: boolean) => void;
  whatsNew: WhatsNew | null;
  closeWhatsNew: () => void;
  /** Checks now and opens the dialog with the answer. */
  checkNow: () => void;
  download: () => void;
  install: () => void;
  skip: (version: string) => void;
}

const UpdateContext = createContext<UpdateContextType | undefined>(undefined);

/** Whether the title bar should offer the update: something new that was not skipped. */
export const hasPendingUpdate = (status: UpdateStatus) =>
  (status.state === 'available' && !status.skipped) || status.state === 'downloading' || status.state === 'ready';

export const UpdateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { updateSettings, showToast } = useStudio();
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle' });
  const [version, setVersion] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [whatsNew, setWhatsNew] = useState<WhatsNew | null>(null);

  useEffect(() => {
    const api = window.electronAPI;
    api.getAppVersion().then(setVersion).catch(() => undefined);
    api.getUpdateStatus().then(setStatus).catch(() => undefined);
    api.takeWhatsNew().then((notes) => notes && setWhatsNew(notes)).catch(() => undefined);
    return api.onUpdateStatus((next) => {
      setStatus(next);
      // A check someone asked for always answers; quiet checks only speak through the title bar.
      if (next.state === 'up-to-date' && next.manual) showToast(`AI DB Studio ${next.version} is the latest version`, 'success');
      if (next.state === 'error' && next.manual) showToast(next.message, 'danger');
      if (next.state === 'available' && next.manual) setDialogOpen(true);
    });
  }, [showToast]);

  const checkNow = useCallback(() => {
    window.electronAPI.checkForUpdates(true).catch((err) => showToast(cleanError(err, 'Could not check for updates'), 'danger'));
  }, [showToast]);

  const download = useCallback(() => {
    window.electronAPI.downloadUpdate().catch((err) => showToast(cleanError(err, 'Download failed'), 'danger'));
  }, [showToast]);

  const install = useCallback(() => {
    window.electronAPI.installUpdate().catch((err) => showToast(cleanError(err, 'Could not install the update'), 'danger'));
  }, [showToast]);

  const skip = useCallback(
    (skipped: string) => {
      updateSettings({ skippedUpdateVersion: skipped });
      setStatus((prev) => (prev.state === 'available' ? { ...prev, skipped: true } : prev));
      setDialogOpen(false);
    },
    [updateSettings]
  );

  return (
    <UpdateContext.Provider
      value={{
        status,
        version,
        dialogOpen,
        setDialogOpen,
        whatsNew,
        closeWhatsNew: () => setWhatsNew(null),
        checkNow,
        download,
        install,
        skip,
      }}
    >
      {children}
    </UpdateContext.Provider>
  );
};

export const useUpdates = () => {
  const context = useContext(UpdateContext);
  if (!context) throw new Error('useUpdates must be used inside UpdateProvider');
  return context;
};
