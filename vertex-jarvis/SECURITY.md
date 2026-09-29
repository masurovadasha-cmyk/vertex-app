# Vertex JARVIS security model

## Owner authority

Strategic command authority is limited to the two configured principals. Runtime access requires a secret owner token plus an asserted principal ID.

Production should replace the bootstrap shared token with passkeys / identity-provider authentication and per-principal credentials.

## Three autonomy zones

### GREEN
May execute automatically once a connector is explicitly enabled:
- internal analysis
- CRM notes
- routine guest responses
- low-risk task assignment
- housekeeping routing
- reminders
- reversible internal workflow changes
- price changes inside configured bands

### YELLOW
May prepare and, only when a numeric policy explicitly permits it, execute within limits:
- discounts
- refunds / guest compensation
- minor purchases
- rate changes outside normal band
- non-critical supplier orders

### RED
Always requires authorized human approval:
- bank transfers beyond configured threshold
- loans / guarantees
- equity or ownership changes
- binding contracts beyond authority
- hiring / firing or disciplinary actions with legal effect
- tax filings or declarations requiring signature
- litigation admissions / settlements
- EDS / digital signature use
- major CAPEX
- release of sensitive personal data

## Never store in model memory or Git
- passwords
- bank login credentials
- card PIN/CVV
- private EDS/signing keys
- recovery codes
- raw authentication cookies
- unredacted secrets

Use Cloudflare secrets or an external secrets manager.

## Fail-safe rules

If JARVIS cannot verify identity, legal source freshness, data provenance, or required approval, it must switch to recommendation-only mode.

If contradictory commands are received from the two principals for the same material action, execution is paused and a conflict report is generated.

## Audit

Every decision record should include:
- timestamp
- principal
- command
- risk tier
- sources used
- model
- recommendation
- approvals
- action status
- result / outcome
