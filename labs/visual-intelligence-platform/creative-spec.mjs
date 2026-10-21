const clean = value => String(value ?? '').trim().replace(/\s+/g, ' ');
const SIZES = Object.freeze({
  'square': { width: 1080, height: 1080 },
  'story': { width: 1080, height: 1920 },
  'landscape': { width: 1200, height: 628 },
  'linkedin': { width: 1200, height: 1200 },
  'presentation-cover': { width: 1600, height: 900 }
});

export function compileCreativeSpec(input = {}) {
  const format = clean(input.format || 'square').toLowerCase();
  if (!SIZES[format]) throw new Error('unsupported-creative-format');
  const headline = clean(input.headline || input.objective);
  if (!headline) throw new Error('creative-headline-required');
  const artboard = Object.freeze({ ...SIZES[format] });
  const spec = {
    specVersion: 'creative-spec/v1alpha1',
    format,
    artboard,
    objective: clean(input.objective || headline),
    audience: clean(input.audience || 'general'),
    brand: Object.freeze({
      name: clean(input.brand?.name || 'Visual Intelligence'),
      background: clean(input.brand?.background || '07111F'),
      foreground: clean(input.brand?.foreground || 'EEF6FF'),
      accent: clean(input.brand?.accent || '66E3FF'),
      muted: clean(input.brand?.muted || '9FB2C8'),
      fontFamily: clean(input.brand?.fontFamily || 'Inter')
    }),
    copy: Object.freeze({
      eyebrow: clean(input.eyebrow || 'VISUAL INTELLIGENCE'),
      headline,
      body: clean(input.body),
      cta: clean(input.cta || 'Learn more')
    }),
    layers: Object.freeze([
      Object.freeze({ id: 'background', type: 'shape', role: 'background' }),
      Object.freeze({ id: 'accent', type: 'shape', role: 'accent' }),
      Object.freeze({ id: 'eyebrow', type: 'text', role: 'eyebrow' }),
      Object.freeze({ id: 'headline', type: 'text', role: 'headline' }),
      Object.freeze({ id: 'body', type: 'text', role: 'body' }),
      Object.freeze({ id: 'cta', type: 'text', role: 'cta' })
    ]),
    provenance: Object.freeze({ source: clean(input.source || 'user-input'), generatedBy: 'visual-intelligence-platform' })
  };
  return Object.freeze(spec);
}

export const creativeFormats = Object.freeze(Object.keys(SIZES));
