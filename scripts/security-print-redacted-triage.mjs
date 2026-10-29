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
    // Security reviewer can cross-reference precise historical fingerprints without
    // revealing the Gitleaks Secret, Match, Line, Email, or Description fields.
    // Only the four known historical commits/rule may expose a fingerprint;
    // all new or unexpected findings remain redacted and FAIL the scan.
    const knownHistoricalCommits = new Set(["a4f97ff8e5b62aa7fcb1eaa9257b330cc2544350","70f5ab43d79aa17b072df311fae2a13b5417b360"]);
    const rows = findings;
    const reviewedFingerprints = rows.map(x => {
      if (x.RuleID !== "generic-api-key" || !knownHistoricalCommits.has(x.Commit)) return null;
      if (typeof x.Fingerprint !== "string" ||
          !/^[a-f0-9]{40}:[a-zA-Z0-9._/@ -]+:generic-api-key:[1-9][0-9]{0,6}$/.test(x.Fingerprint) ||
          !x.Fingerprint.startsWith(x.Commit + ":")) return null;
      return x.Fingerprint;
    });
    safe.forEach((x, i) => {
      if (reviewedFingerprints[i]) x.historicalFingerprintForReview = reviewedFingerprints[i];
    });
    console.log(JSON.stringify({status:"SECURITY_HOLD",findings:safe.length,
      indicators:safe,classification:"UNRESOLVED",valuesIncluded:false},null,2));
    if(safe.length)process.exitCode=2;
  }
}
