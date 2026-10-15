# n8n Commercial Release Readiness Matrix

_Last updated: 2026-10-14 (America/New_York)_

This is the canonical release-control view for the n8n commercialization program. `SELLABLE` means the product can be delivered to a paying customer with a documented installation path, acceptable provenance/license, secret-safe configuration, supported n8n compatibility, deterministic demo fixtures, failure/recovery tests, provider-safe verification where required, support terms, and an exact-SHA release receipt.

## Status vocabulary

- `DONOR_ONLY`: third-party/reference artifact; never sell source as-is.
- `REBUILD_REQUIRED`: clean-room implementation required before packaging.
- `PACKAGE_REQUIRED`: usable implementation exists but commercial packaging/evidence is incomplete.
- `E2E_REQUIRED`: package is materially complete; provider sandbox/live-safe proof is still required.
- `RIGHTS_REQUIRED`: code exists but redistribution/commercial rights are not yet evidenced.
- `SELLABLE`: all gates passed for the stated compatibility/support boundary.
- `PUBLISHED`: sellable release is actually listed in an approved channel.

## Current code-backed products

| # | Product | Source repo / path | Current state | What remains before SELLABLE |
|---:|---|---|---|---|
| 1 | AP MatchFlow | `n8n-automated-vendor-invoice-to-purchase-order-matching` | E2E_REQUIRED | provider sandbox credentials/callbacks/test records; commercial license/provenance receipt; final package docs + release receipt |
| 2 | Hotel Guest WhatsApp Concierge | `n8n-hotel-guest-whatsapp-concierge` | PACKAGE_REQUIRED | provenance, package standardization, WhatsApp/provider sandbox, failure/idempotency tests, demo proof |
| 3 | AI Meeting Analyzer → GHL/CRM | `n8n-ai-meeting-analyzer-transcribe-extract-tasks-update-ghl` | PACKAGE_REQUIRED | provenance, transcription/CRM sandbox, retries/idempotency, package docs, demo proof |
| 4 | AI HVAC Appointment Booking | `n8n-ai-automated-hvac-appointment-booking-n8n-workflow-json` | PACKAGE_REQUIRED | provenance, calendar/SMS sandbox, duplicate-booking prevention, failure tests, release package |
| 5 | Gym Check-in System | `n8n-gym-checkin-system` | PACKAGE_REQUIRED | provenance, input/device contract, duplicate check-in tests, package docs, demo proof |
| 6 | Email Scraper Pro | `n8n-email-scraper-pro-custom-n8n-node-workflow` | RIGHTS_REQUIRED | provenance/license + ToS/access-policy review; compatibility tests; package docs |
| 7 | LinkedIn Engagement Opportunities Finder | `n8n-automated-linkedin-engagement-oppurtunities-finder` | REBUILD_REQUIRED | clean-room implementation/policy-safe data sources; human approval; platform-policy review; E2E |
| 8 | Hotel Smart Lock Access | `n8n-automate-hotel-smart-lock-access-with-n8n-json` | PACKAGE_REQUIRED | provenance, lock-vendor sandbox, revoke/expiry/idempotency tests, release package |
| 9 | Inventory Reorder + Vendor Notification | `n8n-automated-inventory-reorder-vendor-notification-pipeline` | PACKAGE_REQUIRED | provenance, vendor integration sandbox, duplicate-order prevention, threshold/recovery tests |
| 10 | Pet Clinic Appointment Scheduling | `n8n-pet-clinic-appointment-scheduling-agent` | PACKAGE_REQUIRED | provenance, calendar sandbox, duplicate/reschedule/cancel tests, no diagnostic claims |
| 11 | Barcode Scanner Custom Node | `n8n-barcode-scanner-custom-node` | PACKAGE_REQUIRED | provenance, n8n compatibility matrix, malformed barcode/device tests, package docs |
| 12 | Multi-Carrier Shipping Quote Router | `n8n-automate-multi-carrier-shipping-quotes-with-ai` | E2E_REQUIRED | carrier sandbox accounts, timeout/rate-limit/fallback tests, exact quote fixtures, release receipt |
| 13 | Lead Scoring + WhatsApp Proposal | `n8n-lead-scoring-and-automated-whatsapp-proposal-sender` | PACKAGE_REQUIRED | provenance, WhatsApp sandbox, approval/duplicate-send controls, scoring regression tests |
| 14 | Medical Equipment Enquiry Router | `n8n-routing-of-medical-equipment-enquiry` | PACKAGE_REQUIRED | provenance, remove clinical/PHI assumptions, routing tests, package docs, demo proof |
| 15 | ViralFlow | `n8n-viralflow` | DONOR_ONLY | clean-room rebuild if commercialized; original attributed source must not be resold as-is |
| 16 | AI Reel Generator | `n8n-reel-generator` | DONOR_ONLY | clean-room rebuild if commercialized; original attributed source must not be resold as-is |
| 17 | Sogni n8n Nodes | `n8n-nodes-sogni` | RIGHTS_REQUIRED | upstream license/provenance review, supported-version compatibility, packaging/support boundary |
| 18 | Sentinel Reliability Runtime | `n8n-sentinel-circuit-breaker-or-resilient-webhook-queue-engine` | PACKAGE_REQUIRED | premium differentiation beyond public/permissive baseline; Postgres state/idempotency/observability package; release proof |
| 19 | FreeFlow AI Media Factory | `youtube_project/n8n/workflows/FreeFlow_Roman_Pilot_Starter.json` | PACKAGE_REQUIRED | release packaging, media-provider sandbox, copyright/release evidence, private-upload demo, support boundary |
| 20 | Faceless Content Creator | `faceless-content-creator/workflows/n8n/faceless-content-creator.json` | PACKAGE_REQUIRED | package n8n edition, provider sandbox, render/publish failure recovery, demo proof, release receipt |

## Historical / clean-room product lineages

| Product | State | Required action |
|---|---|---|
| Research Agent OS | REBUILD_REQUIRED | recover exact artifact or recreate cleanly, then package and verify |
| Buyer Intent / Intent Revenue OS | REBUILD_REQUIRED | commercial clean-room workflow edition; do not sell historical donor workflow |
| Restaurant AI OS / Cafe Management | DONOR_ONLY → REBUILD_REQUIRED | independent implementation only |
| BillingOps / InvoiceFlow | DONOR_ONLY → REBUILD_REQUIRED | independent implementation with idempotent payment/refund/event handling |
| Agency Automation Pack | DONOR_ONLY → REBUILD_REQUIRED | clean-room implementation |
| Healthcare Operations Pack | DONOR_ONLY → REBUILD_REQUIRED | clean-room implementation with privacy/compliance boundaries |
| Restaurant/Hospitality Pack | DONOR_ONLY → REBUILD_REQUIRED | clean-room implementation |
| LeadGen Pack | DONOR_ONLY → REBUILD_REQUIRED | clean-room implementation with platform-policy-safe acquisition |
| Property/Real-Estate Pack | DONOR_ONLY → REBUILD_REQUIRED | clean-room implementation |

## Pending Reddit evidence targets

The six unresolved `/s/<token>` Reddit links remain `SOURCE_IDENTITY_BLOCKED` and are not counted as new products until canonical identity and deduplication are proven. See `PENDING_REDDIT_TARGETS.md`.

## Mandatory gates before a product can become SELLABLE

1. Source identity and exact source SHA recorded.
2. Provenance/license/redistribution rights acceptable, or clean-room implementation used.
3. No secrets or live credentials committed; `.env.example`/credential map complete.
4. Supported n8n version pinned and import validation passes.
5. Deterministic demo input and expected output included.
6. Happy path passes.
7. Malformed/invalid input path passes.
8. Duplicate/idempotency behavior proven.
9. Provider timeout/failure/rate-limit behavior proven where applicable.
10. Retry policy is classified by failure type, not blind retry.
11. Recovery/replay path proven.
12. Kill switch / safe-disable path documented for side-effecting workflows.
13. External provider claims verified in sandbox/live-safe mode.
14. QUICKSTART, DEPENDENCIES, TEST_MATRIX, SUPPORT, LICENSE/terms, compatibility and architecture docs included.
15. Demo screenshots/video or equivalent evidence captured.
16. Exact-SHA release receipt created.
17. No product is published until the shipping decision is `GO`.

## What can be completed without customer/provider credentials

We can complete code cleanup, clean-room rebuilds, deterministic fixtures, mock/provider simulators, import tests, failure injection, docs, packaging, version pinning, CI, secret scanning, demo-mode execution, storefront metadata, and release-candidate receipts.

## What still requires an external gate

A product that depends on WhatsApp, CRM, carrier, calendar, lock, publishing, billing, scraping, storage, messaging or other provider APIs cannot honestly receive a production-provider `SELLABLE` claim until sandbox/live-safe credentials and test accounts are supplied outside Git and the provider-specific tests pass.
