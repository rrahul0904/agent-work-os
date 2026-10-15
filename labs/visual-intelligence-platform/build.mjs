import { cp, mkdir } from "node:fs/promises";

await mkdir("dist", { recursive: true });
await cp("index.html", "dist/index.html");
await cp("prompt-core.mjs", "dist/prompt-core.mjs");
console.log("Built Visual Intelligence Platform lab into dist/");
