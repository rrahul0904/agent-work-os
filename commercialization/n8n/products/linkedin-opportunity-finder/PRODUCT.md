# Authorized Social Opportunity Radar
SKU: `N8N-SALES-002`
Status: `PACKAGE_REQUIRED`
Legacy catalog slug: `linkedin-opportunity-finder`

## Promise
Rank **customer-authorized social/opportunity records** against configured topic/intent rules and return a deterministic human-review queue. The base commercial edition is source-agnostic and performs no scraping or automated engagement.

## What ships
- Clean-room core-node n8n workflow.
- Explicit `authorizationConfirmed=true` guard.
- Maximum 100 input records/request and 25 configured keywords.
- Deterministic keyword/intent scoring, stable ordering and 50-result cap.
- Evidence URLs retained only as metadata; URL presence never creates an opportunity score.
- `humanReviewRequired=true` and `automatedEngagement=false` enforced in base output.
- Deterministic tests, demo fixtures, support/compatibility/architecture/provenance/license documentation.

## What does not ship
- Historical Apify/profile-scraping workflow.
- Browser automation, credential scraping, automated comments/messages/posts/connections or impersonation.

## Target price
- Workflow Kit: **$49**
- Intent Radar Pack: **$149**
- Installation/customization: from **$1,000** through direct service channels.

## Current release gate
Clean-room authorship/license: PASS. Deterministic tests: PASS locally. Remaining gate is exact-source-blob certification and n8n 2.43.5 import on the central release runner, followed by the exact-SHA `GO` receipt. Do not publish or accept payment until state is `SELLABLE`.
