import { compilePromptSpec, renderPrompt } from '../prompt-core.mjs';
import { createRunPlan } from '../orchestrator.mjs';

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'method-not-allowed' });
  }

  try {
    const input = typeof request.body === 'object' && request.body ? request.body : {};
    const promptSpec = compilePromptSpec(input);
    const runPlan = createRunPlan(input);
    return response.status(200).json({
      promptSpec,
      prompt: renderPrompt(promptSpec),
      runPlan
    });
  } catch (error) {
    const code = error?.message || 'prompt-compilation-failed';
    const status = code === 'plan-capability-denied' ? 403 : 400;
    return response.status(status).json({ error: code });
  }
}
