# Security

AI DB Studio is pre-release software. Read the current boundaries below before using it with sensitive data.

## Reporting

Do not post credentials, database contents, or exploit details in public issues. Use GitHub's private vulnerability reporting for this repository if it is enabled. No security contact or response time has been established yet; maintainers must set up a private reporting channel before a public release.

## Current boundaries

- **Local storage is not encrypted.** `studio-storage.json` holds connection profiles with their passwords in plain text, the AI API key, saved SQL and query history. `ai-memory.json` holds conversation text and the SQL that ran. Moving secrets to the OS keychain is required before a stable release.
- **TLS certificates are not verified.** With TLS on, traffic is encrypted, but the server's identity is not checked.
- **Installers are unsigned** development artifacts, not production releases.
- **No telemetry is sent.** Network calls go only to the databases and the AI endpoint you configure.

## Query execution

Writes run only with fresh, expiring, single-use approval bound to the exact SQL and connection.

AI-proposed statements follow two separate routes. Those that pass the strict read-only check run in a read-only transaction without a person. Anything else pauses for review: the main process holds the statement, and only a decision from the review card can release it. The model can propose statements, but holds no write capability and cannot approve its own. Database content returned to the model is treated as untrusted, because it could contain instructions.

## Data sent to AI endpoints

Prompts include the schema, user questions, conversation context, the SQL the model wrote, database error messages, and the row count and column names of results. They never include credentials. An error message from a database can occasionally contain a value.

Returned rows are excluded unless the user turns on "Let the model read query results", which sends up to 50 rows per result. Stored conversation memory never contains rows, whichever setting is used.
