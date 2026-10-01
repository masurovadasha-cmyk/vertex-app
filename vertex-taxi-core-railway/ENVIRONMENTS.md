# Vertex Taxi Environments

## Current Railway environment

Railway provider environment label: `production`.

**Vertex meaning: STAGING / PRESENTATION ONLY.**

The provider label predates the current release process and MUST NOT be interpreted as Vertex Taxi production approval.

Current environment contains:
- demo/presentation users and drivers;
- demo payment records;
- staging API token;
- public rate-limited demo gateway;
- presentation frontend;
- Postgres/Redis used for RC testing.

It is not approved for:
- real passenger accounts;
- real driver onboarding;
- real payment credentials;
- production Google OAuth;
- production FCM credentials;
- production financial ledger.

A true production environment must be created separately after explicit approval and must use separate secrets, databases, Redis, domains, signing credentials and monitoring.
