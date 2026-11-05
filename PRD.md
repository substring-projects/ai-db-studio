# AI DB Studio — Product Requirements Document

**Version:** 1.2  
**Status:** Product direction confirmed; implementation specifications proposed where marked  
**Date:** 2026-11-05  
**Product concept:** **DBeaver-like visual database client + conversational AI over your databases**  
**License:** Apache License 2.0 (Apache-2.0)  
**Platforms at first public release:** macOS, Windows, Linux

> **The core product is not an AI chatbot with a connection form.** It is a beautiful, fully usable database desktop client with an integrated conversational assistant. A user should be able to use the database client *without configuring AI*, then optionally connect OpenAI or Ollama in Settings to ask natural-language questions about their selected database.

## 1. Product Vision

**AI DB Studio** is a local-first, open-source desktop database workbench with two equally important pillars:

1. **Modern visual database client:** connect to multiple databases; browse schemas and relationships; inspect and filter table data; write and execute manual SQL, including explicitly confirmed writes; view results; manage connections and query tabs.
2. **AI conversation over a database:** configure an AI provider in Settings; ask questions in natural language about the active connection; see transparent, validated read-only SQL executed automatically; receive explanations, result tables and charts; ask contextual follow-up questions.

**One-line pitch:** *The database browsing experience of DBeaver, combined with an AI chat assistant that can query and explain your data.*

**Principles:** desktop-first; excellent UX; database client works without AI; user controls database connectivity; AI writes only after human review; manual writes guarded by explicit user confirmation; no silent upload of row data to cloud AI; transparent generated SQL; secure local persistence; cross-platform parity.

### Confirmed product decisions

| Area | Decision |
|---|---|
| First public release | macOS + Windows + Linux |
| Interface | React and Tailwind CSS in Electron, premium dark/light modes |
| Application runtime | Electron with TypeScript; database and AI work run in the main process |
| Data sources | Multiple user-managed PostgreSQL and MySQL connections in MVP |
| AI model providers | **OpenAI and Ollama both in MVP**; user configures in Settings |
| AI data disclosure | **Schema metadata and the user's question/context** are sent to the model. Query result rows are sent only if the user opts in |
| SQL actions | AI **automatically executes validated read-only SQL** only; manual editor also supports INSERT/UPDATE/DELETE and permitted DDL after explicit confirmation |
| Distribution | Free, open-source desktop application under **Apache-2.0** |
| Storage | Local app data; OS credential vault for connection/API secrets |

### Confirmed execution boundaries and remaining product assumptions

- **Both PostgreSQL and MySQL ship in MVP** with connection management, schema browsing, tabular results, manual SQL, and AI text-to-SQL parity.
- **AI execution is permanently read-only for v1:** AI-generated SQL must pass dialect-aware AST validation and execute through an independently restricted read-only connection/transaction. No write tool is exposed to the model.
- **Manual editor permits writes** (`INSERT`, `UPDATE`, `DELETE`, and supported DDL) only after an explicit per-execution confirmation showing target connection, SQL and potential impact. Actual capabilities depend on DB grants; destructive/DDL workflows should use stronger warnings. No blanket 'remember approval'. Transaction control and rollback UX are specified below.
- The model receives schema metadata and user question/context. **Query results and row values are not sent unless the user opts in**, and are never stored in conversation memory. The user's own question could contain sensitive text; explain this at setup.
- For cloud AI, numerical summaries and charts from query rows are calculated locally and presented as deterministic outputs, rather than requesting a model to narrate raw row values.
- A chat is scoped to one connection; no cross-database querying in MVP. Database writes from the visual data grid are out of scope unless separately approved.
- Initial installer platforms are **Windows, macOS and Linux**. No hosted accounts, remote telemetry, or paid tier are required for MVP.
- Still to finalize: write-confirmation UX details, whether manual DDL ships fully in MVP or is limited to a safe subset, SSH tunneling, Linux secret-vault fallback, and update/signing distribution policy.

## 2. Problem, Audience and Value

### Problems

- Existing database clients expose powerful functionality but often feel dense or outdated to casual users.
- Discovering unfamiliar schemas and writing joins for everyday analysis takes time.
- General-purpose AI chat does not know live database structure, may invent columns, and often cannot enforce SQL security.
- Cloud-only AI database products may require remote database exposure or disclose result data.

### Primary users

| Persona | Primary job |
|---|---|
| Backend developer | Browse tables, inspect records, debug through SQL and natural language |
| DBA / data engineer | Inspect structure, relationships, query plans and execution behavior |
| Data analyst | Explore, filter, export and visualize read-only data |
| Student / educator | Learn database structures and understand AI-generated SQL |

### Success definition

The product is successful only when **both** workflows work well: a developer chooses it as a pleasant full-featured database browser *and* can ask useful questions without manually writing SQL.

## 3. MVP Scope and Release Boundaries

### Pillar A — Database Client (P0)

- Saved named connection profiles; add, edit, test, disconnect and delete.
- Multiple saved PostgreSQL and MySQL connections, one or more open sessions; visible state.
- Connection form with host, port, database, username, password, SSL options (where supported) and timeouts.
- Database explorer tree: connection → schema → tables/views → columns/keys.
- Search/filter explorer objects by name; lazy loading and refresh.
- Table/view inspector: structure, columns, primary/foreign keys, indexes where accessible.
- **Browse Data** tab: paginated grid, sortable columns, safe server-side filters, null display, copy selected cells, CSV export.
- **SQL Editor** with syntax highlighting, formatting where feasible, tabbed queries, manual read/write execution with confirmation for writes, error display, results grid, execution duration and row count.
- Query history stored locally; reopen query; query cancellation and progress states.
- Native desktop polish: resizable multi-pane layout, keyboard navigation, dark/light theme, welcome/empty states.

### Pillar B — Conversational DB Analytics (P0)

- Settings → AI: choose OpenAI or Ollama; configure model, API key (OpenAI), Ollama endpoint/model, test connectivity; save secrets securely.
- Connection-scoped conversation with streaming AI text, loading/cancel/error states and local history.
- Schema discovery and relevant schema retrieval scoped to approved objects.
- Convert natural-language questions to dialect-specific **read-only** SQL with meaningful aliases and limits.
- **Automatically** validate then execute approved SQL; no mandatory Run confirmation in default flow.
- Show generated SQL prominently with execution status; allow copy/open in SQL editor.
- Present query response as a result table, compact explanation and simple line/bar charts when appropriate.
- Follow-up questions preserve the active connection, prior intent and relevant SQL context.
- When the question cannot be answered without sending result rows to a remote model, use deterministic local operations, ask for a narrower task, or recommend Ollama. **Never silently send rows to OpenAI.**

### Out of scope for first release

- AI-generated writes or DDL, unattended/manual bulk writes without confirmation, direct editing of cells in the data grid, and database migration orchestration.
- Full DBeaver feature parity (ER diagram editing, SSH tunneling, advanced drivers/plugins, import tools, administration console).
- Multi-user cloud accounts, sync, remote hosting, collaboration and paid billing.
- Cross-database federation or executing a single question across multiple connections.
- Sending raw results, sample records, credentials or entire databases to OpenAI.
- Autonomous background scheduled queries or destructive agent actions.

## 4. Primary User Journeys and Acceptance Criteria

### UJ-01 — First launch and welcome

1. Install app on supported OS and open it.
2. See polished welcome screen with **Add Database Connection** and **Configure AI** actions.
3. Can start with a database connection **without AI setup**.

**Accept when:** app opens without manually launching a backend, both themes render correctly, and unavailable/empty states are clear.

### UJ-02 — Create and use a DB connection

1. Click Add Connection; choose PostgreSQL or MySQL.
2. Enter host, port, database and credentials; test connection.
3. Save profile; connection appears in left sidebar.
4. Connect/disconnect and switch active connections.

**Accept when:** wrong credentials or blocked host produce actionable errors; secrets never appear in logs/exports; connection uses driver-level TLS options and configured timeouts.

### UJ-03 — Browse the database visually

1. Expand connection and schema tree.
2. Select a table to view **Structure** and **Data** tabs.
3. Page through results, sort, filter, copy and export as CSV.
4. Open multiple tables as tabs, resize sidebar and data pane.

**Accept when:** loading is asynchronous; first grid page is bounded; empty/null/binary values are rendered safely; UI does not freeze for slow queries.

### UJ-04 — SQL editor workflow

1. Open SQL editor tied to a connection.
2. Write SQL with highlighting; execute SELECT directly, or review explicit confirmation before running INSERT/UPDATE/DELETE or supported DDL.
3. Review results, execution time, errors and query history.
4. Open AI-generated SQL into an editor tab.

**Accept when:** a manual SELECT returns rows; a manual UPDATE or DELETE cannot run without an explicit confirmation; cancel stops it before execution; a rejected statement never reaches the database driver; DB permission failures are shown clearly; AI cannot run a write without the user's approval of that exact statement.

### UJ-05 — Configure AI in Settings

1. Open Settings → AI Providers.
2. Select OpenAI or Ollama; configure and test.
3. For OpenAI, review privacy disclosure: question and relevant schema metadata leave the device; row results do not.
4. Select preferred model and save settings locally.

**Accept when:** both providers work in MVP, key is encrypted with the OS keychain (never stored in plain text), Ollama failure has actionable troubleshooting and cloud disclosure is visible.

### UJ-06 — Talk to a database

1. Select a connection and open AI Assistant.
2. Ask “Which five products generated the most revenue this month?”
3. Agent retrieves relevant schema, generates SQL, applies policy checks and **automatically executes** it.
4. User sees generated SQL, result table, concise explanation and optionally chart.
5. Follow up “Only for Lucknow” without restating initial intent.

**Accept when:** all executed SQL passes independent validation; the execution is associated with the selected connection; correct query/result provenance is shown; safety violations fail closed; OpenAI never receives returned rows.

### UJ-07 — Unsafe or expensive query

1. User asks to drop tables, reveal passwords, modify data, run massive unbounded queries or trigger DB functions.
2. Engine refuses or safely narrows request; shows rationale and safe alternative.

**Accept when:** SQL parser, allowlist, DB privileges, timeouts and resource limits are independent of LLM instructions; tests prove unsafe operations never execute.

## 5. UX / Information Architecture

### Main desktop layout

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ AI DB Studio        Active: ecommerce_db       [Theme] [AI Provider] [Settings]│
├────────────────┬─────────────────────────────────────────────────────────────┤
│ CONNECTIONS    │  [Table: orders] [SQL Editor] [AI Chat]                   │
│ + Add          ├─────────────────────────────────────────────────────────────┤
│ PostgreSQL ▾   │  Table: orders                                               │
│  ecommerce_db  │  [Structure] [Data] [Indexes]                                 │
│   public ▾     │  Filter: _______  [Apply] [Export CSV]                       │
│    customers   │  ┌───────────────────────────────────────────────────────┐   │
│    orders      │  │ id │ customer_id │ status │ total_amount │ ...        │   │
│    products    │  └───────────────────────────────────────────────────────┘   │
│                │  Rows 1–100 / ...                                          │
│ HISTORY        │                                                             │
├────────────────┴─────────────────────────────────────────────────────────────┤
│ Connected · PostgreSQL · Manual SQL · AI Read-only · Last query: 84 ms                       │
└──────────────────────────────────────────────────────────────────────────────┘
```

**AI Chat** is a first-class tab/workspace, not a separate product. It displays rich message cards with question, tool progress, SQL used, result table, explanation, chart and export/open-in-editor actions.

### UI standards

- Modern and compact, inspired by polished database and developer tools rather than generic admin templates.
- Semantic CSS theme tokens; dark/light toggles; persists theme and window layout.
- Consistent typography, restrained accent, high-contrast status and error patterns.
- Keyboard navigation: `Ctrl/Cmd+K` search/command, `Ctrl/Cmd+Enter` run SQL, `Ctrl/Cmd+L` focus AI prompt (proposed mappings).
- Accessible labels, focus indicators, appropriately sized hit targets, high-DPI support.
- Virtualized large tables; SQL editor choice must be performance-tested (RichTextFX is a candidate, not a finalized decision).
- Rich chat Markdown rendering and code blocks; avoid embedding remote web content unnecessarily.

## 6. Functional Requirements by Module

| ID | Priority | Requirement |
|---|---|---|
| DB-01 | P0 | Create/edit/test/delete multiple PostgreSQL and MySQL connection profiles |
| DB-02 | P0 | OS-vault-backed passwords and API tokens |
| DB-03 | P0 | Connect/disconnect, active connection, health/error indicators |
| DB-04 | P0 | Lazy schema/table/view/column/keys explorer |
| DB-05 | P0 | Table structure inspector |
| DB-06 | P0 | Paginated read-only data grid, filter/sort/copy/CSV |
| DB-07 | P0 | Tabbed highlighted SQL editor; SELECT execution and confirmed manual writes, permission-aware |
| DB-08 | P0 | Query results, status, timings, errors, local query history |
| AI-01 | P0 | Settings for OpenAI and Ollama, selectable provider/model |
| AI-02 | P0 | Scope chat sessions to a selected database connection |
| AI-03 | P0 | Discover and retrieve only relevant permitted schema metadata |
| AI-04 | P0 | Generate PostgreSQL and MySQL read-only SQL grounded in actual schema |
| AI-05 | P0 | Validate then automatically execute compliant SQL |
| AI-06 | P0 | Stream conversation responses and show transparent tool status |
| AI-07 | P0 | Display SQL, result table, summary and applicable charts |
| AI-08 | P0 | Conversation history and contextual follow-up requests |
| AI-09 | P0 | Enforce strict remote-model payload allowlist; no result rows |
| SEC-01 | P0 | SQL AST validation, policy allowlists and least-privilege DB credentials |
| SEC-02 | P0 | Row cap, timeout, cancellation, query cost/complexity control |
| SEC-03 | P0 | Prevent SSRF-like abuse by unsafe endpoints/metadata and secure logs |
| UX-01 | P0 | Responsive desktop shell, native navigation and settings |
| UX-02 | P0 | Dark/light preference and polished empty/loading/error states |
| DIST-01 | P0 | Reproducible installers and smoke tests for 3 operating systems |
| OSS-01 | P0 | License, build docs, security policy and contribution instructions |
| DB-09 | P0 | MySQL connector, metadata adapter, query dialect and parity tests |
| DB-10 | P1 | SQL Server connector and dialect adapter |
| DB-11 | P1 | ER relationship visualizer and direct result-grid editing (separate from manual SQL writes) |
| AI-10 | P1 | Saved prompt templates, glossary, query explanation and model evaluations UI |

## 7. Technical Architecture

### Electron processes

```text
React interface (renderer process)
    │  window.electronAPI, a typed bridge over IPC (no direct database or AI access)
    ▼
Electron main process
    ├── ConnectionManager (pg and mysql2 pools, TLS, queries, cancellation, metadata)
    ├── SqlClassifier (what is read-only; independent of the model)
    ├── ChatAgentService + LangChain agent (OpenAI and Ollama providers, query review)
    ├── ChatMemoryStore (conversation memory, without result rows)
    └── StorageService (local JSON files; secrets encrypted with the OS keychain)
         │
         └── Database drivers → user-selected PostgreSQL or MySQL database
```

### Important component boundaries

- `ConnectionManager`: lifecycle of connections, TLS settings, credential retrieval, timeouts.
- `SchemaCatalog`: discovered permitted metadata, refresh and cache, capability mapping.
- `AiReadOnlySqlPolicyEngine`: independent of LLM; dialect-aware SQL AST inspection for read-only statements; no AI access to manual executor. Manual SQL uses a separate executor and user authorization flow.
- `AiReadOnlyExecutor`: bounded, least-privileged path exclusively for AI. `ManualSqlExecutor`: separate user-driven path supporting explicitly confirmed writes, transaction handling, limits and cancellation. Shared low-level driver utilities do not imply shared write authority.
- `AgentOrchestrator`: request scope, schema retrieval, LLM calls, tool iteration budget, execution and structured outcome.
- `AiPrivacyGateway`: allowlisted payload construction, redaction, audit of what is shared; disallows results/sample rows in cloud provider requests.
- `ConversationService`: connection-scoped state; persisted messages without implicit row payload retention.

### Stack

| Layer | Choice |
|---|---|
| Runtime | Electron, Node.js and TypeScript |
| UI | React, Tailwind CSS, Radix UI, Lucide icons; Monaco for SQL editing; TanStack Table for results |
| AI framework | LangChain |
| Providers | OpenAI API and Ollama, independently configurable |
| Database connectivity | `pg` and `mysql2` drivers; dialect-aware metadata queries |
| Local metadata | JSON files in the app's data directory |
| Secrets | Electron `safeStorage`, backed by the OS keychain. Without it, secrets are kept for the session only, never written in plain text |
| Build | Vite; `electron-builder` per operating system |
| Tests | Node test runner, including an adversarial SQL suite |

### Provider privacy contract

**OpenAI:** allowed outbound content: (a) user question, (b) tightly scoped prior conversational questions and safe SQL context as needed, (c) relevant schema descriptions such as table/column names, types, foreign keys and optional approved glossary. **Forbidden outbound content:** database row values, query results, credentials, environment variables, entire DB dumps, unapproved logs, connection URL/password, unrelated schema. Any user-supplied chat text itself may contain sensitive values; disclose this limitation and offer local-only Ollama.

**Ollama:** local endpoint by default. Clarify remote Ollama URL risks in Settings; do not claim privacy if users point to a remote host.

**Important design consequence:** Cloud model can create SQL, but cannot truthfully summarize arbitrary result values unless the app uses **local deterministic summaries** or the user selects a fully local model. Show this distinction clearly in UX.

## 8. AI Query Lifecycle

1. User selects a connection and enters a question.
2. Engine checks configured provider, connection permissions, applicable privacy mode and conversation state.
3. Fetch only relevant authorized metadata; construct minimal schema context.
4. Model returns structured SQL proposal and expected output shape; no direct model access to the database drivers.
5. Parse and validate SQL, identifiers, functions, schemas, row caps, parameters, complexity and statement category.
6. **Auto-execute only if all checks pass**, using an AI-specific read-only role/session and guarded executor; never call manual SQL services.
7. Return structured results to local UI, with SQL provenance and execution details.
8. Locally compute numerical summaries/visual specs. If interpretation requires row values unavailable to cloud model, use deterministic logic, narrower local analysis, or Ollama.
9. Persist safe conversation context; support follow-up with scoped metadata and prior SQL, not entire result sets.

### Automatic-execution protections

- Strictly deny writes/DDL, multiple statements, COPY PROGRAM, locking statements, unsafe/external functions, stored procedures and unknown statements.
- Deny non-allowlisted functions even inside `SELECT`; deny arbitrary system/catalog access beyond explicitly approved metadata operations.
- Use an SQL AST parser and DB-specific semantics, never only regex or `startsWith("SELECT")`.
- Require or strongly prefer a separate AI **SELECT-only role** and no unsafe function privileges; use read-only transaction, statement timeout and bounded fetched rows.
- Explicit cost/EXPLAIN checks where supported, plus hard row cap, max joins/complexity and cancellation.
- Guard pagination, sorting/filter parameters and identifier quoting; no unrestricted string interpolation.
- Present policy failure to user; **do not retry with weaker policy**.
- Block AI execution if it cannot be safely confined to read-only operations. A connection with manual write permissions must not grant those permissions to the AI execution path.

## 8A. Manual SQL vs AI SQL — authorization and transaction policy

| Dimension | Manual SQL editor | AI assistant |
|---|---|---|
| Initiator | Human clicking Run | Agent after user question |
| Supported SQL | SELECT and explicitly confirmed INSERT/UPDATE/DELETE; supported DDL based on DB grants and policy | Only vetted read-only SELECT-like statements |
| Execution path | `ManualSqlService` / `ManualSqlExecutor` | `AiReadOnlyQueryService` / `AiReadOnlyExecutor` |
| Confirmation | Per-execution for any potentially mutating SQL, with connection identity, statement class and warning; no silent persistence | No confirmation for validated read-only auto-execution |
| Credentials | User's manually configured connection rights; never elevated by app | Separate read-only credential/profile recommended; refuse when isolation is not assured |
| Transactions | Default auto-commit for ordinary manual statements after confirmation; optional explicit transaction mode (P1) with commit/rollback | Read-only transaction with hard timeout and bounds |
| Protection | Statement preview, multi-statement review, dangerous/DDL warning, cancellation, audit record, no auto-retry | AST allowlist, function and object checks, quotas, read-only DB privilege, cancellation |
| UI indicator | **MANUAL · WRITE CAPABLE** and active database name | **AI · READ ONLY** |

**Manual write confirmation invariant:** A SQL edit, target DB change or expired approval invalidates the confirmation. `executeConfirmedWrite` requires a single-use token issued after displaying a statement fingerprint and target profile; a modal alone is not an authorization boundary. Explicit DB transaction safeguards and privilege grants remain the ultimate protection. For v1, block execution of multiple semicolon-separated mutating statements unless the UI implements a full statement-by-statement review and transaction model. Prevent accidental writes on connections marked production by adding extra friction.

**AI query invariant:** The model can propose statements but cannot run a write or approve one. A statement runs without a person only if it passes the strict read-only check, which rejects DDL, DML, `SELECT ... FOR UPDATE`, mutating CTEs, functions with side effects and multiple statements; it then runs in a read-only transaction. Everything else waits for the user to approve that exact statement on that connection. Auto-execution fails closed if the check fails.

**Persistence:** Log query text and metadata locally only if query-history settings permit it. Never store connection secrets or raw result rows in history by default. Write audits show timestamp, connection, action, completion status and rows affected, not sensitive payloads.

## 9. Local Data Model (Proposed)

| Entity | Important fields | Notes |
|---|---|---|
| `connection_profiles` | id, label, db_type, host, port, database_name, username, tls_config, credential_ref, last_used_at | No plaintext password |
| `schema_cache` | connection_id, object_path, object_type, metadata_json, captured_at | Refreshable; avoid row samples |
| `ai_provider_profiles` | id, provider, model, endpoint, secret_ref, params_json, enabled | OpenAI and Ollama |
| `conversations` | id, connection_id, title, provider_profile_id, created_at | Connection scoped |
| `messages` | id, conversation_id, role, text, safe_sql_context, created_at | Avoid raw results by default |
| `query_executions` | id, connection_id, conversation_id_nullable, source, sql_text, status, duration_ms, rows_returned, error_code, created_at | No result rows saved by default |
| `sql_tabs` | id, connection_id, title, query_text, last_opened_at | Local drafts |
| `preferences` | key, value | Theme, layout, limits |
| `write_confirmations` (ephemeral, in memory) | token, connection_id, sql_digest, expires_at, consumed | One-time manual write approval, never persisted as reusable authorization |
| `query_policies` | connection_id, ai_role_ref, allowed_schemas, statement_timeout_ms, row_limit, manual_writes_enabled | Distinct AI and manual capabilities; no plaintext secrets |

Support export of **non-secret** settings only, with explicit data export controls.

## 10. Internal API / Service Contracts

The interface calls the main process through the typed `ElectronAPI` contract in `src/shared/types.ts`, not REST endpoints.

`AiChatEvent`: `THINKING` (no secret model chain-of-thought), `SCHEMA_SELECTED`, `SQL_PROPOSED`, `VALIDATING`, `EXECUTING`, `RESULT_AVAILABLE`, `SUMMARY`, `ERROR`, `DONE`.

`QueryOutcome`: connection identifier, normalized SQL, status, column metadata, bounded rows, execution time, total/returned rows if known, rejection explanation, safe export handle. Never pretend that a truncated result is the complete dataset.

## 11. Security / Privacy Threat Model

| Threat | Requirement |
|---|---|
| Prompt injection in schema/table names and question | Treat schema and user content as data; SQL policy independent of model |
| Harmful SQL hidden in SELECT/functions/CTE | AI-specific full semantic validation, allowlisted constructs/functions, and least-privilege read-only DB grants |
| Manual write executed against wrong database | Prominent target connection/environment in confirmation dialog; single-use approval token; transaction and audit trail |
| AI escalates to manual SQL path | Separate service capability, no tool binding to manual executor, policy tests and privilege isolation |
| Unbounded costly queries | Hard execution timeout, fetch limit, cost guard, cancellation, worker isolation |
| Connection to dangerous hosts | Warn/block unsafe connection configurations as appropriate; restrict driver options and outbound metadata resolution |
| Remote model data leakage | Allowlisted prompts, privacy notice, no result rows, redacted diagnostics, user-controlled provider |
| Local secret theft | OS vault, avoid logging, minimize privileges, encrypt sensitive local history if enabled |
| Cross-connection context leak | Bind chat to one connection and invalidate metadata context on switching |
| CSV formula injection | Escape spreadsheet-triggering cells when exporting |
| Insecure model endpoint | TLS validation for cloud; warn for non-loopback Ollama endpoints |
| Open-source supply chain | Dependency pinning, SBOM, vulnerability scans, signed builds where feasible |

**No telemetry by default** is proposed; any diagnostics must be transparent and opt-in. Confirm the eventual policy in Settings and project documentation.

## 12. Nonfunctional Requirements

- UI remains interactive during connection tests, metadata loading, slow SQL and LLM streaming.
- App opens without external hosted backend; only remote model/network database connectivity requires internet/network.
- Work on supported macOS, Windows and Linux variants; package and smoke-test per OS.
- Reopen saved connection profiles and restore user theme/window layout after restart.
- Handle up to 100,000-row *logical* result sets via database pagination; never hold all rows in UI memory (proposed test case).
- First table page and cancellation show progress states; benchmark latency targets after baseline.
- Sensitive schema/queries are kept local except explicitly permitted cloud prompt metadata; results are never included in cloud prompts.
- Clear errors for driver load failure, DNS/TLS failure, bad credentials, SQL errors, model offline, rate limits and unsafe SQL.
- Accessibility and keyboard-first operation for primary workflows.

## 13. MVP Implementation Backlog

Priorities: **P0 = necessary for first release**, **P1 = immediately following**. IDs are stable references for issues and PRs. Estimates are intentionally not assigned until architecture spikes establish effort.

| Sprint / Epic | ID | Priority | Deliverable | Acceptance gate |
|---|---|---|---|---|
| Foundation | APP-01 | P0 | Electron and React bootstrap | Lifecycle starts and stops cleanly |
| Foundation | APP-02 | P0 | Theme tokens, light/dark and persistence | Toggle applies everywhere and survives restart |
| Foundation | APP-03 | P0 | Workbench shell, sidebar, tabs, split panels, status bar | Resizable; keyboard usable; no blocked UI thread |
| Foundation | APP-04 | P0 | Local settings store | Local data upgrades are tested |
| Connections | CON-01 | P0 | PostgreSQL driver and test-connection service | Success + TLS/auth/network errors covered |
| Connections | CON-02 | P0 | OS credential vault integration | No plaintext secrets at rest/in logs |
| Connections | CON-03 | P0 | Connection management forms and lifecycle | Add/edit/test/delete/switch multiple profiles |
| DB client | DBUI-01 | P0 | Lazy connection/schema/object explorer | Loading/errors and refresh work |
| DB client | DBUI-02 | P0 | Structure inspector (columns/keys/indexes) | Matches PostgreSQL metadata test fixtures |
| DB client | DBUI-03 | P0 | Paginated data grid, sort/filter/copy | Large tables do not freeze window |
| DB client | DBUI-04 | P0 | SQL editor, highlighting and tab persistence | Multiple tabs + run/cancel controls |
| Connections | CON-04 | P0 | MySQL test + TLS options | MySQL credentials, timeout, TLS/error paths covered |
| Database client | DBUI-06 | P0 | MySQL explorer, grid, manual SQL parity | Both engines pass same UX acceptance suite |
| Manual SQL | MAN-01 | P0 | Statement classification and guarded manual query execution | Dialect-aware statement classification; DB grants respected |
| Manual SQL | MAN-02 | P0 | One-time write confirmation UI and service token | SQL/connection changes invalidate approval; no unconfirmed write |
| Manual SQL | MAN-03 | P0 | Manual write results, errors and affected-row summary | Clear success/failure, no implicit retry |
| Manual SQL | MAN-04 | P0 | Strict AI/manual execution path separation | Integration test verifies model cannot reach write executor |
| Security | SAFE-01 | P0 | AI-only PostgreSQL/MySQL read-only SQL AST validator | Adversarial suite rejects writes and dangerous SELECT |
| Security | SAFE-02 | P0 | Guarded query executor | Row/timeout/cancel/privilege limits enforced |
| DB client | DBUI-05 | P0 | Results grid, CSV export, query history | Correct headers, encoding and export hardening |
| AI settings | MODEL-01 | P0 | OpenAI provider, model settings, secure key store | Connect/test/diagnostic states work |
| AI settings | MODEL-02 | P0 | Ollama provider, endpoint/model discovery | Local inference works and handles offline cases |
| AI settings | MODEL-03 | P0 | Cloud schema-only privacy gateway and disclosure | Test proves query rows never enter cloud payload |
| Agent | AGENT-01 | P0 | Scoped schema catalog/retriever | No unrelated or unauthorized schema shared |
| Agent | AGENT-02 | P0 | NL → dialect-specific PostgreSQL/MySQL SQL proposal | SQL grounded in real schema on eval set |
| Agent | AGENT-03 | P0 | Validation → automatic guarded execution | Auto-run only after independent policy approval |
| Agent | AGENT-04 | P0 | Connection-scoped chat + streaming + history | Follow-ups and cancellation function |
| Agent | AGENT-05 | P0 | SQL explanation, provenance and local charts | No cloud result-row disclosure; no fabricated data |
| Quality | TEST-01 | P0 | Testcontainers integration + adversarial SQL tests | CI blocks unsafe regression |
| Quality | TEST-02 | P0 | AI evaluation dataset and correctness gates | Gold questions, expected SQL semantics, error cases |
| Release | REL-01 | P0 | `electron-builder` installers | Smoke-tested macOS/Windows/Linux installs |
| Release | REL-02 | P0 | Open-source repo/license/docs/SBOM/security policy | Clean-source reproducible build, license chosen |
| Database support | DB-EXT-01 | P0 | MySQL driver, metadata/dialect and AI parity | Connection, browsing, manual SQL and AI tests |
| Next | DB-EXT-02 | P1 | SQL Server driver/dialect | Same parity acceptance gates |
| Next | UX-ADV-01 | P1 | Schema diagrams and richer charts | Works on large relationships/results |

### Recommended incremental delivery sequence

**Milestone 1 — Desktop shell:** APP-01 to APP-04. Deliver a beautiful native window with navigation and working themes.

**Milestone 2 — Real database client:** CON-01 to CON-04, DBUI-01 to DBUI-04 and DBUI-06. Deliver a DBeaver-like browsing experience *without AI*.

**Milestone 3 — Two separated execution paths:** SAFE-01, SAFE-02, DBUI-05 and MAN-01 through MAN-04. Manual writes require explicit confirmation; AI remains read-only.

**Milestone 4 — AI providers and privacy:** MODEL-01 to MODEL-03, AGENT-01. Users configure OpenAI/Ollama; outbound cloud schema-only payload guaranteed by tests.

**Milestone 5 — Conversational agent:** AGENT-02 to AGENT-05. Questions automatically generate, validate and execute safe SQL; results show as chat tables/charts.

**Milestone 6 — Quality + open-source release:** TEST-01/02, REL-01/02. Publish packages for all three OSes with documentation and source.

## 14. Verification and MVP Exit Criteria

1. A fresh install opens on **macOS, Windows and Linux** with no manual runtime setup.
2. New user creates PostgreSQL and MySQL connections and switches between them without context leakage.
3. Visual database explorer can inspect a schema, table details and paginated rows without AI enabled.
4. SQL editor runs SELECT and explicitly confirmed manual UPDATE/DELETE; cancellation, history and CSV export work.
5. OpenAI and Ollama can each be configured and tested from Settings.
6. A grounded natural-language analytics question automatically executes validated SQL and presents a trustworthy answer/table.
7. Follow-up questions honor the selected connection; change of connection requires separate context.
8. SQL injection, write attempts, dangerous functions, multi-statements, long queries and prompt injection are denied by independent tests.
9. Tests verify **no result rows or credentials are sent to OpenAI**; relevant schema/question/context only.
10. Dark/light themes, keyboard navigation, cancellation, error handling, secret storage and native installers pass review.

### Proposed MVP quality metrics (not measured)

- 0 unsafe executions across adversarial regression suite.
- ≥85% executable/correct SQL on a versioned, schema-grounded evaluation set (subject to benchmark definition).
- ≥90% successful first-run launch in a cross-platform pilot.
- No UI lockup for queries/model calls under simulated slow responses.
- Connection, table browse and chat workflows each pass moderated usability testing.

## 15. Open Decisions and Product Questions

All eight key product choices (platforms, models, cloud privacy, AI auto-execution, open-source distribution, PostgreSQL/MySQL, manual writes, and Apache-2.0) are **resolved**. Remaining choices are design refinements:

1. **Cloud mode privacy:** Should names/descriptions of sensitive schemas be excluded by default via a per-connection allowlist? Recommended: **yes**.
2. **Local conversation persistence:** Store only prompts and generated SQL, or encrypted bounded result snippets too? Default: **no stored result rows**.
3. **AI charting:** Are deterministic auto-generated chart suggestions sufficient for MVP, or is an interactive chart builder required?
4. **Connection protocols:** Is direct TCP + TLS sufficient for v1, or do users need SSH tunnels/cloud auth immediately?
5. **Desktop UI priorities:** Should the SQL editor and table inspector or the AI chat receive first focus in UX prototyping? Proposed: build a coherent database workbench shell first, then chat as a first-class tab.

## 16. Immediate Next Steps

1. Lock the confirmed PostgreSQL + MySQL, manual-write/AI-read-only and Apache-2.0 requirements in issue templates and acceptance tests.
2. Create a small design system and clickable navigation prototype: connection sidebar, schema tree, data table, SQL editor and AI chat tab.
3. Bootstrap the Electron app, secure local storage and PostgreSQL/MySQL adapters.
4. Implement database browsing **before** AI orchestration, then separate manual SQL and AI-only read-only execution paths.

---

**Product north star:** *A beautiful database client you would use even without AI—and a conversational assistant you trust when you do use it.*
