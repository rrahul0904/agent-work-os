import test from "node:test";
import assert from "node:assert/strict";
import { compilePromptSpec, renderPrompt } from "../prompt-core.mjs";

test("compiles deterministic architecture PromptSpec", () => {
  const input = {
    artifactType: "architecture-diagram",
    objective: "Show a multi-region RAG platform",
    audience: "enterprise architects",
    source: "requirements.md",
    constraints: "AWS only; include failure paths"
  };
  assert.deepEqual(compilePromptSpec(input), compilePromptSpec(input));
  assert.equal(compilePromptSpec(input).agentChain.includes("architecture-critic"), true);
});

test("technical presentation requests native editable PPTX", () => {
  const spec = compilePromptSpec({ artifactType: "technical-presentation", objective: "Explain the target platform" });
  assert.equal(spec.editability, "native editable PPTX");
  assert.equal(spec.exports.includes("pptx"), true);
});

test("fails closed without an objective", () => {
  assert.throws(() => compilePromptSpec({ artifactType: "creative-ad" }), /missing-objective/);
});

test("renders evidence-safe prompt text", () => {
  const prompt = renderPrompt(compilePromptSpec({ artifactType: "technical-diagram", objective: "Map event flow" }));
  assert.match(prompt, /Do not invent evidence/);
  assert.match(prompt, /semantic plan/);
});
