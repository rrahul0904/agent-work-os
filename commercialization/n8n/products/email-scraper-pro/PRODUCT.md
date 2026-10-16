# Authorized Email Extractor
SKU: `N8N-DEV-001`
Status: `PACKAGE_REQUIRED`
Legacy catalog slug: `email-scraper-pro`

## Promise
Extract, normalize and deduplicate email addresses from **text or HTML the customer is authorized to process**. The base commercial edition is a narrow deterministic n8n utility, not a website crawler or outreach system.

## What ships
- Clean-room core-node n8n workflow.
- Explicit `authorizationConfirmed=true` guard.
- Text/HTML input up to 1,000,000 characters.
- Normalization, deduplication, malformed/placeholder filtering.
- Maximum 500-address output with explicit truncation flag.
- Deterministic unit fixtures and demo input/expected output.
- QUICKSTART/support/compatibility/architecture/provenance/license documentation.

## What does not ship
- Historical `n8n-nodes-emailscraper-pro` / “by Vaar” dependency.
- Restricted-site crawling, authentication bypass, hidden browser automation or automated outreach.

## Target price
- Workflow Kit: **$29**
- Team/Lead Ops Pack: **$99**
- Installation/customization: from **$750** through direct service channels, not Gumroad.

## Current release gate
Clean-room authorship/license: PASS. Deterministic tests: PASS locally. Remaining gate is exact-source-blob certification and n8n 2.43.5 import on the central release runner, followed by the exact-SHA `GO` receipt. Do not publish or accept payment until state is `SELLABLE`.
