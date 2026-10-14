---
name: learn-anything
description: Research a topic into an evidence-backed micro-course with short lessons, source-backed claims, agreement and disagreement mapping, practice prompts, optional audio, and an auditable delivery receipt. Use for teach-me, build-a-course, audio-course, or learn-from-an-expert requests.
---

# Learn Anything

Turn a topic into a compact course that is easy to finish and hard to hallucinate. The governing rule is simple: a claim cannot be presented as sourced unless the supporting page was actually read and recorded in the course manifest.

This skill is provider-neutral. Agent Work OS remains responsible for orchestration, policy, evidence/provenance, clean-room controls, replay, deployment, and Shipping OS gates. REA may investigate reference products or source capabilities, but it is not the authority for course claims.

## Inputs

- `topic` (required)
- `level`: beginner, intermediate, advanced, or a short learner description
- `lessonCount`: default 12
- `sourceMode`: `research` (default), `expert`, or `provided`
- `expert`: optional named author/practitioner when sourceMode is expert
- `feedbackMode`: `interactive` (sample-first) or `autopilot` (self-review then continue)
- `audio`: `auto`, `required`, or `off`
- `constraints`: optional time, format, accessibility, or domain constraints

## Workspace

Keep one course under `./learn-anything/<topic-slug>/`:

```text
course-manifest.json
research/curriculum-map.md
research/evidence-ledger.md
research/agreement-map.md
research/notes/
private-source-cache/        optional; never publish by default
class/lesson-plan.md
class/NN-<handle>/script.txt
class/NN-<handle>/card.md
class/NN-<handle>/audio.*     optional
class/playbook.md
deliver/
evidence-receipt.json
```

## Course contract

`course-manifest.json` uses `version: "learn-anything/v1"` and records:

```json
{
  "version": "learn-anything/v1",
  "topic": "...",
  "level": "beginner",
  "sources": [
    {"id":"S01","url":"https://...","title":"...","kind":"primary","status":"read"}
  ],
  "lessons": [
    {
      "id":"L01",
      "title":"...",
      "citations":["S01","S02"],
      "agreement":{"agree":4,"considered":5},
      "script":"...",
      "card":{"idea":"...","impact":"...","tryIt":"...","ruleToKeep":"..."}
    }
  ]
}
```

Only `status: "read"` sources may support a lesson claim. URLs discovered but not opened can remain candidates in research notes, not citations.

## Phase 1 — Curriculum map

Research how the topic is commonly taught before deciding the syllabus. Write 10–18 learning questions or subtopics that span foundations, core mechanisms, application, failure modes, and contested ideas. Give each one a stable ID.

Do not build a syllabus from model memory alone when live research is available.

## Phase 2 — Source discovery

For research mode, assemble roughly 20–40 worthwhile pages across the curriculum. Prefer:

- primary documentation, standards, research syntheses, and original publications;
- practitioners who show concrete work;
- reputable teaching/reference material;
- a small number of credible sources that disagree with the dominant view.

Avoid thin listicles, SEO farms, login-only pages, and pages whose main purpose is selling a product. Use no more than three sources from one domain unless the user explicitly requests a single-author course.

For expert mode, prioritize the named person's own public work (site, RSS, papers, talks/transcripts, public newsletters). Clearly distinguish their view from wider consensus.

For provided mode, use the user-provided sources first and label gaps that require external research.

## Phase 3 — Evidence loading

Open and read the selected sources. Assign stable source IDs (`S01`, `S02`, ...), capture title, URL, source kind, date when available, and `status: read` in the manifest.

Keep detailed notes in `research/notes/` with claim-level source IDs. Raw downloaded pages are private working material. Do not publish or commit copyrighted page bodies by default.

## Phase 4 — Agreement and disagreement map

Build `research/agreement-map.md` from the notes, not from memory. Cluster the evidence into themes and record:

- supporting source IDs;
- sources that qualify or contradict the theme;
- confidence/coverage;
- scope conditions (version, population, environment, date, etc.);
- whether the issue is factual disagreement, different context, or value judgment.

A count such as `4 of 5 considered sources support this` is acceptable only when all five sources were actually read for that theme.

## Phase 5 — Lesson plan

Write `class/lesson-plan.md` in learning order: foundations first, then core models, then application and contested edges. Use arcs of roughly four lessons when the requested size allows it.

Each lesson should define:

- one central idea;
- why it matters;
- an example or story;
- a small thing to try;
- a durable rule to keep;
- source IDs;
- agreement counts when meaningful.

Keep disagreements as explicit decision points rather than smoothing them into fake consensus.

## Phase 6 — Sample-first or autopilot

In `interactive` mode, create lesson 1, validate it, render optional audio, present the card, and incorporate the learner's feedback before generating the remaining lessons.

In `autopilot` mode, create lesson 1, run an internal format/evidence review against the course contract, record the review in the evidence receipt, then continue without requiring a user round-trip.

## Phase 7 — Generate lessons

Generate remaining lessons in parallel where the runtime supports it. Aim for roughly two to three minutes of spoken material per lesson; the validator treats 240–420 script words as a quality range, not a hard truth about speaking speed.

Cards must stay concise and include the idea, impact, one practice, and one rule to keep. Cite source IDs from the manifest rather than inventing links in prose.

## Phase 8 — Audio adapter

Audio is an adapter, not a product dependency.

Preference order:

1. user-selected configured TTS provider;
2. another configured TTS provider available to the runtime;
3. local OS speech when available;
4. text-only delivery with a clear degraded-mode note.

Never print, persist, or copy API secrets into the course workspace. Do not claim audio exists until a real media artifact was rendered.

## Phase 9 — Validate

Run:

```bash
node <repo>/skills/learn-anything/scripts/validate-course.mjs <workspace>/course-manifest.json
```

Hard failures include unknown/unread citations, invalid agreement counts, missing core lesson/card fields, duplicate IDs, and excessive single-domain concentration. Fix the manifest or lesson evidence and re-run before packaging.

## Phase 10 — Package and receipt

Create `class/playbook.md` with the practices/rules the learner may keep. Package cards, scripts, and rendered audio under `deliver/`.

Write `evidence-receipt.json` with at least:

- topic and course version;
- source count and domain count;
- lesson count and estimated audio duration;
- validation result;
- unresolved coverage gaps;
- disagreements retained;
- audio adapter used (or `none`);
- generation mode (`interactive` or `autopilot`);
- timestamp and, when available, repository commit SHA.

## High-stakes and integrity rules

- Never use an unread page as evidence.
- Attribute a source's number or causal claim to that source unless independently corroborated.
- Health, legal, financial, safety, or other high-stakes topics stay educational and general; identify situation-dependent advice and point to qualified professionals where appropriate.
- Do not present a source count as scientific consensus.
- Do not republish scraped copyrighted pages.
- If evidence is thin, say so and reduce scope instead of padding the course.
- If a source changes over time, record the relevant date/version when it materially affects the lesson.

## Reporting

Report what was produced, source/domain coverage, lesson count, validation status, disagreements or gaps that remain, audio status, and where the delivery artifacts live. Keep the report factual and evidence-oriented.
