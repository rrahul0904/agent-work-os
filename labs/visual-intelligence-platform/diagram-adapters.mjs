const q = value => String(value ?? '').replace(/"/g, '\\"');
const xml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[ch]));

export function toMermaid(spec) {
  const lines = ['flowchart LR'];
  for (const node of spec.nodes) {
    lines.push(`  ${node.id.replace(/[^A-Za-z0-9_]/g, '_')}["${q(node.label)}"]`);
  }
  for (const edge of spec.edges) {
    const from = edge.from.replace(/[^A-Za-z0-9_]/g, '_');
    const to = edge.to.replace(/[^A-Za-z0-9_]/g, '_');
    const label = [edge.label, edge.protocol].filter(Boolean).join(' · ');
    lines.push(label ? `  ${from} -->|"${q(label)}"| ${to}` : `  ${from} --> ${to}`);
  }
  return lines.join('\n');
}

export function toPlantUml(spec) {
  const alias = id => id.replace(/[^A-Za-z0-9_]/g, '_');
  const lines = ['@startuml', `title ${q(spec.title)}`, 'left to right direction'];
  for (const node of spec.nodes) {
    const kind = ['database','storage','dataset'].includes(node.type) ? 'database' : node.type === 'actor' ? 'actor' : 'component';
    lines.push(`${kind} "${q(node.label)}" as ${alias(node.id)}`);
  }
  for (const edge of spec.edges) {
    const label = [edge.label, edge.protocol].filter(Boolean).join(' / ');
    lines.push(`${alias(edge.from)} --> ${alias(edge.to)}${label ? ` : ${q(label)}` : ''}`);
  }
  lines.push('@enduml');
  return lines.join('\n');
}

export function toDrawioXml(spec, layout) {
  const cells = [];
  cells.push('<mxCell id="0"/>', '<mxCell id="1" parent="0"/>');
  for (const node of spec.nodes) {
    const p = layout.positions.get(node.id);
    cells.push(`<mxCell id="${xml(node.id)}" value="${xml(node.label)}" style="rounded=1;whiteSpace=wrap;html=1;" vertex="1" parent="1"><mxGeometry x="${p.x}" y="${p.y}" width="${p.width}" height="${p.height}" as="geometry"/></mxCell>`);
  }
  for (const edge of spec.edges) {
    const value = [edge.label, edge.protocol].filter(Boolean).join(' · ');
    cells.push(`<mxCell id="${xml(edge.id)}" value="${xml(value)}" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=block;" edge="1" parent="1" source="${xml(edge.from)}" target="${xml(edge.to)}"><mxGeometry relative="1" as="geometry"/></mxCell>`);
  }
  return `<mxfile host="app.diagrams.net" version="visual-intelligence"><diagram name="${xml(spec.title)}"><mxGraphModel><root>${cells.join('')}</root></mxGraphModel></diagram></mxfile>`;
}
