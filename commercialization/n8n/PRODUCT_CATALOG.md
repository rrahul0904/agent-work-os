# n8n Product Catalog

Status: commercialization workstream
Owner: Agent Work OS

## Commercialization rule

A workflow is not sellable merely because it exists in GitHub. Every SKU must pass: provenance/license review, clean-room boundary where required, secret scan, n8n import validation, happy-path test, failure-path test, dependency/cost inventory, setup documentation, screenshots/demo proof, support policy, version pinning, and release receipt.

## Tier A — Flagship products to package first

| SKU | Product | Outcome | Primary buyer | Initial price band | Current gate |
|---|---|---|---|---:|---|
| N8N-CREATOR-001 | FreeFlow AI Media Factory | Produce copyright-aware faceless media with private-upload release gates | creators/agencies | $149–$299 | package + demo proof |
| N8N-FINOPS-001 | AP MatchFlow | Match vendor invoices to purchase orders and route exceptions | SMB finance/AP teams | $99–$249 | provider sandbox E2E |
| N8N-HOSP-001 | Hotel Guest Automation Suite | WhatsApp concierge + guest operations + smart-lock automation | independent hotels/property operators | $149–$399 | clean-room/provenance + E2E |
| N8N-SALES-001 | Lead-to-Proposal AI | score leads and send governed WhatsApp proposals/follow-ups | agencies/local services | $99–$299 | clean-room/provenance + E2E |
| N8N-RELIABILITY-001 | Sentinel Reliability Pack | circuit breaker, backoff, DLQ and recovery patterns for production n8n | developers/automation teams | $79–$199 | commercial edition differentiation |

## Tier B — Individual workflow products

| SKU | Product | Initial price band | Gate |
|---|---|---:|---|
| N8N-OPS-001 | AI Meeting Analyzer to CRM | $49–$129 | provenance + integration test |
| N8N-OPS-002 | Inventory Reorder & Vendor Notification | $49–$129 | provenance + integration test |
| N8N-LOGISTICS-001 | AI Multi-Carrier Quote Router | $59–$149 | provenance + carrier sandbox |
| N8N-SALES-002 | LinkedIn Engagement Opportunity Finder | $49–$149 | clean-room + platform-policy review |
| N8N-HVAC-001 | HVAC Lead-to-Appointment Agent | $79–$199 | provenance + calendar/SMS test |
| N8N-PET-001 | Pet Clinic Scheduling Agent | $39–$99 | provenance + calendar test |
| N8N-GYM-001 | Gym Check-in Automation | $29–$79 | provenance + device/input test |
| N8N-DEV-001 | Email Scraper Pro Node/Workflow | $29–$99 | provenance + legal/ToS review |
| N8N-DEV-002 | Barcode Scanner Custom Node | $19–$69 | provenance + compatibility test |
| N8N-MED-ROUTE-001 | Equipment Enquiry Router | $49–$129 | provenance + remove healthcare claims/PHI assumptions |

## Tier C — Rebuild-first / not sellable as-is

| Product | Reason | Action |
|---|---|---|
| ViralFlow donor repo | README/source attribution indicates third-party origin | use only as capability reference; clean-room rebuild |
| Reel Generator donor repo | README/source attribution includes third-party creator material | use only as capability reference; clean-room rebuild |

## Bundles

### Local Business AI Automation Bundle — $299–$599
HVAC booking + lead scoring/proposal + appointment patterns + support runbook.

### Hospitality Automation Bundle — $299–$699
Hotel concierge + smart-lock flow + guest messaging + incident/fallback patterns.

### Operations Automation Bundle — $249–$499
Invoice/PO matching + inventory reorder + shipping quote routing + meeting-to-CRM.

### n8n Production Engineering Bundle — $199–$399
Sentinel reliability pack + error handling + idempotency + DLQ + observability patterns.

### Creator Automation Bundle — $199–$399
FreeFlow Media Factory commercial edition + approved creator workflows + content QA/release gates.

## Service SKUs

- Installation/configuration: $500–$1,500
- Business-specific customization: $1,500–$5,000+
- Managed maintenance/support: $99–$499/month
- Agency white-label license: price separately after licensing/provenance review

## Required package contents for every paid workflow

1. `workflow.json`
2. `README.md` with outcome-first positioning
3. `QUICKSTART.md`
4. `DEPENDENCIES.md` with every paid/free external service
5. `.env.example` and credential map with no secrets
6. `TEST_MATRIX.md`
7. `SUPPORT.md`
8. `LICENSE.md`
9. screenshots / architecture diagram
10. demo input + expected output
11. version compatibility statement
12. release receipt containing commit SHA and validation evidence

## Release states

- `DONOR_ONLY` — reference material; never sell
- `REBUILD_REQUIRED` — capability selected, clean-room implementation pending
- `PACKAGE_REQUIRED` — implementation can be commercialized after packaging
- `E2E_REQUIRED` — package exists; provider sandbox/live-safe verification pending
- `SELLABLE` — all commercialization gates passed
- `PUBLISHED` — listed in one or more approved sales channels
