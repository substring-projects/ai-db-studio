import React from 'react';
import { StudioProvider, useStudio } from './context/StudioContext';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { Workbench } from './components/Workbench/Workbench';
import { ConnectionsView } from './components/Connections/ConnectionsView';
import { SettingsView } from './components/Settings/SettingsView';
import { ToastContainer } from './components/ToastContainer';

const AppContent: React.FC = () => {
  const { activeView } = useStudio();

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-studio-bg text-studio-text">
      {/* Primary Sidebar */}
      <Sidebar />

      {/* Main View Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopBar />

        <main className="flex-1 flex min-h-0 overflow-hidden relative">
          {activeView === 'workbench' && <Workbench />}
          {activeView === 'connections' && <ConnectionsView />}
          {activeView === 'settings' && <SettingsView />}
        </main>
      </div>

      {/* Floating Notifications */}
      <ToastContainer />
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <StudioProvider>
      <AppContent />
    </StudioProvider>
  );
};

export default App;
