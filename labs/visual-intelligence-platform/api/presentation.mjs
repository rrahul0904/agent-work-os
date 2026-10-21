import { createNativePresentation } from '../presentation-service.mjs';

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'method-not-allowed' });
  }
  try {
    const input = typeof request.body === 'object' && request.body ? request.body : {};
    const artifact = createNativePresentation(input, { includeBytes: String(request.query?.mode || '') !== 'receipt' });
    if (String(request.query?.mode || '') === 'receipt') {
      return response.status(200).json({ plan: artifact.plan, deckPlan: artifact.deckPlan, receipt: artifact.receipt });
    }
    response.setHeader('content-type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    response.setHeader('content-disposition', 'attachment; filename="visual-intelligence.pptx"');
    response.setHeader('x-visual-intelligence-editable', 'true');
    response.setHeader('x-visual-intelligence-plan', artifact.plan);
    return response.status(200).send(artifact.pptx);
  } catch (error) {
    const code = error?.message || 'presentation-generation-failed';
    return response.status(code === 'plan-capability-denied' ? 403 : 400).json({ error: code });
  }
}
