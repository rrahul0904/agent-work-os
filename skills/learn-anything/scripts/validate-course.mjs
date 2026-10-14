const DEFAULTS = Object.freeze({
  minScriptWords: 240,
  maxScriptWords: 420,
  maxSourcesPerDomain: 3,
  estimatedWordsPerMinute: 145
});

export function validateCourse(course, options = {}) {
  const cfg = { ...DEFAULTS, ...options };
  const errors = [];
  const warnings = [];
  const sources = Array.isArray(course?.sources) ? course.sources : [];
  const lessons = Array.isArray(course?.lessons) ? course.lessons : [];
  const sourceById = new Map();
  const lessonIds = new Set();
  const domainCounts = new Map();
  let totalScriptWords = 0;

  if (course?.version !== "learn-anything/v1") errors.push("version must be learn-anything/v1");
  if (!String(course?.topic ?? "").trim()) errors.push("topic is required");
  if (!lessons.length) errors.push("at least one lesson is required");

  for (const source of sources) {
    const id = String(source?.id ?? "").trim();
    if (!id) {
      errors.push("every source requires an id");
      continue;
    }
    if (sourceById.has(id)) errors.push(`duplicate source id: ${id}`);
    sourceById.set(id, source);

    let hostname;
    try {
      hostname = new URL(source.url).hostname.replace(/^www\./, "");
    } catch {
      errors.push(`source ${id} has an invalid url`);
      continue;
    }
    domainCounts.set(hostname, (domainCounts.get(hostname) ?? 0) + 1);
    if (source.status !== "read") warnings.push(`source ${id} is not marked read and cannot support claims`);
  }

  for (const [domain, count] of domainCounts) {
    if (count > cfg.maxSourcesPerDomain) {
      errors.push(`${domain} supplies ${count} sources; maximum is ${cfg.maxSourcesPerDomain}`);
    }
  }

  for (const lesson of lessons) {
    const id = String(lesson?.id ?? "").trim();
    if (!id) errors.push("every lesson requires an id");
    else if (lessonIds.has(id)) errors.push(`duplicate lesson id: ${id}`);
    else lessonIds.add(id);

    if (!String(lesson?.title ?? "").trim()) errors.push(`lesson ${id || "<unknown>"} requires a title`);
    const cited = Array.isArray(lesson?.citations) ? lesson.citations : [];
    if (!cited.length) errors.push(`lesson ${id || "<unknown>"} requires at least one citation`);
    for (const sourceId of cited) {
      const source = sourceById.get(sourceId);
      if (!source) errors.push(`lesson ${id || "<unknown>"} cites unknown source ${sourceId}`);
      else if (source.status !== "read") errors.push(`lesson ${id || "<unknown>"} cites unread source ${sourceId}`);
    }

    const agreement = lesson?.agreement;
    if (agreement) {
      const agree = Number(agreement.agree);
      const considered = Number(agreement.considered);
      if (!Number.isInteger(agree) || !Number.isInteger(considered) || agree < 0 || considered < 1 || agree > considered) {
        errors.push(`lesson ${id || "<unknown>"} has invalid agreement counts`);
      }
    }

    const card = lesson?.card ?? {};
    for (const field of ["idea", "impact", "tryIt", "ruleToKeep"]) {
      if (!String(card[field] ?? "").trim()) errors.push(`lesson ${id || "<unknown>"} card.${field} is required`);
    }

    const words = String(lesson?.script ?? "").trim().split(/\s+/).filter(Boolean).length;
    totalScriptWords += words;
    if (words && (words < cfg.minScriptWords || words > cfg.maxScriptWords)) {
      warnings.push(`lesson ${id || "<unknown>"} has ${words} script words; target ${cfg.minScriptWords}-${cfg.maxScriptWords}`);
    }
  }

  if (sources.length < 2) warnings.push("course has fewer than two sources; disagreement and corroboration cannot be measured well");

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    metrics: {
      sources: sources.length,
      domains: domainCounts.size,
      lessons: lessons.length,
      totalScriptWords,
      estimatedAudioMinutes: Number((totalScriptWords / cfg.estimatedWordsPerMinute).toFixed(1))
    }
  };
}

function main() {
  const [file] = process.argv.slice(2);
  if (!file) {
    console.error("usage: node validate-course.mjs <course-manifest.json>");
    process.exit(2);
  }
  import("node:fs/promises").then(async ({ readFile }) => {
    try {
      const course = JSON.parse(await readFile(file, "utf8"));
      const result = validateCourse(course);
      console.log(JSON.stringify(result, null, 2));
      process.exitCode = result.valid ? 0 : 1;
    } catch (error) {
      console.error(error.message);
      process.exitCode = 2;
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) main();
