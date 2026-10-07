# SRC-0331 / PRD-0176 — Wingbird → Dating Copilot Lab

Status: Phase A implemented and locally verified; hosted/browser certification pending.

Canonical repo: `rrahul0904/agent-work-os`
Branch: `reverse/wingbird-dating-copilot`
Issue: `#45`
Date: 2026-10-06

## 1. Source identification

Primary donor signal:
- Reddit creator post: https://www.reddit.com/r/SideProject/comments/1wzhdl3/i_need_your_thoughts/
- First-party surface: https://www.heywingbird.com/
- Privacy: https://www.heywingbird.com/privacy
- Terms: https://www.heywingbird.com/terms

Evidence classes used: Reddit creator self-report, first-party public product surface, first-party privacy/terms, public competitor surfaces, and community feedback. No donor source code or private material was used.

## 2. Evidence summary

Observed product job: keep track of multiple dating conversations, preserve match-specific memory, surface who needs a reply, draft the next message in the user's style, and move reciprocal conversations toward a date while retaining user confirmation.

Public boundary: user approval before sending; current connected dating-app claim is Tinder, while other surfaces are not represented as directly readable; no mind-reading/attraction scoring; data is account-scoped and deletable.

The privacy page exposes production integration families: Google identity/calendar, Stripe, private Supabase/Postgres storage, a messaging relay, browser sessions for connected-app actions, background tasks, AI providers and error monitoring. These are evidence of the donor's public architecture claims, not proof of our implementation.

## 3. Workflow reconstruction

1. Adult user establishes preferences/style.
2. Conversation context is imported or entered for a specific match.
3. The system reconstructs speaker order and stable match memories.
4. A next-action reducer decides: reply, wait, move toward a date, or stop.
5. If drafting is appropriate, multiple candidate replies are generated and ranked.
6. The user chooses/edits the draft; no message is sent automatically in our boundary.
7. If the thread is ready for a plan, the system prepares a date/calendar handoff.
8. User can delete stored context and revoke adapters.

## 4. Failure modes

- Cross-thread memory leakage.
- Generic/obvious AI voice that does not match the user.
- Hallucinated facts about a match or inferred attraction scores.
- Piling on after the user sent last.
- Helping bypass an explicit rejection.
- Dating assistance involving a minor.
- Hidden auto-send or calendar mutation without confirmation.
- Excessive collection/retention of screenshots or sensitive third-party data.
- Adapter drift when dating apps or OAuth scopes change.
- Credential leakage from browser, messaging, billing or calendar integrations.

## 5. Feedback and competitive findings

The category validates screenshot/context-aware drafting, but community feedback repeatedly identifies authenticity and deception as the sharp risk. Stronger competitors separate real messages from AI drafts, make the user choose, and keep per-person context. Our differentiation therefore emphasizes conversation memory and next-action triage over pickup-line generation.

## 6. Internal audit and canonical boundary

No existing dating-copilot product was found as the canonical owner in the current reverse-engineering registry. This intake is therefore a new candidate: `SRC-0331` → `PRD-0176`, implemented as an isolated clean-room prototype under Agent Work OS until ownership is promoted to a dedicated product repository.

## 7. Product thesis

**Dating Copilot Lab helps an adult remember context, decide the next respectful move, and draft a message that still belongs to them.** It is a copilot, not an autonomous dating persona.

Non-goals for Phase A: swiping, autonomous messaging, attraction scoring, profile scraping, bypassing rejection, live restaurant booking, real calendar mutation, payment, or production account automation.

## 8. Behavior contracts

1. Thread isolation: each match has independent transcript and memory state.
2. Deterministic memory: supported stable details are extracted reproducibly.
3. Turn awareness: if the user sent last, the default action is wait.
4. Planning cue: reciprocal scheduling signals can produce move-toward-date.
5. Style fidelity: casing/tone/emoji/length controls affect all drafts.
6. User-send only: a draft can be copied but not sent to a match by the app.
7. Boundary stop: explicit rejection produces no dating draft.
8. Minor stop: minor-related context produces no dating draft.
9. Local deletion: all Phase A demo state can be erased locally.
10. Calendar confirmation: Phase A exports a local ICS draft only.

## 9. Phase A implementation

Location: `experiments/dating-copilot-lab/`

Implemented: adult gate, multi-thread conversation control plane, local-only browser persistence, memory extraction, next-action reducer, three ranked style-aware drafts, rejection/minor safety stops, local data deletion, `.ics` calendar draft export, responsive browser UI, and deterministic test/acceptance harness.

Credentialed integrations are represented only as future adapter seams. No claim is made for live iMessage, Tinder browser automation, Google OAuth/calendar writes, restaurant booking, Stripe, Supabase, or LLM-provider calls.

## 10. Verification

2026-10-06 local evidence:
- `npm test`: 9/9 passing.
- `npm run acceptance`: PASS.
- Negative testing found and fixed a refusal-language bug: `don't contact me` was detected but `do not contact me` initially was not. The pattern was broadened and the acceptance test now passes.

## 11. Hosted/recovery gate

Pending until an isolated exact-branch preview is deployed and exercised. Certification must cover age gate, thread switching, style changes, draft generation, explicit-rejection stop, delete-all recovery, mobile layout and ICS download.

## 12. Release boundary

Preview deployment may be used for certification. Merge or production release should remain gated until browser evidence is green and any real external adapter has explicit credentials, terms review, scoped permissions, revocation semantics and audit receipts.
