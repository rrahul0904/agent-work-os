#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { assessLaunchDossier } from "../packages/release-preflight/src/launch-dossier.js";
try{
  if(process.argv.length!==3)throw new Error("usage");
  const data=JSON.parse(readFileSync(process.argv[2],"utf8"));
  const report=assessLaunchDossier(data);
  console.log(JSON.stringify(report,null,2));
  if(report.verdict!=="NEEDS_INDEPENDENT_SOURCE_VERIFICATION")process.exitCode=1;
}catch{
  console.error("Launch dossier missing/invalid: do not deploy");
  process.exitCode=2;
}
