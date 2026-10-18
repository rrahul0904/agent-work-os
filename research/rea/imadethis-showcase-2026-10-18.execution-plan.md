# REA execution manifest — 2026-10-18 IMadeThis multi-product intake

Issue: https://github.com/rrahul0904/agent-work-os/issues/290

This is a proposed agent runbook, **not proof any executor has run**.

## Ordered bounded jobs
1. **REA-0 Source refresh:** permitted public Reddit HTML current comment list; normalize product URL; append newly visible products; preserve first snapshot and drift. Gate: no authenticated bypass, dedupe evidence.
2. **REA-1 LaunchOrbit capture:** public site routes, breakpoints/screens, negative states, pricing/current policy, manual interactions if permitted; log timestamped evidence. Gap compare to LaunchGrid source.
3. **REA-2 ScoutWand capture:** public site/FAQs, public installer manifest only with explicit approved artifact inspection; note job-board ToS. Compare ApplyAI extension and local permission model. No attempt to log into accounts.
4. **REA-3 MessyNote capture:** public site, unauthenticated interactive demo if available, and privacy/voice disclosures; compare Work OS task/notes service. Do not create accounts/purchase without authorization.
5. **REA-4 Specification review:** acceptance matrices, assumptions and conflicts, third-party license provenance, privacy/threat models for each.
6. **OWNER-BUILD LaunchGrid:** create separate **feature** branch from current main after code audit; implement visual discovery in bounded increments with seed fixtures and tests.
7. **OWNER-BUILD ApplyAI:** implement allowed-surface guided field-fill in existing extension and optional desktop companion only after policy/security design and synthetic form test corpus.
8. **OWNER-BUILD Work OS:** implement ThoughtSpec schema, idea capture/clarify/note and gated PRD/task conversion with no implicit writes.
9. **EVAL:** independent test reviewer across functional correctness, model/schema safety, accessibility, third-party ToS, data minimization, security, load, misuse; exact SHA and test-command receipts.
10. **REPLAY / SHIPPING:** compare against dated public behavior/evidence; retain known deviations; approve staging through Shipping OS; roll back on negative evidence; no merge/deploy by default.

## Stop conditions
- Private content or restricted API would be needed;
- Third-party ToS forbids planned integration;
- License/copyright cannot be established;
- Sensitive applicant/user data would leave permitted boundary;
- No approved credential for external service;
- Test or reproducibility receipt missing; checkout or publishing would be irreversible.

## Definition of 95% product completeness (not achieved)
For each owner lane: >=95% of **approved, observable and testable scope** passes independently run acceptance cases; each unresolved external blocker is explicit; do not count inaccessible proprietary internals as passed. 95% is a target, not an assertion of vendor parity. Production requires 100% completion of critical privacy, authorization and no-unauthorized-write safety gates.

## Receipt template
```json
{
 "project": "owner-repo",
 "source_url": "public URL",
 "evidence_snapshot_id": "sha256",
 "owner_repo_head_sha": "40-char git sha",
 "tool_versions": {},
 "test_commands": [],
 "results": {"passed": 0, "failed": 0, "skipped": 0},
 "screenshots": [],
 "approved_observed_scope_pass_ratio": null,
 "critical_safety_gates": "PASS|FAIL|UNVERIFIED",
 "shipping_decision": "HOLD",
 "reviewer": null,
 "created_at": "RFC3339"
}
```
