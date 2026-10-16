# Architecture

```text
Codex / Claude Code / Gemini CLI / OpenCode / custom
                    |
            Agent Adapter (argv only)
                    |
           Workspace + AGENTS contract
                    |
           Model source / parameters
                    |
          Governed Build Coordinator
          /          |             \\
 policy/grant   isolated worker   history DAG
                    |
          CAD Engine Adapter Contract
          /                        \\
 P1 analytic primitives       P2 CadQuery/OpenCascade
                    |
       canonical geometry + measurements
          /          |             \\
 assertions     renderer/export   analyses
          \          |             /
          signed Build Receipt / Evidence
                    |
       Viewer + measure + markup feedback
                    |
              Feedback Packet
                    |
                Agent loop
```

## Trust boundaries
1. Agent output is untrusted code/data.
2. Model builds execute in a constrained worker with explicit workspace roots, CPU/memory/time budgets and no ambient network.
3. File exports are generated only from a successful canonical geometry build.
4. Measurements are kernel/engine outputs, never values invented by the LLM.
5. FEA is an external solver adapter with validated units/material/load cases and independent sanity tests.
6. The builder cannot certify itself; Shipping OS verification occurs from the exact candidate SHA.

## Core contracts
- `cad.agent.model/v1`: model identity, units, primitive/engine metadata, parameters.
- `cad.agent.feedback/v1`: selected topology, measured values, annotations and user instruction.
- `cad.agent.build-receipt/v1`: normalized inputs, engine identity, measurements/assertions, output digests, policy receipt.
- Future: `cad.agent.export/v1`, `cad.agent.analysis/v1`, `cad.agent.history/v1`.

## Enterprise extension
Control plane adds SSO/RBAC, project tenancy, policy bundles, approved engine images, egress controls, artifact retention, audit logs, model-data classification, signed receipts, team review and deployment/promotion gates.
