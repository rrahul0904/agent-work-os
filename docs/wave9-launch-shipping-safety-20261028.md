# Wave 9 — production shipping safety correction

The existing local acceptance contract set `preview.required=false` and `production.required=false`, yet the Shipping Supervisor emitted `SHIPPED`, set `deployedSha=testedSha`, and created a production receipt. This was a **false release claim**, a launch P0.

## Corrected behavior

- Test-only/no-production contracts produce terminal `VERIFIED_ONLY` with a tested Git SHA, **no deployed SHA, no release receipt** and no claim of a deployment. Worktree cleanup still occurs.
- Production-required contracts **fail closed before creating a worktree or running a shell command**, unless the operator explicitly configures `AGENT_WORK_OS_ALLOW_PRODUCTION_DEPLOYMENT=true` and sets `AGENT_WORK_OS_PRODUCTION_HOSTING_TARGET` to one of `aws`, `oci`, or `onprem`.
- Even with opt-in, a production contract must require preview UAT and exact tested-versus-deployed commit checking; otherwise it fails with `BLOCKED_PRODUCT_DECISION`.
- Account-authenticated production shipping requests require owner/admin membership. Regular members and viewers cannot submit protected production launches.
- Local `npm run acceptance` now checks evidence for a verified-only candidate and asserts the absence of a deployed SHA and release receipt.
- `VERIFIED_ONLY` is terminal for restart reconciliation and activity counters, not a perpetual active deployment.

This is a **minimum protection against accidental production execution**, not blanket permission to deploy. An operator environment variable is a coarse-grained authorization control; it is **not** equivalent to per-run human approval, signed release evidence, or independent QA. Do not set it in a public deployment before implementing those controls.

## Account signup safety

Production public registration is **disabled by default**. Provision initial trusted accounts only when a security operator deliberately enables `AGENT_WORK_OS_PUBLIC_REGISTRATION_ENABLED=true`, then turn it back off; the browser hides its signup control when registration is disabled. This is not a replacement for invitation-based onboarding, email verification, password recovery, anti-bot controls and SSO. Do not enable public registration for a general launch without those controls.

## Outstanding launch gates — NO-GO

1. Build a true per-run human production-approval service with explicit actor identity, exact SHA, expiry, authorization policy, revocation and tamper-evident database audit. Protect the action at the executor, not just the browser.
2. Run real preview and production UAT with independent reviewer approval; prevent self-certification. Final `SHIPPED` must be tied to independently verified deployment and live health, not just commands that exit zero.
3. Clear Token Intelligence's full-repo dependency audit issue #80 and history secrets scan issue #82.
4. Verify model policies, privacy/retention/residency, real provider execution, global quotas and reconciliation.
5. Complete account signup verification/recovery, organization portfolio persistence, usability/accessibility, real browser UAT and approved hosting configuration.
6. Test backup/restore and rollback, incident response and observability.

The code is intentionally stacked on Wave 8 draft PR #388; no production deployment or merge has been authorized.
