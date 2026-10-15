import { cp, mkdir, readFile, writeFile } from "node:fs/promises";

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
  "creative-spec.mjs",
  "creative-renderer.mjs",
  "mcp-core.mjs",
  "studio-upgrade.mjs",
  "platform-manifest.json",
  "plugin-manifest.json"
]) {
  await cp(file, `dist/${file}`);
}
const html = await readFile("dist/index.html", "utf8");
await writeFile("dist/index.html", html.replace("</body>", '<script type="module" src="./studio-upgrade.mjs"></script></body>'));
console.log("Built Visual Intelligence Platform lab into dist/");
