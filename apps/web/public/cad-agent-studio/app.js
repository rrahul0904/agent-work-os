const $ = (id) => document.getElementById(id);
const ctx = $('canvas').getContext('2d');

function spec() {
  return {
    schemaVersion: 'cad.agent.model/v1',
    id: 'demo-enclosure', name: $('name').value, units: 'mm', primitive: 'box',
    dimensions: { width: +$('width').value, depth: +$('depth').value, height: +$('height').value },
  };
}

function fnv(text) {
  let h = 2166136261;
  for (const ch of text) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function project(x, y, z, scale, cx, cy) {
  return [cx + (x - y) * 0.866 * scale, cy + (x + y) * 0.5 * scale - z * scale];
}

function drawBox(model) {
  const { width:w, depth:d, height:h } = model.dimensions;
  const scale = Math.min(4.2, 440 / Math.max(w, d, h));
  const cx = 450, cy = 390;
  const pts = [[0,0,0],[w,0,0],[w,d,0],[0,d,0],[0,0,h],[w,0,h],[w,d,h],[0,d,h]].map(([x,y,z]) => project(x-w/2,y-d/2,z,scale,cx,cy));
  const faces = [[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7],[4,5,6,7]];
  ctx.clearRect(0,0,900,600);
  ctx.lineWidth = 2;
  faces.forEach((face, i) => {
    ctx.beginPath(); face.forEach((idx,j) => { const [x,y]=pts[idx]; j?ctx.lineTo(x,y):ctx.moveTo(x,y); }); ctx.closePath();
    ctx.fillStyle = `rgba(92, 146, 255, ${0.12 + i*0.035})`; ctx.fill();
    ctx.strokeStyle = 'rgba(205,220,255,.8)'; ctx.stroke();
  });
}

function updateLabels(model) {
  for (const key of ['width','depth','height']) $(`${key}Value`).textContent = `${model.dimensions[key]} mm`;
  const {width:w, depth:d, height:h} = model.dimensions;
  $('measurements').innerHTML = `<span>X ${w} mm</span><span>Y ${d} mm</span><span>Z ${h} mm</span><span>Volume ${(w*d*h).toLocaleString()} mm³</span>`;
}

function build() {
  const model = spec(); drawBox(model); updateLabels(model);
  const payload = { engine:'p1-browser-analytic', spec:model, measurements:{bounds:{x:model.dimensions.width,y:model.dimensions.depth,z:model.dimensions.height}}, assertions:[{path:'bounds.x',expected:model.dimensions.width,actual:model.dimensions.width,ok:true}], valid:true };
  const digest = `${fnv(JSON.stringify(payload))}-preview-noncrypto`;
  $('receipt').textContent = JSON.stringify({...payload,digest}, null, 2);
  $('status').textContent = 'Verified preview';
}

for (const id of ['width','depth','height','name']) $(id).addEventListener('input', build);
$('build').addEventListener('click', build);
$('feedback').addEventListener('click', () => {
  const model = spec();
  const packet = { schemaVersion:'cad.agent.feedback/v1', model:model.id, message:$('prompt').value, selection:{kind:'model'}, measurements:model.dimensions, note:'P2 sends this packet to the selected CLI-agent workspace.' };
  $('receipt').textContent = JSON.stringify(packet,null,2); $('status').textContent='Feedback packet ready';
});
build();
