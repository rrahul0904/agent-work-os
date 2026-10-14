# Canonical n8n Master Inventory

_Last reconciled: 2026-10-13 (America/New_York)_

This file is the canonical inventory of n8n-related assets discovered across project chat history and the connected GitHub installation. It distinguishes current repository-backed workflow assets from embedded workflows, historical builds, donor/reference systems, clean-room product lineages, support repositories, and concept-only ideas.

## Inventory rules

- `CURRENT_REPO_ASSET`: current GitHub repository directly contains/is an n8n workflow or n8n custom-node project.
- `EMBEDDED_N8N_ASSET`: n8n workflow exists inside a broader product repository.
- `HISTORICAL_BUILD`: implementation/workflow was built or referenced in prior project work but the dedicated repository is not currently visible in the connected GitHub installation.
- `DONOR_REFERENCE`: third-party/reference implementation; do not sell or redistribute as-is unless rights are independently proven.
- `CLEAN_ROOM_LINEAGE`: commercial product direction derived from capability analysis but intended to be independently implemented.
- `AGGREGATOR`: inventory/support repository, not a workflow product.
- `CONCEPT_ONLY`: prior proposed workflow without confirmed current implementation artifact.

Commercial states:
- `PACKAGE_AND_VERIFY`: likely ours/current but must pass provenance, secret scan, n8n import, deterministic tests, provider sandbox/E2E where applicable, docs, demo, and release receipt.
- `CLEAN_ROOM_REBUILD`: capability is commercially attractive but source must not be sold as-is.
- `DO_NOT_SELL_AS_IS`: explicit third-party attribution/reference material.
- `RECONCILE_LOCATION`: prior build exists in chat history but current artifact/repo location must be recovered.
- `NOT_A_PRODUCT`: support/aggregation artifact.

## A. Current repository-backed n8n workflow/custom-node assets — 18

| # | Asset / product lineage | GitHub repository | Type | Commercial state | Notes |
|---:|---|---|---|---|---|
| 1 | Hotel Guest WhatsApp Concierge | `rrahul0904/n8n-hotel-guest-whatsapp-concierge` | CURRENT_REPO_ASSET | PACKAGE_AND_VERIFY | Hospitality concierge automation. |
| 2 | AI Meeting Analyzer → GHL | `rrahul0904/n8n-ai-meeting-analyzer-transcribe-extract-tasks-update-ghl` | CURRENT_REPO_ASSET | PACKAGE_AND_VERIFY | Transcription/task extraction/CRM update. |
| 3 | Vendor Invoice → Purchase Order Matching / AP MatchFlow | `rrahul0904/n8n-automated-vendor-invoice-to-purchase-order-matching` | CURRENT_REPO_ASSET | PACKAGE_AND_VERIFY | Strong finance/AP product candidate; repo already has runbook/gaps/security packaging. |
| 4 | AI HVAC Appointment Booking | `rrahul0904/n8n-ai-automated-hvac-appointment-booking-n8n-workflow-json` | CURRENT_REPO_ASSET | PACKAGE_AND_VERIFY | Vertical lead-to-booking automation. |
| 5 | Gym Check-in System | `rrahul0904/n8n-gym-checkin-system` | CURRENT_REPO_ASSET | PACKAGE_AND_VERIFY | Gym/member operations. |
| 6 | Email Scraper Pro Custom Node/Workflow | `rrahul0904/n8n-email-scraper-pro-custom-n8n-node-workflow` | CURRENT_REPO_ASSET | PACKAGE_AND_VERIFY | Utility/lead-gen developer product. |
| 7 | LinkedIn Engagement Opportunities Finder | `rrahul0904/n8n-automated-linkedin-engagement-oppurtunities-finder` | CURRENT_REPO_ASSET | PACKAGE_AND_VERIFY | Social/intent lead discovery; related to larger Buyer Intent lineage below. |
| 8 | Hotel Smart Lock Access | `rrahul0904/n8n-automate-hotel-smart-lock-access-with-n8n-json` | CURRENT_REPO_ASSET | PACKAGE_AND_VERIFY | Bundle with hotel concierge where useful. |
| 9 | Inventory Reorder + Vendor Notification | `rrahul0904/n8n-automated-inventory-reorder-vendor-notification-pipeline` | CURRENT_REPO_ASSET | PACKAGE_AND_VERIFY | Operations/procurement automation. |
| 10 | Pet Clinic Appointment Scheduling Agent | `rrahul0904/n8n-pet-clinic-appointment-scheduling-agent` | CURRENT_REPO_ASSET | PACKAGE_AND_VERIFY | Vertical scheduling product. |
| 11 | Barcode Scanner Custom Node | `rrahul0904/n8n-barcode-scanner-custom-node` | CURRENT_REPO_ASSET | PACKAGE_AND_VERIFY | Custom-node/integration product, not a normal template. |
| 12 | AI Multi-Carrier Shipping Quote Automation | `rrahul0904/n8n-automate-multi-carrier-shipping-quotes-with-ai` | CURRENT_REPO_ASSET | PACKAGE_AND_VERIFY | Logistics quoting/routing. |
| 13 | Lead Scoring + WhatsApp Proposal Sender | `rrahul0904/n8n-lead-scoring-and-automated-whatsapp-proposal-sender` | CURRENT_REPO_ASSET | PACKAGE_AND_VERIFY | Strong sales automation candidate. |
| 14 | Medical Equipment Enquiry Router | `rrahul0904/n8n-routing-of-medical-equipment-enquiry` | CURRENT_REPO_ASSET | PACKAGE_AND_VERIFY | Route/enrich/respond workflow; commercial claims need careful domain review. |
| 15 | ViralFlow | `rrahul0904/n8n-viralflow` | CURRENT_REPO_ASSET / DONOR_REFERENCE | DO_NOT_SELL_AS_IS | Current README attributes original project to Prabhanshu Kamal. Use only as capability reference unless rights are proven; clean-room rebuild if desired. |
| 16 | AI Reel Generator | `rrahul0904/n8n-reel-generator` | CURRENT_REPO_ASSET / DONOR_REFERENCE | DO_NOT_SELL_AS_IS | README/contact identifies another creator; clean-room rebuild only. |
| 17 | Sogni n8n Nodes | `rrahul0904/n8n-nodes-sogni` | CURRENT_REPO_ASSET | PACKAGE_AND_VERIFY | Community/custom-node asset; audit upstream license/provenance before commercialization. |
| 18 | Sentinel Circuit Breaker / Automation Reliability Runtime | `rrahul0904/n8n-sentinel-circuit-breaker-or-resilient-webhook-queue-engine` | CURRENT_REPO_ASSET | PACKAGE_AND_VERIFY | Strong technical product; later Automation Runtime/Recipe Framework work belongs to this family rather than being double-counted. |

## B. n8n workflows embedded in broader product repositories — 2

| # | Asset / product lineage | GitHub repository / path | Type | Commercial state | Notes |
|---:|---|---|---|---|---|
| 19 | FreeFlow AI Media Factory / Roman Pilot / Sleep Video Factory family | `rrahul0904/youtube_project` → `n8n/workflows/FreeFlow_Roman_Pilot_Starter.json` | EMBEDDED_N8N_ASSET | PACKAGE_AND_VERIFY | Treat Roman/sleep/lullaby/devotional/ocean/rain/bedtime variants as one product family with editions, not duplicate SKUs. |
| 20 | Faceless Content Creator | `rrahul0904/faceless-content-creator` → `workflows/n8n/faceless-content-creator.json` | EMBEDDED_N8N_ASSET | PACKAGE_AND_VERIFY | Full product repo includes app/rendering/publishing/analytics around an n8n workflow; separate commercial candidate from FreeFlow but dedupe overlapping creator capabilities. |

## C. Historical / clean-room n8n lineages from prior chats — 4

| # | Asset / product lineage | Known location / current repo | Type | Commercial state | Notes |
|---:|---|---|---|---|---|
| 21 | Research Agent OS | Historical path `n8n/research-agent-v2.json`; dedicated `research-agent-os` repo not currently visible | HISTORICAL_BUILD | RECONCILE_LOCATION | Prior build included FastAPI/UI, Tavily/OpenRouter, citations/retries, Docker/CI/docs. Recover exact artifact or recreate cleanly. |
| 22 | Buyer Intent / Assisted SDR → Buyer Intent Radar / Intent Revenue OS | Historical ~95-node donor workflow; clean-room product now `rrahul0904/intent-revenue-os` | CLEAN_ROOM_LINEAGE | PACKAGE_AND_VERIFY current product; donor DO_NOT_SELL_AS_IS | Sources included Reddit/Google/X/RSS → Airtable → LLM classification/enrichment/scoring → Slack approval → outreach/nurture/analytics. Current `intent-revenue-os` main tree does not presently expose an n8n workflow path, so this is lineage rather than a current n8n file. |
| 23 | Cafe Management / Restaurant AI OS | Donor: `tanlovepain/Cafe-Management-System-` 77-node workflow; clean-room Restaurant AI OS proposed | DONOR_REFERENCE / CLEAN_ROOM_LINEAGE | CLEAN_ROOM_REBUILD | WhatsApp receptionist, booking, ordering, payment, kitchen notifications, feedback, retention, support. Do not sell donor JSON as-is. |
| 24 | Invoice & Payment Management → BillingOps / InvoiceFlow | Historical donor `invoice-and-payment-management/workflow.json` (~37 nodes) | DONOR_REFERENCE / CLEAN_ROOM_LINEAGE | CLEAN_ROOM_REBUILD | Distinct from AP MatchFlow: customer invoicing/payment/refund/event handling vs vendor invoice/PO matching. Donor had known correctness/idempotency/state gaps. |

## D. External donor/reference n8n pack family — 5

Source lineage: `aminesellal/n8n-ai-workflows`. These are capability/architecture donors unless redistribution rights are independently proven. Commercialization should be via independently implemented governed packs.

| # | Donor workflow family | Commercial clean-room direction | Type | Commercial state |
|---:|---|---|---|---|
| 25 | AgencyOS | Governed Agency Automation Pack | DONOR_REFERENCE | CLEAN_ROOM_REBUILD |
| 26 | MedFlow | Governed Healthcare Operations Pack | DONOR_REFERENCE | CLEAN_ROOM_REBUILD |
| 27 | RestoFlow | Governed Hospitality/Restaurant Pack | DONOR_REFERENCE | CLEAN_ROOM_REBUILD |
| 28 | LeadGen Engine | Governed Sales/LeadGen Pack | DONOR_REFERENCE | CLEAN_ROOM_REBUILD |
| 29 | ZedProp | Governed Property/Real-Estate Pack | DONOR_REFERENCE | CLEAN_ROOM_REBUILD |

## E. Support/aggregation repository — not a product

| Asset | Repository | Type | Status |
|---|---|---|---|
| Original 14-workflow source/manifest repository | `rrahul0904/n8n-github-repos-as-is-no-tweaks` | AGGREGATOR | NOT_A_PRODUCT |

This repo preserves the original 14 uploaded project extracts and manifests. It should be used for provenance/reconciliation, not marketed as a workflow product itself.

## F. Concept-only n8n workflow ideas from prior chat — 3 (not counted as implemented assets)

| # | Concept | State |
|---:|---|---|
| C1 | Research Interview Analyzer | CONCEPT_ONLY — confirm whether implementation exists before SKU creation |
| C2 | Lesson Inventory QA Monitor | CONCEPT_ONLY — confirm whether implementation exists before SKU creation |
| C3 | Parent Waitlist / Onboarding Router | CONCEPT_ONLY — confirm whether implementation exists before SKU creation |

## Folded/duplicate lineages — intentionally not double-counted

The following appeared separately in chats but are part of another canonical family:

- “N8N Workflow That Auto-Creates and Uploads YouTube Videos While You Sleep” → fold into **FreeFlow AI Media Factory / Sleep Video Factory**.
- Roman Empire, sleep, lullaby, Krishna/devotional, ocean, rain-window, bedtime-story channel variants → editions/use cases of **FreeFlow**, not separate core products unless packaged later as niche bundles.
- Sentinel Automation Runtime Platform / Recipe Framework / governed runtime work → fold into **Sentinel / Automation Reliability Runtime**.
- SATNA_PROJECT n8n architecture slice → donor/reference input to the governed Sentinel/runtime lineage, not a separate resale SKU.
- LinkedIn Engagement Opportunities Finder and Buyer Intent Radar overlap in buyer-intent capability, but both remain listed because there is a current standalone LinkedIn n8n repo and a materially larger historical multi-source Assisted-SDR lineage/product.

## Current count

- **18** current dedicated n8n project/custom-node repositories
- **2** confirmed n8n workflows embedded in broader current product repositories
- **4** historical/clean-room n8n product lineages from prior chats
- **5** external donor/reference workflow families
- **29 distinct workflow/product lineages total**
- **+1 aggregation/support repository**
- **+3 concept-only workflow ideas not yet counted as implemented assets**

Therefore the complete evidence set currently contains **33 n8n-related items**, but the commercial product inventory should use the **29 distinct lineages** as the working universe and must not treat donor/reference files as sellable source products.

## Commercialization priority

### Tier A — push to sellable first
1. AP MatchFlow — Vendor Invoice → PO Matching
2. Hotel Guest Automation Suite — Concierge + Smart Lock
3. Lead Scoring + WhatsApp Proposal Sender
4. Sentinel Reliability / Automation Runtime Pack
5. FreeFlow AI Media Factory
6. Faceless Content Creator n8n Pack
7. HVAC Lead-to-Appointment Agent
8. Inventory Reorder + Vendor Notification
9. Multi-Carrier AI Quote Router
10. AI Meeting Analyzer → CRM

### Tier B — package after Tier A
11. LinkedIn Engagement Opportunities Finder
12. Pet Clinic Appointment Agent
13. Gym Check-in System
14. Email Scraper Pro
15. Barcode Scanner Node
16. Medical Equipment Enquiry Router
17. Sogni Nodes (only after upstream license/provenance review)
18. Research Agent OS (after artifact recovery)
19. Buyer Intent Radar / Intent Revenue OS package

### Tier C — clean-room product opportunities
20. Restaurant AI OS
21. BillingOps / InvoiceFlow
22. Agency Automation Pack
23. Healthcare Operations Pack
24. Restaurant/Hospitality Pack
25. LeadGen Pack
26. Property/Real-Estate Pack
27. Viral content automation inspired by ViralFlow (independent implementation only)
28. Reel-generation automation (independent implementation only)

## Release gate for every paid SKU

No product may be marked `SELLABLE` until:

1. source identity and provenance are recorded;
2. redistribution/license status is acceptable or the implementation is independently rebuilt;
3. secrets/credentials are absent and placeholders documented;
4. workflow imports into a supported n8n version;
5. deterministic demo data and expected outputs exist;
6. happy path, malformed input, duplicate/idempotency, provider failure, retry/rate-limit, and recovery tests are run as applicable;
7. external providers are verified in sandbox/live-safe mode where production claims depend on them;
8. QUICKSTART, dependencies/costs, architecture diagram, test matrix, support policy, compatibility statement, and license are included;
9. demo screenshots/video and verification receipt exist;
10. product page copy describes the business outcome rather than only the node count.

## Coverage note

The connected GitHub installation was enumerated broadly (~217 accessible repositories) rather than relying only on repository-name searches. GitHub code-search indexing is incomplete for this account, so completeness is established by combining full repository enumeration, targeted recursive-tree inspection of likely repositories, the original 14-workflow manifest, and prior project chat history. Any newly discovered n8n artifact should be added here before a new SKU is created.
