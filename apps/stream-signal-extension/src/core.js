(() => {
  const DEFAULT_SETTINGS = Object.freeze({
    minimumScore: 70,
    fadeBelowThreshold: true,
    showConfidence: true,
  });

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function normalizeTitle(value = "") {
    return String(value)
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeYear(value) {
    if (value === null || value === undefined || value === "") return null;
    const year = Number.parseInt(String(value), 10);
    return Number.isInteger(year) && year >= 1888 && year <= 2200 ? year : null;
  }

  function normalizeKind(value) {
    const kind = String(value || "unknown").toLowerCase();
    if (["movie", "series"].includes(kind)) return kind;
    return "unknown";
  }

  function stableTitleKey({ title, year, kind }) {
    return [normalizeTitle(title), normalizeYear(year) ?? "?", normalizeKind(kind)].join("|");
  }

  function createTitleObservation({ platform, rawTitle, year = null, kind = "unknown", platformId = null, pageUrl = null }) {
    const normalizedTitle = normalizeTitle(rawTitle);
    if (!normalizedTitle) {
      return {
        state: "unknown",
        reason: "missing-title",
        platform: platform || "unknown",
        rawTitle: rawTitle ?? null,
        normalizedTitle: "",
        year: normalizeYear(year),
        kind: normalizeKind(kind),
        platformId,
        pageUrl,
      };
    }

    const normalizedYear = normalizeYear(year);
    const normalizedKind = normalizeKind(kind);
    return {
      state: "observed",
      platform: platform || "unknown",
      rawTitle: String(rawTitle),
      normalizedTitle,
      year: normalizedYear,
      kind: normalizedKind,
      platformId,
      pageUrl,
      stableKey: stableTitleKey({ title: normalizedTitle, year: normalizedYear, kind: normalizedKind }),
    };
  }

  function scoreCandidate(observation, candidate) {
    const candidateTitle = normalizeTitle(candidate?.title);
    if (!observation?.normalizedTitle || !candidateTitle) return 0;

    let score = 0;
    if (candidateTitle === observation.normalizedTitle) score += 0.72;
    else if (candidateTitle.includes(observation.normalizedTitle) || observation.normalizedTitle.includes(candidateTitle)) score += 0.45;
    else return 0;

    const observationYear = normalizeYear(observation.year);
    const candidateYear = normalizeYear(candidate.year);
    if (observationYear && candidateYear) {
      if (observationYear === candidateYear) score += 0.2;
      else if (Math.abs(observationYear - candidateYear) === 1) score += 0.06;
      else score -= 0.12;
    }

    const observationKind = normalizeKind(observation.kind);
    const candidateKind = normalizeKind(candidate.kind);
    if (observationKind !== "unknown" && candidateKind !== "unknown") {
      score += observationKind === candidateKind ? 0.08 : -0.12;
    }

    return clamp(Number(score.toFixed(4)), 0, 1);
  }

  function resolveTitle(observation, candidates = [], options = {}) {
    const threshold = Number.isFinite(options.threshold) ? options.threshold : 0.78;
    const ambiguityDelta = Number.isFinite(options.ambiguityDelta) ? options.ambiguityDelta : 0.05;

    if (!observation || observation.state !== "observed") {
      return { state: "unknown", reason: "invalid-observation", candidates: [] };
    }

    const ranked = candidates
      .map((candidate) => ({ candidate, confidence: scoreCandidate(observation, candidate) }))
      .filter((item) => item.confidence > 0)
      .sort((a, b) => b.confidence - a.confidence);

    if (!ranked.length || ranked[0].confidence < threshold) {
      return { state: "unknown", reason: "no-confident-match", candidates: ranked.slice(0, 3) };
    }

    if (ranked.length > 1 && ranked[1].confidence >= threshold && ranked[0].confidence - ranked[1].confidence <= ambiguityDelta) {
      return { state: "ambiguous", reason: "multiple-confident-matches", candidates: ranked.slice(0, 3) };
    }

    return {
      state: "matched",
      canonicalId: ranked[0].candidate.id,
      confidence: ranked[0].confidence,
      candidate: ranked[0].candidate,
      candidates: ranked.slice(0, 3),
    };
  }

  function sanitizeSettings(input = {}) {
    const minimumScoreRaw = Number(input.minimumScore);
    return {
      minimumScore: Number.isFinite(minimumScoreRaw) ? clamp(Math.round(minimumScoreRaw), 0, 100) : DEFAULT_SETTINGS.minimumScore,
      fadeBelowThreshold: typeof input.fadeBelowThreshold === "boolean" ? input.fadeBelowThreshold : DEFAULT_SETTINGS.fadeBelowThreshold,
      showConfidence: typeof input.showConfidence === "boolean" ? input.showConfidence : DEFAULT_SETTINGS.showConfidence,
    };
  }

  function decideOverlay({ resolution, ratings = [], settings = DEFAULT_SETTINGS }) {
    const normalizedSettings = sanitizeSettings(settings);
    if (!resolution || resolution.state !== "matched") {
      return { state: "no-overlay", reason: resolution?.state || "unresolved", faded: false, ratings: [] };
    }

    const validRatings = ratings
      .filter((rating) => rating && Number.isFinite(Number(rating.value)))
      .map((rating) => ({
        provider: String(rating.provider || "unknown"),
        label: String(rating.label || rating.provider || "Score"),
        value: clamp(Number(rating.value), 0, 100),
        scale: 100,
        attributionUrl: rating.attributionUrl || null,
      }));

    if (!validRatings.length) return { state: "no-overlay", reason: "no-ratings", faded: false, ratings: [] };

    const strongest = Math.max(...validRatings.map((rating) => rating.value));
    return {
      state: "overlay",
      faded: normalizedSettings.fadeBelowThreshold && strongest < normalizedSettings.minimumScore,
      ratings: validRatings,
      confidence: resolution.confidence,
      canonicalId: resolution.canonicalId,
    };
  }

  globalThis.StreamSignalCore = Object.freeze({
    DEFAULT_SETTINGS,
    normalizeTitle,
    normalizeYear,
    normalizeKind,
    stableTitleKey,
    createTitleObservation,
    scoreCandidate,
    resolveTitle,
    sanitizeSettings,
    decideOverlay,
  });
})();
