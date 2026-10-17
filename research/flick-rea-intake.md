# Flick REA intake — 2026-10-16

Coordination issue: #262

## Target

User-supplied source: `https://www.reddit.com/r/ProductivityApps/s/7WKLK3KgHg`

Resolved product: **Flick** by Polyhistor (`com.polyhistor.flick`), currently described publicly as an Android ↔ Windows local file-transfer application.

## Publicly observed behavior

Public launch/store material supports the following behavior claims:

- one-time QR pairing;
- remembered paired devices;
- encrypted direct transfer over the local network;
- no account/cloud relay required for the core path;
- phone → desktop and desktop → phone transfer;
- multi-file transfers;
- progress and cancellation;
- drag/drop on desktop;
- mobile share-sheet send;
- desktop folder allowlisting;
- mobile browsing/search/preview/download of shared desktop folders;
- optional rename/delete within shared folders;
- desktop background/tray presence.

Everything below the public behavior surface remains unknown until bounded authorized runtime/black-box evidence is captured: discovery framing, protocol wire format, cryptographic implementation, persistence, resume semantics, update implementation, exact architecture and failure handling.

## Repository routing

Classification: `STANDALONE_PRODUCT`.

The owned application needs its own repository because it has a distinct protocol, native app lifecycle, release matrix, device trust model, filesystem authority and packaging surface.

- new product repo: implementation + protocol + platform apps + tests/releases;
- `agent-work-os`: orchestration/provenance/verification/release gates;
- REA: bounded evidence provider only.

Working neutral repo slug: `local-transfer-bridge`.

Do not use the upstream `Flick` name as the owned brand.

## Provenance boundary

Treat Flick as proprietary/closed unless an explicitly licensed component is discovered later.

Allowed: public behavior/docs/screenshots, standards, licensed comparators, owned black-box tests.

Not allowed as implementation shortcuts: copying/decompiling proprietary binaries, assets, code, private protocols, branding/trade dress, or assuming downloadable/free means reusable.

## Comparator/donor snapshot

### LocalSend

- repository: `localsend/localsend`
- inspected head: `d01fdb14c978fa8b2b13e29a50cc0feaefe5c1b9`
- license: Apache-2.0
- useful evidence: iOS/macOS/Windows packaging, local-network permission issues, HTTPS/REST transfer, CLI, cross-platform failure modes.

### LocalSend protocol docs

- repository: `localsend/protocol`
- inspected head: `62bd3406ec80d62f2ed46269cdc06c4dcc391083`
- public docs currently identify protocol v2.2 and describe multicast + HTTP(S) local communication.
- root inspection found no explicit `LICENSE` file; treat as interoperability research until licensing is reconciled.

### PairDrop

- repository: `schlagmichdoch/PairDrop`
- inspected head: `1b0c9c9d903c3cfc706df1303dc75c3b54d04c77`
- license: GPL-3.0
- use as comparator for WebRTC/WebSocket discovery/pairing/rooms/share-menu/CLI patterns; do not copy into a differently licensed proprietary product without accepting GPL obligations.

### LANDrop

Historical public repository describes cross-platform LAN transfer and BSD-3-Clause source licensing. Useful comparator for Qt/libsodium and local-only product choices.

### Lightning P2P

Useful architecture comparator for Rust/Tauri, QUIC, content hashing, browser receiver and direct-first transfer. Verify exact license/revision before source reuse.

## Owned product thesis

Build a native **iOS + macOS + Windows** trusted device bridge:

> Pair once. Send in either direction at LAN speed. Browse only explicitly shared folders. No account, no cloud storage, no hidden upload step.

Differentiation beyond a basic AirDrop clone:

- resumable verified transfers;
- pinned device identities;
- per-pair ACLs for send/receive/browse/upload/rename/delete;
- read-only shared folders by default;
- transfer manifests and receipts;
- safe path authority and symlink/reparse refusal;
- native platform UX and integrations;
- local CLI/automation surface with explicit approvals;
- one shared protocol/core across all three requested platforms.

## Architecture direction

Shared Rust core + native shells:

- iOS: SwiftUI + Share Extension + QR scanner + Keychain;
- macOS: SwiftUI/AppKit as needed + menu bar + start-at-login + Keychain;
- Windows: WinUI 3 + tray/startup + Explorer integration + DPAPI/Credential Manager;
- shared Rust: identity, discovery, pairing, crypto, ACLs, transfer, resume, integrity, receipts, FFI.

Primary discovery: mDNS/Bonjour with bounded manual/QR endpoint fallback.

Transport target: TLS 1.3 secured direct connection, with QUIC favored for parallel streams/recovery if platform certification is clean. A simpler HTTP/TLS reference lane is acceptable for the earliest protocol proof.

Integrity: streamed chunks + final BLAKE3/SHA-256 verification; write into isolated partial files and atomically commit only after verification.

## Initial acceptance gates

Before broad UI work:

1. same protocol fixture passes iOS/macOS/Windows;
2. QR-paired identity survives restart;
3. changed peer key fails closed and requires re-pair;
4. 5 GB transfer can interrupt/resume and ends at the correct digest;
5. cancellation never produces a falsely completed target file;
6. partial file is isolated until verified;
7. path traversal/junction/symlink escape corpus is blocked;
8. read-only share cannot rename/delete/upload;
9. no cloud/account dependency exists in the core transfer path;
10. no iOS background claim is made without physical-device proof.

## Immediate next work

- behavior-only UX map;
- protocol/threat-model contracts;
- product repo creation;
- Rust workspace scaffold;
- deterministic two-peer simulator;
- iOS↔macOS encrypted one-file vertical slice;
- same core on Windows;
- shared-folder browse only after transfer/trust gates pass.
