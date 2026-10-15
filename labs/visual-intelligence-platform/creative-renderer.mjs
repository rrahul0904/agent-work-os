const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

function wrap(text, max = 24) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = []; let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > max && line) { lines.push(line); line = word; }
    else line = next;
  }
  if (line) lines.push(line);
  return lines.slice(0, 5);
}

export function renderCreativeSvg(spec) {
  const { width, height } = spec.artboard;
  const pad = Math.round(width * 0.075);
  const landscape = width > height;
  const headlineSize = Math.round((landscape ? height : width) * 0.078);
  const bodySize = Math.round(headlineSize * 0.34);
  const lineGap = Math.round(headlineSize * 1.02);
  const lines = wrap(spec.copy.headline, landscape ? 28 : 20);
  const titleY = Math.round(height * (landscape ? 0.34 : 0.27));
  const bodyY = titleY + lines.length * lineGap + Math.round(headlineSize * 0.55);
  const buttonW = Math.round(width * 0.25);
  const buttonH = Math.round(Math.max(54, height * 0.055));
  const buttonY = Math.min(height - pad - buttonH, bodyY + Math.round(height * 0.16));

  const headline = lines.map((line, i) => `<text x="${pad}" y="${titleY + i*lineGap}" font-size="${headlineSize}" font-weight="800" font-family="${esc(spec.brand.fontFamily)}" fill="#${spec.brand.foreground}">${esc(line)}</text>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="creative-title creative-desc">
<title id="creative-title">${esc(spec.copy.headline)}</title><desc id="creative-desc">Editable ${esc(spec.format)} creative generated from CreativeSpec.</desc>
<rect id="background" x="0" y="0" width="${width}" height="${height}" fill="#${spec.brand.background}"/>
<circle id="accent" cx="${Math.round(width*.87)}" cy="${Math.round(height*.15)}" r="${Math.round(Math.min(width,height)*.18)}" fill="#${spec.brand.accent}" opacity=".18"/>
<rect x="${pad}" y="${Math.round(height*.12)}" width="${Math.round(width*.08)}" height="${Math.max(8,Math.round(height*.008))}" rx="4" fill="#${spec.brand.accent}"/>
<text id="eyebrow" x="${pad}" y="${Math.round(height*.19)}" font-size="${Math.max(18,Math.round(headlineSize*.26))}" font-weight="700" letter-spacing="3" font-family="${esc(spec.brand.fontFamily)}" fill="#${spec.brand.accent}">${esc(spec.copy.eyebrow)}</text>
<g id="headline">${headline}</g>
${spec.copy.body ? `<text id="body" x="${pad}" y="${bodyY}" font-size="${bodySize}" font-family="${esc(spec.brand.fontFamily)}" fill="#${spec.brand.muted}">${esc(spec.copy.body.slice(0,120))}</text>` : ''}
<g id="cta"><rect x="${pad}" y="${buttonY}" width="${buttonW}" height="${buttonH}" rx="${Math.round(buttonH/2)}" fill="#${spec.brand.accent}"/><text x="${pad+buttonW/2}" y="${buttonY+Math.round(buttonH*.64)}" text-anchor="middle" font-size="${Math.round(buttonH*.32)}" font-weight="800" font-family="${esc(spec.brand.fontFamily)}" fill="#07111F">${esc(spec.copy.cta)}</text></g>
<text x="${pad}" y="${height-pad}" font-size="${Math.max(16,Math.round(bodySize*.8))}" font-family="${esc(spec.brand.fontFamily)}" fill="#${spec.brand.muted}">${esc(spec.brand.name)}</text>
</svg>`;
}

export function creativeReceipt(spec, svg) {
  const issues = [];
  if (spec.copy.headline.length > 90) issues.push('headline-too-long');
  if (spec.copy.body.length > 160) issues.push('body-too-long');
  if (!spec.copy.cta) issues.push('cta-missing');
  return Object.freeze({
    format: 'svg', editable: true, artboard: spec.artboard, layers: spec.layers.length,
    bytes: Buffer.byteLength(svg, 'utf8'), issues: Object.freeze(issues), passed: issues.length === 0
  });
}
