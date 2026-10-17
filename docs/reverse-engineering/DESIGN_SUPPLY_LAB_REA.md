# Design Supply Lab — REA evidence dossier

Issue: #163  
Target pattern: Oversight Supply / AI-ready template membership  
Date: 2026-10-13  
Method: public-behavior clean-room reconstruction

## 1. Source / target identity

Primary public sources used for capability discovery:

- Reddit launch post: `https://www.reddit.com/r/SideProject/comments/1x517qy/i_spent_5_years_designing_192_website_templates_i/`
- Product home: `https://supply.madebyoversight.com/`
- Product pricing: `https://supply.madebyoversight.com/pricing`
- Public template catalog: `https://supply.madebyoversight.com/?collection=all`
- Existing studio catalog used only to verify public catalog history: `https://www.madebyoversight.com/templates`
- REA project used as the governed reverse-engineering provider reference: `https://github.com/morluto/rea`

No paid template files, private endpoints, authenticated data, proprietary prompts, source repositories, or non-public assets were used.

## 2. Evidence and capability discovery

### Observed directly from public pages

| Capability | Evidence status | Notes |
|---|---|---|
| Large template catalog | Observed | Product states 192 templates. |
| Webflow + Framer support | Observed | Platform filters and pricing copy expose both. |
| Figma source where available | Observed | Pricing copy states availability varies by design. |
| AI-ready templates | Observed | Public catalog exposes an AI-ready filter/count (18 at observation time). |
| Free interactive sections | Observed | Product states 32 sections are free after account creation. |
| Full-template prompt handoff | Observed | Public copy explicitly references Claude Code, Cursor and v0. |
| Search + category/platform filters | Observed | Public catalog UI exposes these controls. |
| Favorites + personal library | Observed | Navigation exposes Favorites and My Templates. |
| Responsive template preview | Observed | Pricing copy describes desktop/tablet/mobile live preview before purchase. |
| Credit-based unlocks | Observed | Starter=1/mo, Monthly=3/mo, Lifetime=all catalog at observation time. |
| Permanent access to unlocked designs | Observed | Pricing FAQ says unlocked templates remain after cancellation. |
| One unlock covers multiple available formats | Observed | Pricing page states one unlock covers every available format for the design. |
| Client/personal use, no redistribution | Observed | Public licence summary states this limitation. |

### Community signal captured from the linked Reddit discussion

- Positive signal: users agreed that AI can generate quickly but often converges on generic-looking design, making curated design references + prompts valuable.
- Positive signal: visual quality/demo presentation received praise.
- Product risk: a commenter questioned whether a large bundle dilutes value if only a subset are high-demand designs.
- Trust risk: a commenter challenged authorship/provenance, and the creator responded that the designs predated current AI website generation.

These comments directly motivated the prototype's per-asset provenance and quality signals.

## 3. REA provider lane

REA is a capability/evidence provider, not the orchestration authority.

For this target class, REA's documented website lane can provide:

- page structure;
- script inventory;
- browser/network observations;
- requested screenshots;
- evidence and limitations attached to conclusions.

The current ChatGPT execution environment does not expose the user's local REA MCP/browser runtime, so no claim is made that an actual REA browser capture was executed in this turn. The dossier therefore marks findings as `public-observed`, `inferred`, or `independent-design` instead of presenting unsupported browser/runtime evidence.

Agent Work OS remains responsible for task orchestration, clean-room boundaries, evidence/provenance, verification, replay, approval, and shipping gates.

## 4. Behavioral reconstruction

### User journey A — browse to preview

1. Visitor lands on a value proposition centered on stronger visual starting points for AI builders.
2. Visitor browses the full catalog without purchase.
3. Search/filter narrows category/platform/access.
4. Opening a template launches a responsive preview.
5. Visitor switches among desktop/tablet/mobile widths.
6. Visitor can favorite before purchase.

### User journey B — unlock to library

1. Signed-in member receives credits or lifetime access.
2. User selects a premium asset.
3. Unlock consumes one credit unless lifetime access applies.
4. The asset becomes persistent in the personal library.
5. Reopening an unlocked asset costs no additional credit.

### User journey C — design to coding agent

1. User chooses a design direction.
2. Product exposes a structured build specification rather than only a screenshot.
3. User selects a destination tool (Claude Code, Cursor, v0, Lovable, generic Markdown/JSON).
4. Prompt/spec includes layout, responsive behavior, design tokens, motion, accessibility, and implementation constraints.
5. User copies the specification into the coding agent.

## 5. Inferred implementation architecture

The following is **inferred**, not claimed as the target's private stack.

```text
Browser UI
  ├─ Public catalog search / filters
  ├─ Responsive preview shell
  ├─ Favorites + library
  ├─ Prompt/spec renderer
  └─ Pricing / account UI
        |
        v
Application API
  ├─ catalog service
  ├─ entitlement / credits service
  ├─ favorites / library service
  ├─ prompt-spec service
  ├─ preview metadata service
  └─ provenance / quality metadata
        |
        +--> relational DB (users, templates, entitlements, unlocks)
        +--> object storage (original screenshots/files/export bundles)
        +--> payment provider (subscriptions/lifetime)
        +--> auth provider
        +--> analytics / audit events
```

A production implementation should separate template metadata from downloadable/exportable assets and use signed, short-lived fulfillment links for paid files.

## 6. Independent product design

Working name: **Design Supply Lab**.

The current static MVP intentionally differentiates from the target:

- entirely original sample designs and names;
- tool-agnostic structured brief generator;
- per-asset provenance badge;
- per-asset accessibility/performance/portability signals;
- free original interaction briefs;
- explicit quality gate in exported prompts;
- local-only entitlement simulation for prototype safety.

## 7. Prototype architecture

Path: `apps/web/public/design-supply-lab/index.html`

Current prototype provides:

- 12 original demo templates;
- category/platform/access filters;
- text search;
- localStorage favorites;
- localStorage unlocked library;
- credit simulation;
- responsive preview modal with desktop/tablet/mobile widths;
- 4 free interaction concepts with copyable briefs;
- structured AI build-brief generator;
- simulated membership tiers;
- provenance + quality metadata.

No backend, payment processing, authentication, or file fulfillment is connected in this prototype.

## 8. Verification plan

### Static gates

- HTML parses without fatal markup errors.
- No external target assets or copied template source.
- No private or paid prompt text embedded.
- Works without network calls.

### Behavioral gates

- Search changes visible catalog results.
- Category/platform/access filters compose correctly.
- Favorites persist after refresh.
- Unlock consumes a credit once and persists.
- Reopening an unlocked template does not consume another credit.
- Plan simulation updates credit count.
- Preview viewport changes between full width / 768px / 390px.
- Prompt generator updates when user edits project type, direction, sections, or target tool.
- Copy controls degrade gracefully when Clipboard API is unavailable.

### Responsive gates

Check at minimum:

- 390 x 844
- 768 x 1024
- 1440 x 900

## 9. Production backlog

P0:

1. Add automated browser smoke tests.
2. Add schema-backed catalog JSON rather than hard-coded sample data.
3. Add authentication + durable favorites/library.
4. Add entitlement service with idempotent unlock transactions.
5. Add payment integration behind explicit deploy gate.
6. Add object storage and signed fulfillment links for our own original assets only.
7. Add admin ingestion for original templates/sections and provenance metadata.
8. Add prompt/spec versioning so outputs are reproducible.

P1 differentiation:

1. Automated accessibility/performance checks per template.
2. AI-agent compatibility packs: Claude Code skill, Cursor rules, generic Markdown/JSON.
3. Design-token export: CSS variables, Tailwind theme, Figma variable schema.
4. Quality-ranked discovery instead of only category browsing.
5. "Remix this direction" flow with brand inputs and explicit anti-sameness constraints.
6. Customer-requested implementation variants while retaining provenance.

## 10. Clean-room provenance statement

This reconstruction reproduces a **general product pattern**: a curated design/template membership combined with AI-ready implementation briefs, responsive preview, favorites/library, and entitlement mechanics.

It does not copy Oversight Studio branding, visual assets, proprietary template files, source code, private APIs, paid prompt content, or fulfillment mechanisms. All prototype designs and implementation code are independently authored for Agent Work OS.