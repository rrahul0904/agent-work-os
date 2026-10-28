# Launch Wave 4 — private UAT, evidence and operational recovery

**Lifecycle:** CI candidate -> independent private UAT -> security inspection -> release board GO/NO-GO -> separate owner-approved AWS/OCI/onprem production transaction -> independently verified live operations.

## Private, non-production UAT (no cloud required)

1. On a trusted development machine with Docker Compose, create an **untracked** `infra/uat/.env` containing a strong disposable `AWOS_DATABASE_PASSWORD`. Never commit the file or re-use production credentials.
2. From `infra/uat`, run `docker compose --env-file .env -f compose.yml up --build -d`.
3. Confirm `http://127.0.0.1:8787/readyz` answers with database and fanout ready. All exposed ports are bound to 127.0.0.1; PostgreSQL is not port-mapped.
4. Provision a disposable UAT account through a **temporarily enabled isolated-registration environment** or an approved administrative bootstrap. Default public registration remains disabled, so the first sign-in cannot be exercised without provisioning.
5. Full browser account-flow UAT requires a trusted **HTTPS** reverse proxy and cookie validation because production-mode browser session cookies carry Secure. The Compose harness alone is not a live HTTPS launch.
6. Run 2 tenants: create and activate a project; test another tenant cannot read it; verify roles; separately grant a local model and revoke; reject outbound private-model transfer with unknown upstream; submit a production-intent run; observe AWAITING_APPROVAL and no command; reject and confirm zero production action.
7. Reboot API and PostgreSQL; verify project/policy/approval state survives, same-tenant event delivery resumes and no lost or duplicated commands.
8. Tear down deliberately. Do **not** use `docker compose down -v` unless deliberately deleting *disposable* UAT data.

The Compose file is not a production architecture, security certificate, public load-balancer configuration, backup plan or proof of real model execution. Secrets in ordinary Compose environment variables may be visible through local container inspection; use an approved secret manager for production.

## Independent launch evidence

Run:

```sh
npm test
npm run acceptance
npm run release:preflight -- /absolute/path/to/evidence-manifest.json
npm run release:dossier -- /absolute/path/to/launch-dossier.json
```

- `release:preflight` requires every Wave1 security gate plus exact SHA and live verification booleans. Its best outcome is `REQUIRES_FINAL_EXTERNAL_AUTHORIZATION`.
- `release:dossier` additionally inspects independent receipt metadata, timestamps, SHA, reviewer separation, hosting and HTTPS. Its best outcome is `NEEDS_INDEPENDENT_SOURCE_VERIFICATION`, **never SHIPPED**.
- The verifier cannot fetch or cryptographically validate all external artifacts by itself. The independent release inspector must open source CI and artifacts, cross-check database receipts, exercise the live prod URL and rollback, and issue a separate signed authorization.
- Evidence must include security review, full-history secret scan, real-provider privacy and quota reconciliation, two-tenant browser UAT, actual backup/restore, rollback drill, incident readiness and live login.
- The machine supervisor **must not emit SHIPPED** after its own shell commands. It stops at `AWAITING_EXTERNAL_CERTIFICATION`, and tenant daemons cannot supply SHIPPED/receipt updates.
- The still-present receipt builder is not an alternative authorization API: no external release-certificate endpoint is shipped in this wave.

## Operating checklist

| Domain | Minimum evidence | Today |
|---|---|---|
| Model rights/region | Contract/permission + actual provider trace, measured usage and retention | UNKNOWN / NO-GO |
| Historical secrets | Protected redacted gitleaks scan, triage and rotations | Open issue #82 / NO-GO |
| Dependencies | TI lockfile from PR #83 and full npm audit | Unverified / NO-GO |
| Tenant security | Two-tenant login, WS, project, policy, CSRF, role and abuse tests | CI verified, independent browser UAT missing |
| Runtime | Container vuln scan, SAST, sandbox, network egress and origin restrictions | Independent QA missing |
| Operations | Encrypted backups, successful restore, rollback, monitoring, alert routing and on-call | Not yet proven |
| Production | Approved AWS/OCI/onprem, managed TLS/DB, verified deployed SHA and owner sign-off | Not authorized |
| Commercial | Privacy/terms, support, SSO/recovery, invoices and billing rights | Incomplete |

**Recovery**: if a release has incident evidence or missing certificate, freeze production command opt-in and block new releases; preserve audit logs, revoke suspect keys, restore only from independently checked backups, run UAT and obtain fresh approval. A version rollback is an owner-authorized production action, not a background automation.

## Four supervisor handoff

Portfolio supervisor owns owner GO, product scope and budget. REA supervisor owns evidence rights/receipts. Engineering supervisor owns code, tests and UAT preparation. Independent security supervisor independently verifies real systems and records a signed review. If an external reviewer or live environment is unavailable, `NO-GO` remains the only defensible decision.
