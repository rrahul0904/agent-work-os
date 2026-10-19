import crypto from "node:crypto";

export const BRIEF_TYPES = [
  "source",
  "source-summary",
  "research",
  "source-comparison",
  "comparison",
  "recommendation"
];

function uid(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function compact(text) {
  return String(text ?? "").replace(/\s+/g, " ").trim();
}

function words(text) {
  return new Set(
    compact(text)
      .toLowerCase()
      .replace(/[^a-z0-9%$.-]+/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );
}

function jaccard(a, b) {
  const A = words(a), B = words(b);
  if (!A.size || !B.size) return 0;
  let hit = 0;
  for (const x of A) if (B.has(x)) hit += 1;
  return hit / (A.size + B.size - hit);
}

function splitSentences(text) {
  return compact(text)
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map(compact)
    .filter((s) => s.length >= 25 && s.length <= 500);
}

function factualSignals(text) {
  const value = compact(text);
  return {
    dates: value.match(/\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[ .-]+\d{1,2}(?:,? [12]\d{3})?|\b[12]\d{3}-\d{2}-\d{2}\b/gi) ?? [],
    numbers: value.match(/(?:[$£€]\s*)?\b\d+(?:\.\d+)?%?\b/g) ?? [],
    negated: /\b(?:no|not|never|cannot|can't|won't|without|false|unsupported|unavailable)\b/i.test(value)
  };
}

function signalConflict(a, b) {
  const A = factualSignals(a), B = factualSignals(b);
  const overlap = jaccard(a, b);
  if (overlap < 0.18) return false;
  const dateConflict = A.dates.length && B.dates.length && A.dates.join("|") !== B.dates.join("|");
  const numberConflict = A.numbers.length && B.numbers.length && A.numbers.join("|") !== B.numbers.join("|");
  const negationConflict = A.negated !== B.negated && overlap >= 0.3;
  return Boolean(dateConflict || numberConflict || negationConflict);
}

function sourceLabel(i) {
  return `S${i + 1}`;
}

export function normalizeSources(input = []) {
  return input
    .filter(Boolean)
    .map((source, i) => {
      const text = compact(source.text ?? source.content ?? "");
      return {
        id: source.id ?? uid("source"),
        label: source.label ?? sourceLabel(i),
        title: compact(source.title ?? source.url ?? `Source ${i + 1}`),
        url: source.url ?? null,
        kind: source.kind ?? (source.url ? "web" : "text"),
        text,
        capturedAt: source.capturedAt ?? new Date().toISOString(),
        metadata: source.metadata ?? {}
      };
    })
    .filter((s) => s.text || s.url);
}

export function extractClaims(sources) {
  const normalized = normalizeSources(sources);
  const claims = [];
  for (const source of normalized) {
    const sentences = splitSentences(source.text);
    const ranked = sentences
      .map((text, index) => {
        const sig = factualSignals(text);
        const score = Math.min(text.length, 220) + sig.dates.length * 80 + sig.numbers.length * 35;
        return { text, index, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .sort((a, b) => a.index - b.index);

    for (const sentence of ranked) {
      claims.push({
        id: uid("claim"),
        text: sentence.text,
        sourceId: source.id,
        sourceLabel: source.label,
        sourceTitle: source.title,
        url: source.url,
        confidence: "source-stated"
      });
    }
  }
  return claims;
}

export function analyzeEvidence(sources) {
  const normalized = normalizeSources(sources);
  const claims = extractClaims(normalized);
  const conflicts = [];
  const agreements = [];

  for (let i = 0; i < claims.length; i += 1) {
    for (let j = i + 1; j < claims.length; j += 1) {
      const a = claims[i], b = claims[j];
      if (a.sourceId === b.sourceId) continue;
      const sim = jaccard(a.text, b.text);
      if (signalConflict(a.text, b.text)) {
        conflicts.push({
          id: uid("conflict"),
          similarity: Number(sim.toFixed(2)),
          left: a,
          right: b,
          status: "unresolved"
        });
      } else if (sim >= 0.46) {
        agreements.push({
          id: uid("agreement"),
          similarity: Number(sim.toFixed(2)),
          claims: [a, b]
        });
      }
    }
  }

  const sourceCoverage = normalized.map((source) => ({
    sourceId: source.id,
    label: source.label,
    title: source.title,
    url: source.url,
    claimCount: claims.filter((c) => c.sourceId === source.id).length
  }));

  return {
    sources: normalized,
    claims,
    conflicts: conflicts.slice(0, 12),
    agreements: agreements.slice(0, 12),
    sourceCoverage,
    evidenceStrength:
      normalized.length >= 4 && claims.length >= 12 ? "strong" :
      normalized.length >= 2 && claims.length >= 4 ? "moderate" : "thin"
  };
}

function cite(claim) {
  return `${claim.text} [${claim.sourceLabel}]`;
}

function topDistinctClaims(analysis, limit = 6) {
  const out = [];
  for (const claim of analysis.claims) {
    if (!out.some((x) => jaccard(x.text, claim.text) > 0.72)) out.push(claim);
    if (out.length >= limit) break;
  }
  return out;
}

function inferOptions(query) {
  const raw = compact(query);
  const vs = raw.match(/(.+?)\s+(?:vs\.?|versus)\s+(.+?)(?:\?|$)/i);
  if (vs) return [compact(vs[1]), compact(vs[2])];
  const compare = raw.match(/compare\s+(.+?)\s+(?:and|with)\s+(.+?)(?:\?|$)/i);
  if (compare) return [compact(compare[1]), compact(compare[2])];
  return [];
}

function optionMentions(option, claim) {
  return words(option).size > 0 && [...words(option)].some((token) => words(claim.text).has(token));
}

function confidenceLabel(analysis) {
  if (analysis.conflicts.length > 0) return "guarded";
  if (analysis.evidenceStrength === "strong") return "high";
  if (analysis.evidenceStrength === "moderate") return "medium";
  return "low";
}

function sourceList(analysis) {
  return analysis.sources.map((s) => ({
    label: s.label,
    title: s.title,
    url: s.url
  }));
}

export function buildBrief({ query = "", briefType = "source", sources = [] } = {}) {
  if (!BRIEF_TYPES.includes(briefType)) throw new Error(`Unsupported brief type: ${briefType}`);
  const analysis = analyzeEvidence(sources);
  const key = topDistinctClaims(analysis, 7);
  const options = inferOptions(query);
  const unresolved = analysis.conflicts.map((c) => ({
    issue: `Sources disagree: ${c.left.text} ↔ ${c.right.text}`,
    sources: [c.left.sourceLabel, c.right.sourceLabel]
  }));

  const common = {
    id: uid("brief"),
    type: briefType,
    query: compact(query),
    createdAt: new Date().toISOString(),
    evidenceStrength: analysis.evidenceStrength,
    confidence: confidenceLabel(analysis),
    sources: sourceList(analysis),
    conflicts: analysis.conflicts,
    agreements: analysis.agreements,
    evidenceCoverage: analysis.sourceCoverage,
    evidenceIndex: analysis.claims.map((claim) => ({
      id: claim.id,
      text: claim.text,
      sourceLabel: claim.sourceLabel,
      sourceTitle: claim.sourceTitle,
      url: claim.url
    }))
  };

  if (briefType === "source") {
    return {
      ...common,
      title: query ? `Source Brief — ${compact(query)}` : "Source Brief",
      summary: key.length ? key.map(cite) : ["No usable source claims were captured."],
      answer: key.length ? cite(key[0]) : "The available evidence is insufficient to answer the question.",
      gaps: unresolved.length ? unresolved : analysis.evidenceStrength === "thin"
        ? [{ issue: "Evidence is thin; add more independent sources.", sources: [] }]
        : []
    };
  }

  if (briefType === "source-summary") {
    return {
      ...common,
      title: "Source Summary Brief",
      themes: key.map(cite),
      tensions: unresolved,
      openQuestions: unresolved.length
        ? unresolved.map((x) => x.issue)
        : ["What important perspective is missing from this source set?"]
    };
  }

  if (briefType === "research") {
    return {
      ...common,
      title: query ? `Research Brief — ${compact(query)}` : "Research Brief",
      answered: key.slice(0, 4).map(cite),
      partial: unresolved,
      open: unresolved.length
        ? unresolved.map((x) => x.issue)
        : ["Add a source that directly tests the weakest assumption."],
      nextResearchMove: unresolved.length
        ? "Resolve the explicit source conflicts with a newer or primary source."
        : analysis.evidenceStrength === "thin"
          ? "Add at least two independent sources before drawing a conclusion."
          : "Stress-test the current conclusion with a dissenting or primary source."
    };
  }

  if (briefType === "source-comparison") {
    return {
      ...common,
      title: "Source Comparison Brief",
      agreements: analysis.agreements.map((a) => ({
        statement: cite(a.claims[0]),
        corroboratedBy: a.claims[1].sourceLabel
      })),
      disagreements: unresolved,
      uniqueClaims: key.map(cite)
    };
  }

  if (briefType === "comparison") {
    const optionRows = options.map((option) => {
      const matching = analysis.claims.filter((c) => optionMentions(option, c)).slice(0, 5);
      return {
        option,
        evidence: matching.map(cite),
        evidenceCount: matching.length
      };
    });
    return {
      ...common,
      title: "Comparison Brief",
      options: optionRows,
      sharedCriteria: [
        "evidence coverage",
        "documented tradeoffs",
        "source agreement",
        "unresolved risks"
      ],
      decision: null,
      note: "This brief deliberately stops before choosing a winner."
    };
  }

  const optionRows = options.map((option) => {
    const matching = analysis.claims.filter((c) => optionMentions(option, c));
    return { option, evidence: matching.map(cite), evidenceCount: matching.length };
  });
  const sorted = [...optionRows].sort((a, b) => b.evidenceCount - a.evidenceCount);
  const safeToRecommend =
    sorted.length >= 2 &&
    sorted[0].evidenceCount >= 2 &&
    sorted[0].evidenceCount > sorted[1].evidenceCount &&
    analysis.conflicts.length === 0 &&
    analysis.evidenceStrength !== "thin";

  return {
    ...common,
    title: "Recommendation Brief",
    options: optionRows,
    recommendation: safeToRecommend ? sorted[0].option : null,
    firmness: safeToRecommend ? confidenceLabel(analysis) : "insufficient",
    rationale: safeToRecommend
      ? `${sorted[0].option} has the strongest non-conflicted evidence coverage in this source set.`
      : "The current evidence does not justify a firm recommendation.",
    gaps: unresolved.length ? unresolved : safeToRecommend ? [] : [
      { issue: "Add more independent evidence or clearer option-specific evidence before making the call.", sources: [] }
    ]
  };
}

export function briefToMarkdown(brief) {
  const lines = [`# ${brief.title}`, "", `**Question:** ${brief.query || "—"}`, `**Evidence:** ${brief.evidenceStrength}`, `**Confidence:** ${brief.confidence}`, ""];
  const pushArray = (heading, values) => {
    if (!Array.isArray(values) || values.length === 0) return;
    lines.push(`## ${heading}`, "");
    for (const item of values) {
      if (typeof item === "string") lines.push(`- ${item}`);
      else lines.push(`- ${item.statement ?? item.issue ?? item.option ?? JSON.stringify(item)}`);
    }
    lines.push("");
  };

  if (brief.answer) lines.push("## Answer", "", brief.answer, "");
  pushArray("Summary", brief.summary);
  pushArray("Themes", brief.themes);
  pushArray("Answered", brief.answered);
  pushArray("Partial / Tensions", brief.partial ?? brief.tensions);
  pushArray("Open questions", brief.openQuestions ?? brief.open);
  pushArray("Agreements", Array.isArray(brief.agreements) ? brief.agreements : []);
  pushArray("Disagreements", brief.disagreements);
  pushArray("Unique claims", brief.uniqueClaims);
  if (brief.options?.length) {
    lines.push("## Options", "");
    for (const option of brief.options) {
      lines.push(`### ${option.option}`, "");
      for (const evidence of option.evidence ?? []) lines.push(`- ${evidence}`);
      if (!(option.evidence ?? []).length) lines.push("- No direct evidence captured.");
      lines.push("");
    }
  }
  if ("recommendation" in brief) {
    lines.push("## Recommendation", "", brief.recommendation ?? "No firm recommendation.", "", brief.rationale ?? "", "");
  }
  if (brief.nextResearchMove) lines.push("## Next research move", "", brief.nextResearchMove, "");
  pushArray("Evidence gaps", brief.gaps);

  lines.push("## Sources", "");
  for (const source of brief.sources ?? []) {
    lines.push(`- [${source.label}] ${source.title}${source.url ? ` — ${source.url}` : ""}`);
  }
  return lines.join("\n");
}

function overlapScore(question, claim) {
  return jaccard(question, claim.text) + ([...words(question)].some((token) => words(claim.text).has(token)) ? 0.08 : 0);
}

export function answerFromBrief({ brief, question = "" } = {}) {
  if (!brief || typeof brief !== "object") throw new Error("A brief is required");
  const q = compact(question);
  if (!q) throw new Error("A follow-up question is required");
  const evidence = Array.isArray(brief.evidenceIndex) ? brief.evidenceIndex : [];
  const ranked = evidence
    .map((claim) => ({ ...claim, score: overlapScore(q, claim) }))
    .filter((claim) => claim.score > 0.08)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const relevantConflicts = (brief.conflicts ?? []).filter((conflict) => {
    const text = `${conflict.left?.text ?? ""} ${conflict.right?.text ?? ""}`;
    return jaccard(q, text) > 0.08;
  });

  if (!ranked.length) {
    return {
      question: q,
      answer: "The saved brief does not contain enough directly relevant evidence to answer that follow-up.",
      confidence: "insufficient",
      evidence: [],
      conflicts: relevantConflicts,
      nextMove: "Capture or add a source that directly addresses this follow-up question."
    };
  }

  const evidenceLines = ranked.map((claim) => `${claim.text} [${claim.sourceLabel}]`);
  return {
    question: q,
    answer: relevantConflicts.length
      ? `The evidence is mixed. ${evidenceLines.slice(0, 2).join(" ")}`
      : evidenceLines.slice(0, 3).join(" "),
    confidence: relevantConflicts.length ? "guarded" : ranked.length >= 3 ? "medium" : "low",
    evidence: evidenceLines,
    conflicts: relevantConflicts,
    nextMove: relevantConflicts.length
      ? "Resolve the conflicting source claims before acting on this answer."
      : ranked.length < 3
        ? "Add another independent source if this answer will drive a consequential decision."
        : null
  };
}

export function draftFromBrief({ brief, format = "memo", audience = "team" } = {}) {
  if (!brief || typeof brief !== "object") throw new Error("A brief is required");
  const heading = brief.title ?? "Research Brief";
  const evidence = (brief.evidenceIndex ?? []).slice(0, 6).map((claim) => `${claim.text} [${claim.sourceLabel}]`);
  const conflicts = (brief.conflicts ?? []).slice(0, 3).map((c) => `- ${c.left?.text ?? ""} [${c.left?.sourceLabel ?? "?"}] vs. ${c.right?.text ?? ""} [${c.right?.sourceLabel ?? "?"}]`);
  const recommendation = "recommendation" in brief
    ? (brief.recommendation ? `Recommendation: ${brief.recommendation}. ${brief.rationale ?? ""}` : `Recommendation: No firm recommendation yet. ${brief.rationale ?? ""}`)
    : "";

  const intro = format === "email"
    ? `Team,\n\nHere is the source-grounded update on ${brief.query || heading}.`
    : format === "decision-note"
      ? `# Decision note: ${brief.query || heading}\n\nAudience: ${audience}`
      : `# ${heading}\n\nPrepared for: ${audience}`;

  const body = [
    intro,
    "",
    "## What the evidence says",
    evidence.length ? evidence.map((x) => `- ${x}`).join("\n") : "- The current brief does not contain enough source evidence.",
    recommendation ? `\n## Current call\n${recommendation}` : "",
    conflicts.length ? `\n## Unresolved disagreement\n${conflicts.join("\n")}` : "",
    brief.nextResearchMove ? `\n## Next research move\n${brief.nextResearchMove}` : "",
    "",
    "## Sources",
    (brief.sources ?? []).map((s) => `- [${s.label}] ${s.title}${s.url ? ` — ${s.url}` : ""}`).join("\n") || "- None captured"
  ].filter(Boolean).join("\n");

  return { format, audience, title: heading, draft: body };
}
