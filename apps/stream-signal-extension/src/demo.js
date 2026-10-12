(() => {
  const Core = globalThis.StreamSignalCore;
  const Engine = globalThis.StreamSignalEngine;
  if (!Core || !Engine) throw new Error("Stream Signal core and engine are required");

  const FIXTURES = [
    { id: "arrival-2016-movie", title: "Arrival", year: 2016, kind: "movie", ratings: [{ provider: "fixture", label: "Score", value: 92 }] },
    { id: "dune-2021-movie", title: "Dune", year: 2021, kind: "movie", ratings: [{ provider: "fixture", label: "Score", value: 83 }] },
    { id: "dark-2017-series", title: "Dark", year: 2017, kind: "series", ratings: [{ provider: "fixture", label: "Score", value: 95 }] },
    { id: "heat-1995-movie", title: "Heat", year: 1995, kind: "movie", ratings: [{ provider: "fixture", label: "Score", value: 88 }] },
    { id: "heat-1972-movie", title: "Heat", year: 1972, kind: "movie", ratings: [{ provider: "fixture", label: "Score", value: 61 }] },
    { id: "low-2024-movie", title: "Example Low Score", year: 2024, kind: "movie", ratings: [{ provider: "fixture", label: "Score", value: 42 }] },
  ];

  const fixtureProvider = {
    async candidates(observation) {
      const exact = FIXTURES.filter((item) => Core.normalizeTitle(item.title).includes(observation.normalizedTitle) || observation.normalizedTitle.includes(Core.normalizeTitle(item.title)));
      return exact.map(({ ratings, ...candidate }) => candidate);
    },
    async ratings(canonicalId) {
      return FIXTURES.find((item) => item.id === canonicalId)?.ratings || [];
    },
  };

  const demoAdapter = {
    discover(root) {
      return root.querySelectorAll("[data-stream-title]");
    },
    observe(card) {
      return {
        platform: "fixture-catalog",
        rawTitle: card.dataset.streamTitle,
        year: card.dataset.streamYear || null,
        kind: card.dataset.streamKind || "unknown",
        platformId: card.dataset.streamId || null,
        pageUrl: location.href,
      };
    },
  };

  async function readSettings() {
    const defaults = Core.DEFAULT_SETTINGS;
    if (globalThis.chrome?.storage?.local) {
      return Core.sanitizeSettings(await chrome.storage.local.get(defaults));
    }
    try {
      return Core.sanitizeSettings({ ...defaults, ...JSON.parse(localStorage.getItem("stream-signal-settings") || "{}") });
    } catch {
      return defaults;
    }
  }

  async function writeSettings(settings) {
    const safe = Core.sanitizeSettings(settings);
    if (globalThis.chrome?.storage?.local) await chrome.storage.local.set(safe);
    else localStorage.setItem("stream-signal-settings", JSON.stringify(safe));
    return safe;
  }

  async function run() {
    const settings = await readSettings();
    const threshold = document.querySelector("#minimum-score");
    const thresholdValue = document.querySelector("#minimum-score-value");
    if (threshold) threshold.value = String(settings.minimumScore);
    if (thresholdValue) thresholdValue.textContent = String(settings.minimumScore);

    const receipt = await Engine.scan({ root: document, adapter: demoAdapter, provider: fixtureProvider, settings });
    const output = document.querySelector("#receipt");
    if (output) output.textContent = JSON.stringify(receipt, null, 2);
  }

  document.addEventListener("DOMContentLoaded", async () => {
    const threshold = document.querySelector("#minimum-score");
    const thresholdValue = document.querySelector("#minimum-score-value");
    threshold?.addEventListener("input", () => {
      if (thresholdValue) thresholdValue.textContent = threshold.value;
    });
    threshold?.addEventListener("change", async () => {
      const current = await readSettings();
      await writeSettings({ ...current, minimumScore: Number(threshold.value) });
      await run();
    });
    await run();
  });
})();
