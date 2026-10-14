# Learn Anything Studio — deployment receipt

Recorded: 2026-10-14

## Code gate

- Source PR: #176
- Tested PR head: `014e0f367c265368fba9d366081589b8fc6b5633`
- GitHub CI conclusion on tested head: `success`
- Squash-merged production commit: `1a2c9458748d031c27c298034e68d291741dd58d`
- Product route in repository: `/learn-anything/`

## Vercel attempt

An isolated Vercel project was provisioned for this product:

- project name: `learn-anything-studio`
- project id: `prj_F2i0nKsFH0n3cjlZhjd1Omwyb0Rn`
- Git source: `rrahul0904/agent-work-os`
- framework: container

The direct deployment request was rejected by the Vercel account before any build was created:

- HTTP status: `402 payment_required`
- resource: `api-deployments-free-per-day`
- reported condition: free-tier API deployment allowance exceeded (`more than 100`)
- retry guidance returned by Vercel: retry after 86400 seconds / resolve plan or billing limit

After merge, the linked project was checked again and had no deployment record. Therefore no Vercel URL is claimed as live or verified.

## Railway fallback attempt

A separate Railway project creation was attempted as a fallback. Railway rejected provisioning with:

`Your trial has expired. Please select a plan to continue using Railway.`

No Railway project, service, deployment, or URL was created for Learn Anything Studio.

## Shipping decision

State: `IMPLEMENTED_CORE / CI_PASS / DEPLOY_BLOCKED / CERTIFICATION_PENDING`

This is an external hosting-account blocker, not an application test failure. Do not mark the product `SHIPPED` until a hosted deployment exists and the exact deployed SHA, HTTPS route, browser UAT, and runtime launch path have been verified.

Next eligible action: after the Vercel daily deployment allowance resets (or the workspace plan is changed), deploy the current `main` commit into project `prj_F2i0nKsFH0n3cjlZhjd1Omwyb0Rn`, verify `/learn-anything/`, then record the deployment ID, URL, commit SHA, route status, and browser UAT receipt here.
