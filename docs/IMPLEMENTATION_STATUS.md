# Implementation status

AI DB Studio is pre-release software. See the [README](../README.md) for what it does, and its known limitations section for what remains.

## Verified

- PostgreSQL 17 and MySQL 8.4, on macOS: connections, schema browsing, table data, manual SQL, cancellation and query review.
- The AI assistant, using LangChain's OpenAI and Ollama clients against local stand-in servers.

## Not yet verified

- A real AI model.
- Windows and Linux.
- Current installers: rebuild them, because the ones built earlier predate the current interface.
- Other database versions, MariaDB and cloud-hosted databases.

## Before a stable release

- Verify TLS certificates.
- Sign the installers.
- Complete a full third-party license review.
