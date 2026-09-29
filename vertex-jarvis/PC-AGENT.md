# Vertex JARVIS PC Agent

A local Windows agent can later give JARVIS controlled access to the office PC without making the cloud model an unrestricted administrator.

## Architecture

`JARVIS Cloud → authenticated task queue → PC Agent → allowlisted local capability → signed result → audit log`

The PC agent makes outbound connections only. Do not expose an unauthenticated local HTTP server to the internet.

## Initial capability allowlist

Safe starting set:
- system health and disk-space status
- list/read/write files only inside configured Vertex work folders
- create PDF/report exports
- watch designated import folders for statements and reports
- start explicitly allowlisted Vertex programs/scripts
- collect application logs
- print approved documents
- send status results back to JARVIS

Not enabled by default:
- arbitrary shell / PowerShell execution
- password-manager access
- browser cookie extraction
- bank application control
- EDS/private signing key access
- Windows credential store export
- disabling antivirus/firewall
- deleting arbitrary folders
- installing arbitrary internet-downloaded executables

## Why

The goal is broad useful autonomy with a small blast radius. If JARVIS needs a new local ability, add one named capability, define its inputs, output, approval tier and rollback behavior, then test it before enabling it.

## Owner control

Both owners should have:
- local stop command,
- cloud kill switch,
- visible action history,
- ability to revoke the PC agent certificate/token,
- separate identities rather than a shared permanent password.
