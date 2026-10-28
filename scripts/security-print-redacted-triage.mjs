#!/usr/bin/env node
// Gitleaks report is treated as sensitive regardless of '--redact'. This
// script only prints narrowly selected metadata; never emit Secret, Match,
// Line, Description, File or untrusted fields from the source report.
import fs from "node:fs";
const report=process.argv[2];
if(!report||!fs.existsSync(report)){
  console.error("Secret scan report unavailable; review failed CI in a protected environment.");
  process.exitCode=1;
}else{
  let findings;
  try{findings=JSON.parse(fs.readFileSync(report,"utf8"));}catch{
    console.error("Invalid redacted scanner report");process.exitCode=1;
  }
  if(findings){
    if(!Array.isArray(findings))throw Error("secret_scan_report_shape_invalid");
    const safe=findings.map(x=>({
      rule:typeof x.RuleID==="string"&&/^[A-Za-z0-9._-]{1,80}$/.test(x.RuleID)?x.RuleID:"unknown",
      commit:typeof x.Commit==="string"&&/^[a-f0-9]{40}$/.test(x.Commit)?x.Commit.slice(0,12):"unknown"
    }));
    console.log(JSON.stringify({status:"SECURITY_HOLD",findings:safe.length,
      indicators:safe,classification:"UNRESOLVED",valuesIncluded:false},null,2));
    if(safe.length)process.exitCode=2;
  }
}
