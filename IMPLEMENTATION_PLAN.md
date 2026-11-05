# AI DB Studio — MVP Implementation Plan

**Version:** 1.0  
**Date:** 2026-11-05  
**Product specification:** [`PRD.md`](PRD.md)  
**License:** Apache-2.0  
**Platforms:** Windows, macOS, Linux (all in initial public release)

## 1. What we are delivering

A **DBeaver-like, beautiful, local-first desktop database client** with two first-class workspaces:

1. **Database Client:** connect to PostgreSQL/MySQL; explore schemas, tables and data; use a syntax-highlighted SQL editor; execute manual `SELECT` and explicitly confirmed manual writes (`INSERT`, `UPDATE`, `DELETE`, and supported DDL); inspect results and history. It works fully without AI.
2. **AI Assistant:** configure OpenAI or Ollama in Settings; chat about the **selected** database; generate dialect-specific SQL grounded in discovered schema; automatically execute only independently validated read-only SQL; show query, result grid, local deterministic summary and charts. The AI **cannot** call the manual-write path.

### Confirmed decisions

| Topic | Decision |
|---|---|
| First-release databases | PostgreSQL **and** MySQL, feature parity |
| Desktop framework | JavaFX + AtlantaFX; native Java controls and styling |
| Service runtime | Spring Boot in-process, `WebApplicationType.NONE`, same JVM |
| LLMs | OpenAI **and** Ollama available in MVP |
| Cloud privacy | Send user questions and approved relevant schema only; never row values or query results to OpenAI |
| AI SQL | Automatically run only dialect-vetted **read-only** queries |
| Manual SQL | Human may run writes after explicit confirmation; database privileges still apply |
| Distribution | Free/open-source, Apache-2.0; Windows/macOS/Linux installers |

## 2. Architectural blueprint

```text
JavaFX UI (AtlantaFX)
  WorkbenchShell
    ├── ConnectionExplorer + ObjectInspector + DataGrid
    ├── SqlWorkspace + ConfirmationDialog + QueryHistory
    ├── AiChatWorkspace + SQL / Results / Chart Cards
    └── Settings (AI provider, appearance, security)
        │ JavaFX ViewModel / CompletableFuture / background executor
        ▼
Spring ApplicationContext (non-web, single JVM)
    ├── ConnectionProfileService ── OS credential vault + SQLite
    ├── JdbcConnectionManager ──── PostgreSQL/MySQL adapters
    ├── SchemaExplorerService ──── metadata, indexes, FK, refresh
    ├── ManualSqlService ──────── classification + one-time confirmation
    │      └── ManualSqlExecutor (user-directed read/write permissions)
    ├── AiAssistantService ────── provider selection, streaming, context
    │      ├── RelevantSchemaRetriever / PrivacyGateway
    │      ├── Spring AI ChatClient (OpenAI/Ollama)
    │      └── AiReadOnlyQueryService
    │             ├── dialect-aware AST + policy
    │             └── AiReadOnlyExecutor (restricted DB role)
    └── QueryHistory / LocalCharts / Audit / Settings
```

**Crucial separation:** `ManualSqlExecutor` and `AiReadOnlyExecutor` are distinct interfaces, classes and authorization contexts. Do **not** expose manual executor methods as AI tools; do not rely solely on prompts, `Connection.setReadOnly(true)` or regex parsing for safety. For users who have only write-capable credentials, require a separately configured/select-only AI credential or verifiable read-only role/session enforcement; otherwise disable automatic AI SQL execution.

### Proposed repository structure

```text
ai-db-studio/
├── pom.xml                          # Maven reactor
├── LICENSE                          # Apache-2.0
├── README.md
├── SECURITY.md
├── CONTRIBUTING.md
├── .github/workflows/
├── docs/PRD.md
├── docs/IMPLEMENTATION_PLAN.md
├── desktop-app/                      # JavaFX bootstrap, views, CSS, controllers, ViewModels
├── application-core/                 # Services, use cases, domain DTOs
├── database-adapters/               # PostgreSQL/MySQL JDBC/dialects/metadata
├── query-engine/                    # AI SQL validator, manual SQL services, executors
├── ai-integration/                  # Spring AI providers + privacy gateway
├── local-persistence/               # SQLite migrations + credentials abstraction
├── test-fixtures/                   # Postgres/MySQL Testcontainers datasets
└── packaging/                       # jpackage scripts / runtime and OS distribution
```

Use **Java 21** only with a compatible pinned JavaFX + AtlantaFX combination; verify library support and build a version matrix before implementation. Runtime packaging must include all required JavaFX/JDBC/Spring modules. Avoid introducing JPA for external customer databases; JDBC metadata and controlled executors are more appropriate.

## 3. Design system and desktop UX

**Workspace organization:** left collapsible connection/schema tree; center tabs for data grid, structure and SQL; right or full-width AI chat panel; persistent bottom status bar. Database identity and environment badge must stay visible during manual writes and AI queries. The assistant is accessible from the same database workspace instead of a separate disconnected chatbot.

- Default dark theme plus light theme; central token definitions: background, surface, border, text, accent, warning, error, success; persist preference.
- AtlantaFX for core controls, Ikonli icons, RichTextFX evaluated for SQL editor; custom TableView cells for NULL, JSON, timestamps and long text.
- Components: `ConnectionTree`, `ConnectionDialog`, `SchemaInspector`, `DataGrid`, `SqlEditorTab`, `WriteConfirmationDialog`, `QueryResultPanel`, `AiChatMessage`, `SqlPreview`, `ChartCard`, `ProviderSettings`.
- Keyboard: focus search, switch connection, new SQL tab, run selected SQL, cancel execution, focus AI input, theme toggle through Settings; document platform shortcut differences.
- Threading: JDBC and AI operations never on JavaFX Application Thread. Cancellable tasks marshal UI updates via `Platform.runLater` or a controlled ViewModel dispatcher.
- Visual QA: both themes at 100% and high DPI; screen readers/keyboard focus where available; narrow and wide window layouts.

## 4. Detailed backlog (recommended issue order)

Each item below should be a tracked issue with a unit/integration test and a demo artifact. **P0 is required for MVP.** Dependencies matter more than estimated calendar dates.

### Epic A — Foundation and desktop UX

| ID | Priority | Work | Definition of done |
|---|---|---|---|
| APP-01 | P0 | Maven reactor, JavaFX launcher, non-web Spring context lifecycle | IDE + Maven launch succeeds; clean shutdown; no HTTP listener |
| APP-02 | P0 | Dependency/version spike for Java 21, JavaFX, AtlantaFX, Spring AI | Reproducible dependency lock/pin; licensing and compatibility reviewed |
| APP-03 | P0 | Theme tokens, dark/light AtlantaFX theme service | Every screen/dialog switches; setting survives restart |
| APP-04 | P0 | Workbench shell: tree, tabs, split panes, toolbars, status bar | Resizable, keyboard navigable, usable in both themes |
| APP-05 | P0 | SQLite persistence and migration strategy | Versioned DB migration; corruption and upgrade handling tested |
| APP-06 | P0 | UI async task infrastructure and error notifications | Long jobs never freeze UI; cancellation and errors visible |

### Epic B — Connections and secure profiles

| ID | Priority | Work | Definition of done |
|---|---|---|---|
| CON-01 | P0 | Connection profile CRUD and settings model | Save/list/edit/delete multiple profiles, no plaintext passwords |
| CON-02 | P0 | macOS Keychain / Windows Credential Manager / Linux Secret Service integration | Secrets never stored in SQLite, logs, crash reports; supported Linux behavior documented |
| CON-03 | P0 | PostgreSQL adapter: TLS, auth, timeout, test connection | Success, wrong password, DNS, timeout, invalid TLS pass integration tests |
| CON-04 | P0 | MySQL adapter: TLS, auth, timeout, test connection | Equivalent PostgreSQL acceptance coverage |
| CON-05 | P0 | Switch active connection + session lifecycle | UI tabs and chat attach to correct connection; no context leakage |
| CON-06 | P0 | AI-specific read-only credential config per DB | Separate credential reference; unsafe setup blocks AI auto-execution |

### Epic C — Visual database client (must work without AI)

| ID | Priority | Work | Definition of done |
|---|---|---|---|
| DBUI-01 | P0 | Lazy explorer tree and refresh | PostgreSQL/MySQL catalogs, schemas, tables/views load on demand |
| DBUI-02 | P0 | Object inspector | Columns, types, nullability, keys, indexes, FKs match fixtures |
| DBUI-03 | P0 | Paginated data grid | Server-side paging/sort/filter, copy, NULL/binary-safe rendering |
| DBUI-04 | P0 | Rich SQL editor tabs | Syntax highlighting, connection binding, run selection, search, persistence |
| DBUI-05 | P0 | Read result panels | Rows affected, metadata, execution time, safe CSV export, cancellation |
| DBUI-06 | P0 | Local query history | Reopen query, redact or exclude secrets/results; user can clear history |
| DBUI-07 | P0 | PostgreSQL/MySQL behavior parity suite | Same user workflows pass with dialect-appropriate differences |

### Epic D — Manual SQL writes (human only)

| ID | Priority | Work | Definition of done |
|---|---|---|---|
| MAN-01 | P0 | Dialect-specific statement classification | Detect SELECT, DML, DDL, transaction commands, multi-statements, unknowns |
| MAN-02 | P0 | Explicit confirmation dialog | Displays full SQL/digest, database/host, operation, production warning, affected-object context when available |
| MAN-03 | P0 | One-time server-side/in-process approval token | SQL modification, connection switch, expiry or token reuse prevents write |
| MAN-04 | P0 | Manual query executor with timeouts, cancellation, row counts | SELECT and confirmed DML work; DB grants respected; no silent retry |
| MAN-05 | P0 | Supported DDL policy and error UX | Confirm supported DDL or explicitly block unimplemented classes; no implicit destructive schema action |
| MAN-06 | P0 | Audit and regression tests | Write attempts from AI are impossible; unconfirmed write never reaches JDBC |

**MVP transaction policy:** Manual statements execute with a clear commit behavior (initially autocommit after confirmation); no claims of rollback after commit. Multi-statement mutating scripts are blocked until a safe transaction + preview UX is designed. Advanced transaction management can be P1, but behavior must always be explicit in UI.

### Epic E — AI setup, safety, and agent

| ID | Priority | Work | Definition of done |
|---|---|---|---|
| MODEL-01 | P0 | OpenAI settings, API key in vault, model selection and connection check | Connect/test/errors work; no key in DB or logs |
| MODEL-02 | P0 | Ollama settings, model list/test, local endpoint indicator | Local model requests work; remote URL warns about disclosure |
| MODEL-03 | P0 | Strict outbound prompt privacy gateway | Model requests contain only user question, approved relevant schema and safe prior context; test intercepts all requests |
| AI-01 | P0 | Schema catalog and relevant table retrieval | Metadata matches active database/allowed scope; no row sampling |
| AI-02 | P0 | Structured SQL generation for both dialects | No invented identifiers in golden evaluation questions |
| AI-03 | P0 | SQL AST validation and policy engine | Reject DML/DDL, risky functions, mutating CTE, locks, unexpected metadata/system objects, multiple statements |
| AI-04 | P0 | Isolated read-only executor | Verify privilege boundary, timeout, cost/row cap, cancellation; fail closed |
| AI-05 | P0 | Agent orchestration and guarded auto-execution | Model proposes SQL; app validates; only approved SELECT is executed; no manual write tool exposure |
| AI-06 | P0 | Conversational UI + streaming/cancel/history | Follow-ups remain connection scoped; errors are actionable |
| AI-07 | P0 | SQL preview, result grid and query provenance | Generated SQL and DB identity shown; row truncation visible |
| AI-08 | P0 | Local deterministic summaries and charts | No result rows sent to OpenAI; numerical claims trace to returned rows |
| AI-09 | P0 | Privacy/attack tests and evaluation suite | No cloud result leakage; prompt injections, wrong joins, unsafe SQL rejected |

**AI read-only policies:** No write functions or tools, default query limits, bounded execution, schema allowlist, no arbitrary driver options, no cross-connection context. Prefer select-only database grants and DB-native read-only transactions on PostgreSQL; for MySQL verify equivalent read-only controls and credentials. Treat the LLM as an untrusted SQL proposer, not as the executor.

### Epic F — Packaging and open-source release

| ID | Priority | Work | Definition of done |
|---|---|---|---|
| REL-01 | P0 | Windows packaging CI | Installer opens on clean Windows VM, correct runtime and driver support |
| REL-02 | P0 | macOS packaging CI | Apple Silicon/Intel support policy documented; notarization/signing assessed; clean install works |
| REL-03 | P0 | Linux packaging CI | Target distro/runtime/Secret Service fallback documented and tested |
| REL-04 | P0 | Apache-2.0 repo compliance | `LICENSE`, NOTICE where needed, third-party notices, dependency license audit |
| REL-05 | P0 | User and contributor documentation | Screenshots, quick start, permissions, privacy, security disclosures, troubleshooting |
| REL-06 | P0 | Security and release gates | SBOM, dependency scans, regression and smoke reports, artifact checksums |

## 5. Recommended delivery milestones

| Milestone | Scope | Demo gate | Dependencies |
|---|---|---|---|
| M0 — Feasibility | APP-01/02; Java 21/AtlantaFX/Spring AI compatibility and jpackage smoke spike | Launch native JavaFX + Spring context on all three OS runners | None |
| M1 — Beautiful shell | APP-03 to APP-06 | Dark/light workbench, responsive panes/tabs and persistent preferences | M0 |
| M2 — Connections | CON-01 to CON-06 | Connect PostgreSQL and MySQL with stored secret references | M1 |
| M3 — Real database client | DBUI-01 to DBUI-07 | Browse both DBs, inspect and filter data; run SELECT, export CSV | M2 |
| M4 — Manual write safety | MAN-01 to MAN-06 | Human explicitly approves UPDATE; cancellation prevents unapproved write; AI still no write path | M3 |
| M5 — Providers & privacy | MODEL-01 to MODEL-03; AI-01 | Configure OpenAI/Ollama; schema/question only crosses cloud boundary | M2/M3 |
| M6 — Conversational analytics | AI-02 to AI-09 | Both DBs: ask, validate, auto-execute SELECT, show charts and follow-ups | M4/M5 |
| M7 — Public release | REL-01 to REL-06 and full test suite | Downloadable installers on three OSes and Apache-2.0 source repo | All |

Parallelism: UI design and connection adapters can proceed alongside persistence work. Packaging spike must begin at M0; delaying it until M7 risks cross-platform surprises. MySQL is not a post-MVP stretch goal.

## 6. Data model — local SQLite (proposed)

- `connection_profiles(id, label, db_type, host, port, database_name, username, tls_json, credential_ref, ai_readonly_credential_ref, last_used_at)`
- `schema_cache(id, connection_id, object_identifier, kind, metadata_json, captured_at)` (no row values)
- `ai_provider_profiles(id, provider, display_name, model, endpoint, key_ref, config_json)`
- `conversations(id, connection_id, provider_id, title, created_at, updated_at)`
- `messages(id, conversation_id, role, text, sql_context_json, created_at)` (no raw result rows by default)
- `sql_tabs(id, connection_id, title, sql_text, last_opened_at)`
- `query_executions(id, connection_id, origin, statement_kind, sql_text, status, affected_rows, duration_ms, error_code, created_at)`
- `preferences(key, value)`
- `query_policies(connection_id, allowed_ai_schemas_json, row_limit, timeout_ms, writes_enabled, require_extra_prod_warning)`

Store passwords/API keys in the OS credential vault, keyed by opaque secret references. A write-approval token is **ephemeral in memory**, short-lived and single-use. Retention, deletion and optional history encryption need explicit UI choices before public release.

## 7. In-process service contracts (illustrative)

```java
interface ConnectionService {
  ConnectionProfile create(ConnectionDraft draft);
  ConnectionTestResult test(UUID id);
  List<ConnectionProfile> list();
  void disconnect(UUID id);
}

interface SchemaExplorerService {
  List<DbSchema> schemas(UUID connectionId);
  List<DbObject> objects(UUID connectionId, String schemaName);
  TableDetails inspect(UUID connectionId, DbObjectRef object);
  RowPage browse(UUID connectionId, BrowseRequest request);
}

interface ManualSqlService {
  StatementInspection inspect(UUID connectionId, String sql);
  QueryOutcome executeSelect(UUID connectionId, String sql);
  ConfirmationRequest prepareWrite(UUID connectionId, String sql);
  QueryOutcome executeConfirmedWrite(UUID connectionId, String sql, OneTimeToken token);
}

interface AiReadOnlyQueryService {
  QueryOutcome validateAndExecute(UUID connectionId, String generatedSql);
}

interface AiAssistantService {
  java.util.concurrent.Flow.Publisher<ChatEvent> ask(UUID conversationId, String question);
}
```

Treat these as domain contracts, not fixed framework APIs. Spring AI's reactive types can be adapted to JavaFX ViewModel events; avoid blocking JavaFX thread. Query request/response types should include connection ID, dialect, column metadata, bounded result rows, duration, truncation status, cancellation and rejected reason.

## 8. Validation and test plan

**Functional integration:** Testcontainers PostgreSQL and MySQL with equivalent fixtures (users, orders, products, money, timestamps, nulls, JSON, FKs, reserved-name columns). Validate object discovery, quoting, pagination, manual CRUD statements, SQL errors, read-only AI selection, dialect differences, and cancellation.

**SQL security:** Adversarial SQL across both dialects (multi-statements, mutating CTEs, SELECT with side effects, stored routines, lock hints, system catalog access, unsafe functions, malformed SQL, deep recursion, huge joins). Confirm rejection **before** any JDBC statement runs. Test safe SELECT acceptance to avoid unusably strict guardrails.

**Manual-write confirmation:** Zero writes from unconfirmed requests; confirmation invalidates when SQL/connection changes; token reuse rejected; dangerous objects require warning; transaction behavior and permission denied are accurately represented.

**AI correctness:** Fixed golden questions with known answers/SQL semantics for both databases; test schema relevance, date boundaries, join correctness, hallucinated table names, follow-ups, unanswerable questions, streaming cancellation, model unavailable states. Establish measurable pass thresholds after a baseline dataset.

**Privacy:** Use a recording HTTP client/test transport to assert no row values, DB secrets, connection host or full schema dumps reach OpenAI; ensure exceptions/debug logs don't bypass the gateway. Distinguish user's voluntarily entered question text from query results. Confirm Ollama remote URL warnings.

**UI and OS:** Smoke-test native launch and dialogs on three platforms; theme toggles, high DPI, keyboard, large results, slow connection, fast switching, window shutdown and credential-vault availability; test installers on clean VMs.

### MVP release acceptance criteria

- [ ] Clean installs start without separately installed Java on Windows, macOS and Linux.
- [ ] Both PostgreSQL and MySQL support connection lifecycle, schema browser, data grid and SQL editor.
- [ ] Manual `UPDATE`/`DELETE` requires fresh explicit approval; AI has no means of modifying any DB state.
- [ ] Both OpenAI and Ollama can be configured and used to ask grounded questions.
- [ ] Safe AI SQL runs automatically with traceable SQL/results and no result-row transmission to OpenAI.
- [ ] AI rejects destructive queries even when maliciously instructed by chat or metadata.
- [ ] User can work entirely without configuring any AI provider.
- [ ] Two themes, error/cancel states, history controls and accessibility checks are complete.
- [ ] Apache-2.0 source, contribution guide, third-party notices and CI artifacts are published.

## 9. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Java 21 / AtlantaFX version mismatch | Test pinned compatible releases in M0; don't blindly pick latest major |
| JavaFX SQL editor feels inferior to IDE clients | Prototype RichTextFX, tabs, search and syntax themes early; user-test core workflow |
| AI read-only guarantees weak with write-capable credentials | Separate AI credentials/role, dialect-aware validator and DB-native read-only enforcement; fail closed |
| Cloud AI cannot explain arbitrary row values | Local deterministic summaries/charts; explain limitations; Ollama can provide local inference when configured |
| MySQL vs PostgreSQL dialect differences | Explicit adapters and both-engine acceptance suite before AI integration |
| Linux vault availability | Defined supported desktop environments, clear secure fallback/no-save flow; never plaintext silently |
| macOS signing/notarization, Windows warnings | Early packaging spike and clearly documented signing strategy |
| Long-running queries freeze app or exhaust RAM | Background tasks, DB timeouts, bounded paging, cancellation and memory caps |
| Open-source third-party licensing conflicts | Dependency and asset license audits, NOTICE and SBOM before first release |

## 10. Decisions to confirm during design (not blockers for starting)

1. Manual SQL DDL scope: permit DDL with stronger per-action warning in MVP (proposed), or restrict manual MVP writes to DML only.
2. Production connection protection: extra typed confirmation for production-labeled profiles (recommended).
3. SQL transactions: autocommit as MVP default, explicit transaction mode in subsequent version (recommended).
4. Connection privacy: allowlist schemas for OpenAI by default and clear notice of schema/typed-question exposure (recommended).
5. Advanced connectivity: SSH tunnel and cloud IAM auth deferred unless user research shows must-have adoption blockers.
6. Branding and release channels: package naming, icons, updater, signing identities and supported OS versions.

## 11. First engineering increment

Start with **M0 + M1**: a Maven multi-module project, Spring Boot non-web context, a JavaFX workbench with AtlantaFX dark/light themes, connection/sidebar placeholders and tab persistence; add simple automated startup and teardown tests. Immediately run a packaging spike on Windows/macOS/Linux. Then implement real PostgreSQL/MySQL connection management and schema browsing—**before** building the AI chatbot.

**Product rule:** The visual database client must be independently useful; the AI conversation must be an integrated second workflow, never a path to unrestricted database writes.
