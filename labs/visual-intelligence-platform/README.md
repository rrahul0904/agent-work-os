# Visual Intelligence Platform — Phase A lab

This is the first runnable slice of the hosted Visual Intelligence Platform.

## Included

- five artifact routes: architecture diagram, technical diagram, technical presentation, creative presentation, creative ad
- deterministic Prompt Studio that compiles user intent into `prompt-spec/v1alpha1`
- artifact-specific specialist agent chains
- Community / Pro / Enterprise product shell
- static build suitable for preview hosting without model credentials

## Verify

```bash
npm test
npm run build
```

Expected build output:

```text
dist/index.html
dist/prompt-core.mjs
```

## Current boundary

The Phase A shell does not yet call external LLM providers or generate final DiagramSpec, PPTX, images, ads, or video. Those are gated follow-on phases that bind the existing owned Traceframe, Presentation OS, Technical Visual Studio, Zalcro, and PR Lens capabilities.

No donor parity, production readiness, or shipped claim is made from this lab.
