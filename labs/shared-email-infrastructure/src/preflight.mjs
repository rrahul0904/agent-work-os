import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const STATES = new Set(['candidate','pilot','enabled','excluded']);
const ISOLATION = new Set(['shared','dedicated']);
const PROVIDERS = new Set(['resend','brevo','mailjet','cloudflare','smtp']);
const DOMAIN = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?!(?:test|example|invalid|localhost)$)[a-z]{2,}$/;
const ALIAS = /^[a-z0-9](?:[a-z0-9._+-]*[a-z0-9])?$/;

export function validateRegistry(registry) {
  if (!registry || typeof registry !== 'object' || Array.isArray(registry) ||
      registry.schemaVersion !== 1 || !Array.isArray(registry.projects)) {
    return { ok:false, issues:['Expected schemaVersion=1 and projects array'], summary:null };
  }
  const issues=[], ids=new Set(), addresses=new Set();
  for (const [i,p] of registry.projects.entries()) {
    const at='projects['+i+']';
    if (!p || typeof p !== 'object' || Array.isArray(p)) {
      issues.push(at+' must be an object'); continue;
    }
    if (typeof p.id !== 'string' || !/^[a-z0-9][a-z0-9-]{1,63}$/.test(p.id)) issues.push(at+'.id invalid');
    else if (ids.has(p.id)) issues.push(at+'.id duplicated');
    else ids.add(p.id);
    if (!STATES.has(p.state)) issues.push(at+'.state invalid');
    if (!ISOLATION.has(p.isolation)) issues.push(at+'.isolation invalid');
    if (!Array.isArray(p.aliases) || p.aliases.some(a=>typeof a!=='string'||!ALIAS.test(a))) {
      issues.push(at+'.aliases invalid');
    }
    if (p.transactionalProvider != null && !PROVIDERS.has(p.transactionalProvider)) issues.push(at+'.provider invalid');
    if (p.state==='pilot'||p.state==='enabled') {
      if (typeof p.domain!=='string'||!DOMAIN.test(p.domain)) issues.push(at+'.domain requires a non-reserved DNS name');
      if (p.dnsVerified!==true) issues.push(at+'.dnsVerified required');
      if (p.ownerApproved!==true) issues.push(at+'.ownerApproved required');
      if (p.securityReviewed!==true) issues.push(at+'.securityReviewed required');
      if (p.state==='enabled' && p.liveAcceptance!==true) issues.push(at+'.liveAcceptance required');
      if (p.state==='enabled' && p.transactionalRequired===true && !p.transactionalProvider) issues.push(at+'.provider required for transactional traffic');
    }
    if (typeof p.domain==='string' && DOMAIN.test(p.domain) && Array.isArray(p.aliases)) {
      for (const alias of p.aliases) {
        if (typeof alias!=='string'||!ALIAS.test(alias)) continue;
        const address=alias+'@'+p.domain;
        if (addresses.has(address)) issues.push(at+'.duplicate address: '+address);
        addresses.add(address);
      }
    }
  }
  const counts=Object.fromEntries([...STATES].map(s=>[s,registry.projects.filter(p=>p?.state===s).length]));
  return {ok:issues.length===0,issues,summary:{total:registry.projects.length,counts}};
}
export function candidateAddresses(project) {
  if (!project || !Array.isArray(project.aliases) || !project.domain ||
      (project.state!=='pilot' && project.state!=='enabled')) return [];
  return project.aliases.map(a=>a+'@'+project.domain);
}
if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  if (!process.argv[2]) { console.error('Usage: node src/preflight.mjs registry.json'); process.exitCode=2; }
  else {
    try {
      const result=validateRegistry(JSON.parse(readFileSync(process.argv[2],'utf8')));
      console.log(JSON.stringify(result,null,2));
      if (!result.ok) process.exitCode=1;
    } catch(error) {
      console.error('Invalid registry: '+error.message); process.exitCode=1;
    }
  }
}
