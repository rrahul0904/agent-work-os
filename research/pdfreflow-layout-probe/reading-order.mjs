// Clean-room geometry-only reading-order probe. Input blocks are assumed extracted
// by a separately licensed PDF parser. It does NOT parse PDFs or render a reader.
const TYPES = new Set(['text','heading','figure','table','formula','caption','footnote','code']);
function compare(a,b){ return a.y0-b.y0 || a.x0-b.x0 || a.id.localeCompare(b.id); }
export function reorderPage(page){
  if(!page || !Number.isFinite(page.width) || !Number.isFinite(page.height) ||
     page.width<=0 || page.height<=0 || !Array.isArray(page.blocks)) throw new TypeError('Invalid page');
  const seen=new Set();
  const blocks=page.blocks.map(b=>{
    if(!b || typeof b.id!=='string' || !b.id || seen.has(b.id) ||
      typeof b.text!=='string' || !TYPES.has(b.kind) ||
      ![b.x0,b.y0,b.x1,b.y1].every(Number.isFinite) ||
      b.x0<0 || b.y0<0 || b.x1>page.width || b.y1>page.height ||
      b.x0>=b.x1 || b.y0>=b.y1) throw new TypeError('Invalid or duplicate block');
    seen.add(b.id);
    return {...b,source:{page:page.page??0,id:b.id,bbox:[b.x0,b.y0,b.x1,b.y1]}};
  });
  if(blocks.length===0) return {blocks:[],mode:'empty',coverage:1};
  const center=page.width/2,gutter=page.width*0.025;
  const spanning=b=>b.x0<center-gutter && b.x1>center+gutter;
  const left=b=>b.x1<=center+gutter;
  const right=b=>b.x0>=center-gutter;
  // Conservative: do not force a two-column layout on ambiguous geometry.
  const unresolved=blocks.some(b=>!spanning(b)&&!left(b)&&!right(b));
  const nLeft=blocks.filter(b=>!spanning(b)&&left(b)).length;
  const nRight=blocks.filter(b=>!spanning(b)&&right(b)).length;
  if(unresolved||nLeft<2||nRight<2)
    return {blocks:[...blocks].sort(compare),mode:'single-or-uncertain',coverage:1};
  const anchors=blocks.filter(spanning).sort(compare), ordered=[];
  let lower=-Infinity;
  for(const anchor of [...anchors,null]){
    const upper=anchor?anchor.y0:Infinity;
    const band=blocks.filter(b=>!spanning(b)&&b.y0>=lower&&b.y0<upper);
    ordered.push(...band.filter(left).sort(compare),...band.filter(right).sort(compare));
    if(anchor){ordered.push(anchor);lower=anchor.y0;}
  }
  // Nothing disappears, even when the heuristic is uncertain.
  if(ordered.length!==blocks.length || new Set(ordered.map(b=>b.id)).size!==blocks.length)
    return {blocks:[...blocks].sort(compare),mode:'single-or-uncertain',coverage:1};
  return {blocks:ordered,mode:'two-column',coverage:1};
}
