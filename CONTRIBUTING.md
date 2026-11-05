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
