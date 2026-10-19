# REA intake: Hermo browser workflow → local REST/MCP bridge

- Source: https://www.reddit.com/r/SideProject/comments/1xa3gvz/
- Upstream: https://github.com/PraveenNimilka/Hermo
- Inspected HEAD on 2026-10-19: `5c4df1d1cca64106c87ed979cc474e1ad5f01b43`.
- Current license: custom **Hermo License 1.0** (proprietary, effective October 19, 2026); previous MIT-licensed upstream history through `6d0c465585ff2ce7d6800de70e3ed5eebb23ab4d` remains MIT. Source: upstream `LICENSE` and `licenses/hermo-mit-legacy.txt`. The original Reddit post's “open source” characterization does not accurately describe current HEAD.

## REA route

**DONOR/INTEGRATION** into existing `rrahul0904/agent-work-os`, not a new repo. Agent Work OS owns orchestration/approvals/receipts; Hermo owns browser workflow authoring, tab authorization and runtime. We do **not** bundle Hermo's implementation, its extension, its assets, or any website account data. The current license permits independent clients using documented REST/MCP.

## Public product and architecture evidence

Pair explicitly authorized Chrome tab → record steps → bind typed inputs → select nested output mappings → specify verification → run a test → publish an immutable revision and scoped key → call the workflow over REST or MCP. Published POST `/v1/actions/{actionId}/versions/1/runs` with Bearer key, Idempotency-Key and `{"input": {...}}` returns HTTP 202 and a `run_id`/`status_url`. Poll the status with the same key until a verified result or explicit failure. Upstream stack: React, TypeScript dashboard; Node/Fastify/SQLite local runtime; Chrome Manifest V3 companion; Playwright isolated read-only mode. No claim of hosted remote execution.

## This branch: runnable owner integration

Implemented an independent Node 22+ bridge and command-line consumer:

- `packages/browser-workflow/src/hermo-client.js`: local-only HTTP client, API contract, authenticated admission, idempotency, same-origin status checks, polling, verified result, explicit failure paths.
- `scripts/hermo.mjs`: two commands, `contract` and `run`, with JSON input and optional repeatable request key.
- `packages/browser-workflow/test/`: synthetic tests including actual loopback HTTP server; never accesses personal sessions or public sites.

### Use it after configuring your own upstream runtime

1. Install **unmodified** Hermo according to [its installation guide](https://github.com/PraveenNimilka/Hermo/blob/main/docs/installation.md) and inspect its current license.
2. Start Hermo on localhost port 4317 and pair your own Chrome tab. Record, test and publish a permitted action. Keep the runtime and authorized tab open.
3. Take the one-time workflow-scoped API key from Hermo, put it in the environment without committing it:

```bash
export HERMO_API_KEY='YOUR_SCOPED_KEY'
node scripts/hermo.mjs contract
node scripts/hermo.mjs run catalog.lookup '{"search_query":"laptop"}'
```

`catalog.lookup` and input names are **illustrations**. Use your own action ID and contract. A custom local port can be set using `HERMO_BASE_URL=http://127.0.0.1:PORT`. The optional fourth argument to `run` is a chosen idempotency key.

The CLI prints the idempotency key to stderr **before the POST**. If you lose the response, reuse the same key **and same input** to recover the receipt; never issue a new key for a possibly completed website change. Verified JSON is printed to stdout. A failed, expired, or uncertain run does not auto-retry.

## Acceptance and delivery receipts

- [x] Public source, current license, provenance and repository ownership researched.
- [x] Independent executable bridge and seven Node 22 local tests pass (one real loopback HTTP fixture).
- [ ] GitHub CI passed at exact PR SHA.
- [ ] User's actual Hermo runtime installed, paired and a workflow published.
- [ ] Real authorized website smoke test with a non-sensitive owned fixture.
- [ ] Agent Work OS approval/receipt/daemon lifecycle and web UI integration.
- [ ] MCP client adapter and user acceptance.

No production deployment, connected Chrome flow, or live provider run is claimed at this stage. Do not automate a provider's website to evade API terms, avoid rate limits or bypass CAPTCHA/MFA; use official provider APIs where required. Never publish the local listener to the internet.
