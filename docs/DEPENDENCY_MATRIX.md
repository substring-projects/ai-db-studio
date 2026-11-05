# Dependency and Runtime Matrix

| Component | Version | Role | Verification |
| :--- | :--- | :--- | :--- |
| **Node.js** | `>= 20` (Node 24 recommended) | Desktop JavaScript & native runtime | Tested on Node v24.4.0 |
| **Electron** | `^34.2.0` | Desktop container & multi-process IPC | IPC & window management |
| **Vite** | `^6.1.0` | Production bundler & dev server (HMR) | `npm run build` |
| **React** | `^19.0.0` | Declarative UI framework | Component render & lifecycle |
| **Tailwind CSS** | `^3.4.17` | Utility-first styling & dark/light themes | Atomic stylesheet compilation |
| **Lucide React** | `^1.16.0` | Vector icons (Feather successor) | UI badging & actions |
| **pg** | `^8.13.1` | PostgreSQL connection pooling | Protocol & query execution |
| **mysql2** | `^3.12.0` | MySQL connection pooling | Protocol & query execution |
| **TypeScript** | `^5.7.3` | Type safety across main & renderer | `npm run typecheck` |
