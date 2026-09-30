# ADR 003 — independent workspaces in a modular monolith

Status: accepted for local development; public staging is not deployed.

## Repository boundary

Keep VISION Core, Views Apart and Cleaning in one repository. A direction owns
its manifest, UI assets and integration client under `vision/modules/<id>`.
Core owns identity, permissions, transactional commands, audit and the outbox.
Modules communicate through these contracts; a module manifest cannot grant
itself permissions or access another module's private tables.

Split a module into another repository only when independent release ownership,
access restrictions or a separate team justify versioning and deployment costs.
JARVIS is outside this repository. The existing Red app stays in `vertex/dist`.

## Views Apart

The VISION launcher opens `/directions/views`. This workspace shows the latest
50 RLS-visible service orders for Views and creates synthetic Cleaning requests
using the fixed local Views profile. The full existing Red application is linked
separately; there is no shared authentication or data migration to Red.

The server exposes an explicit asset allowlist, never paths derived from a URL.
It validates manifests before startup: module IDs and navigation order are
unique, permissions/services stay in the module namespace, events are known,
the minimum Core version is supported, and the external app origin is allowed
by operator-owned configuration. Registry data is immutable after validation.
Adding an organization alone does not create a working application.

## Retried commands

The Views client persists the exact pending synthetic command in session storage
before sending it. Ambiguous network/server responses retain that command and
idempotency key through a reload. An explicit retry reuses it, and durable command
acknowledgment clears it. A second concurrent submit is rejected. If persistence
fails, the client does not send. This does not persist authentication credentials.

Session storage is a local demo mechanism; closing the tab or clearing storage
loses its pending key. A future production client needs authenticated per-user
pending-operation storage and a reconciliation screen before exposing real
bookings or payments. Server-side receipts remain the authority on duplication.

## Migration execution

The runner requires an idle dedicated PostgreSQL connection, never a connection
pool, transaction pooler or an enclosing caller transaction. It snapshots all
migration files, obtains a nonblocking session advisory lock, checks the entire
applied history against the local prefix, then applies each pending file and its
checksum receipt in one transaction. A concurrent runner fails with
`migration_busy` before schema changes. A same-object guard covers reentrant
calls on the embedded development connection.

Changed/missing/reordered applied files stop the run before new migrations.
Checksums normalize LF/CRLF. A failed file rolls back its schema changes and
receipt; earlier successful files remain committed so the next run can resume.
The session lock is released in `finally` or by PostgreSQL on disconnection.
Always close a dedicated connection after a transport/unlock error. No old
migration is edited and no unknown existing schema is automatically adopted.

SQL files are trusted, reviewed application code with one top-level BEGIN/COMMIT
pair; the runner is not a sandbox or general SQL parser. Operators must not insert
additional transaction-control statements. Session-lock behavior follows
[PostgreSQL advisory lock semantics](https://www.postgresql.org/docs/17/explicit-locking.html#ADVISORY-LOCKS).
