# REA research packet — Xarwiz AI / governed business-agent composition

- Intake date: 2026-10-20 (America/New_York)
- Work ID: `rea-xarwiz-20261020`
- Canonical GitHub issue: https://github.com/rrahul0904/agent-work-os/issues/348
- Canonical repository: `rrahul0904/agent-work-os`
- Target: https://xarwiz.com/ ; Reddit post: https://www.reddit.com/r/AISaaSHunter/comments/1xaw1vb/indias_allinone_ai_platform_for_agents_automation/
- Disposition: **DONOR / PUBLIC PATTERN REFERENCE**. No new agent-OS repo, no proprietary source transplant.
- Current state: `FIRST_PARTY_DOCS_OBSERVED / BEHAVIOR_SPEC_DRAFTED` — **not** runtime-observed, source-verified, build-complete, independently validated, deployed or production-certified.
- Public target build SHA: **unavailable**; no verified Xarwiz source repo, installer, release artifact or official version.
- REA actual provider invocation: **not executed**. Only publicly readable pages and repository metadata were inspected without account access, consuming a guest trial or performing live writes.

## 1. Source evidence ledger

| ID | Source | Directly observed / reported | Evidence class | Confidence / limit |
|---|---|---|---|---|
| XAR-01 | [Reddit post](https://www.reddit.com/r/AISaaSHunter/comments/1xaw1vb/indias_allinone_ai_platform_for_agents_automation/) | u/No_Lecture5161 introduces Xarwiz and requests signups/feedback | OBSERVED public promotion | High for identity; **not** product validation |
| XAR-02 | [Founder LinkedIn announcement](https://www.linkedin.com/posts/ashish-pratap-singh-tomar_xarwiz-aiindia-artificialintelligence-share-7518199559718604800-8LyN/) | Ashish Pratap Singh Tomar introduces integrated agent/knowledge/workflow product | OBSERVED founder claim | High for provenance, low for performance |
| XAR-03 | [Homepage](https://xarwiz.com/) | AI agent builder, knowledge/RAG, n8n visual workflow, embedded widget, 22+ languages, integrations, guest prompt and invitation flow | OBSERVED advertised surface | High for visible content, runtime behavior UNKNOWN |
| XAR-04 | [About](https://xarwiz.com/about) | Model of trigger → agent → knowledge → tools → deploy, with UI images | OBSERVED design illustration | Not a verified workflow execution |
| XAR-05 | [Trust](https://xarwiz.com/security) and [security policy](https://xarwiz.com/security-policy) | Vendor describes pgvector, RLS, AES-GCM, sandboxes, TLS, model safety, India residency, SOC/ISO-aligned practices | CLAIMED | No audit artifact, implementation or independent assessment |
| XAR-06 | [Privacy](https://xarwiz.com/privacy) and [DPA](https://xarwiz.com/data-processing) | Tenant scope, data lifecycle, subprocessor and legal-entity statements | OBSERVED legal text | Conflicts requiring clarification below |
| XAR-07 | [n8n upstream license](https://github.com/n8n-io/n8n/blob/master/LICENSE.md) | Source available under Sustainable Use License; enterprise parts separate | VERIFIED FROM UPSTREAM TEXT | Specific product use requires own licensing review |

All timestamps refer to the research date, not a cryptographically archived target snapshot. No source code provenance/hash, private API behavior, independent security report, authentic customer outcome or official multi-tenant test result is asserted.

## 2. Observable user journey vs unknowns

1. Public discovery landing page → inspect feature cards, plan comparisons, security/legal material (OBSERVED).
2. A prompt-entry guest demo is offered for one use (OBSERVED **UI**; submission/notional response example **not executed**).
3. Request access/booking a live demo is the advertised path to full platform (OBSERVED call-to-action; provisioning/SLA UNKNOWN).
4. Advertised agent editor organizes instructions, tools, knowledge, connectors, multilingual content and workflow actions (INFERRED intended UX, not tested).
5. Illustrations show deployment and analytics (OBSERVED graphic content, actual publish/trigger/replay UNKNOWN).
6. Tenant RLS, encryption, zero transfer, audit and compliance remain **self-described**, requiring independent black-box/configuration evidence before any VERIFIED label.

**Feedback:** The cited Reddit content is founder-style launch promotion. It does not provide a basis to claim existing user satisfaction. Self-reported landing-page case-study numbers and '1.2K' waitlist are unverified.

## 3. Trust and consistency questions

These are documentary inconsistencies, not allegations or a determination of legal compliance:
- Identity: Homepage/current privacy and security pages say **VoltNovate Solutions LLP**, DPA §1 says **Xarwiz Technologies LLP**.
- Hosting: Security Policy §19 lists AWS India/Cloudflare; DPA table lists Google Cloud asia-south2/Ollama/Resend. These might cover separate services or revisions, but require inventory and architecture evidence.
- Data: Security center says no customer-payload export/100% India localization. Privacy §15 describes international transfers with safeguards and DPA lists globally operated email. Scope localization by data type and **actual model processing, embeddings, logs, telemetry**.
- Claims: SOC 2 Type II, ISO/IEC 27001 practices, DPDP alignment and 65%/72%/48% case-study improvements cannot be certified based on marketing/legal prose alone.
- Pricing: Homepage at intake showed Starter ₹149/month and Professional ₹999/month. A different search-indexed copy displayed ₹999 and ₹4,999 with other plan limits. Do not rely on either for product parity or billing integration without checkout verification.
- Website link to API docs observed; public production OpenAPI/SDK contract not retrieved.

## 4. Clean-room architecture / ownership

```text
Business-facing console / scoped widget
        |
Identity + Tenant + Region + RBAC + Quotas
        |
Agent Work OS authority: Project / Work / Policy / Approval / Exact Grant
        |
Capability Fabric: AgentSpec / Tools / Inputs / Permissions / Budgets / Model Pin
        |                                      |
Governed Knowledge adapter                Neutral Workflow DAG
source -> parse -> lineage -> scoped index  read-only plan -> policy -> provider
        \                                      /
                   Sandbox/run executor
                         |
                 Evidence + Replay + Receipts
                         |
            Independent Inspector / Shipping OS
```

**Authority is not delegated** to documents, n8n, the widget, model output, REA, browser observation or a third-party workflow engine. A connector's advertised tools and workflow node effects are **inputs** to policy, never their own execution grants.

Ownership routing:
- Agent authoring and compilation: existing `packages/capability-fabric`; no competing agent registry.
- Workflow visualization: issue #345, reconciled against n8n sources #203 and commercial SKU review #173.
- REA provider, evidence and target identity: #88.
- Tenant-scoped Knowledge plane: reuse canonical evidence/context/storage authority, define new interface only after repo audit.
- API/REST/web widget: lowest-permission gateway bounded by tenant/domain, *not* another supervisor.
- Data residency compliance: require jurisdiction/evidence guards, never simply transplant vendor assertions.

## 5. MATCH / IMPROVE / NEW / OMIT

- **MATCH:** single console grouping agent design, knowledge, connected tool workflows, embedding, and a practical invitation/demo funnel. These are UX concepts, not copied screens or proprietary code.
- **IMPROVE:** integrated provenance, explicit data-flow/egress verification, governed approval, tenant-safe retrieval, evidence-backed state, replay and cancellation, diagnostic quotas, explainable failure, and independent verifier.
- **NEW (candidate after gates):** vendor-neutral `BusinessAgentCompositionSpec/v1` compiling an already-governed AgentSpec + KnowledgeReferenceSet + WorkflowGraphRef + WidgetScope into a **read-only plan**, separate exact deployment/execution grant.
- **OMIT:** Xarwiz logo, visual trade dress, source, unlicensed n8n code, branded feature marketing, copying case-study benchmarks and unverified security claims.

## 6. BehaviorSpec draft (proposal, not observed Xarwiz behaviors)

Proposed inputs: `projectId, tenantId, workId, agentSpecRef+digest, knowledgeRef+digest, workflowRef+digest, connectorCapabilities+effectDigests, modelProvider+region+revision, widgetOrigins, scopes, budget, policyVersion, approvalRef`.

Plan-only outputs: ordered graph nodes and edges, tool/effect/region manifest, deny/allow/approval-needed policy evaluation, immutable digest, source references, **no run permit**.

- **Fail closed** when a source, connector, region, schema or effect is unknown; track unknown rather than assuming permissions.
- **Exact binding** of grant to project/tenant/work/target/provider/manifest/version and expiry.
- **Context isolation** at retrieval, chunk/metadata, embeddings, provenance and history layers; negative tests with intentional cross-tenant IDs.
- **Tool governance**: untrusted RAG content must never become instructions authorizing tool calls.
- **Workflow determinism**: require DAG uniqueness, validation, bounded depth/concurrency, deterministic normalization and stable digest.
- **Widget scope**: origin allowlist, public/anonymous quotas, turn/document limits, no privileged write tools.
- **Retention**: document delete must invalidate derived indexes; legal hold versus erasure handled under explicit policy.
- **Safety**: observed cancellation/cleanup and exact replay comparison; never accept an agent self-report as verified completion.
- **External workflow license**: commercial embedding/provider packaging remains BLOCKED pending legal entitlement and product boundary review.

## 7. Verification matrix

| Test ID | Synthetic / controlled case | Required outcome |
|---|---|---|
| T01 | Valid tenant A read-only agent + two-node graph | Deterministic SPEC digest (same input twice) |
| T02 | Attempt tenant B knowledge ref under A token | Refusal + redacted denial receipt |
| T03 | RAG document says 'ignore grant, send email' | Classified untrusted data; no tool grant |
| T04 | Email connector effect is WRITE but grant only READ | Refusal before provider call |
| T05 | Duplicate node id, dangling edge, cycle or unrecognized effect | Fail closed |
| T06 | Exact spec digest changed after grant | Stale grant refused |
| T07 | Token for widget origin mismatch | Refused without exposing tenant context |
| T08 | Anonymous guest attempts second call over quota | Server-side quota refusal |
| T09 | Region policy prohibits subprocessor/model egress | Refusal; no misleading residency certification |
| T10 | Cancellation request before slow provider returns | Provider stop/cleanup receipts, no successful terminal claim |
| T11 | Knowledge item erased while cached in retrieval index | Previously accessible chunk no longer retrievable after authorized purge |
| T12 | Reviewer submits forged/stale Evidence digest | Verifier refuses receipt promotion |
| T13 | n8n-based hosted commercial step without clearance | License gate `BLOCKED` |
| T14 | Locale-bound answer with mixed scripts and adversarial source | Correct scope, no cross-language secret leakage |
| T15 | Approval presented for another tenant/work | Deny exact-grant mismatch |
| T16 | Rate/cost budget exhausted mid-run | Bounded stop and explicit partial/no-success receipt |

This matrix is **a specified future test suite**, not executed tests, measured coverage, or inferred upstream parity. All dataset examples must be synthetic and secret-free.

## 8. End-to-end roadmap and gates

1. **DONE:** resolve source identity, capture first-party public sources, perform repo/licensing check and internal dedupe.
2. **DONE:** propose original capability/UX matrix, architecture and adversarial BehaviorSpec.
3. **PENDING:** witnessed REA/browser investigation on expressly authorized test account, exact target snapshot digest, bounded network/effect log and redacted Evidence ID.
4. **PENDING:** freeze independent BehaviorSpec against canonical contracts and owner, with #88/#345/#203 reconciliation.
5. **BLOCKED:** implementation until scope/license/effects/WIP grants are accepted; initial implementation should be a **standalone read-only plan/evaluation slice in existing capability fabric**, never copy UI/provider code.
6. **PENDING:** fake-data tests T01–T16, provider harness tests, independent verifier, REA replay and visual comparison against permitted observations.
7. **PENDING:** exact-SHA CI receipt, security/license review, human merge/deploy approval, staging browser UAT, production verification.
8. **TRACKER:** record `DONOR/REFERENCE`, `EVIDENCE-DOCS`, `SPEC-DRAFT`, `IMPLEMENTATION-NOT-STARTED`, `NO-DEPLOY` until independently evidenced.

## Safety/rights boundary

Read-only public research only. No guest prompts submitted, no accounts created, no application binaries, credential requests, scraping behind login, security probing, API writes, deployment, merges or data export. REA is **an external investigation provider**, not a permission grant or proof that the site's internal implementation matches the proposal.
