# Security

AI DB Studio is pre-release software. Live PostgreSQL/MySQL connection tests and metadata browsing are implemented. User SQL execution and AI execution remain disabled. SQL editor text is a local draft; Run is disabled.

## Reporting

Do not post credentials, database contents, or exploit details in public issues. Once this repository is hosted, use its private vulnerability reporting facility if enabled. No security contact or response SLA has been established yet; maintainers must configure a private reporting channel before public release.

## Current boundaries

- Profiles, settings and SQL drafts are stored locally in SQLite. Draft SQL may contain sensitive literals. Storage is not encrypted.
- Database passwords are accepted for explicit connection operations and retained in memory for the app session only; API tokens are not collected. OS-vault integration must precede credential persistence; no silent plaintext fallback is permitted.
- Explicit connection tests and metadata browsing make database network calls. No AI provider calls or telemetry are sent.
- Local SQL storage uses prepared statements; user draft text is never executed against the workspace database.
- Native app images are unsigned development artifacts, not production installers.

## Required execution boundaries

The implementation plan supersedes the older read-only-manual assumption: a future manual executor may accept writes only with fresh, expiring, single-use approval bound to the exact SQL and connection. AI execution must use a separate read-only interface, credential context, dialect validator and executor. Manual write services must never be exposed as model tools. These are release requirements, not claims about completed functionality.

Cloud prompts may include only approved schema and user questions/context; never returned rows or credentials. Future test transports must verify this boundary independently of model instructions.
