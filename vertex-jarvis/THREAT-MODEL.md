# Vertex JARVIS threat model

## Assets to protect
- company money and banking authority
- owner identities and authentication
- guest and employee personal data
- contracts and accounting records
- digital signatures / EDS
- pricing and inventory controls
- audit evidence
- source code and API credentials

## Main threats
1. Prompt injection from websites, email, documents or guest messages.
2. Stolen API keys or owner tokens.
3. A compromised third-party connector.
4. Hallucinated legal or financial facts.
5. Incorrect high-impact action due to bad data.
6. One owner account being compromised.
7. Malicious employee input pretending to be an owner instruction.
8. Model or tool outage.
9. Accidental publication of sensitive data in a public repository.
10. Excessive autonomy expanding over time without review.

## Controls
- owner identity is derived from credentials, not text claims
- external content is data, never authority
- official-source restriction for legal research
- two-key approval for selected red-zone actions
- no private signing keys in the AI runtime
- kill switch
- per-connector allowlists and least privilege
- immutable/append-oriented audit history
- source capture for web-researched decisions
- CI secret scanning
- explicit approval matrix
- fail closed when authorization or policy state is uncertain

## Production gate

No connector capable of transferring funds, signing documents, filing taxes, changing ownership, terminating employment or exporting bulk personal data should be activated until its specific approval adapter and rollback/incident procedure are implemented and tested.
