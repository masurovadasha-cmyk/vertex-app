# Views — first VISION direction

The VISION launcher presents Views Apart first, with its own red icon and an
independent workspace at `/directions/views` for service requests and statuses.
Its manifest points to the existing Vertex Red application, verified as version
`1.14-demo`, revision `unified-journey1`. The source remains in `vertex/dist`;
the full catalog, Host Studio, Journey and Taxi stay together in that application.

The workspace links to Red in a new tab. This is an entry point, not a copy of Red or
an authentication migration: Red data and sessions remain separate from VISION's
development profiles. The launcher currently runs in the local development shell.
The registry lists launchable applications independently of the organization graph.

The workspace belongs to this modular repository; module validation and Core
contracts are documented in `docs/architecture/ADR-003-module-workspaces.md`.
Deploying the VISION launcher does not authorize replacing the Red production app.
