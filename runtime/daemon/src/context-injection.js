import { sha256 } from "./project-context-store.js";

export const CONTEXT_INJECTION_RECEIPT_SCHEMA = "context-injection-receipt/v1";

function safePrompt(prompt) {
  if (typeof prompt !== "string" || !prompt.trim()) throw new Error("session prompt is required");
  return prompt.trim();
}

export async function prepareContextInjection({ store, request, prompt, defaultRunId, createdAt = new Date().toISOString() }) {
  const userPrompt = safePrompt(prompt);
  if (!request) return { prompt: userPrompt, receipt: null, handoff: null };
  if (!store) throw new Error("project context store is required when context is requested");
  if (!request.projectId) throw new Error("context.projectId is required");

  const handoff = await store.createHandoff({
    projectId: request.projectId,
    worktreeId: request.worktreeId ?? null,
    taskId: request.taskId ?? null,
    runId: request.runId ?? defaultRunId ?? null,
    budgetChars: request.budgetChars ?? 12000,
    createdAt,
  });
  const combinedPrompt = `${handoff.prompt}\n---\n# User task\n${userPrompt}`;
  const receipt = {
    schemaVersion: CONTEXT_INJECTION_RECEIPT_SCHEMA,
    handoffId: handoff.handoffId,
    at: createdAt,
    binding: handoff.binding,
    context: handoff.context,
    contextPromptDigest: handoff.promptDigest,
    combinedPromptDigest: sha256(combinedPrompt),
    budgetChars: handoff.budgetChars,
    truncated: handoff.truncated,
  };
  return { prompt: combinedPrompt, receipt, handoff };
}
