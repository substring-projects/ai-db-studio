# AI DB Studio

A safe, local-first database desktop client built with **Electron.js, TypeScript, React 19, and Tailwind CSS**. Zero cloud runtime dependencies, zero web servers. Apache-2.0 licensed.

The JavaFX 21 edition snapshot is permanently preserved under Git tag `v0.1.0-javafx`.

---

## Key Features

- **PostgreSQL & MySQL Support**: High-performance pooled connections via `pg` and `mysql2` with SSL/TLS encryption modes.
- **Safety Rails & Human Approval**:
  - Automatic AST/Lexical classification separating read-only queries (`SELECT`, `SHOW`, `EXPLAIN`) from mutations (`INSERT`, `UPDATE`, `DELETE`, `DDL`).
  - Write statements require human approval through single-use, cryptographically generated tokens with statement preview.
- **Modern Responsive Workbench**:
  - Left: Tabbed SQL draft editor, run query (`⌘/Ctrl + Enter`), query execution history, and striped dense data results table.
  - Right: Collapsible Database Explorer with table/view hierarchy, column types, primary key indicators, and search.
- **Advanced Multi-Condition Filter**:
  - Filter data rows with 11 operators (`CONTAINS`, `EQUALS`, `NOT_EQUALS`, `STARTS_WITH`, `ENDS_WITH`, `>`, `>=`, `<`, `<=`, `IS_NULL`, `IS_NOT_NULL`) with `AND` / `OR` logic.
- **Animated Dialog System**:
  - Modern card dialogs with micro-interactions, bouncy squircle badges, and horizontal shake feedback on validation errors.
  - Floating toast notifications.
- **AI Privacy Gateway**:
  - Connects to local Ollama (`http://localhost:11434`) or OpenAI endpoints.
  - Database cell values and query results are strictly isolated locally and never transmitted to external LLMs.

---

## Quick Start & How to Run

### Prerequisites
- Node.js >= 20 (Node 24 recommended)
- npm >= 10

### Development Mode
```bash
# Start Vite + Electron with Hot Module Replacement (HMR)
npm run dev
```

### Build & Production
```bash
# Typecheck and compile production Electron bundles
npm run build

# Run unit tests (Node.js native test runner)
npm test
```

---

## Project Structure

```text
├── src/
│   ├── main/                  # Electron Main Process (Node.js)
│   │   ├── index.ts           # BrowserWindow & IPC handlers
│   │   └── services/          # ConnectionManager, StorageService, SqlClassifier
│   ├── preload/               # Secure contextBridge API definition
│   │   └── index.ts           # Exposes window.electronAPI with full types
│   ├── renderer/              # Frontend Application (React 19 + Tailwind)
│   │   ├── App.tsx            # App root & navigation router
│   │   ├── context/           # StudioContext state & actions
│   │   └── components/
│   │       ├── Sidebar.tsx    # Navigation and dark/light theme switch
│   │       ├── TopBar.tsx     # Window header & active database indicator
│   │       ├── Modals/        # Danger, Warning, Prompt, Connection & Filter modals
│   │       └── Workbench/     # Tabbed editor, Results grid, Right Explorer
│   └── shared/                # Shared TypeScript models and IPC interface
├── test/                      # Standalone unit tests
├── index.html                 # Renderer HTML template
├── package.json               # Dependencies and build scripts
├── tailwind.config.js         # Design token configuration
├── tsconfig.json              # TypeScript configuration
└── vite.config.ts             # Vite + Electron bundler config
```

---

## License

Apache-2.0
