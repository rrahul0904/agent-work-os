import { compileDiagramSpec } from '../diagram-spec.mjs';
import { layoutDiagram, renderDiagramSvg } from '../diagram-renderer.mjs';
import { critiqueDiagram } from '../diagram-critic.mjs';
import { toDrawioXml, toMermaid, toPlantUml } from '../diagram-adapters.mjs';

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'method-not-allowed' });
  }

  try {
    const input = typeof request.body === 'object' && request.body ? request.body : {};
    const diagramSpec = compileDiagramSpec(input);
    const layout = layoutDiagram(diagramSpec);
    const critique = critiqueDiagram(diagramSpec);
    return response.status(200).json({
      diagramSpec,
      critique,
      svg: renderDiagramSvg(diagramSpec),
      exports: {
        mermaid: toMermaid(diagramSpec),
        plantuml: toPlantUml(diagramSpec),
        drawio: toDrawioXml(diagramSpec, layout)
      }
    });
  } catch (error) {
    return response.status(400).json({ error: error?.message || 'diagram-generation-failed' });
  }
}
