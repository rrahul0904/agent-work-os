import { cp, mkdir } from "node:fs/promises";

await mkdir("dist", { recursive: true });
for (const file of [
  "index.html",
  "prompt-core.mjs",
  "entitlements.mjs",
  "orchestrator.mjs",
  "visualbench.mjs",
  "diagram-spec.mjs",
  "diagram-renderer.mjs",
  "diagram-critic.mjs",
  "diagram-adapters.mjs",
  "deck-plan.mjs",
  "zip-store.mjs",
  "pptx-native.mjs",
  "platform-manifest.json",
  "plugin-manifest.json"
]) {
  await cp(file, `dist/${file}`);
}
console.log("Built Visual Intelligence Platform lab into dist/");
