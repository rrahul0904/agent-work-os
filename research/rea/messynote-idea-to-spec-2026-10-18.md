# MessyNote donor -> Agent Work OS Idea-to-Spec module (clean-room PRD)

Governance https://github.com/rrahul0904/agent-work-os/issues/290  
Original Reddit https://www.reddit.com/r/IMadeThis/comments/1x9eqce/  
Donor public site https://messynote.com/ (2026-10-18)  
Classification: **DONOR / MODULE inside Agent Work OS**, not a newly owned proprietary MessyNote clone.

## Observed capabilities (public claims only)
- Idea, free text/voice -> conversational follow-up and challenge -> user-triggered `Make this a note` -> editable synthesized note with original conversation -> folders and library.
- Browser voice beta: 30 minutes per paid period, 15-minute maximum call and 6 starts/day claimed; cross-device access, export/delete; seven-day trial, 50 AI responses, 5 voice minutes.
- $13/month early-adopter introductory price (limited spots), compared to public regular $20; 500 AI responses and 30 voice minutes per paid period.
- Public site discloses that relevant text goes to OpenAI when AI help is requested and connected voice sends audio; Cloudflare for app/storage, Supabase for auth and Stripe for billing. It does **not** establish private backend schema, code ownership or actual retention policy.

## Existing-product fit
Agent Work OS already coordinates tasks, source evidence, reviews and agent execution. Its missing owned behavior is the reliable bridge from *vague thinking* to *verifiable executable work*. A consumer note competitor would duplicate commodity functionality; use idea capture as an orchestration precondition instead.

## Owned value proposition
`capture idea -> deliberate interrogation -> assumption register -> explicit concept approval -> clean-room PRD -> implementation plan / DAG -> owner-repo routing -> approved issue/branch creation -> task execution with receipts`.

The user must be able to stop at a private note, discard it, export it, or refuse task conversion. An inference is never silently promoted to a requirement.

## User stories / flows
1. **Text idea:** type "I need a local-first invoice tool"; system asks targeted product/user/outcome/platform/legal questions, not a fixed 20-question form.
2. **Voice idea:** with explicit mic permissions and granular cloud/local disclosure, capture voice; deterministic transcript + timestamps stored with editability and model/provenance metadata.
3. **Clarify:** a finite conversational budget; categorize claims into observed context, user decision, assumption and unresolved question. User can edit any statement.
4. **Note synthesis:** when user asks, generate a compact editable summary; preserve original source and revisions; no side effects.
5. **Promote to plan:** optional PRD includes problem/persona, differentiator, proof, workflows/states, platform strategy, monetization, data/permissions/security, acceptance tests, success metrics.
6. **Routing:** canonical owner existing or new product repo; REA checks donor evidence, ownership and license; user approves high-impact actions.
7. **Task compiler:** break into bounded work packages with dependencies, risks and acceptance criteria; generate issue references and clean-room agent brief.
8. **Execution:** only after gate, agent supervisor delegates, captures exact SHA/logs/verification receipts, can replay and recover; no unapproved publish/deploy.
9. **Library and export:** authenticated tenant-scoped list, search, versions, markdown/JSON export and deletion/redaction; clear retention controls.

## Versioned contract: ThoughtSpec/v1 (proposed)
```json
{
  "schema_version": "thoughtspec/v1",
  "thought_id": "uuid",
  "workspace_id": "uuid",
  "owner_id": "uuid",
  "created_at": "RFC3339",
  "modality": "text|voice|mixed",
  "source_evidence_refs": ["evidence-id"],
  "original_text_ref": "encrypted-reference",
  "transcript_segments_ref": null,
  "clarification_turn_refs": [],
  "note_revision_refs": [],
  "facts": [{"statement":"...","source_ref":"...","confirmed_by_user":true}],
  "assumptions": [{"statement":"...","confidence":"low|medium|high"}],
  "unknowns": [{"question":"...","blocks_build":true}],
  "draft_artifact_refs": [],
  "proposed_owner_repo": null,
  "permission_state": "private",
  "promotion_state": "CAPTURED|CLARIFYING|NOTE_READY|PRD_DRAFT|APPROVED|ROUTED",
  "retention_policy_ref": "policy-id"
}
```

## Architecture proposal
```text
Web/mobile/desktop capture (explicit mic grant)
  -> user-scoped ingest API -> encrypted Thought storage
  -> optional speech-to-text adapter (consent, quotas, retention)
  -> clarification orchestrator (response schema, bounded budget)
  -> evidence and assumption ledger -> versioned note projection
  -> proposal compiler (PRD/ArchitectureSpec/TaskGraph)
  -> repo router + REA evidence check
  -> review/approval gate -> issue/worktree agent executor
  -> test/eval/exact-SHA receipt -> shipping control plane
```
Provider adapters optional; local-only mode should remain useful for text capture and editable notes if AI provider is missing. Policy controls must apply to all external LLM/speech providers.

## P0 engineering work
- Audit existing Work OS memory, planning/task and workspace APIs; avoid redundant storage/control plane.
- Define ThoughtSpec JSON schema with migration/versioning and clear distinction between proposal and action.
- Local no-model clarification fixture pack; transcripts containing contradictions, multilingual input, nonsensical ideas, malicious instructions, private information.
- Server request/response contracts, tenant auth and quota/metering; model/provider abstraction + typed error states.
- User-confirmed note synthesis, revision history and original source backlinks.
- Export Markdown/JSON and account-level deletion that also enumerates derived artifacts and provider retention limitations.
- Approval-locked PRD/TaskGraph compilation; explicit user authorization before creating GitHub issues or branches.

## P1/P2
- P1: voice recording/transcription with permissions, visible recording state, provider disclosure, cancellation and deletion, fallback to typing.
- P1: cross-device encrypted sync, mobile input and offline drafts; never overclaim offline STT availability.
- P1: provenance-driven problem/competitor validation and REA intake.
- P2: modular note-to-diagram, creator brief, business plan and product landing page handoffs, with scopes and confidence.

## Verification acceptance (not executed)
1. Every AI-derived claim has a source/assumption label and can be corrected by the user.
2. Consent recorded before any audio or personal text leaves device; no accidental background recording.
3. No duplicate issue creation after retries; no GitHub writes without task-specific approval.
4. Workspace A cannot fetch/list/export ThoughtSpec from workspace B (auth tests).
5. Sensitive input is excluded from observability and test fixtures; model prompt injection cannot grant tool authority.
6. Deletion/export enumerates original+derived notes and explains external provider caveats.
7. Same confirmed ThoughtSpec and compiler version -> stable PRD skeleton and TaskGraph identity where deterministic.
8. Model outputs always validated against schema; ambiguous requests ask a concise question and never infer irreversible approval.
9. Tests cover browser/platform fallbacks, non-AI local mode, token limits, voice budget and accessibility.
10. Shipping OS exact-head CI, smoke/e2e, replay and staging promotion receipt before deployment.

## Competitive and licensing boundary
Compare Reflect (linked notes/AI) and Audionotes (voice-to-doc/action flow). Do not copy MessyNote marketing, design, prompt, private code, logo, brand or assets. No donor source license established. Avoid loading competitor app data or interacting with user accounts without authorization.

## Status
First-pass public product reconstruction and original owned PRD: complete. Real app trial, logged-in screenshots, REA runtime analysis, implemented module, quality test suite and deployment: not completed.
