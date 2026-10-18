# Context Continuity deployment

## Canonical source

The canonical implementation lives in `apps/context-workbench` inside Agent Work OS.

## Current production host

**Vercel production:** https://context-continuity.vercel.app

Project: `prj_jp8JA3UeAdwWPJxIZJhKadWWvN2u`.
The frontend uses **same-origin** `/api/session` and `/api/brief`; session
payloads are not forwarded by the UI to the earlier Supabase fallback.
Deployment target is `main` at root `apps/context-workbench`.

The separate `context-continuity-release` GitHub Actions workflow covers unit
tests, code syntax, local HTTP health, session endpoint, and static-source isolation.
A Vercel `READY` deployment is necessary but does not independently verify a
live browser's feature paths, native macOS compilation, or extension publishing.

## Live fallback API

The public fallback API is deployed as Supabase Edge Function `context-continuity-api` on the existing active `provenance-cleaner` Supabase project. It does not use or mutate the project's database.

Base URL:

`https://cikxzxxreryycfjumwsd.supabase.co/functions/v1/context-continuity-api`

Routes:

- `GET /api/health`
- `POST /api/session`
- `POST /api/brief`

The function is currently public and stateless; it is **not** the primary
production API. Do not use it for sensitive agent logs.

## Historical frontend fallback

The `raw.githack.com` HTML route is deprecated for production because it
cannot support the new same-origin API design. Use the Vercel production URL.
The Supabase function is retained only as a stateless compatibility fallback.

## Railway status

Railway was evaluated as a second deployment fallback, but the connected Railway account reports an expired trial and cannot create a new project until a plan is selected.

## Search provider

Prompt-to-web discovery is implemented but remains disabled until `BRAVE_SEARCH_API_KEY` is configured on the host. Manual sources, selected-tab/chat capture, URL hydration, all six brief types, follow-up Q&A/drafting, and agent-session handoff do not require that key.
