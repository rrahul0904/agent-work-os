# Context Continuity — Agent Work OS

A clean-room implementation of two complementary product patterns observed in public product material:

1. **Cross-agent session handoff** — preserve conversation, reasoning, tool history, project context, forks, and partial-history handoff across coding agents.
2. **Source-grounded research memory** — capture prompts, browser tabs and AI chats as sources, then generate inspectable briefs that preserve citations, conflicts, gaps and uncertainty.

This lives inside the Agent Work OS product boundary. It is not a copy of Speechy or SourceFrame branding, code, assets, or proprietary implementation.

## Implemented surfaces

### Agent handoff
- Canonical `agent-session/v1` intermediate representation.
- Claude JSONL → canonical parser.
- Codex JSONL → canonical parser.
- Canonical → Claude / Codex serializers.
- Unknown tool calls retained under their original names so the target can read history without pretending it can invoke the source tool.
- Continue in another agent.
- Fork a copy.
- Continue from a selected message.
- Export/import session bundles.
- Mid-turn and open-tool-call safety blocks.
- Limit/quota text detection.
- Project metadata (`cwd`, repo, branch).
- Generic adapter path for future Cursor, OpenCode, Amp and Hermes adapters.

### Research frame
- Prompt + selected sources → brief.
- URL/text/tab/AI-chat source model.
- Six brief types:
  - Source Brief
  - Source Summary Brief
  - Research Brief
  - Source Comparison Brief
  - Comparison Brief
  - Recommendation Brief
- Claim/source binding with visible `[S#]` citations.
- Agreement detection.
- Contradiction detection for overlapping factual claims with conflicting dates/numbers/negation.
- Evidence strength and coverage.
- Explicit uncertainty and next-research moves.
- Recommendation guardrail: no winner if the evidence is thin or conflicted.
- Markdown/JSON export.
- Optional Brave Search provider for prompt-to-web discovery (`BRAVE_SEARCH_API_KEY`).
- Safe URL fetch path with private-network blocking and size limits.

### Capture
- Chrome MV3 extension.
- Capture selected tabs only; no passive browsing.
- Generic AI-chat capture works through rendered page text.
- Stateless handoff to the workbench in the URL fragment, so captured content is not placed in server logs.

### Voice capture
- Web push-to-talk / dictation surface using the browser speech API when available.
- Local cleanup, dictionary replacement and snippets.
- macOS companion source uses Apple Speech with on-device recognition requested where supported.

## Privacy model

- Browser extension only captures tabs the user explicitly selects.
- Extension-to-web import uses a URL **fragment**, which is not sent to the server as part of HTTP requests.
- Session conversion is deterministic and can run locally.
- Research URL fetching rejects localhost/private-address targets.
- No provider keys are committed.
- Search discovery is optional and only activates when the deployment has `BRAVE_SEARCH_API_KEY`.

## Run tests

```bash
npm test
```

## Vercel

Set the Vercel project root directory to:

```text
apps/context-workbench
```

No build command is required. Static files are served directly and `api/*.js` run as Node functions.

## Chrome extension

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Load unpacked → `extension/`.
4. Set the deployed workbench URL in the popup if needed.
5. Select the tabs to capture and press **Open in Context Continuity**.

## Architecture boundary

The app surface is deployable by itself, but the canonical contracts belong to Agent Work OS. Future desktop/CLI adapters should call the same `agent-session/v1` and research evidence contracts rather than inventing agent-specific state models.

## Follow-up from a brief

A completed brief remains usable rather than becoming a dead-end document:

- **Ask about this brief** ranks only the captured evidence against the follow-up, returns source labels, preserves relevant conflicts, and refuses when the brief lacks evidence.
- **Create draft** turns the evidence into a memo, decision note, or email-style draft while retaining citations and unresolved disagreements.

## Local agent bridge

The included CLI discovers local Claude/Codex JSONL sessions, inspects them, exports portable bundles, creates a handoff artifact under the project, and can launch the receiving CLI normally:

```bash
npm run cc -- list --agent claude
npm run cc -- inspect --agent claude --file ~/.claude/projects/.../session.jsonl
npm run cc -- handoff --source claude --target codex --file ~/.claude/projects/.../session.jsonl --launch
```

The bridge deliberately does **not** overwrite Claude/Codex private state databases. This avoids tying the owned product to undocumented mutable indexes while still preserving the whole conversation/tool history for the receiving agent.
