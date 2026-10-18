# REA dossier — r/IMadeThis product showcase (2026-10-18)

## Scope / exact source
- User-supplied shortlink: https://www.reddit.com/r/IMadeThis/s/5rJbCU07pi
- Resolved source: https://www.reddit.com/r/IMadeThis/comments/1x9eqce/
- Author: u/tashkan; title: "Drop your product below 👇 I want to see what you’re building".
- Reddit public HTML observation on 2026-10-18 exposed *three* unique named products including the OP product. This is a time-bounded capture, **not an assertion that future comments contain only three**. Reddit JSON and old.reddit fetch routes were not accessible through available public retrieval.
- Governance GitHub issue: https://github.com/rrahul0904/agent-work-os/issues/290
- Evidence confidence: product identity HIGH, self-reported/public features HIGH-as-advertised (not runtime verified), inferred architecture LOW, actual performance/security LOW.

## Inventory and routing
| Product | Producer/source | Observed problem and workflows | Owner | Classification |
|---|---|---|---|---|
| LaunchOrbit | OP u/tashkan; https://launchorbit.co | submit product -> discover canvas -> vote -> organic ranking; premium/featured listings | rrahul0904/launchgrid | donor/extension |
| ScoutWand | commenter u/Little-Jump-5572; https://www.scoutwand.com/ | criteria -> find jobs on 3 sites -> CV-based local autofill -> applicant submits | rrahul0904/applyai | donor/extension |
| MessyNote | commenter u/brandong453; https://messynote.com/ | rough idea/text or voice -> follow-up questions -> editable note -> library | rrahul0904/agent-work-os | donor/idea-to-spec module |

No new standalone GitHub repository at this point. The product boundaries already exist or, for idea-to-spec, belong to Agent Work OS workflows.

## 1. LaunchOrbit public teardown
- Current public page: https://launchorbit.co/ (2026-10-18).
- Nav and discovery: Discover, Services, Pricing, Launch, Top launches, About, badges, Journal, launch notes, product directory, weekly/all-time views, category filters, newsletter.
- Canvas public copy: community upvotes move launches toward the center. Weekly launch board, permanent products, leaderboard.
- Pricing observed: Free $0 up to five permanent standard tiles with optional badge/post upgrades; Premium $19 one-time with 2x Free tile area and verified listing; Premium+ $39 one-time with two weeks labeled Featured after approval. Sponsored prominence must never change organic score.
- Older maker post (2026-08-27): first 5×5 tile free; larger tile placement and Orbit Pro. This conflicts in details with current site: preserve as historical drift, **not as today's SKU description**.
- Competitors: Product Hunt / Uneed / BetaList / Peerlist. Main opportunity: persistent spatial browsing + transparent, fair ranks + multi-channel launch campaign and verified attribution, not just pixels.
- Owned reconstruction in LaunchGrid: deterministic launch/listing records, spatial normalized layout, zoom/pan, tile renderer, temporal filters, anti-fraud vote policy, sponsorship/organic separation, search/SEO fallback, accessible table fallback, moderation workflow.
- Open evidence: actual tile density and UI gestures, payment/verification edge states, auth, listing approval SLAs, abuse mitigations, accessibility and analytics schemas.

## 2. ScoutWand public teardown
- Site: https://www.scoutwand.com/ (2026-10-18).
- Primary promise: input criteria and cities, optional CV, search LinkedIn/Indeed/InfoJobs, direct listing, in-app browser auto-fills contact/profile fields, user reviews and clicks Apply; Windows/macOS installation.
- Free: 5 listings/day; paid: €10.99/month; 2 devices; apparently server-signed licensing (public self-description). Public disclosures: CV, autofill and saved sessions remain local; activation/renewal transmits email/license/device ID; free daily usage counter includes device ID.
- Critical explicit caveat on vendor site: automated use may be restricted by job-board terms and could lead to account closure. Owned product MUST favor official/allowed feeds and user-navigated pages and never offer CAPTCHA evasion, account block bypass, or uncontrolled submissions.
- Comparators: Simplify Copilot (forms + matches + tracker), Teal (tracking/resume), existing ApplyAI stack (candidate web, extension, mobile, backend).
- Owned differentiator: provenance for every form field, optional local secure profile vault, resume tailoring + independent QA gate, candidate-in-control form preview, auditable submission state, job dedupe and outcome tracking.
- Unknowns: actual third-party search connectivity rights, job match algorithm, local storage encryption, binary provenance, accessibility, support coverage, failure recovery and field accuracy.

## 3. MessyNote public teardown
- Site: https://messynote.com/ (2026-10-18).
- Flow: thought -> conversation (questions/pushback) -> explicit "Make this a note" -> editable note + original chat -> library/folders; text input or voice beta; cross-device and export/delete.
- Seven-day trial without card (50 AI responses, 5 voice minutes); current introductory paid $13/mo, regular rate advertised $20/mo, 500 responses + 30 voice minutes per paid period. Calls up to 15 min and 6 starts/day according to FAQ.
- Site states relevant text is sent to OpenAI when asking AI; voice sends microphone audio while connected; names Cloudflare (app/storage), Supabase (sign-in), Stripe (payments). These are **marketing disclosures**, not proof of private implementation.
- Comparators: Reflect, Audionotes, general AI notebook tools. Distinct owned direction: turn ideas into evidence-grounded PRDs, assumptions, project/branch plans and work tickets.
- Owned module idea: ThoughtSpec v1 {raw_input, modality, transcript, question_turns, revised_concept, assumptions, risks, evidence_refs, owner_workspace, retention, artifact_links}. Non-destructive versioned approval before exporting to tasks/issues. A notes-only consumer app should not be created until separately validated.
- Unknowns: actual conversational system prompt/model, search/export formats, voice transport, offline behavior, moderation and storage retention.

## Canonical REA / owner architecture
```text
Public URL / eligible user-consented surface
    -> REA intake + canonical URL + source snapshot + evidence ledger
    -> Observation / inference / unknown assertions, provenance + drift
    -> CapabilitySpec + workflow state graph + unknowns
    -> Product-boundary router
          LaunchGrid: visual discovery + fairness
          ApplyAI: candidate-controlled job discovery/form fill
          Agent Work OS: ThoughtSpec / Idea-to-Spec planning
    -> Owner repo implementation branch + test fixtures
    -> verification (unit, integration, UI, security, accessibility)
    -> replay/compare (evidence IDs and exact commit SHA)
    -> Shipping OS approval gate -> staging -> deployment when authorized
```

## Threats, clean-room and acceptance controls
- Each product and public HTML is proprietary absent verified licensing. Do not copy source, logos, layouts, screenshots, UI trade dress, text, marks, decompiled binaries, vendor keys or private endpoint payloads. Attribute public source as evidence.
- REA may inspect only authorized/public surfaces. No unauthorized logins, hidden APIs, anti-bot bypass, third-party provider writes or automatic submissions. Request credentials/permission if authenticated exploration is required.
- Distinguish "declared on marketing site" from "observed in test" and "inferred".
- Screenshot checklist: landing, onboarding, search/discovery, active result, edit, empty/error/loading, pricing, accessibility+mobile, payment/upgrade, export/delete, refusal/limits (as applicable). None represented as completed from this run.
- Tests: deterministic fixture normalizer, schema validation, hostile/invalid URL, third-party ToS policy checks, duplicate/abuse control, fail-closed authorization, lossless export, token/quota limits, rollback and replays.
- Verification receipt needed per owner repo: {source_snapshot, implementation_sha, test_cmds/results, redaction, provider versions, diff_against_baseline, human_gate, deploy_environment}. Not yet available.
- Portfolio tracker ID remains pending canonical collision-free allocation.

## Roadmap status at dossier commit
| Gate | Status |
|---|---|
| Source resolution | DONE |
| Three-product public capability audit | DONE (first pass, time-bounded) |
| Repo ownership routing | DONE |
| Market/competitor overview | DONE (first pass) |
| REA runtime/browser screenshot capture | NOT RUN |
| Clean-room API/workflow contracts | PROPOSED |
| Owned implementation and tests | NOT RUN |
| Exact-SHA replay/certification | NOT RUN |
| Staging/deploy | NOT RUN |

Revisit the live Reddit post periodically for new product comments; dedupe by normalized domain rather than counting comments as products.
