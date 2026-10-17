# Pocket IDE donor → Mobile Agent Workbench

Snapshot: 2026-10-07
Coordination issue: #59
Canonical tracker/source/product IDs: pending reconciliation

## 1. Source manifest

Primary launch:
- https://www.reddit.com/r/coolgithubprojects/comments/1wzyf7r/i_built_pocket_ide_an_android_ide_for_vibe_coding/

First-party source:
- https://github.com/rahilanw4r/pocket-ide
- inspected `main`: `a73dbd7535876a08886202d278c8fcb934239d2e`
- inspected release: `v1.0.37`
- license: MIT

Comparators:
- Acode: https://github.com/Acode-Foundation/Acode
- AndroidIDE: https://github.com/AndroidIDEOfficial/AndroidIDE (archived)
- Code on the Go: https://github.com/appdevforall/CodeOnTheGo
- Termux packages / PRoot: https://github.com/termux/termux-packages

## 2. Evidence classes

### First-party source / docs

Pocket IDE's public repository and README document a native Android/Jetpack Compose application with:

- projects/files/editor/terminal/Git/GitHub workflow;
- native/JNI process launch code;
- app-private PRoot Ubuntu userspace;
- local static/server preview;
- Android, JS/TS, Python, C/C++, PHP and shell tooling;
- AI provider/runtime bridges including Claude and Antigravity-facing code paths;
- credential-vault / Keystore-facing data code;
- runtime installer/setup/foreground execution services;
- workspace checkpoints;
- deterministic runtime-bundle/checksum/build scripts;
- tests around runtime configuration, provider parsing, memory bounds and local serving.

The README explicitly states that PRoot is not a hardened sandbox. It also states that AI-provider use can send source/context/tool output to external services. Preserve both boundaries.

### First-party release evidence

`v1.0.37` is useful failure evidence. Its release notes focus on:

- Android low-memory kills during toolchain/package setup;
- staged installation to reduce peak RAM;
- interrupted/network-dropped package operations;
- stale package-manager locks and partial configuration;
- explicit retry/recovery behavior.

Treat these as product requirements for mobile execution truth rather than incidental bugs.

### Reddit feedback

The exact launch thread contains skepticism about differentiation from Termux + Vim/Neovim + coding-agent CLIs. The author concedes that the present practical advantage is mainly an integrated project UI plus inline preview and says the intended direction is a better mobile workflow, not merely a GUI over a terminal.

A commenter also challenges the meaning of “37 successful builds” because many versions were rapid incremental releases. Therefore release/version count is not independent product-validation evidence.

## 3. Reconstructed workflow

Observed intended flow:

`create/open project -> inspect files -> edit -> terminal/agent -> run/build -> local preview -> inspect Git changes -> commit/push`

Mobile-specific hidden work underneath that flow:

`device capability check -> runtime/toolchain readiness -> process launch -> foreground/background survival -> output/port health -> interruption recovery -> storage/memory cleanup`

The second line is where a truthful product must improve materially.

## 4. Capability / failure decomposition

### Product capabilities

1. project/workspace discovery;
2. file/editor experience;
3. shell/terminal process execution;
4. local userspace/toolchain provisioning;
5. Git/GitHub operations;
6. web preview/service detection;
7. Android build/install lane;
8. AI-agent/provider lane;
9. background execution/notifications;
10. checkpoint/recovery;
11. settings/secrets/provider configuration.

### Failure modes to design for

- unsupported architecture / Android version;
- insufficient RAM or storage;
- Android LMK/process death;
- foreground service/background restrictions;
- interrupted package installs and stale locks;
- partial runtime/toolchain state;
- network loss during setup/provider calls;
- preview process spawned but not healthy;
- port collision / stale preview identity;
- local process disappears while UI still says running;
- source changes while a build/preview is in flight;
- Git work based on the wrong source/worktree identity;
- provider errors misclassified as authentication failures;
- credentials leaking into logs/receipts;
- PRoot treated incorrectly as a security sandbox;
- mobile thermal/battery/resource pressure;
- UI keyboard/inset/orientation disruption during terminal/editor work.

## 5. Competitive comparison

### Acode

Acode already covers Android editing, instant browser preview, JS console, S/FTP, SSH terminal integration, a built-in Alpine terminal and a large plugin ecosystem. Editor + terminal + preview alone is not defensible differentiation.

### AndroidIDE / Code on the Go

AndroidIDE demonstrated full Gradle Android development on-device but is archived. Code on the Go is the active successor and runs real Android builds on-device with a bundled Termux toolchain. Its public guidance explicitly publishes Android/CPU/RAM/storage/AGP compatibility limits. We should adopt that honesty and make capability preflight machine-readable.

### Termux / PRoot

Termux is already a strong low-level developer environment. PRoot supports a non-root userspace model but is not itself a hardened isolation boundary. Rebuilding these primitives without a product-level advantage is wasted scope.

## 6. Internal donor / dedupe audit

Canonical destination: `rrahul0904/agent-work-os`.

Existing foundations to reuse:

- control plane + authenticated local daemon;
- machine capability/heartbeat state;
- provider-neutral agent adapters and durable sessions;
- local-repository credential boundary;
- work/evidence/review/approval branches;
- browser/mobile operator direction;
- Shipping OS isolated worktrees, deterministic verification, bounded repair, restart truth and exact-SHA release receipts.

Do not create a standalone Pocket IDE clone.

## 7. Product thesis

Build **Mobile Agent Workbench**: a phone-native development/operator surface that preserves proof-bearing work identity across a phone and full development machines.

The differentiated loop is:

`open project on phone -> preflight device -> choose local_mobile or known Agent Work OS machine -> edit/ask/run -> health-backed preview -> inspect evidence -> hand off exact workspace/source/session state -> verify -> continue from phone or desktop`

Heavy execution should be able to move to an existing developer-owned machine rather than forcing every compiler/toolchain into the phone.

## 8. MATCH / IMPROVE / NEW / OMIT

### MATCH
- projects/files/editor;
- integrated terminal;
- Git status/diff/commit;
- local preview;
- AI coding-agent access;
- background task UX;
- visible runtime/toolchain setup.

### IMPROVE
- machine-readable resource/capability preflight;
- deterministic interruption/recovery semantics;
- exact run/source/workspace receipts;
- local-vs-remote execution lane is explicit;
- preview requires health evidence;
- secret references remain outside receipts;
- truthful device compatibility matrix;
- independent verification before completion.

### NEW
- `mobile-workbench/v1` domain contract;
- local and remote execution targets under one workspace identity;
- device capability digest;
- resource budget contract;
- preview provenance receipt;
- local→remote handoff receipt and remote→mobile review continuation;
- mobile attention state for input/approval/interruption/resource refusal.

### OMIT / DEFER
- donor branding/assets/UI trade dress;
- donor runtime copied byte-for-byte;
- unrestricted shell/network/package installation;
- treating PRoot as a security sandbox;
- kitchen-sink toolchains in the first native slice;
- native iOS/iPadOS/macOS claims;
- parity/readiness claims from version count.

## 9. Phase A behavior contract

Phase A is deliberately side-effect-free and platform-neutral. It proves the truth model before a native Android shell.

### `MobileDeviceCapability`

- platform + platform version;
- architecture;
- available memory/storage;
- declared toolchains/capabilities;
- stable capability digest.

### `ExecutionTarget`

- `local_mobile` or `agent_work_os_machine`;
- remote lane requires a known machine/session identity and matching capability.

### `MobileWorkspaceRef`

- project/workspace/worktree/session refs;
- cwd/root;
- exact source SHA/digest where available.

### `ResourceBudget`

- bounded memory/storage/runtime/network policy;
- deterministic preflight result and refusal reason.

### `MobileRun`

States:
`queued -> starting -> running -> needs_input|blocked|interrupted|failed|completed`

Invariants:
- process disappearance/restart never fabricates completion;
- `completed` requires independent verifier evidence;
- terminal state cannot silently regress;
- replay/duplicate transition must be deterministic.

### `PreviewReceipt`

- exact run/workspace/source identity;
- local port/URL;
- positive health evidence;
- spawn/listen without health is not preview-ready.

### `HandoffReceipt`

- source/destination execution identities;
- exact workspace/source digest;
- unresolved state and evidence refs;
- does not claim live-process migration.

## 10. Phase A acceptance / negative tests

1. unsupported architecture fails closed;
2. insufficient memory/storage refuses local execution;
3. missing/unhealthy runtime refuses local execution;
4. simulated process loss reconciles to `interrupted`;
5. stale/duplicate transitions are rejected or idempotent by exact key;
6. preview without health evidence is not ready;
7. preview/workspace identity mismatch is rejected;
8. handoff source digest mismatch is rejected;
9. secret-like literal fields are refused from persisted receipt payloads;
10. remote execution requires a known capable machine identity;
11. completion without independent verifier evidence stays unverified/not-complete;
12. canonical digests are stable across object-key ordering.

## 11. Implementation phases

- **A — domain truth**: contracts + deterministic tests only.
- **B — remote lane**: bind existing Agent Work OS machine/session/work truth and responsive mobile operator UI.
- **C — native Android shell**: Kotlin/Compose project/editor/terminal/preview surface with device preflight.
- **D — bounded local runtime**: evaluate direct Termux-style toolchain vs independent PRoot userspace; checksum/setup/recovery/resource receipts.
- **E — Git/worktree/review handoff**: governed exact-SHA continuity.
- **F — mobile AI agents**: provider-neutral local/remote routing, bounded context and explicit provider data boundary.
- **G — device/recovery certification**: multiple Android RAM/storage/OS tiers, LMK/network loss/restart/package recovery/background/orientation/keyboard tests.
- **H — release certification**: package/install/upgrade, exact-head CI, preview/recovery golden paths and Shipping OS receipt before `SHIPPED`.

## 12. Shipping / WIP gate

A machine-readable Phase A Shipping Contract is committed beside this dossier. It is intentionally non-deploying and scoped to the pure domain slice. It may only become `SHIPPED` after the focused mobile-workbench tests plus repository unit/acceptance gates pass in an isolated Shipping OS worktree.

There are already multiple active implementation PRs in Agent Work OS. Per the bounded portfolio rule, this donor remains research/specification until a BUILDING slot is available; do not create an uncontrolled additional implementation lane merely because the research is complete.

## 13. Rights / clean-room boundary

Pocket IDE is MIT-licensed, but the default implementation path is independently authored Agent Work OS contracts and product identity. Any intentional upstream code reuse later must retain the applicable MIT notice and be recorded explicitly.

AndroidIDE and Code on the Go are GPL-3.0 comparators. Their behavior and public architecture are research evidence only unless a separate GPL-compatible licensing decision is made.

## 14. Explicit non-claims

No Pocket IDE parity. No native Android client yet. No local PRoot/toolchain yet. No on-device build certification. No cross-device live-process migration. No iOS/iPadOS/macOS client. No production deployment. No `SHIPPED` claim without a Shipping OS release receipt.
