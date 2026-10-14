# AP MatchFlow — Invoice to PO Automation

SKU: `N8N-FINOPS-001`
Status: `E2E_REQUIRED`

## Promise
Ingest vendor invoices, match them against purchase-order data, score/route mismatches, and produce an auditable exception queue instead of manual line-by-line reconciliation.

## Buyer
- SMB finance teams
- accounts-payable teams
- accounting/automation consultants
- fractional CFO operations

## Editions

### Workflow Kit — $99
- n8n workflow export
- credential/config map
- sample invoice + PO data
- matching rules guide
- exception-path runbook
- test matrix

### Business Pack — $249
- everything in Workflow Kit
- configurable tolerance rules
- approval routing pattern
- notification templates
- deployment runbook
- observability/error handling guide

### Implementation — from $1,500
- install and configure
- connect customer-owned provider accounts
- map one invoice source and one PO source
- run sandbox/test records
- handoff documentation

## Required release gates

- provenance/license pass
- secret scan
- clean import into supported n8n release
- deterministic sample-data tests pass
- duplicate/idempotency behavior verified
- mismatch and malformed-input paths verified
- provider sandbox E2E test performed before claims of live-provider readiness
- no accounting/compliance guarantee language
