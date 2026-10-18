# Evidence Canvas — governed Caseboard REA intake

**State:** SOURCE_VERIFIED / FIRST_BUILD_COMMITTED / TEST_AND_BROWSER_VERIFICATION_PENDING. This is **not merged, deployed, Safari-certified, or production ready**.

## Target and immutable source baseline
- User-supplied Reddit: https://www.reddit.com/r/SideProject/s/RYHm7AZ1Gi
- Resolved discussion: https://www.reddit.com/r/SideProject/comments/1x8x541/
- Original author's public project: https://github.com/vishalnaikawadi/detective-board
- Live source: https://caseboard.myselfvishal.dev/
- Source commit inspected: \`b77f30caeb646d300e34b44fbafcb9539448dbbe\`, 2026-10-18.
- Source license: MIT for upstream code and original art; fonts have separate OFL and map/tile data requires OpenStreetMap attribution. Do not import upstream branding/art.
- Ownership: issue [#281](https://github.com/rrahul0904/agent-work-os/issues/281), Visual Intelligence roadmap [#206](https://github.com/rrahul0904/agent-work-os/issues/206), REA governance [#88](https://github.com/rrahul0904/agent-work-os/issues/88). **Not a standalone repo.**

## First-party evidence ledger
| ID | Evidence type | Observation | Source / verification limits |
|---|---|---|---|
| CB-E-01 | OBSERVED_SOURCE | Six node classes: photo/sticky/note/article/map/folder; thread edges with optional map anchors; world-positioned nodes and viewport transforms. | Upstream \`src/types.ts\`, \`src/lib/geometry.ts\` at pinned SHA; source-read only |
| CB-E-02 | OBSERVED_SOURCE | IndexedDB board and separate blob stores; Zustand board history and 350ms debounce; undo history capped at 100 snapshots. | \`src/lib/db.ts\`, \`src/store/boards.ts\`; no measured durability claims |
| CB-E-03 | OBSERVED_SOURCE | One scene reused for interactive rendering, thumbnails and PNG; SVG foreignObject rasterization with dimensions capped at 8192px or 48M pixels. | \`src/components/board/exportBoard.tsx\`, upstream README; no actual Safari test |
| CB-E-04 | OBSERVED_DOCUMENTATION | Desktop-first, touch unfinished; JSON import/export unsupported; Safari PNG export may fail and remote image CORS may block export. | Upstream README known limitations |
| CB-E-05 | OBSERVED_DOCUMENTATION | Microlink metadata, Nominatim place search and OSM tile network dependencies. | Upstream README + linkPreview/map source; vendor policies require separate recheck |
| CB-E-06 | COMMUNITY_REPORT | User feedback includes bugs, interest in no-account share links, and PNG-size problems. | User-supplied Reddit discussion; feedback is not proof of root cause |
| CB-E-07 | INFERRED_DESIGN | A governed typed evidence/relationship canvas can supply research, requirements and architecture workflows without duplicating DiagramSpec ownership. | Architectural judgment, not donor or customer claim |
| CB-E-08 | OWNED_IMPLEMENTATION | \`apps/web/public/evidence-board/\` implements a distinct visual P0 with a validated graph model and portable local JSON. | Branch commit only; CI + manual UAT still required |

## Product positioning and dedupe
The donor is a local creativity/organizing app. The owned differentiated product is a source-traceable canvas for ideas, source documents, REA observations, architecture investigations, learning paths and agent workflow plans.

**Boundary:** the board is the visual projection of typed evidence and relationships, not the source-of-truth for external runtime facts. REA observes and creates provenance-bearing evidence; authority to mutate task state and run workflows stays in Agent Work OS. DiagramSpec owns technical diagrams. Do not add overlapping ownership to Presentation OS, ThreadTales, Creator Console or individual donor repos.

## First vertical slice
- \`apps/web/public/evidence-board/model.mjs\`: independent \`evidence-board/v1\` validator, pure command reducer, JSON import/export. Node types \`note|source\`, statuses \`unknown|hypothesis|reported|observed\`, relations \`related|supports|contradicts|depends\`.
- \`apps/web/public/evidence-board/index.html\`: pointer-driven card editing, pan/zoom, relationship links, read-only reference labels, on-device local persistence, undo/redo, JSON import/export. No remote fetch, account, AI key, or external runtime.
- \`apps/web/public/evidence-board/test/model.test.mjs\`: Node built-in test suite for portable roundtrip, duplicate/dangling IDs, source requirement, cascade deletion, malformed JSON/oversized payload denial, prototype keys, non-executing HTML text data, unknown command refusal and immutable revision.
- This is a **P0 experiment**, not feature parity; no photos/maps/document import, collaboration, cloud sync, PNG export or real run receipts. Links are planning edges and are not treated as verified facts.
- Accessibility requires further review (keyboard card navigation, screen reader announcement and zoom interaction); touch behavior is implemented with Pointer Events but **not yet verified on physical iOS/Android**.

## How to run and check
Local static server at the root directory:
\`\`\`sh
python3 -m http.server 8080 --directory apps/web/public
# open http://localhost:8080/evidence-board/
node --test apps/web/public/evidence-board/test/model.test.mjs
\`\`\`
No production service, backend, secrets or network provider is needed.

Manual UAT: add two cards, edit inspector text, add source reference and promote one to \`observed\`, connect them, move them, zoom/pan, undo/redo, export JSON, reload, re-import and compare graph/revision. Verify HTML snippets render as text only. Attempt corrupt JSON, duplicate IDs, missing edge endpoints and oversized file import; app must reject without overwriting the original board. Repeat on Chrome, Firefox and Safari/Apple pointer+keyboard targets; record actual results and browser versions.

## Next bounded capabilities / approval gates
1. Browser/PWA compatibility tests, offline persistence/recovery, accessible keyboard actions and test automation receipts.
2. Asset bundles (image/document/map) with digest manifest and explicit license/privacy boundaries; migrations and backups.
3. Source-specific claims and stable REA Evidence IDs, diff and graph-replay receipts, agents producing **proposals** only until scoped approvals.
4. SVG/PNG exports certified in Chromium, Firefox and Safari, with bounded memory and CORS fallback; optional no-login read-only share via explicit approval and expiration.
5. DiagramSpec/Presentation OS adapters using typed import/export without duplicated persistence or release authority.
6. Compare with pinned upstream in disposable browser, document parity gaps; gated preview, independent review, promotion/rollback and exact-head release receipt.

**Do not mark SHIPPED** on the basis of this commit, research issue, unit tests, or preview alone. Only an approved exact-SHA release with tested runtime behavior qualifies.
