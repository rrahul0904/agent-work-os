# REA Intake — Context Continuity

Governance: `rrahul0904/agent-work-os#270`

## Sources

- Reddit SideProject target: https://www.reddit.com/r/SideProject/s/VLRE2AKeeg
- Reddit SideProject target: https://www.reddit.com/r/SideProject/s/AdG1JlV3v6

## Product boundary

This is an Agent Work OS extension, not a standalone clone repository. The owned capability is a **context continuity plane** with two surfaces: agent-session portability and source-grounded research memory.

## Independently implemented capability map

### Agent continuity

- canonical `agent-session/v1` IR
- Claude and Codex import/serialization
- message, reasoning-history, tool-call, tool-result and unknown-tool preservation
- continue, fork, slice-from-message, import and export
- usage-limit detection and automatic offer in the web UI
- mid-turn / open-tool-call safety block
- local session discovery and handoff launcher
- target CLI starts normally so its own configuration/tools remain authoritative

### Research continuity

- manual evidence capture
- URL hydration with SSRF/private-network controls
- optional web-search adapter
- explicit Chrome selected-tab / AI-chat capture
- Source, Source Summary, Research, Source Comparison, Comparison and Recommendation briefs
- claim/source linking, evidence coverage, agreement/disagreement, uncertainty and gaps
- recommendation guardrail that refuses unsupported decisions
- ask-about-brief and create-draft follow-ups
- browser-local saved work and reopen flow

### Voice continuity

- browser speech capture surface
- filler cleanup, dictionary replacements and snippets
- macOS companion using Apple Speech with on-device recognition requested when supported
- accessibility paste workflow for the active application

## Clean-room rules

No proprietary product code, assets, copy or private protocols are used. Publicly observable behavior defines owned contracts. Local CLI state is read-only; the bridge does not mutate private Claude/Codex databases or indexes.

## External dependencies

Prompt-to-web discovery is implemented through a provider adapter and activates when `BRAVE_SEARCH_API_KEY` is configured. Source-backed briefs, captured tabs/chats, URL hydration, follow-ups, agent handoff and local persistence work without that key.
