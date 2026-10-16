# n8n Commercial Release Readiness Matrix

_Last updated: 2026-10-15 (America/New_York)_

`SELLABLE` means a paying customer can receive the product with acceptable provenance/license, secret-safe configuration, supported n8n compatibility, deterministic fixtures, failure/recovery evidence, provider-safe verification where required, support terms, and an exact-SHA GO receipt.

## Status vocabulary

- `DONOR_ONLY`: reference artifact; never ship/sell this source.
- `REBUILD_REQUIRED`: independent implementation still required.
- `PACKAGE_REQUIRED`: owned/clean-room implementation exists but local package/import/evidence gates remain.
- `E2E_REQUIRED`: commercial package exists; external/provider or full integration verification remains.
- `RIGHTS_REQUIRED`: implementation/package exists but redistribution rights remain unproven.
- `SELLABLE`: all release gates passed for the documented support boundary.
- `PUBLISHED`: a `SELLABLE` exact-SHA release is listed in an approved channel.

## Current 20 code-backed assets after hardening

| # | Product / commercial disposition | State | What remains before SELLABLE |
|---:|---|---|---|
| 1 | AP MatchFlow | E2E_REQUIRED | rights/provenance receipt; Gmail/Sheets/Gemini/Slack safe E2E; exact-SHA GO |
| 2 | Hotel Guest WhatsApp Concierge | E2E_REQUIRED | rights; WhatsApp/Google/Gemini/Redis E2E; isolation/idempotency evidence; GO receipt |
| 3 | Meeting Analyzer → CRM | E2E_REQUIRED | rights; Deepgram/Gemini/HighLevel/Slack/Gmail E2E; malformed-output/idempotency proof |
| 4 | HVAC Booking Agent | E2E_REQUIRED | rights; calendar/messaging E2E; duplicate/concurrent booking proof; rerun CI after runner issue |
| 5 | Gym Check-in | E2E_REQUIRED | workflow/custom-node rights; n8n/node compatibility; Supabase/Google E2E; webhook-auth proof |
| 6 | **Authorized Email Extractor** (clean-room replacement) | PACKAGE_REQUIRED | record license/authorship for new files; n8n import; CI/unit tests; demo + exact-SHA GO |
| 7 | **Authorized Social Opportunity Radar** (clean-room replacement) | PACKAGE_REQUIRED | record license/authorship; n8n import; CI/unit tests; human-review/no-auto-engagement demo |
| 8 | Hotel Smart Lock Access | E2E_REQUIRED | rights; Apaleo/Seam/Twilio/Gmail E2E; expiry/revocation/idempotency proof |
| 9 | Inventory Reorder + Vendor Notification | E2E_REQUIRED | rights; vendor E2E; duplicate/concurrent reorder proof; rerun CI after runner issue |
| 10 | Pet Clinic Scheduler | E2E_REQUIRED | rights; HighLevel/WhatsApp/Gemini/Redis E2E; schedule lifecycle; administrative-only claim proof |
| 11 | Barcode Scanner Node | RIGHTS_REQUIRED | workflow/custom-node rights; n8n/node compatibility; deterministic barcode/QR fixtures; GO receipt |
| 12 | Multi-Carrier Shipping Quote Router | E2E_REQUIRED | rights; ShipEngine/WhatsApp/HighLevel E2E; ranking/commission/rate-limit proof |
| 13 | Lead-to-Proposal AI | E2E_REQUIRED | rights; WhatsApp E2E; scoring/approval/idempotency proof; rerun CI after runner issue |
| 14 | Equipment Enquiry Router | E2E_REQUIRED | rights; Google/Slack E2E; privacy + administrative/product-enquiry-only boundary proof |
| 15 | ViralFlow donor source | DONOR_ONLY | **never ship donor**; capability is fulfilled by FreeFlow + Faceless once those receive GO |
| 16 | Reel Generator donor source | DONOR_ONLY | **never ship donor**; capability is fulfilled by Faceless + FreeFlow once those receive GO |
| 17 | Sogni Integration Engineering Pack | E2E_REQUIRED | build/lint/tests; n8n node load; Sogni safe fixture/failure tests; exact-SHA GO |
| 18 | Sentinel Production Engineering Pack | PACKAGE_REQUIRED | supported n8n import; behavioral/load evidence; separately authored premium enhancement/support evidence |
| 19 | FreeFlow AI Media Factory n8n Edition | E2E_REQUIRED | code/content rights; n8n import; deterministic render; evidence packet; provider/private-upload proof |
| 20 | Faceless Content Creator n8n Edition | E2E_REQUIRED | app+n8n compatibility; tenant/quota/cancel/idempotency tests; provider/test-private publish; rights |

## Material progress completed

- All 20 code-backed entries now have a concrete governed disposition and candidate SHA/branch/PR recorded in `release_registry.json` and `RELEASE_TRAIN_STATUS.md`.
- Commercial release packages were added across the sellable candidates with QUICKSTART, dependencies, release test matrix, support boundary, provenance/license gate and release receipt.
- The Email Scraper lineage now has an independently authored core-node **Authorized Email Extractor** that excludes the historical third-party scraper node and does no crawling/outreach.
- The LinkedIn lineage now has an independently authored core-node **Authorized Social Opportunity Radar** that consumes customer-authorized records, scores deterministically, requires human review and performs no automated engagement.
- Sogni's upstream MIT license and Sogni AI attribution are explicitly preserved; its commercial offer is integration engineering/support rather than proprietary resale.
- Sentinel's MIT core remains free; paid value is production engineering/support and independently authored enhancements.
- ViralFlow and Reel Generator are formally excluded from commercial shipping; their useful capability themes are mapped to owned FreeFlow/Faceless implementations rather than cloned.

## Historical / clean-room lineages beyond the current 20

| Product | State | Required action |
|---|---|---|
| Research Agent OS | REBUILD_REQUIRED | recover exact artifact or recreate cleanly, then package/verify |
| Buyer Intent / Intent Revenue OS | REBUILD_REQUIRED | build governed commercial workflow edition; do not ship historical donor workflow |
| Restaurant AI OS / Cafe Management | DONOR_ONLY → REBUILD_REQUIRED | independent implementation only |
| BillingOps / InvoiceFlow | DONOR_ONLY → REBUILD_REQUIRED | independent idempotent invoice/payment/refund implementation |
| Agency Automation Pack | DONOR_ONLY → REBUILD_REQUIRED | clean-room implementation |
| Healthcare Operations Pack | DONOR_ONLY → REBUILD_REQUIRED | clean-room implementation with privacy/compliance boundary |
| Restaurant/Hospitality Pack | DONOR_ONLY → REBUILD_REQUIRED | clean-room implementation |
| LeadGen Pack | DONOR_ONLY → REBUILD_REQUIRED | policy-safe clean-room acquisition workflow |
| Property/Real-Estate Pack | DONOR_ONLY → REBUILD_REQUIRED | clean-room implementation |

## Pending Reddit evidence targets

Six unresolved Reddit `/s/<token>` targets remain `SOURCE_IDENTITY_BLOCKED` and are not promoted into the product count until canonical identity and deduplication are proven. See `PENDING_REDDIT_TARGETS.md`.

## Mandatory gates before SELLABLE

1. Exact source/candidate SHA recorded.
2. Provenance/license/redistribution rights acceptable, or clean-room implementation used.
3. No live credentials committed; credential map/placeholders complete.
4. Supported n8n version pinned and import validated.
5. Deterministic demo input/output exists.
6. Happy path passes.
7. Invalid/malformed input path passes.
8. Duplicate/idempotency behavior proven.
9. Provider timeout/failure/rate-limit behavior proven where applicable.
10. Retry policy is failure-class aware, not blind retry.
11. Recovery/replay path proven.
12. Kill switch/safe-disable documented for side-effecting workflows.
13. External provider claims verified sandbox/live-safe.
14. QUICKSTART, dependencies, tests, support, license/terms, compatibility and architecture are complete.
15. Demo evidence exists.
16. Exact-SHA release receipt is complete.
17. Shipping decision is `GO` before sale/publication.

## External boundary

We can complete code, clean-room rebuilds, mocks/fixtures, CI, docs, packaging, secret scans and local/import testing without customer accounts. We cannot honestly claim production-provider readiness for WhatsApp, CRM, carriers, calendars, locks, publishing or similar APIs until approved sandbox/test credentials and accounts are supplied outside Git and those exact-SHA provider tests pass.
