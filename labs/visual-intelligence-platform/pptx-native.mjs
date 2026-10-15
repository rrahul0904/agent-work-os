import { createZip } from './zip-store.mjs';
import { compileDeckPlan } from './deck-plan.mjs';

const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[ch]));
const emu = inches => Math.round(Number(inches) * 914400);

function run(text, size, color, opts = {}) {
  return `<a:r><a:rPr lang="en-US" sz="${Math.round(size * 100)}"${opts.bold ? ' b="1"' : ''}><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:latin typeface="${esc(opts.font || 'Aptos')}"/></a:rPr><a:t>${esc(text)}</a:t></a:r>`;
}

function paragraph(text, size, color, opts = {}) {
  const bullet = opts.bullet ? '<a:pPr marL="342900" indent="-285750"><a:buChar char="•"/></a:pPr>' : '<a:pPr/>';
  return `<a:p>${bullet}${run(text, size, color, opts)}<a:endParaRPr lang="en-US" sz="${Math.round(size * 100)}"/></a:p>`;
}

function textShape(id, name, x, y, w, h, paragraphs, options = {}) {
  const fill = options.fill ? `<a:solidFill><a:srgbClr val="${options.fill}"/></a:solidFill>` : '<a:noFill/>';
  const line = options.line ? `<a:ln w="${options.lineWidth || 12700}"><a:solidFill><a:srgbClr val="${options.line}"/></a:solidFill></a:ln>` : '<a:ln><a:noFill/></a:ln>';
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${esc(name)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${emu(x)}" y="${emu(y)}"/><a:ext cx="${emu(w)}" cy="${emu(h)}"/></a:xfrm><a:prstGeom prst="${options.shape || 'rect'}"><a:avLst/></a:prstGeom>${fill}${line}</p:spPr><p:txBody><a:bodyPr wrap="square" lIns="${emu(.08)}" rIns="${emu(.08)}" tIns="${emu(.06)}" bIns="${emu(.04)}"/><a:lstStyle/>${paragraphs.join('')}</p:txBody></p:sp>`;
}

function rectShape(id, name, x, y, w, h, fill) {
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${esc(name)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${emu(x)}" y="${emu(y)}"/><a:ext cx="${emu(w)}" cy="${emu(h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="${fill}"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr></p:sp>`;
}

function groupRoot() {
  return '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
}

function slideXml(slide, theme, index) {
  const shapes = [groupRoot(), rectShape(2, 'Accent Bar', .45, .45, .08, 6.55, theme.accent)];
  let id = 3;
  if (slide.layout === 'title' || index === 0) {
    shapes.push(textShape(id++, 'Title', .9, 1.55, 11.3, 1.35, [paragraph(slide.title, 30, theme.foreground, {bold:true,font:'Aptos Display'})]));
    if (slide.subtitle || slide.body) shapes.push(textShape(id++, 'Subtitle', .92, 3.05, 10.8, 1.25, [paragraph(slide.subtitle || slide.body, 17, theme.muted, {font:'Aptos'})]));
  } else {
    shapes.push(textShape(id++, 'Slide Title', .85, .55, 11.45, .72, [paragraph(slide.title, 23, theme.foreground, {bold:true,font:'Aptos Display'})]));
    const body = [];
    if (slide.body) body.push(paragraph(slide.body, 15, theme.muted, {font:'Aptos'}));
    for (const bullet of slide.bullets) body.push(paragraph(bullet, 16, theme.foreground, {bullet:true,font:'Aptos'}));
    if (!body.length) body.push(paragraph(' ', 15, theme.foreground));
    shapes.push(textShape(id++, 'Body', .95, 1.55, 11.0, 4.75, body));
  }
  const bg = `<p:bg><p:bgPr><a:solidFill><a:srgbClr val="${theme.background}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld ${NS}><p:cSld name="${esc(slide.title)}">${bg}<p:spTree>${shapes.join('')}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}

function contentTypes(count) {
  const slides = Array.from({length:count},(_,i)=>`<Override PartName="/ppt/slides/slide${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>${slides}</Types>`;
}

function presentationXml(count) {
  const ids = Array.from({length:count},(_,i)=>`<p:sldId id="${256+i}" r:id="rId${i+2}"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation ${NS}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${ids}</p:sldIdLst><p:sldSz cx="12192000" cy="6858000" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`;
}

function presentationRels(count) {
  const slides = Array.from({length:count},(_,i)=>`<Relationship Id="rId${i+2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i+1}.xml"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>${slides}</Relationships>`;
}

const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;
const layoutXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout ${NS} type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>${groupRoot()}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;
const layoutRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`;
const masterXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster ${NS}><p:cSld><p:spTree>${groupRoot()}</p:spTree></p:cSld><p:clrMap accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" bg1="lt1" bg2="lt2" folHlink="folHlink" hlink="hlink" tx1="dk1" tx2="dk2"/><p:sldLayoutIdLst><p:sldLayoutId id="1" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>`;
const masterRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>`;
const themeXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Visual Intelligence"><a:themeElements><a:clrScheme name="Visual Intelligence"><a:dk1><a:srgbClr val="07111F"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="1C2838"/></a:dk2><a:lt2><a:srgbClr val="EEF6FF"/></a:lt2><a:accent1><a:srgbClr val="66E3FF"/></a:accent1><a:accent2><a:srgbClr val="A78BFA"/></a:accent2><a:accent3><a:srgbClr val="6EE7B7"/></a:accent3><a:accent4><a:srgbClr val="FBBF24"/></a:accent4><a:accent5><a:srgbClr val="FB7185"/></a:accent5><a:accent6><a:srgbClr val="93A8BF"/></a:accent6><a:hlink><a:srgbClr val="66E3FF"/></a:hlink><a:folHlink><a:srgbClr val="A78BFA"/></a:folHlink></a:clrScheme><a:fontScheme name="Aptos"><a:majorFont><a:latin typeface="Aptos Display"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Aptos"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Visual Intelligence"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;

export function generateNativePptx(input) {
  const plan = input?.specVersion === 'deck-plan/v1alpha1' ? input : compileDeckPlan(input);
  const files = [
    {name:'[Content_Types].xml',data:contentTypes(plan.slides.length)},
    {name:'_rels/.rels',data:rootRels},
    {name:'docProps/core.xml',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(plan.title)}</dc:title><dc:creator>Visual Intelligence Platform</dc:creator><cp:lastModifiedBy>Visual Intelligence Platform</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">2026-01-01T00:00:00Z</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">2026-01-01T00:00:00Z</dcterms:modified></cp:coreProperties>`},
    {name:'docProps/app.xml',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Visual Intelligence Platform</Application><PresentationFormat>On-screen Show (16:9)</PresentationFormat><Slides>${plan.slides.length}</Slides><Company></Company><AppVersion>1.0</AppVersion></Properties>`},
    {name:'ppt/presentation.xml',data:presentationXml(plan.slides.length)},
    {name:'ppt/_rels/presentation.xml.rels',data:presentationRels(plan.slides.length)},
    {name:'ppt/slideMasters/slideMaster1.xml',data:masterXml},
    {name:'ppt/slideMasters/_rels/slideMaster1.xml.rels',data:masterRels},
    {name:'ppt/slideLayouts/slideLayout1.xml',data:layoutXml},
    {name:'ppt/slideLayouts/_rels/slideLayout1.xml.rels',data:layoutRels},
    {name:'ppt/theme/theme1.xml',data:themeXml}
  ];
  plan.slides.forEach((slide,index)=>{
    files.push({name:`ppt/slides/slide${index+1}.xml`,data:slideXml(slide,plan.theme,index)});
    files.push({name:`ppt/slides/_rels/slide${index+1}.xml.rels`,data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`});
  });
  return createZip(files);
}

export function nativePptxReceipt(input) {
  const plan = input?.specVersion === 'deck-plan/v1alpha1' ? input : compileDeckPlan(input);
  const buffer = generateNativePptx(plan);
  return Object.freeze({format:'pptx',editable:true,compiler:'visual-intelligence-native-ooxml/v1alpha1',slides:plan.slides.length,bytes:buffer.length,magic:buffer.subarray(0,2).toString('ascii')});
}
