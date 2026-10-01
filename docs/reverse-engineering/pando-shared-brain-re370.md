# RE-370 — Pando-style shared Brain / multi-provider workbench

## Evidence-bounded product model

The supplied 2026-10-01 Reddit launch describes Pando as a Mac coding workspace where Claude Code, Codex, Gemini, Grok and other coding agents can work on the same folder while sharing one Brain. A related first-party launch post also describes agent-to-agent handoff, one place to approve risky steps and bundled voice dictation. The supplied thread exposed no substantive independent comments during this research pass, so no community feedback is invented.

Primary sources:
- https://www.reddit.com/r/AppBuilding/comments/1wvc5d0/pando_is_the_side_project_that_became_the_app_i/
- https://www.reddit.com/r/vibecoding/comments/1wv8w7v/pando_mac_workbench_so_any_coding_agent_shares/
- https://pandoworkbench.com/

Provider integration is based on current public CLI contracts, not terminal screen scraping: Claude Code print mode plus stream-json plus resume; Gemini CLI prompt mode plus stream-json plus resume; Grok Build headless mode plus streaming-json plus resume.

## Canonical fit

This is an Agent Work OS capability donor, not a new standalone product. RE-297 already provides verified restart-safe handoffs; this slice consumes that substrate. AgentDock remains the intended source of future PTY/workspace primitives.

## Implemented in Phase A

- locally installed Claude Code, Gemini CLI and Grok Build are advertised as provider capabilities beside Codex;
- each provider is launched through its documented non-interactive structured-output mode and can resume a provider-native session;
- no new provider adapter enables bypass, YOLO or always-approve permissions by default;
- an explicit verified-context Brain mode turns a verified RE-297 handoff into bounded local reference context;
- Brain content is labeled untrusted, the current user request is explicitly authoritative, and only up to six verified decisions are included;
- the existing proof-only behavior remains available and does not inject decision bodies into an agent prompt;
- only proof/hash metadata is emitted to the hosted control plane;
- deterministic tests cover provider arguments and Brain isolation/bounds.

## Not claimed

This slice does not establish live certification against every provider version, provider permission brokering, parallel PTYs, macOS-native packaging, voice input, Pando parity, deployment or production readiness. Those require separate runtime evidence and later phases.
