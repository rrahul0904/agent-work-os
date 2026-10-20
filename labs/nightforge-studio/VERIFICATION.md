# NightForge verification contract

Release is evidence-gated. A candidate is not considered deployed merely because source exists or a hosting API accepted a request.

## v0.1 required checks

- Agent Work OS repository CI passes for the exact candidate SHA.
- Browser source parses successfully.
- Root document, stylesheet and runtime bundle are present in the deployed artifact.
- The studio shift cannot publish before the independent QA lane completes.
- A completed shift emits receipts for all eight lanes.
- A shipped game opens a real Canvas runtime and supports keyboard and pointer/touch input.
- The deployed URL returns a successful HTTP response.
- The deployment can be tied back to the candidate Git SHA.

## Release boundary

The deterministic v0.1 demonstrates the complete governed workflow without external model credentials. A future generative builder must remain behind the same Agent Work OS authorization, provenance and Shipping OS gates; provider output alone can never authorize release.
