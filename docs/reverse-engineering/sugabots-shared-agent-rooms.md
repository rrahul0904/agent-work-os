# Sugabots shared-agent workspace — clean-room research dossier

Research date: 2026-10-02

## Source supplied by the project owner

- Reddit launch post: https://www.reddit.com/r/SideProject/comments/1wvkgr0/built_a_group_chat_where_you_and_your_ai_agents/
- Public upstream repository: https://github.com/nitrictech/sugabots

The Reddit post describes a shared group-chat product in which people and AI agents work in the same conversation, including local models, MCP tools, schedules/webhooks, Docker/PostgreSQL self-hosting, and human approval before changes. At research time the accessible Reddit page exposed no substantive comment thread to incorporate; this dossier therefore does not invent community feedback.

## Public behavior researched

The upstream public documentation and code expose these product patterns:

1. **Shared workspaces.** A pod is a shared space containing people and bots. Each bot has a shared chat visible to the pod.
2. **Named agents.** A bot has a name/handle, instructions, model, and tool settings.
3. **Agent-to-agent collaboration.** A bot can ask another bot in the same pod for help. Collaboration is bounded rather than recursively unbounded.
4. **Auditable side work.** Collaborations, routine runs, and approval waits are represented as inspectable threads/activity.
5. **Tool safety.** Connection tools have Off/Ask/Allow policies; mutating calls remain approval-gated under the documented policy.
6. **MCP connections.** Pods can connect to external apps through MCP over Streamable HTTP, including custom remote servers.
7. **Multiple model providers.** Hosted and local/provider-compatible model endpoints are supported and models can differ per bot.
8. **Routines.** A bot can run on a schedule or webhook. Webhooks use a bearer secret, support an optional idempotency key, and mark incoming JSON as external data.
9. **Long-chat maintenance.** Public code/docs describe summaries and context compaction while retaining the visible full chat.

## Translation into Agent Work OS

The goal is not to clone Sugabots. The useful product thesis is translated into Agent Work OS's existing local-runtime architecture:

| Observed pattern | Agent Work OS implementation |
| --- | --- |
| Shared pod/chat | Durable Shared Room transcript |
| Configured bots | Room-agent binding to existing machine/adapter/model/cwd |
| Human mentions | Deterministic `@handle` routing |
| Bot collaboration | Explicit start-of-reply `@handle` delegation, max two hops |
| Auditable execution | Every agent transcript message retains generating session ID |
| Webhook routine | Bearer-secret webhook with hashed-at-rest secret, run receipt and idempotency |
| External-data boundary | Webhook JSON is explicitly labeled untrusted in the agent prompt |
| Existing model diversity | Reuse Agent Work OS RE-370 adapters rather than introducing a second model layer |
| Existing operator UI | Add `/rooms.html` without replacing RE-371 Operations Atlas |

## Clean-room boundary

No Sugabots source code, database schema, UI component, branding, logo, copy, or protected visual asset is copied into Agent Work OS. The implementation uses independently authored Node.js code and the existing Agent Work OS protocol/session abstractions.

Sugabots is used only as public evidence for general product behavior and interaction patterns. This implementation retains Agent Work OS's existing local credential/repository boundary: room agents are local daemon capabilities, and their provider credentials stay on the local machine.

## Improvements / deliberate differences

- Room messages retain exact Agent Work OS session provenance for evidence tracing.
- Webhook state persists only the secret hash and input digest, reducing unnecessary durable sensitive data.
- Agent-to-agent delegation has a hard depth limit of two hops.
- The new UI is additive to Operations Atlas rather than replacing the existing control plane.
- The implementation fails closed when a configured machine/capability is unavailable.

## Deferred capabilities

The researched product also includes broader capabilities that are intentionally **not** claimed by this slice: remote MCP connection configuration, tool-level approval UX/policies, multi-user membership/roles, cron schedule execution, background conversation summaries/compaction, PostgreSQL-backed multi-instance scale, hosted deployment, and production readiness.

These remain separate evidence-gated engineering phases.
