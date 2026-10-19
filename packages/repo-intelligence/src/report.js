export const REPO_REPORT_SCHEMA = "repo-report/v1";

export class RepoReportError extends Error {
  constructor(code, message) {
    super(message ?? code);
    this.name = "RepoReportError";
    this.code = code;
  }
}

export function renderRepoAtlasHtml({ repoMap, topology = null, risk = null, diff = null, gitSignals = null, importAnalysis = null, impact = null, title = null } = {}) {
  assertRepoMap(repoMap);
  if (topology) assertBoundArtifact(topology, "repo-topology/v1", repoMap.digest, "repo_report_topology_invalid");
  if (gitSignals) assertBoundArtifact(gitSignals, "repo-git-signals/v1", repoMap.digest, "repo_report_git_invalid");
  if (importAnalysis) assertBoundArtifact(importAnalysis, "repo-import-analysis/v1", repoMap.digest, "repo_report_imports_invalid");
  if (risk) {
    assertBoundArtifact(risk, "repo-risk/v1", repoMap.digest, "repo_report_risk_invalid");
    if (topology && risk.topologyDigest !== topology.digest) {
      throw new RepoReportError("repo_report_risk_topology_mismatch", "Risk artifact is not bound to supplied topology");
    }
  }
  if (diff) {
    if (diff.schemaVersion !== "repo-diff/v1" || diff.currentDigest !== repoMap.digest) {
      throw new RepoReportError("repo_report_diff_invalid", "Diff must target supplied RepoMap");
    }
  }
  if (impact) {
    assertBoundArtifact(impact, "repo-impact/v1", repoMap.digest, "repo_report_impact_invalid");
    if (!importAnalysis || impact.importAnalysisDigest !== importAnalysis.digest) {
      throw new RepoReportError("repo_report_impact_import_mismatch", "Impact artifact is not bound to supplied import analysis");
    }
    if (!diff || impact.diffDigest !== diff.digest) {
      throw new RepoReportError("repo_report_impact_diff_mismatch", "Impact artifact is not bound to supplied drift artifact");
    }
    if (topology && impact.topologyDigest !== topology.digest) {
      throw new RepoReportError("repo_report_impact_topology_mismatch", "Impact artifact is not bound to supplied topology");
    }
    if (gitSignals && impact.gitSignalsDigest !== gitSignals.digest) {
      throw new RepoReportError("repo_report_impact_git_mismatch", "Impact artifact is not bound to supplied Git signals");
    }
  }

  const model = {
    schemaVersion: REPO_REPORT_SCHEMA,
    title: normalizeTitle(title ?? `${repoMap.root.name} · Repo Atlas`),
    repositoryDigest: repoMap.digest,
    metrics: repoMap.metrics,
    languages: repoMap.languages,
    files: repoMap.files.map(({ path, language, lines, estimatedTokens }) => ({ path, language, lines, estimatedTokens })),
    directories: flattenDirectories(repoMap.tree).slice(0, 250),
    topology: topology ? {
      digest: topology.digest,
      modules: topology.modules,
      edges: topology.moduleEdges,
      centrality: topology.centrality,
      metrics: topology.metrics
    } : null,
    risk: risk ? {
      digest: risk.digest,
      hotspots: risk.hotspots,
      modules: risk.modules,
      metrics: risk.metrics,
      methodology: risk.methodology
    } : null,
    diff: diff ? {
      digest: diff.digest,
      summary: diff.summary,
      metricsDelta: diff.metricsDelta,
      languageDelta: diff.languageDelta,
      files: diff.files
    } : null,
    git: gitSignals ? {
      digest: gitSignals.digest,
      headCommit: gitSignals.headCommit,
      workingTreeDirty: gitSignals.workingTreeDirty,
      historyLimit: gitSignals.historyLimit,
      commitsAnalyzed: gitSignals.commitsAnalyzed,
      contributorCount: gitSignals.contributorCount,
      metrics: gitSignals.metrics,
      hotspots: gitSignals.hotspots
    } : null,
    imports: importAnalysis ? {
      digest: importAnalysis.digest,
      parser: importAnalysis.parser,
      metrics: importAnalysis.metrics,
      edges: importAnalysis.edges.slice(0, 500),
      fallbackFiles: importAnalysis.files.filter((file) => file.parseMode === "lexical-fallback").slice(0, 100)
    } : null,
    impact: impact ? {
      digest: impact.digest,
      metrics: impact.metrics,
      files: impact.files.slice(0, 100),
      removedFiles: impact.removedFiles,
      impactedFiles: impact.impactedFiles.slice(0, 500),
      impactedModules: impact.impactedModules,
      methodology: impact.methodology
    } : null
  };

  const data = safeJson(model);
  const pageTitle = escapeHtml(model.title);
  const staticGitSummary = renderStaticGitSummary(gitSignals);
  const staticM8Summary = renderStaticM8Summary(importAnalysis, impact);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark light">
<title>${pageTitle}</title>
<style>
:root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#17202a;background:#f6f7f9}*{box-sizing:border-box}body{margin:0;background:inherit;color:inherit}.wrap{max-width:1440px;margin:0 auto;padding:28px}.hero{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;margin-bottom:22px}.hero h1{margin:0 0 7px;font-size:28px}.muted{color:#69727d;font-size:13px}.digest{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;word-break:break-all}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:18px 0}.card,.panel{background:#fff;border:1px solid #e1e5ea;border-radius:12px;box-shadow:0 1px 2px rgba(0,0,0,.03)}.card{padding:16px}.card strong{display:block;font-size:24px;margin-top:4px}.panel{padding:18px;margin:14px 0}.panel h2{font-size:17px;margin:0 0 14px}.bar-row{display:grid;grid-template-columns:minmax(130px,1fr) 3fr 90px;gap:10px;align-items:center;margin:7px 0}.bar{height:10px;background:#edf0f3;border-radius:999px;overflow:hidden}.bar>i{display:block;height:100%;background:#5562ea;border-radius:999px}.bar-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}.bar-value{text-align:right;font-variant-numeric:tabular-nums;font-size:12px;color:#69727d}.two{display:grid;grid-template-columns:1fr 1fr;gap:14px}.search{width:100%;padding:10px 12px;border:1px solid #cfd5dc;border-radius:8px;background:#fff;color:inherit;margin-bottom:10px}table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:8px;border-bottom:1px solid #edf0f3;vertical-align:top}th{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#69727d}.pill{display:inline-block;padding:3px 7px;border-radius:999px;background:#edf0f3;font-size:11px}.high{background:#fee2e2}.medium{background:#fef3c7}.low{background:#dcfce7}.dirty{background:#fee2e2}.clean{background:#dcfce7}.parser{background:#dcfce7}.fallback{background:#fef3c7}.empty{color:#8b949e;font-style:italic}.section-note{font-size:12px;color:#69727d;margin-top:-8px;margin-bottom:12px}@media(max-width:900px){.grid{grid-template-columns:1fr 1fr}.two{grid-template-columns:1fr}.hero{display:block}}@media(prefers-color-scheme:dark){:root{color:#e8edf2;background:#11151a}.card,.panel{background:#171c22;border-color:#2a323b}.muted,.bar-value,.section-note,th{color:#9ca8b4}.bar{background:#29313a}.search{background:#11151a;border-color:#36414d;color:#e8edf2}th,td{border-color:#283039}.pill{background:#29313a}.high,.dirty{background:#5a2222}.medium,.fallback{background:#5b4714}.low,.clean,.parser{background:#17452c}}
</style>
</head>
<body>
<div class="wrap">
  <div class="hero"><div><h1 id="title"></h1><div class="muted">Offline repository intelligence · metadata only</div></div><div class="muted digest" id="digest"></div></div>
  <div class="grid" id="summary"></div>
  <div class="two"><section class="panel"><h2>Languages</h2><div id="languages"></div></section><section class="panel"><h2>Largest directories</h2><div id="directories"></div></section></div>
  <section class="panel"><h2>Files</h2><input id="search" class="search" placeholder="Filter by file path or language"><div style="overflow:auto"><table><thead><tr><th>Path</th><th>Language</th><th>Lines</th><th>Est. tokens</th></tr></thead><tbody id="files"></tbody></table></div></section>
  <div class="two"><section class="panel"><h2>Module topology</h2><div id="topology"></div></section><section class="panel"><h2>Structural hotspots</h2><div class="section-note">Heuristic structural signal, not a defect or vulnerability probability.</div><div id="risk"></div></section></div>
  <div class="two"><section class="panel"><h2>Parser import coverage</h2><div class="section-note">Parser-backed JS/TS dependency metadata. Lexical fallback is explicit when syntax cannot be parsed.</div>${staticM8Summary}<div id="imports"></div></section><section class="panel"><h2>Change impact</h2><div class="section-note">Bounded structural blast radius, not a defect, vulnerability, or failure probability.</div><div id="impact"></div></section></div>
  <div class="two"><section class="panel"><h2>Git history signals</h2><div class="section-note">Contributor identities are opaque hashes; email addresses are not embedded.</div>${staticGitSummary}<div id="git"></div></section><section class="panel"><h2>Snapshot drift</h2><div id="diff"></div></section></div>
</div>
<script id="repo-atlas-data" type="application/json">${data}</script>
<script>
(()=>{const d=JSON.parse(document.getElementById('repo-atlas-data').textContent);const $=id=>document.getElementById(id);const fmt=n=>new Intl.NumberFormat().format(n);$('title').textContent=d.title;$('digest').textContent=d.repositoryDigest;
const cards=[['Files',d.metrics.files],['Nonblank lines',d.metrics.lines],['Est. tokens',d.metrics.estimatedTokens],['Modules',d.topology?d.topology.metrics.modules:'—']];$('summary').innerHTML=cards.map(([k,v])=>'<div class="card"><span class="muted">'+esc(k)+'</span><strong>'+esc(typeof v==='number'?fmt(v):v)+'</strong></div>').join('');
const langs=Object.entries(d.languages).sort((a,b)=>b[1].lines-a[1].lines),maxLang=Math.max(1,...langs.map(x=>x[1].lines));$('languages').innerHTML=langs.length?langs.map(([k,v])=>bar(k,v.lines,maxLang,fmt(v.lines)+' lines')).join(''):'<div class="empty">No language data</div>';
const dirs=d.directories.filter(x=>x.path!=='.').sort((a,b)=>b.lines-a.lines).slice(0,18),maxDir=Math.max(1,...dirs.map(x=>x.lines));$('directories').innerHTML=dirs.length?dirs.map(x=>bar(x.path,x.lines,maxDir,fmt(x.lines)+' lines')).join(''):'<div class="empty">No child directories</div>';
function renderFiles(q=''){q=q.toLowerCase();const rows=d.files.filter(f=>!q||f.path.toLowerCase().includes(q)||f.language.toLowerCase().includes(q)).slice(0,500);$('files').innerHTML=rows.map(f=>'<tr><td class="digest">'+esc(f.path)+'</td><td>'+esc(f.language)+'</td><td>'+fmt(f.lines)+'</td><td>'+fmt(f.estimatedTokens)+'</td></tr>').join('')||'<tr><td colspan="4" class="empty">No matching files</td></tr>'}$('search').addEventListener('input',e=>renderFiles(e.target.value));renderFiles();
if(d.topology){const c=[...d.topology.centrality].slice(0,20);$('topology').innerHTML='<div class="muted" style="margin-bottom:8px">'+fmt(d.topology.metrics.moduleEdges)+' module edges · '+fmt(d.topology.metrics.fileImports)+' file imports</div><table><thead><tr><th>Module</th><th>In</th><th>Out</th><th>Degree</th></tr></thead><tbody>'+c.map(x=>'<tr><td class="digest">'+esc(x.moduleId)+'</td><td>'+x.incoming+'</td><td>'+x.outgoing+'</td><td>'+x.degree+'</td></tr>').join('')+'</tbody></table>'}else $('topology').innerHTML='<div class="empty">Topology not included</div>';
if(d.risk){$('risk').innerHTML='<table><thead><tr><th>Path</th><th>Score</th><th>Signal</th></tr></thead><tbody>'+d.risk.hotspots.slice(0,20).map(x=>'<tr><td class="digest">'+esc(x.path)+'</td><td>'+x.score+'</td><td><span class="pill '+esc(x.level)+'">'+esc(x.level)+'</span> '+esc(x.reasons.join(', '))+'</td></tr>').join('')+'</tbody></table>'}else $('risk').innerHTML='<div class="empty">Risk analysis not included</div>';
if(d.imports){const m=d.imports.metrics;$('imports').innerHTML='<div class="muted" style="margin-bottom:8px">'+esc(d.imports.parser.package)+' '+esc(d.imports.parser.version)+' · '+fmt(m.parserFiles)+' parser files · '+fmt(m.fallbackFiles)+' fallback files · '+fmt(m.edges)+' edges</div><table><thead><tr><th>From</th><th>Kind</th><th>Specifier</th><th>Target</th></tr></thead><tbody>'+d.imports.edges.slice(0,30).map(x=>'<tr><td class="digest">'+esc(x.from)+'</td><td>'+esc(x.importKind)+(x.typeOnly?' <span class="pill">type</span>':'')+'</td><td class="digest">'+esc(x.specifier)+'</td><td class="digest">'+esc(x.to??x.targetKind)+'</td></tr>').join('')+'</tbody></table>'}else $('imports').innerHTML='<div class="empty">Parser import analysis not included</div>';
if(d.impact){const m=d.impact.metrics;$('impact').innerHTML='<div class="grid"><div class="card"><span class="muted">Changed</span><strong>'+fmt(m.changedCurrentFiles)+'</strong></div><div class="card"><span class="muted">Downstream</span><strong>'+fmt(m.impactedFiles)+'</strong></div><div class="card"><span class="muted">Modules</span><strong>'+fmt(m.impactedModules)+'</strong></div><div class="card"><span class="muted">High impact</span><strong>'+fmt(m.highImpactChanges)+'</strong></div></div><table><thead><tr><th>Changed path</th><th>Score</th><th>Level</th><th>Signal</th></tr></thead><tbody>'+d.impact.files.slice(0,20).map(x=>'<tr><td class="digest">'+esc(x.path)+'</td><td>'+x.score+'</td><td><span class="pill '+esc(x.level)+'">'+esc(x.level)+'</span></td><td>'+esc(x.reasons.join(', '))+'</td></tr>').join('')+'</tbody></table>'}else $('impact').innerHTML='<div class="empty">Change impact not included</div>';
if(d.git){$('git').innerHTML='<div class="muted" style="margin-bottom:8px">HEAD <span class="digest">'+esc(d.git.headCommit.slice(0,12))+'</span> · '+fmt(d.git.commitsAnalyzed)+' commits · '+fmt(d.git.contributorCount)+' contributors · <span class="pill '+(d.git.workingTreeDirty?'dirty':'clean')+'">'+(d.git.workingTreeDirty?'dirty':'clean')+'</span></div><table><thead><tr><th>Path</th><th>Churn</th><th>Commits</th><th>Contributors</th></tr></thead><tbody>'+d.git.hotspots.slice(0,20).map(x=>'<tr><td class="digest">'+esc(x.path)+'</td><td>'+fmt(x.churn)+'</td><td>'+fmt(x.commitsTouched)+'</td><td>'+fmt(x.contributorCount)+'</td></tr>').join('')+'</tbody></table>'}else $('git').innerHTML='<div class="empty">Git signals not included</div>';
if(d.diff){const s=d.diff.summary;$('diff').innerHTML='<div class="grid"><div class="card"><span class="muted">Added</span><strong>'+s.addedFiles+'</strong></div><div class="card"><span class="muted">Removed</span><strong>'+s.removedFiles+'</strong></div><div class="card"><span class="muted">Changed</span><strong>'+s.changedFiles+'</strong></div><div class="card"><span class="muted">Affected</span><strong>'+s.affectedFiles+'</strong></div></div>'}else $('diff').innerHTML='<div class="empty">No previous snapshot supplied</div>';
function bar(label,value,max,note){return '<div class="bar-row"><div class="bar-label" title="'+attr(label)+'">'+esc(label)+'</div><div class="bar"><i style="width:'+Math.max(1,value/max*100).toFixed(2)+'%"></i></div><div class="bar-value">'+esc(note)+'</div></div>'}function esc(v){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}function attr(v){return esc(v)} })();
</script>
</body>
</html>`;
}

function renderStaticGitSummary(gitSignals) {
  if (!gitSignals) return "";
  const state = gitSignals.workingTreeDirty ? "dirty" : "clean";
  return `<div class="muted" style="margin-bottom:8px">${gitSignals.commitsAnalyzed} commits analyzed · ${gitSignals.contributorCount} contributors · working tree ${state}</div>`;
}

function renderStaticM8Summary(importAnalysis, impact) {
  if (!importAnalysis) return "";
  const impactText = impact ? ` · ${impact.metrics.impactedFiles} downstream files` : "";
  return `<div class="muted" style="margin-bottom:8px">${importAnalysis.metrics.parserFiles} parser files · ${importAnalysis.metrics.fallbackFiles} fallback files · ${importAnalysis.metrics.edges} import edges${impactText}</div>`;
}

function flattenDirectories(root) {
  const output = [];
  const visit = (node) => {
    output.push(Object.freeze({ path: node.path, name: node.name, lines: node.lines, files: node.files, directLines: node.directLines, directFiles: node.directFiles }));
    for (const child of node.children ?? []) visit(child);
  };
  visit(root);
  return output.sort((a, b) => b.lines - a.lines || a.path.localeCompare(b.path));
}

function safeJson(value) {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/gu, (char) => ({ '<': '\\u003c', '>': '\\u003e', '&': '\\u0026', '\u2028': '\\u2028', '\u2029': '\\u2029' }[char]));
}

function normalizeTitle(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 500) throw new RepoReportError("repo_report_title_invalid", "Invalid report title");
  return value.trim();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/gu, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function assertRepoMap(value) {
  if (!value || value.schemaVersion !== "repo-map/v1" || typeof value.digest !== "string" || !value.metrics || !Array.isArray(value.files) || !value.tree) {
    throw new RepoReportError("repo_report_map_invalid", "Expected repo-map/v1");
  }
}

function assertBoundArtifact(value, schemaVersion, repositoryDigest, code) {
  if (!value || value.schemaVersion !== schemaVersion || value.repositoryDigest !== repositoryDigest) {
    throw new RepoReportError(code, `Expected ${schemaVersion} bound to current RepoMap`);
  }
}
