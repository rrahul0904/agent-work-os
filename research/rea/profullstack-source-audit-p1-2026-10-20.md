# Profullstack P1 source audit — 2026-10-20

This is public source inspection, **not** a claim of production parity. Upstream code execution/installers were not run. The canonical implementation remains owned by Agent Work OS. The directory is a marketing catalog, not a direct repo mapping; confirm identity separately.

| Public target | Inspected repository (exact SHA) | License | Identity/status boundary | Intended owned delta |
|---|---|---|---|---|
| moshcode | [moshcoder/moshcode](https://github.com/moshcoder/moshcode) @ `9529c0a5c6ff83b3493505ace9f1b3a8a4f7fde3` | MIT LICENSE verified | README explicitly describes wrapper CLI, multi-agent herd/swarm, work queue, cost, handoff, session restore, MCP/skills. Source is in `moshcoder` org, not necessarily `profullstack` org | Agent Execution Fabric: independent supervised work queues, resumption, cost/verification receipts, exact engine contracts |
| QAaaS | [profullstack/qaai](https://github.com/profullstack/qaai) @ `be99dd57637c4331dd556ce46227d8720705b916` | **UNKNOWN** (root LICENSE not found) | **Archived** repo with Playwright AI QA README; product-to-repo identity NOT independently proven as live `qaaas.dev` code. README feature claims not runtime tests | Evaluate as comparator only, no code copy; plan PR-aware browser tests, artifacts, human approval |
| Chovy | [profullstack/chovy.com](https://github.com/profullstack/chovy.com) @ `5e0d4d2a4d7686c81534295796ee54d79ccc0c50` | **UNKNOWN** (root LICENSE not found) | README describes an older static microblog with 240-character posts, **not** the current “idea to deployed app” Chovy builder shown at `/docs/ai/chovy`. **Do not misattribute repo to product implementation.** | Continue white-box repo discovery; use site UI/CLI contract only until source confirmed; Solution Factory remains original implementation |
| Profullstack MCP | [profullstack/mcp-server](https://github.com/profullstack/mcp-server) @ `b5dcfdb889f5b16c0c3c6cb0075bf369fa41e464` | ISC LICENSE verified | README for generic modular model/MCP integration; mapping to current `mcp.profullstack.com` fleet MCP is **unproven**. README warns that some routes can be reachable without configured tokens | Capability Fabric: credential-scope, authenticated remote MCP registration, read-only inspection and no auto-trust |
| Shared stack | [profullstack/stack](https://github.com/profullstack/stack) @ `89d4c5a7e74d677395841557776bec5dbc730be6` | MIT LICENSE verified | v0.4.0 subpath packages; fleet service catalog has 62 service snapshot | Approved package recipes, catalog/provenance and determinism |
| Cross-platform shipping | [profullstack/sh1pt](https://github.com/profullstack/sh1pt) @ `e6b90a07da881986a34a69283f4cea645e428d46` | MIT LICENSE verified | README declares alpha and several targets manual/planned; do not infer operational parity | Shipping OS adapter readiness/dry-run receipts |

## Direct product evidence
- Chovy https://profullstack.com/docs/ai/chovy documents `chovy login`, `chovy new`, `chovy build --watch` and per-user deployment URLs (publicly advertised).
- moshcode https://profullstack.com/docs/ai/moshcode is CLI/TUI/PWA.
- QAaaS https://profullstack.com/docs/ai/qaaas describes browser flow testing.
- Profullstack MCP https://profullstack.com/docs/ai/mcp describes one MCP endpoint for fleet tools.
- Stack builder https://profullstack.com/stack/build has selectable surfaces and shared core; mobile notes-only and multiple unreleased modules explicitly shown.

## Why this audit matters
**Do not equate a same-domain GitHub repository with the marketed product.** Chovy shows why: the current public catalog describes an agentic app builder while the publicly discovered `chovy.com` repository describes a microblog. QAaaS has a likely conceptual ancestor, but archived status and absent root LICENSE invalidate any “verified current source/open license” claim.

## Acceptance priorities
1. moshcode public source: inspect canonical agent session/work/handoff control flows and tests at exact SHA, then compare contract-by-contract with Agent Work OS #267.
2. QAaaS: establish live repo identity or treat as UI/behavior comparator only; inspect safe standalone testing patterns but do not copy unlicensed code.
3. Chovy: investigate source identity; build only behavior based on documented CLI and lawful public observations.
4. MCP: never auto-activate vendor endpoints; credentials remain tenant-approved and scoped.
5. Verify per-product CI, failures, runtime tests and freshness before declaring feature complete.
