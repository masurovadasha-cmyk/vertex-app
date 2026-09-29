# Vertex JARVIS private memory

Business memory is stored in the Cloudflare Durable Object at runtime. Sensitive company data is **not** committed to this public GitHub repository.

## API

Authenticated owners can add or update a memory record with:

`POST /v1/memory`

Example body:

```json
{
  "key": "company.strategy.tashkent",
  "category": "strategy",
  "value": {
    "target_apartments": 100,
    "priority": "profitable hospitality growth"
  },
  "sensitivity": "internal"
}
```

`GET /v1/memory` returns stored records to an authenticated principal.

The command pipeline receives a bounded private memory snapshot so JARVIS can reason with Vertex context.

## Do not store here

The API rejects obvious secret fields, but policy is broader. Never store:
- passwords or passcodes
- OpenAI / Cloudflare / banking API keys
- private signing or EDS keys
- card CVV/PIN
- recovery codes
- authentication tokens

Raw guest identity documents, health information, payment-card data and other regulated data should use dedicated systems with stricter access controls and data-minimization rules rather than general JARVIS memory.

## Recommended categories

- strategy
- company
- property
- finance_summary
- owner_policy
- operations
- service_standards
- pricing_policy
- legal_policy
- founder_decisions
- product
- expansion

## Learning

The memory layer is not uncontrolled self-training. Outcome learning should only promote reviewed decisions into long-term founder memory after the result is known.
