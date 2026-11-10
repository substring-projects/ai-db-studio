# Contributing

Contributions are made under the Apache License 2.0.

## Setup

Requires Node.js 22.18 or newer.

```sh
npm ci
npm run dev
```

Before opening a pull request, run:

```sh
npm test
npm run typecheck
npm run build
```

## Code layout

- `src/main`: Electron main process. All database and AI access happens here.
- `src/preload`: the typed bridge exposed to the interface. Keep it narrow.
- `src/renderer`: the React interface. It reaches the database and AI only through `window.electronAPI`.
- `src/shared`: types used by more than one process.

## Adding a database

1. Add the engine to `Engine` in `src/shared/types.ts` and describe it in `src/shared/engines.ts`: label, defaults, the words the interface uses (table or collection) and which features apply. The interface checks these features rather than engine names.
2. Write a driver in `src/main/services/drivers/` that implements `DatabaseDriver`, and register it in `drivers/index.ts`. A SQL database can extend `SqlDriver` to reuse filtering, paging, statement classification and the read-only rules; SQLite, for example, needs mostly the connection, metadata queries and `rawExecute`.
3. Give the driver its own `classify` and `checkStrictReadOnly` if its query language is not SQL. Writes then need approval and AI queries stay read-only without changes elsewhere.
4. If the interface writes statements for it (browse, drop, edits), add a branch in `src/renderer/lib/statements.ts`.
5. Add tests, and add the driver package to `external` in `vite.config.ts` when it has native or optional dependencies.

Keep decisions about what is safe to run in the main process, where tests can cover them and the interface and model can't bypass them. `src/main/services/ai/agent.ts` takes its dependencies as arguments so its rules can be tested without Electron.

## Pull requests

- Explain the behavior that changes, how you tested it, and any limitations that remain.
- Include dark and light screenshots for interface changes.
- Add tests for changes to SQL classification, query review or what is sent to AI models.
- Never commit workspaces, passwords, API keys, real result rows or credentials in fixtures.

## Safety rules

Do not weaken these to make a feature easier:

- Statements that can change data need a person's approval, bound to the exact SQL and connection.
- The model can propose a write, but must not be able to run or approve one.
- Result rows reach an AI model only when the user has opted in, and are never stored in conversation memory.
