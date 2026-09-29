# Vertex JARVIS security model

## Owner authority

Strategic command authority is limited to FIRDAUS and DARYA.

Production runtime requires **separate credentials per principal**:
- `JARVIS_FIRDAUS_TOKEN`
- `JARVIS_DARYA_TOKEN`

The runtime derives the principal from the presented credential. It does not trust a caller-supplied principal name by itself.

A shared `JARVIS_OWNER_TOKEN` is transitional only and is disabled in production. Replace bearer tokens with passkeys / an identity provider before connecting sensitive third-party systems.

## Three autonomy zones

### GREEN
May execute automatically only after the relevant connector has been explicitly enabled and scoped:
- internal analysis
- CRM notes
- routine guest responses
- low-risk task assignment
- housekeeping routing
- reminders
- reversible internal workflow changes
- price changes inside configured bands

### YELLOW
May prepare and, only when an explicit numeric policy permits it, execute within configured limits:
- discounts
- refunds / guest compensation
- minor purchases
- rate changes outside the normal band
- non-critical supplier orders

### RED
Always requires authorized human approval:
- bank transfers above configured threshold
- loans / guarantees
- equity or ownership changes
- binding material contracts
- hiring / firing or legally significant disciplinary actions
- tax filings or declarations requiring signature
- litigation admissions / settlements
- EDS / digital signature use
- major CAPEX
- release of sensitive personal data

Two-key approval is required for the categories defined in `policies/approvals.json`.

## Foundation-build execution rule

The current JARVIS foundation has **no third-party mutation connectors enabled**. Even when a recommendation is approved, approval means “approved for later/manual execution” until a specific connector is implemented, allowlisted, tested and explicitly enabled.

## Never store in model memory or Git

- passwords
- bank login credentials
- card PIN/CVV
- private EDS/signing keys
- recovery codes
- raw authentication cookies
- unredacted API secrets
- bearer tokens

Use Cloudflare secrets or an external secrets manager.

## Fail-safe rules

If JARVIS cannot verify identity, legal-source freshness, data provenance, or a required approval, it must switch to recommendation-only mode.

If contradictory commands are received from the two principals for the same material action, execution is paused and a conflict report is generated.

If the upstream model/API fails, JARVIS records an error event and returns a controlled failure instead of pretending the task completed.

## Audit

Every decision record should include:
- timestamp
- authenticated principal
- command
- risk tier
- sources used
- model / response id
- recommendation
- approvals
- action status
- result / outcome

Audit records must be append-only from the model's perspective.
