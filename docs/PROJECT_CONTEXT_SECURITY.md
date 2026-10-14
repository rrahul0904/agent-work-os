# Project Context Security Boundary

The Project Context Spine keeps the **input context body** on the developer-owned machine by default.

The hosted control plane sends only a bounded reference request (`projectId`, optional worktree/task/run identifiers, and a character budget). The local daemon resolves that reference, verifies the immutable revision, renders the handoff, and injects it into the local coding-agent process. The control plane receives a `context-injection-receipt/v1` containing bindings and digests rather than the private context text.

## Important limitation

This is not a claim that private context can never appear in hosted session output. A coding agent may quote, summarize, or otherwise disclose information that was present in its local prompt. The built-in echo adapter makes that risk especially obvious because its purpose is to echo the supplied prompt.

Therefore the current boundary is:

- private context is **not transported as an input payload through the hosted control plane**;
- context revisions and handoffs remain on the local machine;
- receipt metadata may be persisted remotely;
- agent-generated output continues to use the normal session event channel and may contain information derived from private context.

A future strict-privacy mode must treat outbound agent text/tool events as a separate data-loss-prevention problem. Exact-string redaction alone is insufficient because an agent can paraphrase sensitive context. Strict mode should combine context classification, outbound policy, optional local-only sessions, explicit disclosure rules, and auditable redaction/block decisions.

Context also carries **no execution authority**. It cannot by itself approve push, merge, deploy, provider writes, credential access, or changes to human-owned success criteria.
