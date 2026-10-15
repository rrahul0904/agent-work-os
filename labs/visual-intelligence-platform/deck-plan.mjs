const clean = value => String(value ?? '').trim().replace(/\s+/g, ' ');

export function compileDeckPlan(input = {}) {
  const title = clean(input.title || input.objective);
  if (!title) throw new Error('deck-title-required');
  const rawSlides = Array.isArray(input.slides) ? input.slides : [];
  if (!rawSlides.length) throw new Error('deck-slides-required');
  if (rawSlides.length > 80) throw new Error('deck-too-large');

  const slides = rawSlides.map((slide, index) => {
    const slideTitle = clean(slide.title || `Slide ${index + 1}`);
    const bullets = (Array.isArray(slide.bullets) ? slide.bullets : [])
      .map(clean).filter(Boolean).slice(0, 12);
    const body = clean(slide.body);
    const layout = clean(slide.layout || (index === 0 ? 'title' : 'title-body'));
    return Object.freeze({
      id: clean(slide.id || `slide-${index + 1}`),
      title: slideTitle,
      subtitle: clean(slide.subtitle),
      body,
      bullets: Object.freeze(bullets),
      layout,
      speakerNotes: clean(slide.speakerNotes),
      source: clean(slide.source)
    });
  });

  return Object.freeze({
    specVersion: 'deck-plan/v1alpha1',
    title,
    audience: clean(input.audience || 'professional'),
    purpose: clean(input.purpose || 'technical-presentation'),
    theme: Object.freeze({
      name: clean(input.theme?.name || 'Visual Intelligence Dark'),
      fontFamily: clean(input.theme?.fontFamily || 'Aptos'),
      background: clean(input.theme?.background || '07111F'),
      foreground: clean(input.theme?.foreground || 'EEF6FF'),
      muted: clean(input.theme?.muted || '9FB2C8'),
      accent: clean(input.theme?.accent || '66E3FF')
    }),
    slides: Object.freeze(slides),
    provenance: Object.freeze({ source: clean(input.source || 'user-input'), generatedBy: 'visual-intelligence-platform' })
  });
}
