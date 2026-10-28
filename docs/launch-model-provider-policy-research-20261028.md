# REA evidence appendix — model provider data handling and policy

Source check: 2026-10-28. Evidence classification: **OBSERVED in official documentation**, not verified in any of our tenant accounts or provider contracts. Provider pages can change; commercial terms and actual account controls supersede this research.

| Provider class | Official observation | Required tenant policy |
|---|---|---|
| Self-hosted Qwen/Llama/other compatible runtime | Model weights run under operator-owned infrastructure **only if deployment traces independently establish the full egress path**. Local gateway endpoint proves nothing about upstream model residency. | Approved model digest, license/rights, local runtime host, network egress allowlist, configured prompt retention and log scrub, authorized GPU/OS access |
| OpenAI API | API inputs are not used for model training unless opted in; default abuse-monitoring logs may hold content for up to 30 days, with feature-specific retention and eligible zero-data-retention arrangements. Source: https://developers.openai.com/api/docs/guides/your-data | Require exact API endpoint/project/organization, accepted retention and abuse logging terms, region availability, spend limits and explicit private-data approval; `store:false` is not an end-to-end zero retention warranty |
| Anthropic Claude API | ZDR is contract- and organization-specific and not all features/products/models qualify; third-party integrations require their own review. Source: https://platform.claude.com/docs/en/manage-claude/api-and-data-retention | Verify commercial organization, endpoint feature, exact model and third-party data processor, exception/retention status, separate Claude Code/consumer product policy if used |
| Google Gemini API | Google's API Additional Terms distinguish unpaid and paid services. On unpaid Gemini API quotas, content may be used for product improvement and reviewed by humans; Google warns not to submit confidential/personal data. Source: https://ai.google.dev/gemini-api/terms | **Reject unpaid Gemini API for private source or customer data.** Require documented approved paid processing terms and data region controls before any private traffic |
| Token Intelligence gateway | An HTTP loopback gateway can forward to any externally configured provider. Our adapter's upstream attestation is operator-declared. Source: https://github.com/rrahul0904/agent-work-os/pull/394 | Independently verify downstream provider request destination, actual tokens/usage receipt, retention and metering; no raw transcript forwarding without a scoped grant |

## Why one universal model switch is unsafe

Data classes differ: PUBLIC can use vetted public-model lanes under provider terms; PRIVATE requires contracted provider, host/region/retention and explicit operator approval; RESTRICTED remains local-only until independently verified residency. The exact model and provider change must invalidate older approvals. Third-party tools/plug-ins have separate data processors and cannot inherit a model's consent automatically. Unknown provider characteristics or upstream metadata must mean **DENY**, not fallback.

## Required contract fields before an actual multi-model release

`organization_id`, `project_id`, `agent`, `model_id`, `model_version`, `provider`, `data_class`, `upstream_endpoint`, `region`, `retention_window`, `training_allowed`, `tool_permissions`, `storage_scope`, `budget_usd`, `max_concurrency`, `approval_actor`, `legal_basis`, `verified_at`, `expires_at`, `key_rotation_id`.

Current Wave3 code enforces a **subset**: agent/model/destination/region/retention/private grant, not a complete legal contract, independently measured residency or a company-wide rate/budget manager. Do not mark full model policy as complete without those external checks.

## Licensing and independent research boundary

Reuse only authorized public API contracts. No copying of closed implementation, product assets, dataset content, training prompts or chat sessions from competing products. API integration requires verified ownership and permitted credentials; live provider requests may incur usage charges and require user authorization.
