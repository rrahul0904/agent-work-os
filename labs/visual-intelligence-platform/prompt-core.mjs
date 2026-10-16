export const ARTIFACTS = Object.freeze({
  "architecture-diagram": {
    label: "Architecture Diagram",
    agents: ["intent-router", "requirements-planner", "research-grounding", "architecture-critic", "diagram-spec-compiler", "layout-designer", "mechanical-qa", "fresh-eyes-reviewer"],
    defaults: { editability: "semantic editable diagram", exports: ["svg", "png", "pdf"] }
  },
  "technical-diagram": {
    label: "Technical Diagram",
    agents: ["intent-router", "requirements-planner", "research-grounding", "technical-critic", "diagram-spec-compiler", "layout-designer", "mechanical-qa", "fresh-eyes-reviewer"],
    defaults: { editability: "semantic editable diagram", exports: ["svg", "png", "pdf"] }
  },
  "technical-presentation": {
    label: "Technical PPT",
    agents: ["intent-router", "requirements-planner", "research-grounding", "architecture-critic", "narrative-agent", "deck-plan-compiler", "layout-designer", "pptx-renderer", "mechanical-qa", "fresh-eyes-reviewer"],
    defaults: { editability: "native editable PPTX", exports: ["pptx", "pdf"] }
  },
  "creative-presentation": {
    label: "Creative PPT",
    agents: ["intent-router", "creative-brief-agent", "research-grounding", "narrative-agent", "art-director", "deck-plan-compiler", "layout-designer", "pptx-renderer", "fresh-eyes-reviewer"],
    defaults: { editability: "native editable PPTX", exports: ["pptx", "pdf"] }
  },
  "creative-ad": {
    label: "Creative Ad",
    agents: ["intent-router", "creative-brief-agent", "research-grounding", "copy-agent", "art-director", "layout-designer", "creative-renderer", "brand-reviewer", "fresh-eyes-reviewer"],
    defaults: { editability: "layered editable creative", exports: ["png", "jpg", "svg"] }
  }
});

const clean = value => String(value ?? "").trim().replace(/\s+/g, " ");

export function compilePromptSpec(input = {}) {
  const artifactType = clean(input.artifactType);
  const config = ARTIFACTS[artifactType];
  if (!config) throw new Error("unsupported-artifact-type");

  const objective = clean(input.objective);
  if (!objective) throw new Error("missing-objective");

  const audience = clean(input.audience) || "general professional audience";
  const source = clean(input.source) || "user prompt only";
  const constraints = clean(input.constraints) || "No unstated assumptions; label uncertainty; preserve source provenance.";
  const brand = clean(input.brand) || "Use a restrained professional visual system with accessible contrast.";
  const editability = clean(input.editability) || config.defaults.editability;
  const exports = Array.isArray(input.exports) && input.exports.length ? [...new Set(input.exports.map(clean).filter(Boolean))].sort() : [...config.defaults.exports];
  const reviewPolicy = clean(input.reviewPolicy) || "Run domain critique, mechanical QA, and a fresh-eyes review before marking the artifact ready.";

  const spec = {
    specVersion: "prompt-spec/v1alpha1",
    artifactType,
    objective,
    audience,
    inputs: [source],
    constraints,
    editability,
    brand,
    reviewPolicy,
    exports,
    agentChain: [...config.agents]
  };

  return Object.freeze(spec);
}

export function renderPrompt(spec) {
  return [
    `Create a ${ARTIFACTS[spec.artifactType].label}.`,
    `Objective: ${spec.objective}`,
    `Audience: ${spec.audience}`,
    `Inputs/evidence: ${spec.inputs.join("; ")}`,
    `Constraints: ${spec.constraints}`,
    `Brand/design direction: ${spec.brand}`,
    `Editability requirement: ${spec.editability}`,
    `Required exports: ${spec.exports.join(", ")}`,
    `Review policy: ${spec.reviewPolicy}`,
    "Do not invent evidence. Separate observed facts, inferred structure, and recommendations. Produce the semantic plan before rendering the final artifact."
  ].join("\n\n");
}
