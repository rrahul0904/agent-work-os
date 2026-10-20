# REA Intake — Digital Footprint Cleanup (2026-10-20)

**Issue:** #324 · **Reddit:** https://www.reddit.com/r/SATNA_PROJECT/comments/1xatjuy/ · **Author:** u/ZookeepergameMost817 · **Source type:** article/workflow graphics, **not** a released app or source-code repository.

**Canonical disposition:** BEHAVIOR/WORKFLOW DONOR to `rrahul0904/agent-work-os` (governed privacy action case template); **no standalone Agent OS or REA clone.** Consumer product boundary remains unvalidated; no new implementation repo or invented RE tracker ID. Our REA is a reverse-engineering investigation provider; do not conflate it with the Reddit post's unexplained claims about an “REA” data-sharing tracker.

## Source provenance / rights

- Short link: https://www.reddit.com/r/SATNA_PROJECT/s/DzWURUVUZb
- Source title: “A practical digital-footprint cleanup workflow—with AI prompts for organizing the work”.
- Observed publicly accessible first-pass text (October 20, 2026); no substantive comments were visible at initial inspection, so community sentiment is UNKNOWN.
- The posted graphics and prose have no identified software license. **No upstream code, upstream Git SHA or functional production runtime was found.** Do not rehost images, lift third-party prompts or claim behavioral parity. Conceptual workflow, independently authored code and cited public evidence only.
- The post itself cautions against guarantees of total removal, universal legal rights, uploading sensitive IDs/passwords, automatic sending, or inferring what companies hold personal records from tracker detections.

## Source-evidence ledger

| Evidence level | Fact / claim | Boundary |
| --- | --- | --- |
| OBSERVED | Suggested inventory of search results, data brokers, older accounts, contact disclosures and breaches | Proposed human workflow in public post, not a tested crawler |
| OBSERVED | Drafting requests, choosing deletion vs opt-out, recording receipts, reviewing subsequent visibility | Suggested workflow, not observed software |
| OBSERVED | Post warns deletion rights/deadlines vary and external submissions need user authorization | Article's textual caution |
| UNKNOWN | Product/source code, runtime behavior, success rate, identity-resolution accuracy, provider integrations and security | No app/source in linked post |
| INFERRED | Durable case state and scoped approvals would improve auditability | Owned design; not a source feature |
| VERIFIED LOCAL | Original offline Node 22 synthetic reducer and tests | No network, real identity, real sent requests or production proof |

## REA reconstruction: MATCH / IMPROVE / NEW / OMIT

| Disposition | Work |
| --- | --- |
| MATCH | Case inventory, request classification, deletion/opt-out/account/security tasks, drafts, acknowledgements, follow-ups and visibility review |
| IMPROVE | User attestation distinct from identity verification; current-revision approval; idempotent versioned commands; no promotion of acknowledgements into deletion claims; evidence refs, synthetic fixtures |
| NEW | Clean-room state reducer; hash-chain/replay comparison; per-case draft fingerprint; explicit `NOT_VISIBLE_OBSERVED`; eventual governing Agent Work OS approvals and retention/purge |
| OMIT | Bulk scraping of people, unauthorized account lookups, impersonation, auto-sending, CAPTCHA bypass, credential or ID collection, invented legal rights/deadlines, claim to know all data recipients |

## Current competitor / official workflow audit

- **Official CalPrivacy DROP:** https://privacy.ca.gov/DROP/ and https://cppa.ca.gov/data_brokers/ . California's official consumer deletion process already exists; registered data brokers began recurring processing August 1, 2026. Do not impersonate or automatically submit to state portals. Actual eligibility depends on resident status and current terms.
- **JustDeleteMe:** https://github.com/jdm-contrib/jdm . Community-maintained links/instructions for account deletion, MIT repository; any code/data import needs separate license/source/freshness verification.
- **Have I Been Pwned:** https://haveibeenpwned.com/api/v3 . Breach service, not a guarantee of safety; authenticated APIs, permission/use/rate and attribution requirements. No emails sent to this or any other provider in this implementation.
- **DeleteMe / Optery / Incogni:** existing commercial personal-information removal category; benchmark UX/case coverage only after independent evidence audit, do not assume their internal methods or interoperability.

## Owned contract (not source-code parity)

`PrivacyCase`: opaque IDs, category, jurisdiction enum, source hostname and evidence ref, exact version/state. `RequestDraft`: request type, channel hostname, official policy evidence ref (not authenticated as official in prototype), revision and digest. `Approval`: revision digest and reference (currently synthetic actor only). `ManualSubmissionEvidence`: reference only, not a real effect receipt. `VisibilityObservation`: public manual observation, not backend deletion. `CaseEvent`: command ID, expected version, parent/event digest.

Pure transition chain:

```
NEEDS_SUBJECT_ATTESTATION -> SUBJECT_ATTESTED -> DRAFTED -> APPROVED
    -> SUBMISSION_RECORDED -> ACKNOWLEDGED -> NOT_VISIBLE_OBSERVED
                            \-> FOLLOWUP_DUE <---- listing reappears
```

All `record_*` actions are **offline annotations**; no live browsing, authentication, deletion, requests, email or external mutations. Current `actor:subject` is a simulated declaration, not an authenticated consent grant. Digest chain offers deterministic tamper comparison, not cryptographic signatures or trusted provenance. Reject external use until custody and auth are integrated.

## Verification, threats and honest gate states

Local Node 22 test scope: unknown extra fields and many raw identifiers, missing attestation, wrong actor, changed drafts/revoked prior approvals, wrong digest, stale version, conflicting duplicate command, cross-case digest, observation vs backend deletion, replay and snapshot tamper.

Remaining adversarial tests: authenticated subject identity, link-domain verification, malicious URL/SSRF, forged confirmations, replay after persistent restart, multi-tenant isolation and deletion, misleading source data, provider outage/rate limits, jurisdiction-specific rights, contact-data leakage, unsafe automated browser actions and user revocation mid-flight.

| Canonical phase | Verified truth |
| --- | --- |
| Source / evidence / ownership | First-pass source identity, no donor code, research boundaries |
| Reconstruction + clean-room spec | Written and prototype contract |
| Implementation | Isolated offline synthetic Node 22 reducer ONLY |
| Unit tests | 12 locally passed; verify GitHub branch and CI at exact SHA separately |
| Authenticated real integration / privacy legal review | NOT STARTED |
| Real client/user UAT | NOT STARTED |
| Independent exact-SHA CI | NOT YET VERIFIED |
| Merge / preview / deploy / certify | NO / NO / NO / NO |

## Next governed actions

1. Obtain true Agent Work OS approval and evidence API contracts; replace simulator actor labels with authenticated case-owner and exact-action grant checks.
2. Add encrypted case persistence, tenant scoping, granular retention and trustworthy signed immutable receipts; design user-controlled deletion including backup/log retention.
3. Validate legal process and official domains per jurisdiction, plus provider permissions and applicable privacy laws, before connector prototypes.
4. Add isolated manual case walkthrough with synthetic fixtures, negative scenarios and restart/rollback tests; independent review and exact-head CI receipts.
5. Reconcile canonical RE tracker ID only after deduplication. Do not advance to SHIPPING-CONTRACT-CERTIFIED or SHIPPED on unit tests alone.
