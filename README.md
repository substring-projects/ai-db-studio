<p align="center">
  <img src="build/icon.png" width="130" alt="AI DB Studio Logo" />
</p>

<h1 align="center">AI DB Studio</h1>

<p align="center">
  <strong>The Intelligent, Local-First Database Client with Zero-Row Data Leakage AI Grounding</strong>
</p>

<p align="center">
  <a href="https://github.com/substring-projects/ai-db-studio/releases"><img src="https://img.shields.io/badge/release-v0.2.0-blue.svg?style=flat-square" alt="Release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-green.svg?style=flat-square" alt="License" /></a>
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows-lightgrey.svg?style=flat-square" alt="Platform" />
  <img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg?style=flat-square" alt="Node" />
  <img src="https://img.shields.io/badge/electron-v34-teal.svg?style=flat-square" alt="Electron" />
  <img src="https://img.shields.io/badge/react-19-61dafb.svg?style=flat-square" alt="React 19" />
  <img src="https://img.shields.io/badge/tests-16%2F16%20passed-success.svg?style=flat-square" alt="Tests" />
</p>

<p align="center">
  <a href="#key-features">Key Features</a> •
  <a href="#downloads--installers">Downloads</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#ai-grounding--privacy-guarantee">AI Privacy Gateway</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#keyboard-shortcuts">Shortcuts</a> •
  <a href="#license">License</a>
</p>

---

## Overview

**AI DB Studio** is a safe, fast, and modern desktop database management client for **PostgreSQL** and **MySQL**. Engineered from the ground up with **Electron, TypeScript, React 19, and Tailwind CSS**, it pairs the speed and agility of native desktop tooling with an intelligent **conversational AI SQL Copilot**.

Unlike traditional tools that either lack modern UI or blindly leak entire database records to remote language models, AI DB Studio is architected around **strict zero-cell data leakage**: only structural schema definitions (table names, column types, and constraints) are ever provided to the AI, ensuring complete data privacy and enterprise compliance.

---

## Key Features

### 🧠 Grounded Conversational AI SQL Copilot
- **Natural Language to Optimized SQL**: Ask complex business and analytical questions in plain English and receive production-grade, executable SQL.
- **Accurate Schema Grounding**: Automatically pre-fetches all database tables, exact column names, data types, and primary key constraints in a single efficient query. The AI **never hallucinates column names**.
- **Dual AI Provider Support**:
  - **Local Ollama** (`http://localhost:11434`): Run completely offline with models like `codellama`, `deepseek-coder`, `mistral`, or `llama3`. Zero API keys or cloud dependencies needed.
  - **OpenAI & Compatible Endpoints**: Connect with `gpt-4o`, `gpt-4o-mini`, OpenRouter, Groq, LocalAI, or vLLM.
- **Offline Query Synthesizer**: Built-in heuristic engine provides instant schema-grounded query templates even when offline or disconnected from an AI provider.
- **Real-Time Schema Status**: Live indicator displays grounded tables and column count with a 1-click **Sync** action.

### 🛡️ Mutation Safety Rails & Guardrails
- **Lexical AST Statement Classification**: Every query is inspected before execution to classify operations as read-only (`SELECT`, `EXPLAIN`, `SHOW`) or mutations (`INSERT`, `UPDATE`, `DELETE`, `DDL`).
- **Cryptographic Human Approval**: Destructive actions (dropping tables, truncating data, or bulk deletions) cannot execute automatically. They trigger a safety modal requiring human confirmation and a single-use token.
- **Engine-Aware Syntax & Quoting**: Tailored quoting and identity clauses for PostgreSQL (`"col"`) and MySQL (`` `col` ``).

### 🖥️ High-Performance Resizable Workbench
- **Draggable Layout Splitters**:
  - **Vertical Split**: Resize between the SQL Editor and Query Results Grid.
  - **Horizontal Splits**: Independently resize the Database Explorer and AI Copilot sidebars.
  - **Double-Click Reset**: Instant reset to default panel dimensions.
  - **Persistent Dimensions**: Custom sizes are stored and remembered across app sessions.
- **Interactive Query Results Grid**:
  - Live cell editing with primary-key targeting.
  - Row insertion and deletion modals.
  - Execution runtime statistics (milliseconds and affected row counts).
- **Advanced Multi-Condition Filter**: Filter table rows using 11 operators (`EQUALS`, `NOT_EQUALS`, `CONTAINS`, `STARTS_WITH`, `ENDS_WITH`, `>`, `>=`, `<`, `<=`, `IS_NULL`, `IS_NOT_NULL`) with `AND` / `OR` combinatorial logic.
- **Multi-Tab SQL Drafts**: Create, rename, delete, and switch between multiple draft scratchpads.
- **Execution History**: Search, review, and re-run past SQL statements with duration and timestamp metrics.

### 🎨 Craftsmanship & Native Desktop Polish
- **macOS & Windows First-Class Support**:
  - Platform-aware title bar with macOS traffic lights inset clearance.
  - Native window drag regions.
- **Adaptive Dark / Light Themes**: Beautiful theme engine based on Shadcn/UI HSL CSS variables.
- **Keyboard-First Workflow**: Full set of global accelerators (`⌘/Ctrl + Enter`, `⌘1`, `⌘2`, `⌘3`).

---

## Downloads & Installers

Pre-built binaries for **v0.2.0** are ready for deployment:

### macOS
- **[Universal DMG (Apple Silicon & Intel)](release/AI%20DB%20Studio-0.2.0-universal.dmg)** — Recommended for all Macs (M1/M2/M3/M4 & Intel x64).
- **[Apple Silicon DMG (arm64)](release/AI%20DB%20Studio-0.2.0-arm64.dmg)** — Optimized for M1/M2/M3/M4 Macs.
- **[Intel DMG (x64)](release/AI%20DB%20Studio-0.2.0.dmg)** — For Intel-based Macs.
- **[macOS Portable ZIP](release/AI%20DB%20Studio-0.2.0-universal-mac.zip)** — Drag-and-drop standalone bundle.

### Windows
- **[Windows Setup Installer (NSIS .exe)](release/AI%20DB%20Studio-Setup-0.2.0-x64.exe)** — Full installer with Desktop & Start Menu shortcuts.
- **[Windows Portable (.exe)](release/AI%20DB%20Studio%200.2.0.exe)** — Standalone executable that runs without installation.

---

## Quick Start

### Prerequisites
- **Node.js** >= 20 (Node 22 or 24 recommended)
- **npm** >= 10

### 1. Clone & Install
```bash
git clone git@durgeshcoder:substring-projects/ai-db-studio.git
cd ai-db-studio
npm install
```

### 2. Run in Development Mode
```bash
# Starts Vite renderer + Electron main process with Hot Module Replacement (HMR)
npm run dev
```

### 3. Run Tests & Typechecks
```bash
# Run unit test suite (Node.js native test runner)
npm test

# Verify TypeScript types
npm run typecheck
```

### 4. Build Production Binaries
```bash
# Build web and main bundles
npm run build

# Package macOS DMG and ZIP
npm run dist:mac

# Package Windows NSIS and Portable Executable
npm run dist:win

# Package both platforms
npm run dist:all
```

---

## AI Grounding & Privacy Guarantee

```
┌─────────────────────────────────────────────────────────────┐
│                       Your Database                         │
│   (Customers, Financials, PII, Credentials, Records)        │
└──────────────────────────────┬──────────────────────────────┘
                               │
                      [ STRICT ISOLATION ]
                               │
            ┌──────────────────▼──────────────────┐
            │         AI DB Studio Client         │
            │  Metadata Extractor (Schema Only)   │
            │  TABLE "orders" (id INT, total NUM) │
            └──────────────────┬──────────────────┘
                               │
                  [ ZERO ROW DATA LEAKAGE ]
                               │
            ┌──────────────────▼──────────────────┐
            │        Local Ollama / OpenAI        │
            │   Synthesizes Grounded SQL Query    │
            └─────────────────────────────────────┘
```

> [!IMPORTANT]
> **Data Privacy Commitment**: AI DB Studio **never** transmits row records, query results, or cell contents to any AI endpoint. Only table schemas, column names, data types, and primary key constraints are utilized to construct grounding context.

### Setting Up Local Ollama (Offline Mode)
1. Install [Ollama](https://ollama.com/).
2. Pull a code generation model:
   ```bash
   ollama pull codellama
   # or
   ollama pull deepseek-coder:6.7b
   ```
3. Open **AI DB Studio > Settings > AI Copilot**, set provider to **Ollama** and endpoint to `http://localhost:11434`.

---

## Supported Databases

| Engine | Versions Supported | Features Tested |
| :--- | :--- | :--- |
| **PostgreSQL** | 10, 11, 12, 13, 14, 15, 16, 17+ | Connection pooling, SSL/TLS, schema navigation, table structure inspection, execution plans (`EXPLAIN`). |
| **MySQL** | 5.7, 8.0, 8.4+ | Pooled connections, SSL verification modes, primary key discovery, mutation safety checks. |
| **MariaDB** | 10.4 – 11.x+ | Compatible via MySQL driver. |
| **Cloud Databases** | AWS RDS, Supabase, Neon, PlanetScale, Cloud SQL | Full SSL/TLS encrypted support. |

---

## Keyboard Shortcuts

| Shortcut (macOS) | Shortcut (Windows/Linux) | Action |
| :--- | :--- | :--- |
| `⌘ + Enter` | `Ctrl + Enter` | **Execute SQL Statement** |
| `⌘ + 1` | `Ctrl + 1` | **Switch to Workbench View** |
| `⌘ + 2` | `Ctrl + 2` | **Switch to Connections View** |
| `⌘ + 3` | `Ctrl + 3` | **Switch to Settings View** |

---

## Architecture

```text
ai-db-studio/
├── build/                     # App packaging assets (icon.icns, icon.ico, icon.png)
├── dist/                      # Vite compiled production frontend assets
├── dist-electron/             # Compiled main process (main.js) and preload (preload.cjs)
├── release/                   # Packaged desktop installers (.dmg, .exe, .zip)
├── src/
│   ├── main/                  # Electron Main Process (Node.js runtime)
│   │   ├── main.ts            # Application lifecycle, IPC handlers, and window management
│   │   └── services/
│   │       ├── ConnectionManager.ts  # Database connection pooling and metadata prefetching
│   │       ├── AiService.ts          # Schema-grounded AI copilot & heuristic synthesizer
│   │       ├── StorageService.ts     # Local settings, query history, and draft persistence
│   │       └── SqlClassifier.ts      # AST lexical analyzer and mutation classifier
│   ├── preload/               # Secure Electron contextBridge preload script
│   │   └── preload.ts         # Strictly typed window.electronAPI contract
│   ├── renderer/              # Frontend Application (React 19 + Tailwind CSS)
│   │   ├── components/
│   │   │   ├── Workbench/     # SqlEditor, QueryResultsGrid, DatabaseExplorer, AiAssistant
│   │   │   ├── Connections/   # Saved database profiles manager and connection modals
│   │   │   ├── Settings/      # Theme, max history, and AI Copilot endpoint configuration
│   │   │   └── ui/            # Reusable accessible Shadcn/UI design system components
│   │   ├── context/           # StudioContext global state provider
│   │   └── assets/            # Official brand assets and logo
│   └── shared/                # Shared TypeScript models and IPC protocol definitions
├── test/                      # Standalone unit test suite (Node.js native test runner)
├── electron-builder.json      # Desktop packaging and installer layout configuration
├── package.json               # NPM scripts and project dependencies
└── vite.config.ts             # Vite + Electron bundler configuration
```

---

## License

This project is licensed under the **Apache License, Version 2.0**. See the [LICENSE](LICENSE) file for details.
