# Workbench verification — 2026-11-05

## Evidence

`mvn -Ddesktop.tests=true -Ddatabase.integration=true -Dtest.pg.port=<fixture-port> -Dtest.mysql.port=<fixture-port> verify`

Local run: Java 21, macOS, PostgreSQL 17 and MySQL 8.4 disposable Docker fixtures. **34 tests, zero failures, zero errors, zero skipped.** Existing CI runs the database suite under Linux/Xvfb; this audit does not establish a new Windows/Linux native-app result.

## Coverage

| Workflow | Evidence |
|---|---|
| Connection test and save gating | Desktop tests cover success, authentication failure, edits invalidating approval and stale asynchronous completions; both JDBC engines exercise connection/metadata access |
| Table browsing | Both engines: first/middle/last/empty pages, 100-row boundaries, default key ordering, descending sorting, column filtering, unknown identifiers and negative-page rejection |
| Editing data | Both engines: insert, update, delete, NULL/default values, typed number rejection, duplicate-key failure, stale row rollback, case-only concurrent edits, composite keys, no-key/truncated-row refusal |
| GUI data operations | Live PostgreSQL: column reordering followed by confirmed editing, confirmed insertion/deletion, filtering/clearing, reload, initial/end-page button state |
| SQL | Parser rejection tests, real execution and syntax failure/recovery, 500-row cap, missing/reused/expired/cross-profile/reconnected approvals |
| Cancellation | Real running statement cancellation on both engines; disconnect during a delayed UPDATE leaves original data intact; GUI confirmation dismissal and cancellation during preparation |
| Clipboard | Reordered-column copy verified against the actual system clipboard |
| CSV | File replacement, CSV quoting, embedded newline/comma/quote, NULL versus empty string, formula-prefix escaping, temporary-file cleanup |
| History | Opt-in remains the UI default; service persistence across reopen, 200-entry cap, clear and profile-deletion cascade tested |
| Workspace | Existing Spring/FXML navigation, draft save/reopen, theme and layout checks; dialogs tested in light/dark modes |

GUI integration scenarios are grouped into the desktop integration test, rather than counted as individual test methods.

## Fixes from this audit

- Preserve original column identity after visual reordering for editing and copying.
- Disable misleading client-side lexical sorting; use database sorting controls.
- Disable unavailable export/paging/write actions and expose SQL busy state.
- Clear stale SQL results before a new attempt; cancel superseded table reads.
- Reject stale preparation completions after cancellation and block closing a running-query tab.
- Reopen changed connection profiles with their updated details.
- Check connection generation before execution and before transactional commit.
- Reject fractional/out-of-range integer input before JDBC conversion.
- Use byte-exact MySQL text guards so case-insensitive collations do not hide concurrent edits.
- Preserve the original execution error if rollback also fails.
- Write CSV through a temporary file and escape formula-like values, including multiline values.

## Remaining release checks and limits

This is a tested hardening increment, not a blanket production certification. Native file-picker interaction, every accessibility/screen-reader combination, long-duration soak testing, crash recovery, signed installers and clean-machine Windows/Linux acceptance are not established by this run. History's storage operations are covered; its entire dialog interaction is not automated. Table-grid GUI write tests run on PostgreSQL; MySQL write coverage runs at the service/JDBC layer.

DDL can commit implicitly, cancellation is best-effort, and MySQL transactional rollback requires transactional storage engines such as InnoDB. A network loss during commit can leave the commit outcome uncertain; users should inspect data before retrying a write. Paging without a primary key is not stable, and offset pagination can shift during concurrent inserts/deletes. Results remain intentionally bounded and unsupported/complex grid values require confirmed SQL.
