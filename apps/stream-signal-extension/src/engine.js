(() => {
  const Core = globalThis.StreamSignalCore;
  if (!Core) throw new Error("StreamSignalCore must be loaded before engine.js");

  function makeReceipt() {
    return {
      observed: 0,
      matched: 0,
      ambiguous: 0,
      unknown: 0,
      rendered: 0,
      timestamp: new Date().toISOString(),
    };
  }

  function clearExistingOverlay(card) {
    card.querySelectorAll(":scope > .stream-signal-overlay").forEach((node) => node.remove());
    card.classList.remove("stream-signal-faded");
  }

  function renderOverlay(card, decision, settings) {
    clearExistingOverlay(card);
    if (!decision || decision.state !== "overlay") return false;

    const overlay = document.createElement("div");
    overlay.className = "stream-signal-overlay";
    overlay.setAttribute("data-stream-signal", decision.canonicalId || "matched");

    decision.ratings.forEach((rating) => {
      const chip = document.createElement(rating.attributionUrl ? "a" : "span");
      chip.className = "stream-signal-chip";
      chip.textContent = `${rating.label} ${Math.round(rating.value)}`;
      if (rating.attributionUrl) {
        chip.href = rating.attributionUrl;
        chip.target = "_blank";
        chip.rel = "noopener noreferrer";
      }
      overlay.appendChild(chip);
    });

    if (settings.showConfidence && Number.isFinite(decision.confidence)) {
      const confidence = document.createElement("span");
      confidence.className = "stream-signal-confidence";
      confidence.textContent = `${Math.round(decision.confidence * 100)}% match`;
      confidence.title = "Title-match confidence";
      overlay.appendChild(confidence);
    }

    card.appendChild(overlay);
    card.classList.toggle("stream-signal-faded", Boolean(decision.faded));
    return true;
  }

  async function scan({ root = document, adapter, provider, settings = Core.DEFAULT_SETTINGS }) {
    if (!adapter || typeof adapter.discover !== "function" || typeof adapter.observe !== "function") {
      throw new Error("adapter must implement discover(root) and observe(card)");
    }
    if (!provider || typeof provider.candidates !== "function" || typeof provider.ratings !== "function") {
      throw new Error("provider must implement candidates(observation) and ratings(canonicalId)");
    }

    const normalizedSettings = Core.sanitizeSettings(settings);
    const receipt = makeReceipt();
    const cards = Array.from(adapter.discover(root));

    for (const card of cards) {
      clearExistingOverlay(card);
      const observed = adapter.observe(card);
      const observation = Core.createTitleObservation(observed || {});
      receipt.observed += 1;

      if (observation.state !== "observed") {
        receipt.unknown += 1;
        continue;
      }

      const candidates = await provider.candidates(observation);
      const resolution = Core.resolveTitle(observation, candidates);
      if (resolution.state === "matched") receipt.matched += 1;
      else if (resolution.state === "ambiguous") receipt.ambiguous += 1;
      else receipt.unknown += 1;

      const ratings = resolution.state === "matched" ? await provider.ratings(resolution.canonicalId) : [];
      const decision = Core.decideOverlay({ resolution, ratings, settings: normalizedSettings });
      if (renderOverlay(card, decision, normalizedSettings)) receipt.rendered += 1;
    }

    return receipt;
  }

  globalThis.StreamSignalEngine = Object.freeze({ scan, renderOverlay, clearExistingOverlay });
})();
