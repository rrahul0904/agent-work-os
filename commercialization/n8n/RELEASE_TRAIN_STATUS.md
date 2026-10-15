# n8n Commercial Release Train Status

_Last updated: 2026-10-15 (America/New_York)_

This is the canonical execution ledger for all **20 current code-backed n8n assets**. Every entry now has one of three governed dispositions:

1. **release candidate** — current/owned implementation is being hardened for sale;
2. **clean-room replacement** — risky/uncertain dependency was replaced by independently authored commercial code;
3. **donor disposition** — source is explicitly excluded from shipping and its capability is fulfilled by an owned product.

A branch or draft PR is never itself a shipping approval.

| # | Product / disposition | Branch | Candidate SHA | Draft PR | Current gate |
|---:|---|---|---|---|---|
| 1 | AP MatchFlow | `commercialize/release-ready` | `f470b4b6bf312d1492bcc5b5e2af5bf3f985899f` | vendor-invoice repo #1 | RIGHTS + PROVIDER_E2E |
| 2 | Hotel Guest WhatsApp Concierge | `commercialize/release-ready` | `f4182993d57b492f81a12028f7706c0a28e940a5` | hotel-concierge repo #1 | RIGHTS + PROVIDER_E2E |
| 3 | Meeting Analyzer → CRM | `commercialize/release-ready` | `3a6c4b3e16aae59e92ef1142accfd6ae06970840` | meeting-analyzer repo #1 | RIGHTS + PROVIDER_E2E |
| 4 | HVAC Booking Agent | `commercialize/release-ready` | `5831237fd7f05172ffefa9514096890445c2a232` | HVAC repo #1 | RIGHTS + PROVIDER_E2E + ACTIONS_RUNNER |
| 5 | Gym Check-in | `commercialize/release-ready` | `53fa2c904cfda66d15464b93e6252490624a578b` | gym repo #1 | RIGHTS + NODE_COMPATIBILITY + PROVIDER_E2E |
| 6 | Authorized Email Extractor — clean-room replacement | `commercialize/clean-room-release` | `40222f382e8b3b62b9a34e1cf843cfb73b90428f` | email-scraper repo #1 | CLEAN_ROOM_LICENSE + N8N_IMPORT + CI/DEMO |
| 7 | Authorized Social Opportunity Radar — clean-room replacement | `commercialize/clean-room-release` | `5ab00daef5a72312989d36f742ea286368a13e08` | LinkedIn-opportunity repo #4 | CLEAN_ROOM_LICENSE + N8N_IMPORT + CI/DEMO |
| 8 | Hotel Smart Lock Access | `commercialize/release-ready` | `9eb4052ea1d7deecd6d3b227abbbae65413acc8c` | smart-lock repo #1 | RIGHTS + PROVIDER_E2E |
| 9 | Inventory Reorder + Vendor Notification | `commercialize/release-ready` | `8cef1b4b046aafbe72b4141f97ef7e9737921861` | inventory repo #1 | RIGHTS + PROVIDER_E2E + ACTIONS_RUNNER |
| 10 | Pet Clinic Appointment Scheduler | `commercialize/release-ready` | `3ee53ae514ab3e5369c30a4704d4bdde1a4b467c` | pet-clinic repo #1 | RIGHTS + PROVIDER_E2E |
| 11 | Barcode Scanner Node | `commercialize/release-ready` | `3ab28edb1c172df3dc42bb3c49f75ca09623e5d6` | barcode repo #1 | RIGHTS + N8N/CUSTOM-NODE COMPATIBILITY |
| 12 | Multi-Carrier Shipping Quote Router | `commercialize/release-ready` | `f3fa229c799f3756d0c11f26cd8e6147b63d0629` | shipping repo #1 | RIGHTS + PROVIDER_E2E |
| 13 | Lead-to-Proposal AI | `commercialize/release-ready` | `25f51d28d741f197905abc471111cd3f96ecbe7e` | lead-proposal repo #1 | RIGHTS + PROVIDER_E2E + ACTIONS_RUNNER |
| 14 | Equipment Enquiry Router | `commercialize/release-ready` | `43853aa78485189bf3941b04d02d17c7fe490d20` | equipment-router repo #1 | RIGHTS + PROVIDER_E2E + PRODUCT-CLAIM BOUNDARY |
| 15 | ViralFlow donor source → folded into FreeFlow/Faceless | `commercialize/donor-disposition` | `0562032d07e355eda2e476c66ef7062846a68b7a` | ViralFlow repo #1 | DO-NOT-SHIP-DONOR; OWNED REPLACEMENTS MUST GO |
| 16 | Reel Generator donor source → folded into Faceless/FreeFlow | `commercialize/donor-disposition` | `7268708784b9bc96678bbe69658f697e4e8c3e5c` | Reel Generator repo #1 | DO-NOT-SHIP-DONOR; OWNED REPLACEMENTS MUST GO |
| 17 | Sogni Integration Engineering Pack | `commercialize/release-ready` | `bbeedf0bf4dbc429ef359e47dbcf136c286f66d8` | Sogni repo #1 | BUILD/LINT/TEST + N8N LOAD + SOGNI E2E |
| 18 | Sentinel Production Engineering Pack | `commercialize/release-ready` | `49a3fde4df21882fb7cfee26851861da53efbfc4` | Sentinel repo #6 | N8N COMPATIBILITY + BEHAVIORAL/LOAD EVIDENCE |
| 19 | FreeFlow AI Media Factory n8n Edition | `commercialize/n8n-release-ready` | `9f83cda78c3ac22b8c0824e55b9286f791c4c133` | `youtube_project` #7 | CODE/CONTENT RIGHTS + N8N IMPORT + RENDER/PRIVATE-UPLOAD E2E |
| 20 | Faceless Content Creator n8n Edition | `commercialize/n8n-release-ready` | `e041afb3a2f87fb7b534513832ac6f8136608eb7` | `faceless-content-creator` #29 | APP/N8N COMPATIBILITY + TENANT/RENDER/PUBLISH E2E + RIGHTS |

## What has actually been built

Across the release candidates, commercial packaging now standardizes:

- QUICKSTART / install path;
- complete external dependency/provider boundary;
- deterministic and failure-path TEST_MATRIX;
- support scope;
- provenance / clean-room boundary;
- license / redistribution gate;
- exact-SHA RELEASE_RECEIPT;
- fail-closed CI that does not allow an unevidenced candidate to masquerade as shippable.

Product-specific controls include duplicate/idempotency protection, replay/recovery, rate-limit classification, kill-switch behavior, human approvals where appropriate, tenant isolation for SaaS products, and product-claim boundaries for sensitive verticals.

## Clean-room replacements completed

### Authorized Email Extractor

The historical `n8n-nodes-emailscraper-pro` dependency is excluded from the commercial edition. The new workflow is independently authored from n8n core Webhook + Code + Respond-to-Webhook nodes and only accepts customer-supplied/authorized text or HTML. It requires explicit authorization, caps input/output, deduplicates addresses, performs no crawling/authentication bypass, and sends no outreach.

### Authorized Social Opportunity Radar

The historical Apify/profile-scraping workflow is excluded from the commercial edition. The new core-node workflow consumes only customer-authorized records, produces deterministic local opportunity scoring, and always returns a human-review queue with automated engagement disabled.

## Open-source commercial boundaries

### Sentinel

The existing core is MIT. Commercial value is **not** a proprietary resale of the free workflow; it is production engineering, tested compatibility, observability/state/idempotency enhancements, deployment and support.

### Sogni

The upstream project is MIT and attributed to **Sogni AI**. The commercial offer preserves attribution and sells integration engineering, tested compatibility, recipes, deployment/support and separately authored enhancements.

## Donor retirements

### ViralFlow

The source README attributes the project to Prabhanshu Kamal / PrabhanshuKamal2121. Its workflow/code/assets are excluded from commercial shipping. Capability is fulfilled through owned FreeFlow + Faceless Content Creator products.

### Reel Generator

The source describes downloading/transcribing existing YouTube videos and includes another creator's contact information. The donor workflow/code/media are excluded from commercial shipping. Reel/presenter/publishing capability is fulfilled by the independently implemented Faceless Content Creator and FreeFlow products using customer-authorized content.

## Release Factory

Central control plane:

- `commercialization/n8n/release_registry.json`
- `commercialization/n8n/tools/release_factory.py`
- `commercialization/n8n/tools/test_release_factory.py`
- `.github/workflows/n8n-rea-gates.yml`

It enforces the 20-product registry, clean-room/donor invariants, required package artifacts, workflow validity, basic secret detection, rights gates, provider-E2E gates, and fail-closed state calculation.

At commit `fddaec303c892919ae92b70716a18ae5a8af24b8`, both central `n8n REA gates` and repository CI completed successfully. New registry/disposition changes must also pass those checks before the central PR can be merged.

## GitHub Actions infrastructure blocker

Issue `agent-work-os#207` tracks a separate runner-level blocker seen in multiple private workflow repositories. Affected GitHub Actions jobs ended with `steps: []`, `runner_id: 0`, and no runner name, so the repository validation scripts never executed. Those runs are neither pass evidence nor code-failure evidence; exact candidate SHAs must be rerun after runner allocation works.

## Shipping rule

**0 products are declared `SELLABLE` or `PUBLISHED` merely because these branches/PRs now exist.**

A product may move to `SELLABLE` only when its exact candidate SHA has a GO receipt proving, as applicable: rights/provenance, secret safety, supported n8n import, deterministic fixtures, malformed-input handling, idempotency, provider failure/rate-limit behavior, replay/recovery, kill switch, provider-safe E2E, demo evidence, and support/license boundaries.
