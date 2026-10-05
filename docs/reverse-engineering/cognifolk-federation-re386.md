# RE-386 — Cognifolk-inspired federation layer

Status: Phase A implementation slice
Snapshot: 2026-10-05
Canonical issue: #37

## Source boundary

Public inspiration only:
- https://www.reddit.com/r/SideProject/comments/1wykkf0/cognifolk_a_place_where_ai_agents_can_work_on/
- https://cognifolk.pages.dev/
- https://cognifolk.pages.dev/openapi.json

At the recorded Reddit snapshot there were no substantive visible comments to incorporate. This document does not invent feedback or private implementation details.

This is a clean-room extension of Agent Work OS. It does not copy Cognifolk branding, assets, private internals, hidden endpoints, proprietary prompts, source code or wording.

## Donor contract recovered

The useful product pattern is a network of independently operated agents that can discover one another and collaborate through explicit projects. Public API behavior exposes project roles, invitation/join flows, versioned shared documents with optimistic concurrency, decision history, and evidence-oriented task/claim workflows.

The social feed, referral mechanics and internal point economy are not required for the core value.

## Dedupe decision

Do not create a second orchestration product. Agent Work OS already owns local runtime/provider adapters, Shared Brain, decision memory, Operations Atlas, Shared Rooms, governed tools/routines and Agent Studio. RE-386 therefore adds only the missing cross-operator/federation contracts.

## MATCH / IMPROVE / NEW / OMIT

### MATCH
- local provider-neutral agents;
- named agents and capabilities;
- bounded room collaboration/delegation;
- project/work facts and decision memory;
- governed side effects.

### IMPROVE
- self-described agent profile -> evidence-verifiable capability card;
- project membership -> explicit cross-operator role grant;
- mutable shared doc -> immutable version receipts + optimistic concurrency;
- free-form decision -> append-only actor/document/evidence-bound receipt;
- reward claim -> later evidence-gated contribution claim with independent verification.

### NEW
- public/federated agent identity contract;
- cross-operator project invitations;
- portable project document/version ledger;
- contribution reputation derived from verified work;
- later authenticated node-to-node federation.

### OMIT / DEFER
- generic Reddit-like feed and karma as execution primitives;
- referral growth campaigns;
- internal currency before abuse/value rules exist;
- duplicate generic KV memory.

## Phase A: `federated-project/v1`

Phase A is intentionally domain-only. It makes no network calls and performs no shell, Git, deploy, provider or external-app writes.

Contracts implemented in `services/control-api/src/federation.js`:

- `FederatedAgentIdentity`: stable agent/operator binding, public metadata/capabilities, explicit unverified/verified state, revision digest, evidence-backed third-party verification receipt; profile mutation invalidates verification.
- `FederatedProject`: private/public project, single owner, maintainer/member roles, explicit one-time invitations, owner-controlled role changes/removal.
- `ProjectDocument`: public/team visibility, immutable versions, author agent/operator provenance, content hash + receipt digest, mandatory `baseVersion` match before every write.
- `ProjectDecision`: owner/maintainer-only append, project revision binding, immutable document-version references and evidence refs, deterministic digest.

## Threat model / negative gates

- a public profile or public project view grants no write/tool/runtime authority;
- an actor must present both the agent id and its bound operator id;
- an invitation must be accepted by the target agent itself;
- only owner/maintainer can invite, and only owner can promote/demote/remove;
- the owner role cannot be reassigned through Phase A APIs;
- team documents are invisible to nonmembers;
- removed members lose write/read access immediately;
- stale writers get `document_version_conflict`, never last-write-wins overwrite;
- persisted profile/document/decision receipt tampering is rejected on reload.

## Phase A acceptance scenario

1. Register owner, remote member and maintainer profiles.
2. Verify owner from a different operator using evidence refs; keep remote agent unverified.
3. Create private project.
4. Prove public discovery alone cannot write.
5. Explicitly invite/accept member and maintainer.
6. Owner creates document v1; member writes v2; owner writes v3.
7. Reject member's stale v2-based write.
8. Member rereads v3 and produces merged v4.
9. Maintainer records a decision bound to document v4.
10. Owner removes member; subsequent team read/write is refused.
11. Reload store and prove receipt/version digests remain stable.
12. Mutate persisted document bytes and prove reload fails digest validation.

## Later phases

- Phase B: bounded registry/discovery HTTP surface, portable signed/operator verification receipts, import/export bundles, revocation.
- Phase C: open work offers, evidence submissions, multi-agent split confirmation, review/appeal history and contribution reputation.
- Phase D: optional communities/follows that remain authority-free.
- Phase E: authenticated node federation/relay, live remote membership handshake, revocation propagation and browser/device UAT.

## Claims boundary

Phase A proves only the deterministic local federation-domain contract. It does not prove live cross-machine networking, Cognifolk compatibility/parity, public deployment, production hardening, economics, abuse resistance, remote identity authenticity, or end-to-end federation transport.