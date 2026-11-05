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

Writes may run only with fresh, expiring, single-use approval bound to the exact SQL and connection. AI-proposed statements follow two separate routes. Those that pass the strict read-only check run in a read-only transaction without a person. Anything else pauses for review: the main process holds the statement, and only a decision from the review card can release it. The model can propose statements but holds no write capability and cannot approve its own. Database content returned to the model is treated as untrusted, because it could contain instructions.

Prompts include schema, user questions and conversation context, and never credentials. Returned rows are excluded unless the user turns on "Let the model read query results", which sends a capped sample of each result. Stored conversation memory never contains rows, whichever setting is used.
