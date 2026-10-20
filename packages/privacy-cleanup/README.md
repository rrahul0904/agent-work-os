# Privacy Cleanup Workflow Pack (REA Research Prototype)

**Status:** OFFLINE SYNTHETIC PROTOTYPE; NOT a deployed privacy removal service; NOT integrated with the Agent Work OS control plane; NOT externally security-audited.

An original, clean-room, pure Node 22 state reducer demonstrating consent-gated cleanup cases. No networking, browser automation, search, scraping, email transmission, account login, account deletion, legal-rule engine, identity verification integration or real provider connection.

Reference: intake issue #324 and `research/rea/digital-footprint-cleanup-2026-10-20.md`.

## Run

```sh
node --test packages/privacy-cleanup/test/*.test.js
```

Synthetic identifiers only. **Never put names, emails, phone numbers, screenshots, identity documents, passwords, confirmation tokens or personal URL paths in Git or case metadata.** Opaque refs must not contain private data even when syntax validation passes.

## Pure case states

`NEEDS_SUBJECT_ATTESTATION -> SUBJECT_ATTESTED -> DRAFTED -> APPROVED -> SUBMISSION_RECORDED -> ACKNOWLEDGED -> NOT_VISIBLE_OBSERVED`, including `FOLLOWUP_DUE` and revising approved drafts.

- `ATTEST_SUBJECT`: self-attestation, **not** actual identity verification.
- `DRAFT_REQUEST`: request-type, policy evidence and hostname references; hostname **not verified official domain**.
- `APPROVE_DRAFT`: case/revision-bound simulator approval. `actor:'subject'` is an *untrusted string*, **not** an authenticated user or production grant.
- `RECORD_SUBMISSION`: records a manual claim and never transmits a request; it is **not independent evidence of delivery**.
- `RECORD_RESPONSE`: acknowledgement/decline are distinguished from deletion.
- `RECHECK_VISIBILITY`: reports current human-observed visibility only. `NOT_VISIBLE_OBSERVED` **does not prove legal deletion, backend erasure, permanence or absence of retained records**.
- Replay and SHA-256 chaining are deterministic but **not authenticated signatures**. A malicious custodian could rewrite both events and hashes.

Every command has an idempotency key and expected version. Unexpected fields are rejected. Input syntax validation is **not sufficient personal-data protection**.

## Future authorization / production gates

Authenticated subject binding; consent with exact scoped revocable grants; official recipient verification; jurisdiction-specific current legal guidance; encrypted tenant-scoped persistence; controlled evidence storage and retention; authorized purge including backups/logs/embeddings; privacy risk review; local-first user consent for breach checks; provider API/ToS/license/rate limits; security and accessibility review; comprehensive integration and adversarial testing; signed immutable receipts; independent UAT; exact-head CI; Shipping OS approval.

**No merge, preview, deployment or real personal-data processing is authorized by this prototype.**
