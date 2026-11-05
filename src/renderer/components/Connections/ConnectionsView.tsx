import React from 'react';
import { Database, Plus, Edit2, Copy, Trash2, Power, PowerOff, ShieldCheck, HardDrive } from 'lucide-react';
import { useStudio } from '../../context/StudioContext';
import { ConnectionProfile } from '../../../shared/types';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Card } from '../ui/card';
import logoImg from '../../assets/logo.png';

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
    <div className="flex-1 overflow-y-auto p-8 bg-background select-none">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-foreground tracking-tight">Connection Profiles</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Manage saved credentials for PostgreSQL and MySQL instances.
            </p>
          </div>
          <Button
            onClick={() => openEditProfileModal(null)}
            variant="accent"
            className="gap-2 text-xs"
          >
            <Plus className="w-4 h-4" />
            <span>New Connection</span>
          </Button>
        </div>

        {/* Profiles Grid */}
        {profiles.length === 0 ? (
          <div className="p-12 text-center border border-dashed border-border rounded-2xl flex flex-col items-center justify-center gap-3.5 bg-card/40">
            <div className="w-16 h-16 rounded-2xl bg-card border border-border flex items-center justify-center shadow-md overflow-hidden p-1">
              <img src={logoImg} alt="AI DB Studio" className="w-full h-full object-cover rounded-xl" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-semibold text-foreground">No Database Profiles</h4>
              <p className="text-xs text-muted-foreground">
                Create a connection profile to start querying your databases safely.
              </p>
            </div>
            <Button
              onClick={() => openEditProfileModal(null)}
              variant="accent"
              className="mt-2 text-xs"
            >
              Add First Profile
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {profiles.map((p) => {
              const isConnected = connectedProfileIds.includes(p.id);

              return (
                <Card
                  key={p.id}
                  className="p-5 flex flex-col justify-between hover:border-primary/40 transition-all shadow-xs group"
                >
                  <div className="space-y-3">
                    {/* Top Row: Engine badge and status */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-muted border border-border flex items-center justify-center text-primary">
                          <HardDrive className="w-4 h-4" />
                        </div>
                        <div>
                          <h3 className="text-sm font-semibold text-foreground truncate max-w-[150px]">
                            {p.name}
                          </h3>
                          <span className="text-[10px] font-mono text-muted-foreground uppercase">
                            {p.engine}
                          </span>
                        </div>
                      </div>

                      <Badge variant={isConnected ? 'success' : 'outline'} className="gap-1.5 py-0.5">
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-muted-foreground'
                          }`}
                        />
                        {isConnected ? 'Connected' : 'Offline'}
                      </Badge>
                    </div>

                    {/* Details */}
                    <div className="space-y-1.5 font-mono text-xs text-muted-foreground bg-muted/30 p-3 rounded-lg border border-border/60">
                      <div className="flex justify-between">
                        <span>Host:</span>
                        <span className="text-foreground truncate max-w-[170px]">{p.host}:{p.port}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Database:</span>
                        <span className="text-foreground truncate max-w-[170px]">{p.database}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>User:</span>
                        <span className="text-foreground truncate max-w-[170px]">{p.username}</span>
                      </div>
                      <div className="flex justify-between items-center pt-1 border-t border-border/50 text-[11px]">
                        <span>SSL / TLS:</span>
                        <span className="flex items-center gap-1 text-foreground">
                          <ShieldCheck className="w-3 h-3 text-primary" />
                          {p.tlsMode}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between pt-4 mt-3 border-t border-border">
                    <div className="flex items-center gap-1">
                      <Button
                        onClick={() => openEditProfileModal(p)}
                        title="Edit profile"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        onClick={() => handleDuplicate(p)}
                        title="Duplicate profile"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        onClick={() => handleDelete(p)}
                        title="Remove profile"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>

                    {isConnected ? (
                      <Button
                        onClick={() => disconnectProfile(p.id)}
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                      >
                        <PowerOff className="w-3.5 h-3.5 text-destructive" />
                        <span>Disconnect</span>
                      </Button>
                    ) : (
                      <Button
                        onClick={() => connectProfile(p)}
                        variant="accent"
                        size="sm"
                        className="gap-1.5 text-xs"
                      >
                        <Power className="w-3.5 h-3.5" />
                        <span>Connect</span>
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
