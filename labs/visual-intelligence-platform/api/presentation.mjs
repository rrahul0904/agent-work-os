import { compileDeckPlan } from '../deck-plan.mjs';
import { generateNativePptx, nativePptxReceipt } from '../pptx-native.mjs';

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'method-not-allowed' });
  }
  try {
    const input = typeof request.body === 'object' && request.body ? request.body : {};
    const plan = compileDeckPlan(input);
    const pptx = generateNativePptx(plan);
    if (String(request.query?.mode || '') === 'receipt') return response.status(200).json({ deckPlan: plan, receipt: nativePptxReceipt(plan) });
    response.setHeader('content-type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    response.setHeader('content-disposition', 'attachment; filename="visual-intelligence.pptx"');
    response.setHeader('x-visual-intelligence-editable', 'true');
    return response.status(200).send(pptx);
  } catch (error) {
    return response.status(400).json({ error: error?.message || 'presentation-generation-failed' });
  }
}
