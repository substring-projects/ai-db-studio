import React from 'react';
import { StudioProvider } from './context/StudioContext';
import { SchemaProvider } from './context/SchemaContext';
import { WorkspaceProvider } from './context/WorkspaceContext';
import { ChatProvider } from './context/ChatContext';
import { TooltipProvider } from './components/ui/tooltip';
import { AppShell } from './components/shell/AppShell';

export const App: React.FC = () => (
  <TooltipProvider delayDuration={400} skipDelayDuration={200}>
    <StudioProvider>
      <SchemaProvider>
        <WorkspaceProvider>
          <ChatProvider>
            <AppShell />
          </ChatProvider>
        </WorkspaceProvider>
      </SchemaProvider>
    </StudioProvider>
  </TooltipProvider>
);

export default App;
