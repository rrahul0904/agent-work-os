# Free n8n Starter Templates

These independently authored templates are the public acquisition layer for the n8n commercialization program. They are intentionally useful, provider-free starters and do not expose paid product source.

## Templates

### 1. Production-Safe Webhook Intake + Idempotency + DLQ Starter
Path: `webhook-idempotency-dlq-starter/workflow.json`

Demonstrates:
- core webhook intake;
- deterministic starter idempotency key;
- explicit validation route;
- accepted vs DLQ response;
- no external provider credentials.

This is a starter pattern, not a complete durable replay engine. Use Sentinel Production Engineering Pack for production resilience engineering.

### 2. Lead Qualification + Human Approval Starter
Path: `lead-qualification-human-approval/workflow.json`

Demonstrates:
- deterministic weighted lead scoring;
- explicit threshold;
- human-review boundary;
- `automatedOutreach=false` by default;
- no external provider credentials.

### 3. Meeting Notes + Task Extraction Starter
Path: `meeting-notes-task-extraction/workflow.json`

Demonstrates:
- transcript input;
- deterministic extraction of explicit `TODO:`, `ACTION:` and `TASK:` lines;
- bounded summary/task output;
- human-review recommendation;
- no AI/provider credential required.

## Compatibility

Certification target: n8n **2.43.5**. CI must prove that each JSON parses, contains only the expected core nodes, is inactive by default, contains no credential references, and imports through the pinned n8n CLI before submission to a public template catalog.

## License

These three free templates are MIT licensed. See `LICENSE` in this directory.

## Commercial boundary

The free templates may be used and modified under MIT. Paid products, implementation, support and separately authored commercial workflow packs remain governed by their own licenses and release receipts.
