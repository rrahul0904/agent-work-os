# REA Reverse-Engineering Dossier: BruteForceAI -> Auth Assurance Capability

Status: investigation started
Target: `MorDavid/BruteForceAI`
Governing system: Agent Work OS
Reverse-engineering provider: REA (`morluto/rea`)
Implementation model: clean-room, evidence-backed, authorized-target-only

## 1. Decision summary

The upstream product's most reusable idea is not password guessing. It is the two-stage automation pattern:

1. inspect an authentication page and infer the relevant form controls/selectors;
2. drive a browser against those controls and determine whether the observed authentication behavior matches the expected result.

We will rebuild that pattern as an **Auth Assurance / Login QA** capability for owned or explicitly authorized applications. We will not reproduce arbitrary-target credential attacks, password spraying, evasion-oriented user-agent rotation, proxy rotation, or high-volume credential guessing.

This is a clean-room implementation. The upstream repository is non-commercial-only, so upstream source code must not be copied, adapted, translated, or used as a code base for a commercial product. Public behavior and documentation may be used as evidence to define independent requirements.

## 2. Canonical roadmap mapping

The project follows the Agent Work OS reverse-engineering roadmap. REA is a governed evidence/capability provider, not the orchestrator or policy authority.

### Stage A - Source / Target Identity

Record immutable source identity:

- Reddit post URL and canonical post URL
- upstream GitHub repository URL
- repository owner/name
- default branch
- inspected commit SHA when a REA capture is performed
- upstream license and attribution requirements
- timestamps for all observations

Output: `target_manifest.json`

### Stage B - Evidence & Capability Discovery

Use REA for website/browser observations and local artifact inspection where applicable. Capture only authorized/public behavior.

Evidence classes:

- page DOM structure
- form controls and labels
- form submit behavior
- redirects and URL changes
- visible success/failure states
- cookies/storage changes visible to the test browser
- network request metadata needed to understand the login flow
- screenshots of pre-login, invalid-login and valid-login test states
- runtime logs from the local test harness

Output: evidence bundle with hashes and provenance.

### Stage C - Behavioral Specification

Convert observations into implementation-independent contracts.

Core behavioral contract:

- discover username/email control
- discover password control
- discover submit action
- optionally discover SSO buttons and MFA/OTP follow-up states
- classify page as login/non-login/ambiguous
- return selector candidates with confidence and evidence
- execute a deterministic login test using a caller-provided synthetic credential fixture
- classify outcome as expected-success, expected-failure, MFA-required, locked, rate-limited, unknown or error
- retain screenshots, DOM snapshots and timestamps as receipts

### Stage D - Clean-room Architecture

Proposed components:

1. `auth-surface-observer`
   - Playwright-based browser worker
   - captures DOM, accessibility tree, page metadata and deterministic screenshots
   - no credential generation

2. `auth-form-inference`
   - rule-first extraction using labels, input types, names, autocomplete attributes and accessibility metadata
   - optional LLM fallback for ambiguous forms
   - returns structured candidates plus confidence and evidence

3. `auth-flow-runner`
   - executes only a bounded test case provided by the caller
   - one test identity or a small explicit fixture set
   - no password spray/brute-force mode
   - no evasion mode

4. `auth-outcome-classifier`
   - combines URL/redirect changes, DOM differences, known failure messages, cookie/storage deltas and expected fixtures
   - emits deterministic classifications plus uncertainty

5. `auth-policy-gate`
   - blocks execution unless the target is explicitly allowlisted
   - requires test-scope metadata
   - enforces per-target and per-account attempt caps
   - prevents public-IP / arbitrary-target execution by default
   - creates an authorization receipt

6. `auth-evidence-store`
   - stores only redacted metadata and receipts by default
   - credentials are never written to logs or evidence
   - screenshots/DOM are redactable and retention-controlled

7. `auth-assurance-provider`
   - Agent Work OS capability adapter
   - receives governed tasks from the control plane
   - streams normalized status/evidence events
   - produces a final signed/hashed receipt

### Stage E - Verification / Replay

Every supported fixture must be replayable against a local test application.

Required fixtures:

- standard username/password form
- email/password form
- form with dynamic IDs
- form with button text-only submit action
- SPA route transition on success
- server redirect on success
- explicit invalid-credential error
- account locked state
- rate-limit state
- MFA/OTP second step
- SSO-only page
- intentionally ambiguous page

Acceptance goal: selector and outcome results remain stable across replay runs while preserving evidence hashes and uncertainty.

### Stage F - Shipping Gates

A release is eligible only if:

- no upstream source code was copied
- license/provenance review passes
- authorization policy is enforced before browser execution
- no credential is persisted in logs, receipts or screenshots by default
- attempt caps cannot be disabled by an unprivileged caller
- tests cover allowed and blocked targets
- replay tests pass
- CI passes
- security review passes
- deployment remains behind an explicit human/admin gate

## 3. Capability comparison

### Preserve as product value

- AI-assisted form discovery
- selector retry/fallback
- DOM-change observation
- browser automation
- local model option
- structured persistence of analysis results
- duplicate-test prevention
- notifications / run summaries
- deterministic evidence capture

### Rebuild differently

- SQLite-only persistence -> adapter-backed store with immutable receipts
- monolithic Python class -> separated services/modules
- weak success heuristics -> explicit outcome classifier with confidence
- direct webhook secrets -> managed notification adapter
- implicit runtime authority -> Agent Work OS policy/authorization gate
- opaque LLM answer -> evidence-backed structured selector contract

### Explicitly exclude

- password spraying
- brute-force credential enumeration
- user-agent rotation for evasion
- proxy rotation for evasion
- arbitrary-target operation
- high-concurrency credential attempts
- stopping on discovered real credentials
- credential harvesting

## 4. Proposed contract

```json
{
  "target": {
    "origin": "https://staging.example.test",
    "authorization_id": "authz_...",
    "environment": "staging"
  },
  "observation": {
    "page_kind": "login",
    "username": {"selector": "...", "confidence": 0.98},
    "password": {"selector": "...", "confidence": 1.0},
    "submit": {"selector": "...", "confidence": 0.96},
    "mfa_possible": true
  },
  "test_case": {
    "credential_fixture_id": "fixture_...",
    "expected": "success"
  },
  "result": {
    "classification": "mfa-required",
    "confidence": 0.94,
    "evidence_receipt": "sha256:..."
  }
}
```

Credentials themselves must never be embedded in this contract.

## 5. REA investigation plan

REA should be used to gather evidence, not to become the runtime authority.

For each authorized target/fixture:

1. capture browser page structure and screenshot;
2. capture network observations around form submission using synthetic credentials;
3. compare pre/post DOM and route state;
4. record selectors and supporting evidence;
5. document unknowns and ambiguity;
6. save the evidence manifest with digests;
7. hand the behavioral specification to the implementation agent;
8. independently run replay tests to compare implementation behavior with the captured specification.

The REA output becomes an input artifact to Agent Work OS. Agent Work OS decides what may execute, where it may execute, and whether results satisfy the shipping gates.

## 6. Implementation phases

### Phase 0 - provenance and policy

- target manifest schema
- license/provenance record
- authorization scope schema
- deny-by-default target gate
- credential redaction rules

Exit: blocked target tests prove the runner cannot execute without an authorization receipt.

### Phase 1 - deterministic local fixture lab

Build a small local auth fixture application covering the acceptance cases above. The first implementation must operate only on localhost/fixture origins.

Exit: fixtures run in CI and produce stable screenshots/DOM receipts.

### Phase 2 - form discovery

Implement rule-first selector inference and structured confidence. Add optional LLM fallback only when deterministic rules are insufficient.

Exit: >=95% selector accuracy across fixture suite and clear ambiguous-state reporting.

### Phase 3 - bounded login QA runner

Implement a single-fixture login execution path with strict attempt budgets and secret-safe logging.

Exit: success, failure, MFA, lockout and rate-limit states are correctly classified in fixtures.

### Phase 4 - evidence + replay

Add content hashing, evidence manifests, screenshot/DOM comparison and replay checks.

Exit: each run is reproducible and auditable from non-secret receipts.

### Phase 5 - Agent Work OS provider

Expose the capability through the local daemon and normalized Agent Work OS protocol. Add explicit approval requirements for non-local targets.

Exit: end-to-end task -> policy -> local provider -> evidence -> verification path passes acceptance testing.

### Phase 6 - product UI

Add an Auth Assurance workspace:

- authorized applications
- discovered login surface
- selector confidence
- test fixtures
- run history
- evidence viewer
- regression diff
- policy status
- CI integration

Exit: an operator can configure and run a staging login check without CLI access.

### Phase 7 - deployment / monetization

Commercial direction should be positioned as authentication regression testing and AI-assisted QA, not credential attack automation.

Candidate plans:

- Developer: local + CI, small fixture count
- Team: shared staging projects, evidence history, notifications
- Enterprise: SSO/RBAC, private runners, policy packs, audit retention, self-hosted control plane

Potential differentiators:

- LLM-assisted selector healing when login UIs change
- evidence-backed regression diffs
- MFA/SSO flow mapping
- CI gate for broken login flows
- multi-browser testing
- secret-safe receipts
- Agent Work OS orchestration across many applications

## 7. Initial backlog

P0:

- [ ] add target/provenance manifest contract
- [ ] add authorization receipt contract
- [ ] add local login fixture app
- [ ] add browser observer
- [ ] add deterministic selector inference
- [ ] add bounded test runner
- [ ] add outcome classifier
- [ ] add evidence hashing/redaction
- [ ] add replay test suite
- [ ] add Agent Work OS capability adapter
- [ ] add CI acceptance test

P1:

- [ ] MFA fixture support
- [ ] SSO-only classification
- [ ] dynamic selector healing
- [ ] browser matrix
- [ ] notification adapter
- [ ] UI workspace

P2:

- [ ] staging-domain ownership verification
- [ ] enterprise RBAC and audit retention
- [ ] private runner enrollment
- [ ] CI provider integrations
- [ ] policy templates

## 8. Definition of done

This reverse-engineering effort is complete only when all of the following are true:

- observed upstream behavior has an evidence-backed specification;
- our implementation is independently written and provenance-documented;
- protected/unsafe capabilities are absent or policy-blocked;
- local fixture replay demonstrates functional parity for the safe login-discovery/testing pattern;
- the capability is integrated with Agent Work OS;
- acceptance tests and CI pass;
- receipts prove what was executed and against which authorized target;
- deployment is gated and operational documentation exists.

## 9. Current status

Completed in this wave:

- source identity confirmed
- upstream architecture and dependency shape inspected
- upstream license risk confirmed
- safe reusable capability isolated
- clean-room product direction selected
- Agent Work OS selected as governing control plane
- REA role defined as evidence/capability provider
- implementation phases and acceptance criteria defined

Next implementation action: Phase 0 contracts + Phase 1 local auth fixture lab on this branch.
