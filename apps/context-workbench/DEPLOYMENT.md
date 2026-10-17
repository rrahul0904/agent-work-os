# Context Continuity deployment

## Canonical source

The canonical implementation lives in `apps/context-workbench` inside Agent Work OS.

## Intended production host

A Vercel project named `context-continuity` is linked to this monorepo with root directory `apps/context-workbench`. The October 17, 2026 deployment was blocked by the connected Hobby team's 100-deployments-per-day quota. The project remains linked so a later Git push can deploy normally when account capacity is available.

## Live fallback API

The public fallback API is deployed as Supabase Edge Function `context-continuity-api` on the existing active `provenance-cleaner` Supabase project. It does not use or mutate the project's database.

Base URL:

`https://cikxzxxreryycfjumwsd.supabase.co/functions/v1/context-continuity-api`

Routes:

- `GET /api/health`
- `POST /api/session`
- `POST /api/brief`

The function is intentionally public (`verify_jwt=false`) because the workbench is a public demo surface. CORS is enabled. Session conversion and research analysis are stateless.

## Public fallback frontend

Until the Vercel quota clears, the static frontend can be served directly from this public repository through a static GitHub-content CDN. The frontend rewrites only `/api/*` requests to the Supabase Edge Function; local development continues to use the same-origin Node server.

`https://raw.githack.com/rrahul0904/agent-work-os/main/apps/context-workbench/index.html`

This CDN fallback is suitable for demonstration and verification, not the intended long-term production origin.

## Railway status

Railway was evaluated as a second deployment fallback, but the connected Railway account reports an expired trial and cannot create a new project until a plan is selected.

## Search provider

Prompt-to-web discovery is implemented but remains disabled until `BRAVE_SEARCH_API_KEY` is configured on the host. Manual sources, selected-tab/chat capture, URL hydration, all six brief types, follow-up Q&A/drafting, and agent-session handoff do not require that key.
