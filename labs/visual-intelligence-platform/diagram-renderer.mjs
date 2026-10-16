import { validateDiagramSpec } from './diagram-spec.mjs';

const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

function computeLayers(spec) {
  const incoming = new Map(spec.nodes.map(n => [n.id, 0]));
  const outgoing = new Map(spec.nodes.map(n => [n.id, []]));
  for (const edge of spec.edges) {
    incoming.set(edge.to, (incoming.get(edge.to) || 0) + 1);
    outgoing.get(edge.from)?.push(edge.to);
  }
  const queue = [...spec.nodes.filter(n => (incoming.get(n.id) || 0) === 0).map(n => n.id)];
  const depth = new Map(spec.nodes.map(n => [n.id, 0]));
  let processed = 0;
  while (queue.length) {
    const id = queue.shift();
    processed += 1;
    for (const next of outgoing.get(id) || []) {
      depth.set(next, Math.max(depth.get(next) || 0, (depth.get(id) || 0) + 1));
      incoming.set(next, (incoming.get(next) || 0) - 1);
      if ((incoming.get(next) || 0) === 0) queue.push(next);
    }
  }
  if (processed < spec.nodes.length) {
    spec.nodes.forEach((node, index) => depth.set(node.id, Math.floor(index / 4)));
  }
  const layers = new Map();
  for (const node of spec.nodes) {
    const d = depth.get(node.id) || 0;
    if (!layers.has(d)) layers.set(d, []);
    layers.get(d).push(node);
  }
  return layers;
}

export function layoutDiagram(spec, options = {}) {
  const validation = validateDiagramSpec(spec);
  if (!validation.valid) throw new Error('invalid-diagram-spec');
  const nodeWidth = Number(options.nodeWidth || 210);
  const nodeHeight = Number(options.nodeHeight || 94);
  const gapX = Number(options.gapX || 100);
  const gapY = Number(options.gapY || 42);
  const margin = Number(options.margin || 48);
  const layers = computeLayers(spec);
  const maxLayerSize = Math.max(...[...layers.values()].map(nodes => nodes.length));
  const maxDepth = Math.max(...layers.keys());
  const width = margin * 2 + (maxDepth + 1) * nodeWidth + maxDepth * gapX;
  const height = margin * 2 + Math.max(1, maxLayerSize) * nodeHeight + Math.max(0, maxLayerSize - 1) * gapY + 64;
  const positions = new Map();
  for (const [depth, nodes] of [...layers.entries()].sort((a,b)=>a[0]-b[0])) {
    const total = nodes.length * nodeHeight + Math.max(0, nodes.length - 1) * gapY;
    const startY = Math.max(margin + 52, (height - total) / 2);
    nodes.forEach((node, row) => {
      positions.set(node.id, Object.freeze({
        x: margin + depth * (nodeWidth + gapX),
        y: startY + row * (nodeHeight + gapY),
        width: nodeWidth,
        height: nodeHeight
      }));
    });
  }
  return Object.freeze({ width, height, nodeWidth, nodeHeight, positions });
}

export function renderDiagramSvg(spec, options = {}) {
  const layout = layoutDiagram(spec, options);
  const style = `
    .bg{fill:#08111f}.title{fill:#eef6ff;font:700 22px system-ui}.subtitle{fill:#9fb4cc;font:13px system-ui}
    .node{fill:#11233a;stroke:#35506f;stroke-width:1.4}.node-observed{stroke:#53d5ff}.label{fill:#f3f8ff;font:700 14px system-ui}
    .meta{fill:#9fb4cc;font:11px system-ui}.edge{fill:none;stroke:#7f97b1;stroke-width:1.5;marker-end:url(#arrow)}
    .edge-label{fill:#b9cbe0;font:11px system-ui}.boundary{fill:#82dfff;font:10px system-ui;text-transform:uppercase}
  `;
  const lines = [];
  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}" role="img" aria-labelledby="diagram-title diagram-desc">`);
  lines.push(`<title id="diagram-title">${esc(spec.title)}</title><desc id="diagram-desc">${esc(spec.description || `${spec.kind} diagram with ${spec.nodes.length} nodes and ${spec.edges.length} relationships`)}</desc>`);
  lines.push(`<defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#7f97b1"/></marker></defs><style>${style}</style>`);
  lines.push(`<rect class="bg" width="100%" height="100%" rx="18"/><text class="title" x="48" y="38">${esc(spec.title)}</text><text class="subtitle" x="48" y="58">${esc(spec.kind)} · semantic editable source</text>`);

  for (const edge of spec.edges) {
    const from = layout.positions.get(edge.from); const to = layout.positions.get(edge.to);
    const x1 = from.x + from.width; const y1 = from.y + from.height / 2;
    const x2 = to.x; const y2 = to.y + to.height / 2;
    const bend = Math.max(36, (x2 - x1) / 2);
    const path = `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
    lines.push(`<path class="edge" d="${path}" data-edge-id="${esc(edge.id)}"/>`);
    if (edge.label || edge.protocol) {
      lines.push(`<text class="edge-label" x="${(x1+x2)/2}" y="${(y1+y2)/2 - 7}" text-anchor="middle">${esc([edge.label, edge.protocol].filter(Boolean).join(' · '))}</text>`);
    }
  }

  for (const node of spec.nodes) {
    const p = layout.positions.get(node.id);
    const observed = Boolean(node.evidence);
    lines.push(`<g data-node-id="${esc(node.id)}" tabindex="0" aria-label="${esc(`${node.label}, ${node.type}`)}">`);
    lines.push(`<rect class="node${observed ? ' node-observed' : ''}" x="${p.x}" y="${p.y}" width="${p.width}" height="${p.height}" rx="14"/>`);
    if (node.boundary) lines.push(`<text class="boundary" x="${p.x+14}" y="${p.y+18}">${esc(node.boundary)}</text>`);
    lines.push(`<text class="label" x="${p.x+14}" y="${p.y+40}">${esc(node.label)}</text>`);
    lines.push(`<text class="meta" x="${p.x+14}" y="${p.y+59}">${esc(node.type)}${node.technology ? ` · ${esc(node.technology)}` : ''}</text>`);
    if (node.description) lines.push(`<text class="meta" x="${p.x+14}" y="${p.y+78}">${esc(node.description.slice(0, 34))}</text>`);
    lines.push(`</g>`);
  }
  lines.push('</svg>');
  return lines.join('');
}
