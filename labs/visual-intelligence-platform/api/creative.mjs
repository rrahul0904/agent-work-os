import { compileCreativeSpec } from '../creative-spec.mjs';
import { renderCreativeSvg, creativeReceipt } from '../creative-renderer.mjs';

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'method-not-allowed' });
  }
  try {
    const input = typeof request.body === 'object' && request.body ? request.body : {};
    const creativeSpec = compileCreativeSpec(input);
    const svg = renderCreativeSvg(creativeSpec);
    return response.status(200).json({ creativeSpec, svg, receipt: creativeReceipt(creativeSpec, svg) });
  } catch (error) {
    return response.status(400).json({ error: error?.message || 'creative-generation-failed' });
  }
}
