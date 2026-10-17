import test from "node:test";
import assert from "node:assert/strict";
import { createProjectRecipe, createProjectSpec, defaultResearchOsRecipe, ProjectRecipeValidationError } from "../../ai-engineering-lab/src/index.js";

test("Research OS recipe is deterministic and keeps REA as evidence-only", () => {
  const a = defaultResearchOsRecipe();
  const b = defaultResearchOsRecipe();
  assert.equal(a.digest, b.digest);
  assert.equal(a.provenance.reaRole, "evidence-provider-only");
  assert.equal(a.authority.deployment, "shipping-os-only");
});

test("project spec binds the exact recipe digest", () => {
  const recipe = defaultResearchOsRecipe();
  const spec = createProjectSpec(recipe, { providers: ["fixture-search"] });
  assert.equal(spec.recipeDigest, recipe.digest);
  assert.deepEqual(spec.providers, ["fixture-search"]);
});

test("tampered recipe fails closed", () => {
  const recipe = defaultResearchOsRecipe();
  const tampered = { ...recipe, name: "Other" };
  assert.throws(() => createProjectSpec(tampered), (error) => error instanceof ProjectRecipeValidationError && error.code === "project_recipe_digest_invalid");
});

test("unknown project lanes are rejected", () => {
  assert.throws(() => createProjectRecipe({ kind: "unknown", name: "Bad", description: "Bad" }), (error) => error instanceof ProjectRecipeValidationError && error.code === "project_recipe_kind_invalid");
});
