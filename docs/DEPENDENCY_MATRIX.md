# Dependencies

| Component | Role |
| :--- | :--- |
| Node.js 22.18+ | Development and tests |
| Electron 34 | Desktop runtime |
| Vite 6, electron-builder | Bundling and installers |
| React 19, TypeScript | Interface |
| Tailwind CSS 3, Radix UI, Lucide | Styling, components and icons |
| Monaco Editor, sql-formatter | SQL editing |
| TanStack Table and Virtual | Results grid |
| react-resizable-panels, cmdk | Layout and command palette |
| pg, mysql2 | Database drivers |
| LangChain (`@langchain/core`, `@langchain/openai`, `@langchain/ollama`), Zod | AI assistant |

Exact versions are in `package.json` and `package-lock.json`. Interface and AI libraries are bundled at build time, so they are listed as development dependencies.
