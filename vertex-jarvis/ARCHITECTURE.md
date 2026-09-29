# Architecture

## Control plane

FIRDAUS + DARYA
→ JARVIS Strategic Cortex
→ policy / approval engine
→ specialist agents
→ tools / connectors
→ audit + memory

## Specialist agents

1. Finance / Treasury
2. Accounting
3. Legal / Compliance
4. Revenue Management
5. Guest Experience / Concierge
6. Owner Relations
7. Sales
8. Operations
9. Cleaning / Laundry
10. Mobility / Rent Car
11. Travel / DMC
12. Maintenance / Engineering
13. HR / Workforce
14. Technology / Security
15. Strategy / Investment

## Memory layers

- Founder decision memory
- Company knowledge
- Financial ledger mirror
- Property memory
- Guest memory
- Owner memory
- Employee / role memory
- Legal source index
- Decision / outcome memory
- Audit trail

## Event model

Future connectors publish normalized events such as:

- booking.created
- booking.cancelled
- guest.message
- payment.received
- owner.payment_due
- cleaning.completed
- maintenance.ticket
- employee.absent
- bank.transaction
- rate.changed

JARVIS evaluates events and chooses one of:
- observe
- record
- recommend
- create_task
- execute_low_risk
- request_approval
- emergency_stop

## Production evolution

### Phase 0 — foundation
Authorization, model access, web research, Durable Object audit.

### Phase 1 — read-only intelligence
Connect PMS/CRM, bookings, finance exports, contracts, operational data.

### Phase 2 — task orchestration
Create tasks, drafts, alerts, schedules and suggested price changes.

### Phase 3 — bounded execution
Allow reversible low-risk writes under policy limits.

### Phase 4 — autonomous operations
Continuous event-driven operation with owner approvals for red-zone actions.

### Phase 5 — optimization
Outcome learning, evaluation suites, forecasting and multi-agent critique.

The system learns operational preferences through explicit outcomes and approved decisions. It must not silently rewrite its own security policy or grant itself new permissions.
