import { createHash } from 'node:crypto';

export const COMPONENT_SCHEMA = 'ecosystem-component/v1';
export const RECOMMENDATION_SCHEMA = 'ecosystem-recommendation/v1';
export const DEFAULT_POLICY = Object.freeze({
  policyVersion: 'agent-ecosystem-policy/v1',
  maxAgeDays: 365,
  minimumStars: 0,
  requirePinnedRevision: true,
  requireKnownLicense: true,
  allowedLicenses: ['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'MPL-2.0', 'CC-BY-4.0'],
  weights: {
    freshness: 0.25,
    popularity: 0.15,
    maintenance: 0.2,
    license: 0.15,
    integrationFit: 0.15,
    evidenceCompleteness: 0.1,
  },
});

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function digest(value) {
  return createHash('sha256').update(canonical(value)).digest('hex');
}

export function canonicalGitHubIdentity(input) {
  const raw = typeof input === 'string' ? input.trim() : '';
  let owner = '';
  let repo = '';

  if (/^[\w.-]+\/[\w.-]+$/.test(raw)) {
    [owner, repo] = raw.split('/');
  } else {
    let url;
    try {
      url = new URL(raw);
    } catch {
      throw new TypeError('component source must be owner/repo or a github.com repository URL');
    }
    if (url.hostname.toLowerCase() !== 'github.com') throw new TypeError('only github.com repositories are supported in Phase A');
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length < 2) throw new TypeError('github.com URL must include owner and repository');
    [owner, repo] = parts;
    repo = repo.replace(/\.git$/i, '');
  }

  if (!owner || !repo || !/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo)) {
    throw new TypeError('invalid GitHub owner/repository identity');
  }
  const key = `${owner.toLowerCase()}/${repo.toLowerCase()}`;
  return { key, url: `https://github.com/${key}` };
}

function ageDays(isoDate, now) {
  if (!isoDate) return null;
  const t = Date.parse(isoDate);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((now.getTime() - t) / 86_400_000));
}

function clamp(n, min = 0, max = 100) {
  return Math.min(max, Math.max(min, n));
}

function scoreFreshness(days, maxAgeDays) {
  if (days === null) return null;
  return clamp(100 * (1 - days / Math.max(1, maxAgeDays)));
}

function scorePopularity(stars) {
  if (!Number.isFinite(stars) || stars < 0) return null;
  return clamp(Math.log10(stars + 1) / 5 * 100);
}

function scoreMaintenance({ daysSincePush, archived, fork }) {
  if (archived === true || fork === true) return 0;
  if (daysSincePush === null) return null;
  if (daysSincePush <= 30) return 100;
  if (daysSincePush <= 90) return 85;
  if (daysSincePush <= 180) return 65;
  if (daysSincePush <= 365) return 40;
  return 10;
}

function evidenceCompleteness(component) {
  const checks = [
    component.sourceUrl,
    component.revision,
    component.pushedAt,
    Number.isFinite(component.stars),
    typeof component.archived === 'boolean',
    typeof component.fork === 'boolean',
    component.license,
    Array.isArray(component.capabilities) && component.capabilities.length > 0,
    Array.isArray(component.evidenceRefs) && component.evidenceRefs.length > 0,
  ];
  return Math.round(checks.filter(Boolean).length / checks.length * 100);
}

function integrationFit(required, available) {
  if (!required.length) return 100;
  const have = new Set(available.map((x) => String(x).toLowerCase()));
  const matched = required.filter((x) => have.has(String(x).toLowerCase()));
  return Math.round(matched.length / required.length * 100);
}

function normalizePolicy(policy = {}) {
  return {
    ...DEFAULT_POLICY,
    ...policy,
    weights: { ...DEFAULT_POLICY.weights, ...(policy.weights || {}) },
    allowedLicenses: [...(policy.allowedLicenses || DEFAULT_POLICY.allowedLicenses)],
  };
}

export function evaluateComponent(component, { profile = {}, policy = {}, now = new Date() } = {}) {
  if (!component || typeof component !== 'object') throw new TypeError('component is required');
  const normalizedPolicy = normalizePolicy(policy);
  const identity = canonicalGitHubIdentity(component.sourceUrl || component.repository || component.identity || '');
  const requiredCapabilities = [...new Set((profile.requiredCapabilities || []).map(String))];
  const capabilities = [...new Set((component.capabilities || []).map(String))];
  const pushedAge = ageDays(component.pushedAt, now);
  const reasons = [];

  if (component.archived === true) reasons.push('archived');
  if (component.fork === true) reasons.push('fork');
  if (pushedAge === null) reasons.push('unknown-freshness');
  else if (pushedAge > normalizedPolicy.maxAgeDays) reasons.push('stale');
  if (Number.isFinite(component.stars) && component.stars < normalizedPolicy.minimumStars) reasons.push('below-minimum-stars');
  if (normalizedPolicy.requirePinnedRevision && !component.revision) reasons.push('unpinned-revision');

  const license = component.license || null;
  const allowed = license && normalizedPolicy.allowedLicenses.includes(license);
  if (!license && normalizedPolicy.requireKnownLicense) reasons.push('unknown-license');
  else if (license && !allowed) reasons.push('license-not-allowed');

  const missingCapabilities = requiredCapabilities.filter((cap) => !capabilities.map((x) => x.toLowerCase()).includes(cap.toLowerCase()));
  if (missingCapabilities.length) reasons.push('missing-required-capability');

  const dimensions = {
    freshness: scoreFreshness(pushedAge, normalizedPolicy.maxAgeDays),
    popularity: scorePopularity(component.stars),
    maintenance: scoreMaintenance({ daysSincePush: pushedAge, archived: component.archived, fork: component.fork }),
    license: license ? (allowed ? 100 : 0) : null,
    integrationFit: integrationFit(requiredCapabilities, capabilities),
    evidenceCompleteness: evidenceCompleteness(component),
  };

  const unknownDimensions = Object.entries(dimensions).filter(([, value]) => value === null).map(([name]) => name);
  const weighted = Object.entries(normalizedPolicy.weights).filter(([name]) => dimensions[name] !== null);
  const weightTotal = weighted.reduce((sum, [, weight]) => sum + weight, 0);
  const score = weightTotal > 0
    ? Math.round(weighted.reduce((sum, [name, weight]) => sum + dimensions[name] * weight, 0) / weightTotal)
    : null;

  return {
    schema: 'ecosystem-evaluation/v1',
    identity,
    eligible: reasons.length === 0,
    reasons,
    missingCapabilities,
    dimensions,
    unknownDimensions,
    score,
    facts: {
      revision: component.revision || null,
      stars: Number.isFinite(component.stars) ? component.stars : null,
      pushedAt: component.pushedAt || null,
      daysSincePush: pushedAge,
      archived: typeof component.archived === 'boolean' ? component.archived : null,
      fork: typeof component.fork === 'boolean' ? component.fork : null,
      license,
      capabilities,
      evidenceRefs: [...(component.evidenceRefs || [])],
    },
    policyDigest: digest(normalizedPolicy),
  };
}

export function recommendComponents(components, { profile = {}, policy = {}, catalogSnapshot = {}, now = new Date() } = {}) {
  if (!Array.isArray(components)) throw new TypeError('components must be an array');
  const normalizedPolicy = normalizePolicy(policy);
  const seen = new Set();
  const evaluated = [];
  const duplicates = [];

  for (const component of components) {
    const result = evaluateComponent(component, { profile, policy: normalizedPolicy, now });
    if (seen.has(result.identity.key)) {
      duplicates.push(result.identity.key);
      continue;
    }
    seen.add(result.identity.key);
    evaluated.push(result);
  }

  const ranked = evaluated
    .filter((item) => item.eligible)
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.identity.key.localeCompare(b.identity.key));

  const receipt = {
    schema: RECOMMENDATION_SCHEMA,
    generatedAt: now.toISOString(),
    noInstallAuthority: true,
    noExecutionAuthority: true,
    profile,
    policyVersion: normalizedPolicy.policyVersion,
    policyDigest: digest(normalizedPolicy),
    catalogSnapshotDigest: digest(catalogSnapshot),
    candidates: ranked.map((item, index) => ({ rank: index + 1, ...item })),
    refused: evaluated.filter((item) => !item.eligible),
    duplicates,
  };
  return { ...receipt, receiptDigest: digest(receipt) };
}
