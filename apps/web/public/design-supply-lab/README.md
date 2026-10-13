# Design Supply Lab

Clean-room REA reconstruction for issue #163.

## Prototype

Open `index.html` directly or serve this directory as a static site. The prototype has no network or package dependencies.

## Deployment

This directory is linked to the dedicated Vercel project `design-supply-lab` so its preview lifecycle is isolated from the Agent Work OS container deployment and unrelated legacy Vercel project root settings.

## Scope

- original sample design catalog
- search and filters
- favorites and unlock state via localStorage
- responsive preview widths
- free section briefs
- structured AI build brief exports
- provenance and quality metadata

See `docs/reverse-engineering/DESIGN_SUPPLY_LAB_REA.md` for evidence, observed vs inferred behavior, clean-room boundaries, architecture, verification, and production backlog.
