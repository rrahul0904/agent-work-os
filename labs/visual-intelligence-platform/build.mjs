import { cp, mkdir } from "node:fs/promises";

await mkdir("dist", { recursive: true });
for (const file of [
  "index.html",
  "prompt-core.mjs",
  "entitlements.mjs",
  "orchestrator.mjs",
  "visualbench.mjs",
  "platform-manifest.json"
]) {
  await cp(file, `dist/${file}`);
}
console.log("Built Visual Intelligence Platform lab into dist/");
