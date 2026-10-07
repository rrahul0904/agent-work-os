# Date Copilot Lab — clean-room Wingbird donor slice

This is an independent behavior prototype inspired by publicly observable dating-copilot workflows. It does **not** copy Wingbird source code, branding, private prompts, UI assets, or proprietary implementation.

## Implemented in this Phase A slice

- adult-only entry gate;
- multiple match/thread contexts;
- deterministic per-match memory extraction;
- next-action reducer: reply / wait / move toward date / stop;
- three ranked reply drafts shaped by user tone/casing/emoji/length settings;
- user-send-only interaction model (copy/edit; no messaging adapter);
- explicit-boundary and minor-related hard stops;
- local-only browser storage + one-click deletion;
- local `.ics` calendar draft export;
- unit tests and a full-flow acceptance script.

## Deliberately not claimed as implemented

The donor’s production system depends on credentialed external integrations. This prototype does not claim live iMessage delivery, Tinder browser automation, Google OAuth/Calendar mutation, restaurant booking, Stripe billing, Supabase persistence, or an LLM provider. Those are separate adapters that require credentials, provider terms review, and production authorization.

## Run

Serve this directory with any static server, then open `index.html`.

```bash
npm test
npm run acceptance
python3 -m http.server 4173
```

## Product boundary

The product thesis is **memory + next action + authentic drafting**, not automated impersonation. Drafts never send themselves, the system should not infer whether another person "likes" the user, explicit rejection disables drafting, and real calendar/booking changes require confirmation.
