# Research Ledger

A clean-room Agent Work OS module for turning prompts, browser tabs, AI chats and sources into inspectable research artifacts with provenance, evidence gaps, decision lineage and downstream execution handoff.

## Run
Use any static server for the UI; deploy to Vercel to activate `/api/research`.

## Live AI research
Set:
- `OPENAI_API_KEY`
- optional `OPENAI_MODEL` (defaults to `gpt-6-luna`)

Without an API key the deployment runs in demo-safe mode so the entire workflow can be evaluated without hidden external dependencies.

## Chrome extension
`extension/` is a Manifest V3 capture skeleton in the downloadable build. Replace `REPLACE_WITH_DEPLOYMENT_URL` in `sidepanel.js` with the deployed web URL, then load the folder as an unpacked extension.
