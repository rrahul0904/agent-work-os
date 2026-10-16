# Creator Hub Submission Drafts

These drafts are for the three public MIT starter templates. Submission is gated on successful n8n 2.43.5 import certification and manual marketplace review/approval. Nothing in this file claims an approved or published listing.

## Template 1 — Production-Safe Webhook Intake + Idempotency + DLQ Starter

**Short description**  
Start an n8n webhook workflow with explicit payload validation, a deterministic starter idempotency key, and a dead-letter response path before you connect real side effects.

**Use cases**
- safer webhook intake for business automations;
- duplicate-aware workflow design;
- DLQ/error-path teaching starter;
- base pattern before connecting CRM, billing, messaging or fulfillment actions.

**Required credentials**: none.  
**Core nodes only**: Webhook, Code, If, Respond to Webhook.  
**Commercial upsell boundary**: production resilience engineering / Sentinel, not hidden inside the free template.

**Sample request**
```json
{
  "idempotencyKey": "order-123",
  "payload": {
    "orderId": 123,
    "event": "created"
  }
}
```

**Tags**: webhook, reliability, idempotency, error-handling, DLQ, starter.

---

## Template 2 — Lead Qualification + Human Approval Starter

**Short description**  
Deterministically score lead records using budget, urgency and fit signals, then return either a human-review queue or a not-qualified result—with automated outreach disabled by design.

**Use cases**
- lead triage before CRM routing;
- human-in-the-loop sales automation;
- deterministic alternative to opaque AI scoring;
- starter for approval-based proposal/outreach flows.

**Required credentials**: none.  
**Core nodes only**: Webhook, Code, If, Respond to Webhook.  
**Safety boundary**: no automated outreach in the free template.

**Sample request**
```json
{
  "lead": {
    "id": "lead-1001",
    "budgetScore": 4,
    "urgencyScore": 3,
    "fitScore": 5
  },
  "threshold": 18
}
```

**Tags**: sales, lead-scoring, human-approval, CRM, qualification, starter.

---

## Template 3 — Meeting Notes + Task Extraction Starter

**Short description**  
Turn a provided meeting transcript into a bounded summary plus explicit tasks from `TODO:`, `ACTION:` and `TASK:` lines—without requiring an AI provider.

**Use cases**
- deterministic meeting-note intake;
- action-item handoff starter;
- pre-processing before Jira/Asana/CRM integrations;
- low-cost fallback when an LLM is unnecessary.

**Required credentials**: none.  
**Core nodes only**: Webhook, Code, Respond to Webhook.

**Sample request**
```json
{
  "meetingId": "weekly-ops-42",
  "transcript": "Reviewed launch readiness.\nACTION: Rahul to validate the deployment checklist.\nTODO: Team to confirm support coverage."
}
```

**Tags**: meetings, tasks, productivity, notes, human-review, starter.

---

## Submission checklist

- [ ] n8n 2.43.5 import CI passes for all three JSON files.
- [ ] Open each imported workflow in n8n editor and inspect node wiring/expressions.
- [ ] Capture a clean screenshot for each template.
- [ ] Execute each sample request and capture output.
- [ ] Confirm MIT license and attribution are included.
- [ ] Submit through the current n8n template/Creator Hub process.
- [ ] Record listing URL/status in the commercialization registry only after approval.
