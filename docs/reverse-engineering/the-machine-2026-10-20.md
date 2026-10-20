# REA intake: The Machine -> synthetic observation replay and vision console

- Intake: 2026-10-20
- User source: https://www.reddit.com/r/SideProject/s/ujrphx2FHW
- Canonical post: https://www.reddit.com/r/SideProject/comments/1xahurs/the_machine_i_rebuilt_the_surveillance_ais/
- Creator: u/HopeSuccessful880
- Upstream: https://github.com/rosehahah/the-machine
- Inspected upstream head: `f867925bcafc0f1657b57165154739d3217283db` (2026-10-19T09:48:47Z)
- Demo: https://rosehahah.github.io/the-machine/
- License: MIT for authored code only; third-party assets separately licensed
- Coordination: Agent Work OS issue #311, related existing Vision Perception Layer issue #117
- Routing: **DONOR / REFERENCE + bounded existing-product extension**; no new repo.

## Verified architecture and product surface

The creator built a fan-made visual interface from *Person of Interest*. The public browser console demonstrates a fictional world of 500 generated individuals, 32 mock cameras, seven days and about 30 fictional cases/numbers. It provides FEEDS, SUBJECTS, CASES, NETWORK, MAP and LOG panels bound to a shared timeline.

An independent local macOS runtime can use Mac/iPhone Continuity Camera plus face enrollment, object recognition and heuristic incident generation. Its existence is NOT evidence of production detection accuracy, legal clearance or consent for capturing other people. The demo's fictional identities are not real face matches.

| Layer | Inspected files | Observed implementation |
|---|---|---|
| Input | `backend/cameras.py`, `run.sh` | ffmpeg camera/file capture, Mac startup |
| Server | `backend/server.py` | FastAPI, WebSockets, Uvicorn on 127.0.0.1, state/enrollment APIs |
| Vision | `backend/vision.py` | YOLOX, YuNet/SFace, ByteTrack |
| Incident heuristics | `backend/threat.py` | armed and fall heuristics, not reliable threat conclusions |
| Cases | `backend/numberbook.py` | notification and numbered case lists |
| View | `web/app.js`, `web/hud.js`, `web/fx.js` | Canvas overlay, WebGL grade |
| Console | `web/console/pages/*.js`, `timeline.js` | six synchronized views |
| Simulated world | `tools/gen_world.py` | seeded people, sightings, cases and co-observation |
| Assets | `tools/build_clips.py`, `tools/build_map.py`, `web/fonts` | stock video, OSM map, third-party font licences |
| Source research | `research/SPEC.md`, `tools/index_clip.py`, `tools/find_shots.py` | frame-index specification from media user must independently possess |

Upstream acknowledges limited incident types, imperfect weapon recognition, and not-yet-built prediction tree/voice features. Its own MIT notice explicitly excludes TV IP, stock footage, weights, map and font licences.

## Owned capability / product boundary

Absorb the *general pattern*, not the fictional surveillance product:

1. A typed and time-indexed **VisionObservation** with exact provenance.
2. Deterministic seed-replay, camera/source and subject filters, and shared timeline.
3. Six read-only observation views with full synthetic case-to-event lineage.
4. Co-presence visualizations clearly labeled **simulation coincidence**, not interpersonal relations.
5. Human-auditable evidence and policy gates before any external effects.

Issue #117 already owns model-agnostic governed visual perception. This intake extends its operator-experience and temporal-evidence layer. A standalone camera product is not authorized by this donor intake; it needs a separate market, user, privacy, deployment and repo gate.

## P0 code delivered on research branch

- `packages/vision-observation/src/index.js`
  - `vision-observation/v1` normalization
  - synthetic-only `awos-synthetic-world/v1` provenance
  - bounded synthetic IDs, exact UTC, normalized optional boxes, immutable outputs
  - deterministic 7-day/500-person/32-mock-camera maximum sighting fixture
  - date-cutoff replay (future leakage forbidden), camera and subject filters
  - explicitly labeled `simulated-co-presence` edges, not relationship inference
- `packages/vision-observation/test/vision-observation.test.js`
  - Eight focused deterministic boundary/replay tests.
- No copied upstream implementation code, assets, fonts, model binaries or footage.
- No camera/device/media read, biometric identification, outbound network, hosted service or deployment.

Local verification command: `node --test packages/vision-observation/test/vision-observation.test.js`.

Observed local result: **8 passed; 0 failed**. This is a local package receipt, NOT a GitHub CI / complete application / real-hardware / deployment certification.

## Implementation gates

| Phase | Work | Acceptance |
|---|---|---|
| P0 | donor intake + clean-room observation/replay | exact upstream SHA, linked issue and branch; synthetic guard tests |
| P1 | read-only six-page synthetic console UI | timeline/camera/subject/map/graph/log share equal source and cutoff, no future leak |
| P2 | Agent Work OS work-item/case evidence integration | case and views resolve to exact immutable observation IDs |
| P3 | governed vision model adapters under #117 | versioned model/data/preprocessing provenance, comparator tests, model/provider policy |
| P4 | separately approved opt-in local camera/media pilot | permission, identity/retention controls, service authentication, false-positive review |
| P5 | real-device certification and release | tests, accessibility, performance, asset-license clearance, privacy/security UAT |

## Gated or excluded

Real-world face enrollment, cross-camera real-person tracking, invisible cameras, other people's biometric data, arbitrary CCTV ingestion, social-relationship inference, third-party identity lookups, automated threat labels/decisions, outbound incident messages, media clips or branded TV graphics are **not part of P0**.

Safety: Detecting a potential weapon or apparent fall is not evidence of harmful intent or a reliably verified incident. Any future alert must be carefully validated and explicitly human-reviewed. Localhost-only API binding by itself is not authorization/authentication.

**Status:** RESEARCHED + SYNTHETIC CONTRACT BUILT AND LOCALLY TESTED. **Not** an implemented six-screen console, not merged, not deployed and not live-camera validated.
