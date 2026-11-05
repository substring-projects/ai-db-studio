import React from 'react';
import { Database, Plus, Edit2, Copy, Trash2, Power, PowerOff, ShieldCheck, HardDrive } from 'lucide-react';
import { useStudio } from '../../context/StudioContext';
import { ConnectionProfile } from '../../../shared/types';

export const ConnectionsView: React.FC = () => {
  const {
    profiles,
    connectedProfileIds,
    connectProfile,
    disconnectProfile,
    deleteProfile,
    saveProfile,
    openEditProfileModal,
    openDangerModal,
    openPromptModal,
    showToast,
  } = useStudio();

  const handleDuplicate = (p: ConnectionProfile) => {
    openPromptModal({
      title: 'Duplicate Connection',
      subtitle: 'Create a copy of this connection profile with a new name.',
      fieldLabel: 'Profile Name',
      initialValue: `${p.name} (Copy)`,
      placeholder: 'Name…',
      validate: (v) => Boolean(v.trim()),
      errorMsg: 'Name cannot be empty.',
      onConfirm: (newName) => {
        const copy: ConnectionProfile = {
          ...p,
          id: 'profile-' + Date.now(),
          name: newName,
        };
        saveProfile(copy);
        showToast(`Profile duplicated as “${newName}”`, 'success');
      },
    });
  };

  const handleDelete = (p: ConnectionProfile) => {
    openDangerModal({
      title: 'Remove Connection?',
      subtitle: 'This removes the saved local profile, not the database itself.',
      message: `Are you sure you want to remove the profile “${p.name}” (${p.host}:${p.port}/${p.database})?`,
      actionText: 'Remove Profile',
      onConfirm: () => deleteProfile(p.id),
    });
  };

  return (
    <div className="flex-1 overflow-y-auto p-8 bg-studio-bg select-none">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-studio-text">Connection Profiles</h2>
            <p className="text-xs text-studio-muted mt-1">
              Manage saved credentials for PostgreSQL and MySQL instances.
            </p>
          </div>
          <button
            onClick={() => openEditProfileModal(null)}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-studio-sidebar bg-studio-accent hover:bg-studio-accentHover rounded-xl shadow-md shadow-studio-accent/20 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Connection</span>
          </button>
        </div>

        {/* Profiles Grid */}
        {profiles.length === 0 ? (
          <div className="p-12 text-center border border-dashed border-studio-border rounded-2xl flex flex-col items-center justify-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-studio-surface border border-studio-border flex items-center justify-center text-studio-muted">
              <Database className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-semibold text-studio-text">No Database Profiles</h4>
              <p className="text-xs text-studio-muted">
                Create a connection profile to start querying your databases safely.
              </p>
            </div>
            <button
              onClick={() => openEditProfileModal(null)}
              className="mt-2 px-4 py-2 text-xs font-semibold text-studio-sidebar bg-studio-accent hover:bg-studio-accentHover rounded-lg transition-all cursor-pointer"
            >
              Add First Profile
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {profiles.map((p) => {
              const isConnected = connectedProfileIds.includes(p.id);

              return (
                <div
                  key={p.id}
                  className="bg-studio-surface border border-studio-border rounded-xl p-5 flex flex-col justify-between hover:border-studio-muted transition-all shadow-xs group"
                >
                  <div className="space-y-3">
                    {/* Top Row: Engine badge and status */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-studio-bg border border-studio-border flex items-center justify-center text-studio-accent">
                          <HardDrive className="w-4 h-4" />
                        </div>
                        <div>
                          <h3 className="text-sm font-semibold text-studio-text truncate max-w-[150px]">
                            {p.name}
                          </h3>
                          <span className="text-[10px] font-mono text-studio-muted uppercase">
                            {p.engine}
                          </span>
                        </div>
                      </div>

                      <span
                        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                          isConnected
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                            : 'bg-white/5 border-studio-border text-studio-muted'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-studio-muted'
                          }`}
                        />
                        {isConnected ? 'Connected' : 'Offline'}
                      </span>
                    </div>

                    {/* Details */}
                    <div className="space-y-1.5 font-mono text-xs text-studio-muted bg-studio-bg/60 p-3 rounded-lg border border-studio-border/60">
                      <div className="flex justify-between">
                        <span>Host:</span>
                        <span className="text-studio-text truncate">{p.host}:{p.port}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Database:</span>
                        <span className="text-studio-text truncate">{p.database}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>User:</span>
                        <span className="text-studio-text truncate">{p.username}</span>
                      </div>
                      <div className="flex justify-between items-center pt-1 border-t border-studio-border/50 text-[11px]">
                        <span>SSL / TLS:</span>
                        <span className="flex items-center gap-1 text-studio-text">
                          <ShieldCheck className="w-3 h-3 text-studio-accent" />
                          {p.tlsMode}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between pt-4 mt-3 border-t border-studio-border">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEditProfileModal(p)}
                        title="Edit profile"
                        className="p-1.5 text-studio-muted hover:text-studio-text rounded-md hover:bg-white/5 transition-colors cursor-pointer"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDuplicate(p)}
                        title="Duplicate profile"
                        className="p-1.5 text-studio-muted hover:text-studio-text rounded-md hover:bg-white/5 transition-colors cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(p)}
                        title="Remove profile"
                        className="p-1.5 text-studio-muted hover:text-red-400 rounded-md hover:bg-white/5 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {isConnected ? (
                      <button
                        onClick={() => disconnectProfile(p.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-studio-muted hover:text-studio-text hover:bg-white/5 border border-studio-border rounded-lg transition-colors cursor-pointer"
                      >
                        <PowerOff className="w-3.5 h-3.5 text-red-400" />
                        <span>Disconnect</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => connectProfile(p)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-studio-sidebar bg-studio-accent hover:bg-studio-accentHover rounded-lg transition-all shadow-xs cursor-pointer"
                      >
                        <Power className="w-3.5 h-3.5" />
                        <span>Connect</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
