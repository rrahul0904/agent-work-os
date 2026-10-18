# REA intake — Drexius Terminal → governed remote SSH/SFTP access

**Snapshot:** 2026-10-18 ET
**Owner:** Agent Work OS / REA
**Classification:** DONOR / EXTENSION to existing rrahul0904/agent-work-os, not a standalone product repository
**Governance:** https://github.com/rrahul0904/agent-work-os/issues/297
**Related owned lanes:** #265 (Open Machine, machine-provider and SSH lane), #267 (Agent Execution Fabric), #29 (NodeTerm, terminal canvas), #99 (Agent Workbench).

## 1. Source chain and licensing

- User-supplied Reddit share: https://www.reddit.com/r/saasbuild/s/A0vDcwRbEE
- Resolved post: https://www.reddit.com/r/saasbuild/comments/1x9canl/
- Public author: u/RUSTOFUS
- Upstream: https://github.com/DreyDreamer17/drexius-terminal
- **Inspected Git commit**: master bc6a226a23942f0c5bc1fd4a7bacb282a8b7f88d, observed 2026-10-18 18:59 UTC.
- Docs read: README.md, ARCHITECTURE.md, docs/SECURITY.md, LICENSE, source directory index.
- Product demo: https://dreydreamer17.github.io/drexius-terminal/ — *simulated browser preview*, not a native SSH runtime.
- Public beta: v0.1.0-beta.1, upstream advertises Linux, macOS, Windows and Android installers.
- License: GPL-3.0-or-later (verified README + LICENSE). Product name, official logos, artwork and identifier are reserved as proprietary marks.

**Provenance boundary:** This issue, policy contract, tests and document were independently authored from public functional descriptions, general standards and Agent Work OS constraints. Do **not** reuse GPL implementation code, component/source structure, exact frontend layouts, app assets or marks in MIT Agent Work OS. A distributed product incorporating GPL code requires separate licensing/legal review.

## 2. Problem, users, differentiation, validation

**Job to be done:** Developer/operator opens secured multi-host terminal sessions, handles files, inspects Docker services, requests AI help and resumes remote work from owned devices without an obligatory third-party account.

**Target users:** individual developers, homelab operators, SRE/platform engineers, SSH-heavy engineering teams.

**User pain:** fragmented terminal and SFTP experiences, credentials/cloud sync concerns, subscriptions, memory consumption, cross-device friction.

**Public evidence:** a launch post, public repository/readme/security guide and beta installers. These are product availability evidence, NOT verified demand or an independent security assessment. Performance comparisons are upstream-reported and unreplicated. Public Reddit comments observed in the first snapshot are not a representative user-validation sample.

**Owned angle:** govern remote execution as another Agent Work OS capability tied to *work/session identity, explicit authority, receipt, replay, failure recovery*, rather than release an ungoverned SSH clone. Continue terminal canvas/Agent Workbench as the frontend owner.

**Standalone classification rationale:** Although Drexius itself is a separate end-user application, the user-requested portfolio has existing terminal, remote-machine and agent-execution lanes. A second portfolio SSH app would duplicate core session/control authority. For this intake, only the independent policy and provider capabilities are donors. Reconsider a standalone product only with new evidence for a nonoverlapping user/job, monetization and deployment boundary.

## 3. External feature and implementation evidence

| Surface | Public evidence | Confidence / caveat |
| --- | --- | --- |
| Rust/Tauri 2 + React 19 + xterm.js 6 | Upstream repository/docs | Confirmed described tech; no local binary execution |
| SQLCipher vault, Argon2id, opt-in OS keychain | README, ARCHITECTURE, SECURITY | Implementation claim; no crypto audit |
| SSH/TOFU + multihop, PTY streams | README, ARCHITECTURE | Described; no real host connected |
| SFTP graphical manager and transfer queue | README | Described; not benchmarked |
| Local PTY, serial UART, tunnel forwarding | README, ARCHITECTURE | Described; no device integration test |
| Device E2EE pairing and relay sync | README, ARCHITECTURE, SECURITY | Documented limitations: synced data survives revocation, group seed not rotated, LWW conflicts |
| Docker/Tailscale | README | Integration described only |
| OpenCode copilot and multi-provider AI | README, SECURITY | Claims deny-by-default policy; policy filter explicitly not a sandbox |
| Android / Linux / Windows / macOS | release docs | Advertised installables; platform UAT not performed |
| iOS / iPadOS | not in advertised release list | Not verified; classify as feasibility gap |

## 4. Trust boundaries / attack surfaces

User / agent -> Workbench UI -> control API -> **canonical Agent Work OS authority**
-> daemon-owned remote-access policy (P0) -> local identity handle / SSH provider (future)
-> remote host / SFTP filesystem / network tunnel (future)
-> bounded scrubber -> receipts / verification / Workbench projection.

**Rules:**
1. No SSH network traffic, filesystem touches, shell/PTY, local keychain access or credentials in P0.
2. A remote host must already be manually enrolled in trusted daemon policy; changed or unknown fingerprint fails closed. Never auto-accept a key.
3. Read/connect vs write/exec/tunnel are separate scopes; expiry must be checked at time of use.
4. High-impact intent needs an approval tied to *request + actor + host + action + resource*. Provider must enforce one-time/idempotent use and revalidate after restart.
5. Agent-generated arbitrary shell commands, dynamic executable arguments, arbitrary endpoint/port injection and dynamic SFTP roots are never policy-authoritative.
6. Do not interpret terminal output as instructions, tool policy, or model system prompt. Treat all remote output as untrusted.
7. P0 lexical path boundaries are a preflight only; future SFTP provider MUST enforce realpath/symlink behavior and remote root authorization.
8. Keep secrets out of logs, telemetry, receipts and the WebView wherever possible; explicit UI entry is still a privileged boundary.
9. SSH provider, Docker controls and native companion cannot bypass existing approval/safety/shipping gates.
10. A remote access grant is not a production sandbox. Preserve isolated test hosts and explicit operator consent.

## 5. P0 deterministic implementation

Files:
- runtime/daemon/src/remote-access-policy.js
- runtime/daemon/test/remote-access-policy.test.js

Inputs:
- Untrusted intent has only IDs/action/observed server fingerprint and a single resource ID/path.
- Trusted daemon-owned policy contains enrolled hosts, verified pinned key, host action limits, expiring grants, exact command catalog, optional bounded SFTP roots/tunnel catalog, resource-bound approvals.
- Explicit evaluation clock allows deterministic verification.

Output:
- { allowed, reason, receipt }, a non-executing decision receipt with only request/host/principal/action and reason/time/allow flag.
- No command argv, raw paths, keys or fingerprints in returned receipt.

**No provider integration yet.** This code is not a credential manager, executable SSH/SFTP service, secure file transfer engine or host-key enrollment UI.

## 6. Next implementation stages

### P1 — explicit enrollment + daemon adapter
- Formal machine-capability schema and trusted persistent host table, no competing identity authority.
- Fingerprint verification ceremony; persist only on explicit user approval.
- Capability-feature gate default disabled; daemon action wiring with bounded args, timeouts and cancellation.
- Receipt ledger and idempotency; approval consumption transactions and stale-grant rejection.

### P2 — synthetic-host remote operations
- Disposable SSH fixtures with generated throwaway credentials and trusted host public keys.
- Verified SSH connect, host-key rotation failure, reconnect timeout, channel backpressure and cancellation.
- SFTP read/write root + remote canonical-path enforcement, symlink refusal, concurrency/transfers.
- Strict non-shell argv execution; deny/approve high-impact operations.
- No production hosts or real user credentials during validation.

### P3 — frontend/workbench
- Reuse Agent Workbench host/session projections, mobile read/review, clear reconnect state and trust warnings.
- Inspect Docker/Tailscale through provider grants; isolate remote logs/output as untrusted.
- Native macOS/Windows/Linux packaging separately tested; Android/iOS/iPadOS feasibility tracked separately.

### P4 — encrypted cross-device sync (optional)
- Evaluate product need before any pairing/relay build.
- Device identity, revocation and key rotation, conflicts, recovery, metadata exposure threat model.
- Never sync known-host trust as a substitute for each device's verification.

### P5 — evidence/ship
- Negative tests (unknown/changed keys, stale grant/approval, symlink/escape, endpoint pivot, malicious output).
- Cross-platform E2E smoke with synthetic hosts; verify binaries, tests, performance vs baseline on equivalent hardware.
- Independent security review, license review, exact SHA receipts and gated shipping.
- No automatic deploy, merge, remote execution, password sync or production host access.

## 7. REA outcome and proof status

- **DONE:** Reddit target identified; public source/docs/license inspected at pinned SHA; repository deduplication; issue #297; clean-room P0 policy implementation and deterministic tests committed on isolated branch.
- **PENDING:** executable test receipt, full repo CI, actual SSH/SFTP adapter, cross-platform builds/UAT, security audit, monetization or demand validation, live demo deployment.
- **Not claimed:** end-to-end shipped feature parity; production access, proven crypto, validated performance or secure sync.
