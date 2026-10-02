# RE-372 Sugabots research refresh: governed tool approvals

Date: 2026-10-02

## Source refresh

The supplied Reddit launch post describes Sugabots as a shared workspace where humans and AI agents collaborate in the same conversations, with MCP tools, schedules/webhooks, local or hosted models, and self-hosting. At this refresh, the Reddit thread did not expose substantive user feedback comments to mine. That absence is recorded explicitly rather than treating launch copy as user validation.

Primary sources:

- https://www.reddit.com/r/SideProject/comments/1wvkgr0/built_a_group_chat_where_you_and_your_ai_agents/
- https://github.com/nitrictech/sugabots

Upstream repository activity also points to practical maturity work around documentation access, role lookup, composer/layout polish, and proxy reconnect behavior. Those are useful backlog signals, but they are repository-maintainer signals rather than Reddit-user feedback.

## Adjacent approval research used to improve the rebuild

Because the Reddit thread currently has no substantive feedback comments, this follow-up uses adjacent open-source approval systems and issue reports as concrete design feedback:

1. Fail closed before a sensitive tool executes, rather than logging after execution.
2. Show the human the tool call arguments before approval, but redact credential-like fields.
3. Bind approval to the exact requested arguments using a cryptographic digest so a later execution cannot silently mutate the approved intent.
4. Expire approvals with a bounded TTL.
5. Make approval consumption one-time to prevent replay.
6. Emit durable decision and claim receipts for auditability.

Research sources:

- https://github.com/permission-protocol/mcp-guard
- https://github.com/NousResearch/hermes-agent/issues/96703
- https://github.com/itcustomsolution/approval-gate-mcp

## Clean-room implementation delta in agent-work-os

This slice extends the existing RE-372 Shared Rooms implementation with an MCP-ready governed-tool approval contract:

- room-scoped approval requests for an agent/server/tool/risk/reason tuple;
- canonical SHA-256 digest of the exact JSON arguments;
- recursively redacted human-visible argument preview;
- no raw tool arguments persisted in the room state;
- bounded approval TTL;
- pending -> approved/denied -> consumed state machine, with expiry;
- exact-digest enforcement on both decision and claim;
- one-time claim with replay rejection;
- decision and claim receipt digests;
- authenticated control-API routes for create, decide, and claim;
- Shared Rooms UI for reviewing redacted intent and approving or denying the exact call;
- acceptance coverage for unauthorized access, redaction, digest mismatch, mutation rejection, exact claim, and replay rejection.

## Truthful boundary

This slice does **not** claim remote MCP connection lifecycle/discovery, MCP transport proxying, tool execution, fine-grained RBAC, cron scheduling, transcript compaction/summarization, horizontal/PostgreSQL scale validation, production deployment, or provider/device/browser UAT. A later adapter may consume the approval contract before forwarding a real MCP `tools/call`; that integration is deliberately not claimed here.
