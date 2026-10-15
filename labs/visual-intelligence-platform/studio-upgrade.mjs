const $ = id => document.getElementById(id);
const tabs = document.querySelector('.workspace-tabs');
const pricingTitle = [...document.querySelectorAll('.section-title')].find(x => x.textContent.includes('Commercial editions'));

function button(label, target) {
  const el = document.createElement('button');
  el.className = 'tab';
  el.dataset.tab = target;
  el.textContent = label;
  return el;
}

for (const placeholder of [...tabs.querySelectorAll('.pill')]) placeholder.remove();
const presentationTab = button('Presentation Studio', 'presentation-workspace');
const creativeTab = button('Creative Studio', 'creative-workspace');
tabs.append(presentationTab, creativeTab);

const presentation = document.createElement('section');
presentation.id = 'presentation-workspace';
presentation.className = 'workspace';
presentation.innerHTML = `<div class="studio"><div class="panel panel-body"><h2>Presentation Studio</h2><div class="sub">DeckPlan → owned OOXML compiler → native editable PowerPoint.</div><div class="field"><label>DeckPlan input</label><textarea id="deckInput" class="code"></textarea></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="button" id="inspectDeck">Compile receipt</button><button class="button secondary" id="downloadDeck">Download editable PPTX</button></div><div class="meta-row"><span class="pill" id="deckSlides">Slides: —</span><span class="pill" id="deckBytes">Bytes: —</span><span class="pill" id="deckEditable">Editable: —</span></div></div><div class="panel panel-body"><h2>DeckPlan + artifact receipt</h2><div class="sub">The receipt is separate from the PPTX binary so editability and compiler identity are inspectable.</div><div class="codebox" id="deckReceipt"></div></div></div>`;
pricingTitle.before(presentation);

const creative = document.createElement('section');
creative.id = 'creative-workspace';
creative.className = 'workspace';
creative.innerHTML = `<div class="diagram-grid"><div class="panel panel-body"><h2>Creative Studio</h2><div class="sub">CreativeSpec → adaptive artboard → layered editable SVG.</div><div class="field"><label>Format</label><select id="creativeFormat"><option value="square">Square 1080×1080</option><option value="story">Story 1080×1920</option><option value="landscape">Landscape 1200×628</option><option value="linkedin">LinkedIn 1200×1200</option><option value="presentation-cover">Presentation cover 1600×900</option></select></div><div class="field"><label>Headline</label><textarea id="creativeHeadline">Architecture that stays editable</textarea></div><div class="field"><label>Body</label><textarea id="creativeBody">Create diagrams, decks and campaign assets with governed AI agents.</textarea></div><div class="field"><label>CTA</label><input id="creativeCta" value="Build now"></div><button class="button" id="renderCreative">Render creative</button><div class="meta-row"><span class="pill" id="creativeLayers">Layers: —</span><span class="pill" id="creativeQuality">Quality: —</span></div></div><div class="panel panel-body"><h2>Layered creative preview</h2><div class="sub">The output remains semantic SVG with named layers for downstream editing/export.</div><div class="preview" id="creativePreview"></div><div class="codebox" id="creativeReceipt" style="min-height:110px;margin-top:12px"></div></div></div>`;
pricingTitle.before(creative);

const deckSample = {
  title: 'Visual Intelligence Platform',
  audience: 'enterprise architecture and product leadership',
  purpose: 'technical-presentation',
  slides: [
    { title: 'Visual Intelligence Platform', subtitle: 'Governed agents for editable diagrams, presentations and creative assets', layout: 'title' },
    { title: 'Why it matters', bullets: ['Prompt Studio converts rough intent into structured artifact specifications', 'DiagramSpec and DeckPlan keep outputs editable', 'Specialist critics and VisualBench provide measurable quality gates'] },
    { title: 'Platform architecture', body: 'Agent Work OS orchestrates research, critique, semantic compilation, rendering, review and receipts.' }
  ]
};
$('deckInput').value = JSON.stringify(deckSample, null, 2);

async function inspectDeck() {
  try {
    const payload = JSON.parse($('deckInput').value);
    const res = await fetch('/api/presentation?mode=receipt', {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(payload)});
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'presentation-generation-failed');
    $('deckReceipt').textContent = JSON.stringify(data, null, 2);
    $('deckSlides').textContent = `Slides: ${data.receipt.slides}`;
    $('deckBytes').textContent = `Bytes: ${data.receipt.bytes}`;
    $('deckEditable').textContent = `Editable: ${data.receipt.editable ? 'yes' : 'no'}`;
  } catch (error) { $('deckReceipt').textContent = `Presentation error: ${error.message}`; }
}

async function downloadDeck() {
  try {
    const payload = JSON.parse($('deckInput').value);
    const res = await fetch('/api/presentation', {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(payload)});
    if (!res.ok) { const data = await res.json(); throw new Error(data.error || 'presentation-generation-failed'); }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'visual-intelligence.pptx'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  } catch (error) { $('deckReceipt').textContent = `Presentation error: ${error.message}`; }
}

async function renderCreative() {
  try {
    const payload = {format:$('creativeFormat').value, headline:$('creativeHeadline').value, body:$('creativeBody').value, cta:$('creativeCta').value, audience:'professional creators'};
    const res = await fetch('/api/creative', {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(payload)});
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'creative-generation-failed');
    $('creativePreview').innerHTML = data.svg;
    $('creativeReceipt').textContent = JSON.stringify(data.receipt, null, 2);
    $('creativeLayers').textContent = `Layers: ${data.receipt.layers}`;
    $('creativeQuality').textContent = `Quality: ${data.receipt.passed ? 'pass' : 'review'}`;
  } catch (error) { $('creativePreview').textContent = `Creative error: ${error.message}`; }
}

function selectTab(tab) {
  document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.workspace').forEach(x => x.classList.remove('active'));
  tab.classList.add('active');
  $(tab.dataset.tab).classList.add('active');
}

presentationTab.addEventListener('click', () => selectTab(presentationTab));
creativeTab.addEventListener('click', () => selectTab(creativeTab));
$('inspectDeck').addEventListener('click', inspectDeck);
$('downloadDeck').addEventListener('click', downloadDeck);
$('renderCreative').addEventListener('click', renderCreative);
inspectDeck();
renderCreative();
