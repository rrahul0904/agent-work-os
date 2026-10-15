# n8n Commercial Release Train Status

_Last updated: 2026-10-15 (America/New_York)_

This file tracks concrete release branches, candidate SHAs, pull requests and blockers for the n8n commercialization program. A draft PR is not a shipping approval.

| Product | Release branch | Candidate SHA | Draft PR | Current gate |
|---|---|---|---|---|
| AP MatchFlow | `commercialize/release-ready` | `f470b4b6bf312d1492bcc5b5e2af5bf3f985899f` | `n8n-automated-vendor-invoice-to-purchase-order-matching#1` | RIGHTS + PROVIDER_E2E_REQUIRED |
| Hotel Guest WhatsApp Concierge | `commercialize/release-ready` | `f4182993d57b492f81a12028f7706c0a28e940a5` | `n8n-hotel-guest-whatsapp-concierge#1` | RIGHTS + PROVIDER_E2E_REQUIRED |
| Sentinel Reliability Runtime | `commercialize/release-ready` | `49a3fde4df21882fb7cfee26851861da53efbfc4` | `n8n-sentinel-circuit-breaker-or-resilient-webhook-queue-engine#6` | COMPATIBILITY + BEHAVIORAL_EVIDENCE_REQUIRED |
| Lead-to-Proposal AI | `commercialize/release-ready` | `25f51d28d741f197905abc471111cd3f96ecbe7e` | `n8n-lead-scoring-and-automated-whatsapp-proposal-sender#1` | RIGHTS + PROVIDER_E2E + ACTIONS_RUNNER_REQUIRED |
| HVAC Booking Agent | `commercialize/release-ready` | `5831237fd7f05172ffefa9514096890445c2a232` | `n8n-ai-automated-hvac-appointment-booking-n8n-workflow-json#1` | RIGHTS + PROVIDER_E2E + ACTIONS_RUNNER_REQUIRED |
| Inventory Reorder + Vendor Notification | `commercialize/release-ready` | `8cef1b4b046aafbe72b4141f97ef7e9737921861` | `n8n-automated-inventory-reorder-vendor-notification-pipeline#1` | RIGHTS + PROVIDER_E2E + ACTIONS_RUNNER_REQUIRED |
| Meeting Analyzer → CRM | `commercialize/release-ready` | `3a6c4b3e16aae59e92ef1142accfd6ae06970840` | `n8n-ai-meeting-analyzer-transcribe-extract-tasks-update-ghl#1` | RIGHTS + PROVIDER_E2E_REQUIRED |
| Hotel Smart Lock Access | `commercialize/release-ready` | `9eb4052ea1d7deecd6d3b227abbbae65413acc8c` | `n8n-automate-hotel-smart-lock-access-with-n8n-json#1` | RIGHTS + PROVIDER_E2E_REQUIRED |
| Pet Clinic Appointment Scheduler | `commercialize/release-ready` | `3ee53ae514ab3e5369c30a4704d4bdde1a4b467c` | `n8n-pet-clinic-appointment-scheduling-agent#1` | RIGHTS + PROVIDER_E2E_REQUIRED |
| Multi-Carrier Shipping Quote Router | `commercialize/release-ready` | `f3fa229c799f3756d0c11f26cd8e6147b63d0629` | `n8n-automate-multi-carrier-shipping-quotes-with-ai#1` | RIGHTS + PROVIDER_E2E_REQUIRED |

## Release Factory

The central Release Factory lives under `commercialization/n8n/tools/release_factory.py` with the 20-product registry in `commercialization/n8n/release_registry.json`.

It enforces:
- exactly 20 current code-backed product records;
- unique product slugs;
- donor-only/clean-room invariants;
- required commercial package artifacts;
- workflow JSON/node validation;
- basic secret detection;
- rights gate before sellability;
- provider E2E gate when external providers are required;
- fail-closed state calculation.

At commit `fddaec303c892919ae92b70716a18ae5a8af24b8`, both the `n8n REA gates` workflow and the main repository CI completed successfully.

## GitHub Actions infrastructure blocker

Issue `agent-work-os#207` tracks a separate runner-level blocker observed in multiple private workflow repositories. Affected jobs completed with `steps: []`, `runner_id: 0` and no runner name, which means the validation scripts never executed. These runs must not be treated as either passing or code-level failing evidence.

## Product-specific boundaries encoded in the release packages

- Hotel Concierge: cross-guest isolation, duplicate WhatsApp prevention, unauthorized-write prevention, prompt-injection handling and Redis/model/provider failure tests.
- Lead-to-Proposal: human approval, scoring regression, duplicate-send prevention, WhatsApp failure/rate-limit/replay controls.
- HVAC Booking: duplicate/concurrent slot prevention, calendar lifecycle and messaging recovery.
- Inventory Reorder: threshold correctness, duplicate/concurrent reorder prevention and isolated notification retry.
- Meeting Analyzer: transcript/structured-output regression, CRM idempotency, malformed AI output and downstream notification failures.
- Hotel Smart Lock: room→lock mapping, access-code expiry/revocation, cancellation/room-change handling and duplicate grant prevention.
- Pet Clinic Scheduler: booking/reschedule/cancel correctness, cross-user memory isolation, and a strict administrative-only/no-clinical-advice product boundary.
- Shipping Quote Router: deterministic ranking/commission math, partial/no-rate handling, quote freshness, rate-limit recovery and duplicate message prevention.
- Sentinel: existing MIT core remains open source; paid value is production engineering/support and separately authored enhancements.

## Shipping rule

No workflow becomes `SELLABLE` merely because a release PR exists. The release receipt for that exact candidate SHA must show GO for provenance/rights, secret safety, supported n8n import, deterministic tests, idempotency/failure/recovery behavior, provider-safe E2E where applicable, demo evidence and support/license boundaries.
