# Ansly → Interview Coach OS reverse-engineering dossier

Research snapshot: 2026-10-12  
Tracker issue: #151  
Source Reddit: https://www.reddit.com/r/AISaaSHunter/comments/1x49gpf/built_ai_interview_assitance/  
Observed product: https://www.ansly.app/

## 1. Evidence boundary

This dossier is a clean-room reconstruction from public behavior, public product/privacy material, public open-source comparators and independently authored analysis. It does not copy Ansly source, private APIs, prompts, branding, assets or trade dress.

The supplied Reddit thread currently reports zero comments. No comment-derived features or user opinions are invented.

Observed facts, reconstruction hypotheses and owned design choices must remain separate.

## 2. Publicly observed Ansly surface

Public product materials currently describe:

- real-time transcription of system/other-party audio;
- streamed AI answer generation;
- optional microphone capture;
- resume + job-description context;
- screenshot/screen analysis;
- Mermaid diagrams for system-design/process answers;
- macOS + Windows desktop clients;
- call-platform compatibility across Zoom, Meet, Teams, Webex and Slack Huddles;
- session creation/history/dashboard behavior;
- a free first session and paid subscription plans;
- screen-capture exclusion / hidden-on-share behavior;
- privacy disclosures covering account information, uploaded resume/JD, transcripts/Q&A, optional microphone audio, transient screenshot processing, AI-provider processing and cloud hosting.

Important: the product's hidden-on-share behavior is an observed donor characteristic, not an owned product requirement.

## 3. Product boundary

The owned product is not a stealth/anti-detection interview-cheating tool.

Target uses:

- mock interview practice;
- disclosed/allowed assistance;
- accessibility and language support;
- interviewer/recruiter copilot;
- consented interview notes;
- presentation/system-design practice;
- post-session coaching;
- general meeting copilot workflows outside restricted assessments.

Excluded:

- proctoring bypass;
- anti-detection optimization;
- process disguise;
- hidden screen-share success criteria;
- unauthorized real-time answer injection into restricted assessments.

## 4. Core user jobs

### Candidate practice

`resume/JD -> targeted question set -> live mock interview -> transcript -> structured hints/feedback -> score/gap map -> review queue`

### Allowed live assistance

`consent/policy check -> audio/screen context -> question detection -> bounded user-selected assistance -> provenance -> session history`

### Interviewer copilot

`JD/rubric -> live transcript -> rubric evidence -> suggested follow-ups -> structured evaluation draft -> human review/export`

### Practice screen lab

`user-selected prompt/screen region -> parse problem -> hint ladder / reasoning support -> code/system-design workspace -> review`

## 5. Reconstructed clean-room architecture

```text
Desktop Capture Layer
  |- system audio
  |- optional microphone
  |- user-selected screen region
  v
Realtime Media Pipeline
  |- VAD
  |- noise suppression
  |- chunking
  |- source/speaker labeling
  v
Speech-to-Text Adapter
  v
Conversation State Engine
  |- question detection
  |- topic threading
  |- follow-up detection
  |- ambiguity/confidence
  |- consent/policy state
  v
Context Retrieval
  |- resume
  |- job description
  |- notes
  |- prior practice memory
  v
Assistance Router
  |- hint
  |- outline
  |- STAR
  |- explanation
  |- coding coach
  |- system-design diagram
  |- interviewer rubric
  v
Streaming Practice / Interview Workspace
  v
Session Ledger + Coach Analytics
  |- transcript observations
  |- question/suggestion links
  |- evidence refs
  |- model/provider/latency/cost
  |- skill-gap/progress analysis
```

This is a behavioral reconstruction, not a claim about Ansly's private implementation.

## 6. Capability disposition

### MATCH

- streaming transcription;
- system audio + optional mic;
- resume/JD context;
- screenshot/screen-region analysis;
- concise spoken-answer support;
- Mermaid/system-design diagrams;
- session persistence;
- macOS + Windows first.

### IMPROVE

- explicit speaker/source confidence;
- topic/follow-up classification before expensive generation;
- question ambiguity/clarification states;
- evidence-linked suggestions;
- hint/outline/STAR/deep-answer/code/diagram modes;
- local-first transcript option;
- explicit retention/delete/export controls;
- consent as session state;
- encrypted local cache for sensitive documents;
- provider-neutral STT/LLM/vision adapters;
- cost/latency telemetry;
- restart/reconnect recovery;
- accessibility and keyboard-first operation;
- per-platform capability certification instead of blanket claims.

### NEW

- adaptive mock interviewer;
- behavioral STAR coach;
- system-design whiteboard;
- practice coding sandbox with hint ladder;
- interviewer rubric/evaluation mode;
- evidence-linked scoring;
- competency/skill-gap map;
- spaced-repetition review cards;
- resume-vs-JD gap plan;
- role/company prep packet;
- speaking analytics: latency, filler words, verbosity, answer structure;
- consent/recording disclosure workflow;
- portable session/export report;
- mobile/browser companion for review after desktop core is stable.

### OMIT / DEFER

- donor branding/assets/copy;
- screen-capture exclusion as a product promise;
- proctoring bypass;
- process disguise;
- anti-detection testing;
- broad mobile live-capture before desktop certification;
- automatic hiring/rejection actions from model output.

## 7. Owned contracts

### `interview-session/v1`

Required fields:

- stable session id;
- mode: `mock | allowed-assist | interviewer | practice-lab | review`;
- consent/recording policy state;
- role/company/JD/resume revision refs;
- language/accessibility settings;
- retention policy;
- provider/runtime policy digest;
- started/ended state.

### `conversation-observation/v1`

- source channel;
- speaker classification + confidence;
- transcript segment;
- start/end timestamps;
- STT adapter/model/version;
- correction/supersession state;
- immutable evidence digest.

### `interview-question/v1`

- question id;
- normalized text/topic;
- type: `behavioral | technical | coding | system-design | follow-up | unknown`;
- confidence;
- source transcript refs;
- topic/thread id;
- ambiguity/clarification state.

### `assist-suggestion/v1`

- suggestion mode;
- exact question id;
- source/context evidence refs;
- provider/model/version;
- limitations/uncertainty;
- streaming timing;
- policy-state reference proving the requested assist mode is allowed.

### `interview-evaluation/v1`

- competency/rubric identity;
- transcript/evidence refs;
- score/band if configured;
- rationale;
- uncertainty;
- human-review state;
- no external hiring authority.

### `interview-runtime-receipt/v1`

- exact application commit/build;
- OS/device/capture adapter;
- STT/LLM/vision adapter revisions;
- privacy/retention mode;
- latency and dropped-segment facts;
- restart/recovery result;
- test/UAT identity;
- terminal pass/fail/unknown.

## 8. Negative and recovery tests

1. Mock-only policy cannot silently switch to allowed/live answer mode.
2. Consent-required capture cannot begin until the declared consent state is satisfied.
3. Mic disabled means no microphone capture.
4. Transcript-save disabled means no persisted transcript/Q&A outside bounded ephemeral buffers.
5. STT uncertainty remains visible and may force clarification.
6. Small talk/no-question state does not generate answer cards.
7. Follow-up remains attached to the correct topic.
8. Topic switch cannot inherit unrelated evidence silently.
9. Resume/JD revisions are immutable references for each suggestion/evaluation.
10. Unsupported resume fact is flagged rather than invented.
11. Provider outage cannot destroy the active local session state.
12. Restart cannot duplicate accepted transcript segments.
13. Network reconnect cannot replay suggestion requests as duplicate accepted records without explicit idempotency behavior.
14. Screen analysis operates only on user-selected/current captures and follows retention policy.
15. API keys/tokens are excluded from transcript/history/export/logs.
16. Interviewer evaluation cannot directly cause an external hire/reject action.
17. No runtime acceptance test optimizes for stealth, capture exclusion or proctoring evasion.
18. Same canonical evidence/config remains traceable even when model text differs across runs.

## 9. Phase roadmap

### P0 — source/evidence

Status: first pass complete.

- Reddit resolved;
- thread comment count checked;
- public product flow inspected;
- privacy/data-processing surface inspected;
- public/open-source comparators inspected;
- internal issue dedupe completed;
- safe product boundary established.

### P1 — specification

- freeze JSON schemas/contracts;
- consent/allowed-use state machine;
- macOS/Windows capability matrix;
- fixture STT/model adapters;
- privacy/threat model;
- latency/accuracy/error budgets.

### P2 — mock/practice vertical slice

- desktop shell;
- fixture/system/mic input seam;
- streaming transcript;
- topic/question state engine;
- resume/JD retrieval;
- hint/outline/STAR modes;
- session ledger;
- recovery suite.

### P3 — screen/system-design lab

- user-selected region capture;
- coding/problem parsing;
- hint ladder;
- Mermaid/whiteboard output;
- evidence binding;
- no stealth dependency.

### P4 — interviewer copilot

- rubric builder;
- follow-up suggestions;
- evidence-linked notes;
- evaluation draft;
- explicit human review/export.

### P5 — coaching intelligence

- answer-structure metrics;
- recurring gap analysis;
- speaking metrics;
- prep plan;
- spaced review;
- progress dashboard.

### P6 — runtime hardening

- provider abstraction;
- local/BYOK paths where feasible;
- cost/latency telemetry;
- retry/fallback;
- crash/restart/reconnect;
- retention/delete/export verification.

### P7 — device/UAT

- macOS real-device capture;
- Windows real-device capture;
- Zoom/Meet/Teams as ordinary audio-source compatibility tests;
- accessibility/keyboard/large text;
- long-session and latency tests.

### P8 — release certification

- exact-head CI;
- signed builds;
- privacy/consent behavior review;
- runtime/UAT receipts;
- rollback/recovery;
- explicit owner production gate.

## 10. Placement and WIP

No existing canonical interview-copilot issue was found at intake.

Disposition: `STANDALONE_PRODUCT_CANDIDATE`.

Agent Work OS remains the evidence/specification/shipping coordinator until a product placement terminal is approved. Do not create a duplicate implementation repo before that gate.

Current portfolio WIP is already high, so research/contracts may proceed on this isolated branch without claiming BUILDING/SHIPPED status.

## 11. Current truthful state

`SOURCE=done / EVIDENCE=first-pass / RECONSTRUCTION=first-pass / INTERNAL_DEDUPE=done / PRODUCT_THESIS=done / SPECIFICATION=started / IMPLEMENTATION=not-started / RUNTIME_UAT=none / DEPLOYMENT=none`

## 12. Explicit non-claims

- no Ansly parity;
- no donor source copied;
- no stealth/proctoring bypass implementation;
- no desktop product implementation yet;
- no macOS/Windows capture certification;
- no hosted preview;
- no production deployment;
- no `SHIPPED` status.