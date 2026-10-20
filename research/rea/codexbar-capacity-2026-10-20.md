# REA intake: CodexBar → read-only provider capacity observations

**Captured:** 2026-10-20 | **Classification:** DONOR / MODULE | **Canonical owner:** `rrahul0904/agent-work-os` | **Issue:** #316 | **Related canonical provenance rule:** #69

## Primary evidence / provenance

| Evidence | Finding |
|---|---|
| https://www.reddit.com/r/BestGitHubRepos/s/5EU4SAQPj8 | Reddit post resolves to CodexBar; published stars/release metrics are a snapshot, not an invariant. |
| https://github.com/steipete/CodexBar/commit/92acf2eac671ef172b1509abaa0487786aa1c3a7 | Inspected upstream default-branch HEAD on 2026-10-20. |
| Upstream `README.md`, `docs/architecture.md`, `docs/provider.md` | macOS menu bar, Linux desktop and CLI; descriptor/fetcher → shared snapshots → native menus/widgets and CLI. |
| Upstream `docs/dashboard-api.md`, `docs/cli.md` | `codexbar dashboard --identity redacted` is a one-shot, versioned schema-v1 JSON contract. Optional server is bearer protected; raw HTTP is not TLS. |
| Upstream `docs/providers.md`, `docs/refresh-loop.md` | 106 registered provider IDs at inspection, not 106 individually certified integrations; cookie/API/OAuth/CLI/local sources, adaptive refresh, stale/error projection and estimated cost semantics. |
| Upstream `LICENSE` | Repository root MIT © 2026 Peter Steinberger; third-party components/assets require separate review. |
| Owned `rrahul0904/agent-work-os` README and #69 | Local daemon already collects normalized agent usage; existing quota/reset/incident provenance donor, planned budgets and cost telemetry. |

### What we can establish

CodexBar is a developer-facing per-provider quota/status/spend observer. The core is in Swift with shared fetchers, parsers, provider descriptors and account-aware caches. The same observations drive native UI, CLI JSON and dashboard. Different providers can use OAuth, API tokens, browser sessions, CLI probes or status websites. Session, weekly and model-specific windows must retain individual identity, freshness and uncertainty. Cost reports may be locally estimated, partial, unpriced or denominated in multiple currencies, not necessarily a billing receipt.

### What we cannot establish from public docs

Runtime success of every registered provider or auth method; upstream adherence to every provider's terms; real quota accuracy on the user's accounts; identical desktop parity across platforms; mobile app parity; reliability of private/undocumented APIs; production readiness of any integration into our supervisor.

## Decision: extend existing Agent Work OS, don't clone

Owner is **Agent Work OS provider-capacity observation**, not a standalone CodexBar clone. Retain #69 as the canonical semantics for `QuotaWindowObservation` / `OperationalAllowanceEvent`. These are distinct from credit/reset news or official provider entitlements.

```text
Provider CLIs / OAuth / APIs / status / local usage logs
  → [CodexBar: upstream-owned strategies and refresh]
  → documented `codexbar dashboard --identity redacted` (local-only, future opt-in)
  → [our separate, pure dashboard-v1 projection]
  → identity-free, source-labeled third-party observations
  → [future #69 provenance reconciliation + dashboard]
  → [future human-reviewed advisory, never automatic authority]
```

We use a documented output contract and independently authored code. No upstream app source, icons, cookies or private API snippets are incorporated.

## Delivered P0 slice (branch: research/rea-codexbar-capacity-20261020)

- `runtime/daemon/src/codexbar-capacity.js`: independent, deterministic schema-v1 projection, no network/CLI/auth side effects.
- `runtime/daemon/test/codexbar-capacity.test.js`: six synthetic Node tests covering stale, unknown/invalid values, exhausted/low, status incident, privacy/account separation and schema mismatch.
- Local check: `node --test runtime/daemon/test/codexbar-capacity.test.js` — six tests passed in staging; **full owned-repository CI must still be independently verified**.
- Output label `evidenceType: third_party_observation`; `observation` is **display-only**. It must NOT automatically authorize dispatch, paid spend, account switching or provider credentials access.
- Top-level provider row represents CodexBar's selected/ambient account; optional inactive `accounts[]` are **not pooled**.

## Shipping gates / actionable implementation backlog

**P0 — research & normalization:**
- [x] Canonical link, license and SHA provenance; provider source/architecture investigation.
- [x] Schema-v1 pure projection with deterministic tests and identity minimization.
- [ ] Inspect draft PR CI and run root `npm test`; run independent security and replay review.
- [ ] Enrich synthetic fixtures: two simultaneously active quota lanes, idle model lanes, stale provider inside a fresh snapshot, 0 vs unknown, future timestamps, schema drift, enabled/disabled, source errors, multi-account and partial costs.

**P1 — opt-in machine-local acquisition (NOT YET IMPLEMENTED):**
- [ ] Obtain explicit user opt-in before reading local CodexBar installation; support absent CLI cleanly.
- [ ] `spawn/execFile` with fixed `codexbar dashboard --identity redacted --timeout 15` argv, no shell, sanitized environment, no provider credentials passed.
- [ ] Bound wall time, output bytes, concurrency and refresh rate, cancel process trees; parse JSON schema exactly; redact logs and discard payload fields not in owned contract.
- [ ] Missing CLI, nonzero exit, auth prompt, invalid JSON, excessive size, schema drift, stale/unknown → UNKNOWN observation; never silently imply capacity.

**P2 — operational evidence (#69) (NOT YET IMPLEMENTED):**
- [ ] Source-linked provenance with source class, observation vs retrieval timestamp, TTL and scoped account/machine identifiers.
- [ ] Tenant boundary and replay-safe storage, read-only status dashboard, human refresh button and data-quality notices.
- [ ] Keep official incidents, third-party quota observations and local cost estimates separate; no price cross-currency addition.

**P3 — optional routing intelligence (NOT YET IMPLEMENTED):**
- [ ] Advisory only: allowed providers/models, status, freshness, user-approved budget, account scope, and manual gate for ambiguous evidence.
- [ ] Fail-closed decision tests and receipt-backed end-to-end verification against real **opt-in** local snapshots.
- [ ] No autonomous account switching, credentials read, paid action, external writes, push, merge or deploy from this donor.

## Privacy, security and license guardrails

The cloud API must never read or request browser cookies, Keychain secrets, provider auth files, or personal account identifiers. Even CodexBar's own dashboard default can expose emails, so its redaction flag is mandatory for future acquisition, followed by independent field allowlisting. Its optional `serve` route is HTTP, so do not expose directly over LAN or insert tokens in query strings. Stable timestamps/freshness and unknown states prevent stale cached quota or scheduled reset estimates from becoming false authority.

**Non-claims:** no native clone, no user installation, no live provider query, no macOS/Windows/mobile releases, no deploy, no integration into runtime event loop, no dispatch decision certification.
