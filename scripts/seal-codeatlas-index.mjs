#!/usr/bin/env node
import { sealCodeAtlasIndex } from "../runtime/daemon/src/codeatlas-search-adapter.js";

const root = process.argv[2];
if (!root || process.argv.length !== 3) {
  console.error("usage: node scripts/seal-codeatlas-index.mjs /absolute/repository/path");
  process.exitCode = 2;
} else {
  try {
    const manifest = sealCodeAtlasIndex(root);
    console.log(JSON.stringify({ status: "operator_sealed", revision: manifest.revision, dbSha256: manifest.dbSha256 }));
  } catch (error) {
    console.error("Cannot seal CodeAtlas index:", error.message);
    process.exitCode = 1;
  }
}
