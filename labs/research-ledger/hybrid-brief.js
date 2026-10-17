(() => {
  const button = document.querySelector('#createBrief');
  const questionInput = document.querySelector('#question');
  if (!button || !questionInput) return;

  const originalCreateBrief = button.onclick;
  let running = false;

  async function persistedCaptureChunks() {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('research-ledger', 3);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      if (!db.objectStoreNames.contains('captures')) return [];
      const captures = await new Promise((resolve, reject) => {
        const tx = db.transaction('captures', 'readonly');
        const request = tx.objectStore('captures').getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });
      return captures.flatMap(capture => capture?.text ? chunkText(capture.text, capture.id, capture.title || capture.url || capture.id) : []);
    } finally {
      db.close();
    }
  }

  async function resolveFusedResults(fused, limit) {
    const liveById = new Map(state.chunks.map(chunk => [chunk.id, chunk]));
    const missing = fused.some(item => !liveById.has(item.id));
    const persisted = missing ? await persistedCaptureChunks() : [];
    const persistedById = new Map(persisted.map(chunk => [chunk.id, chunk]));
    const selected = [];
    const seen = new Set();

    for (const item of fused) {
      let chunk = liveById.get(item.id) || persistedById.get(item.id);
      if (!chunk) continue;

      if (!liveById.has(item.id)) {
        const normalized = String(chunk.text || '').replace(/\s+/g, ' ').trim();
        const equivalent = state.chunks.find(candidate => String(candidate.text || '').replace(/\s+/g, ' ').trim() === normalized);
        if (equivalent) chunk = equivalent;
        else state.chunks.push(chunk);
      }

      if (seen.has(chunk.id)) continue;
      seen.add(chunk.id);
      selected.push({ ...chunk, score: item.score, retrieval: item });
      if (selected.length >= limit) break;
    }
    return selected;
  }

  function decorateBrief(brief, meta) {
    brief.retrieval = meta;
    brief.lineage = Array.isArray(brief.lineage) ? brief.lineage : [];
    const existing = brief.lineage.findIndex(step => /retrieval/i.test(step?.stage || ''));
    const step = { stage: 'Retrieval', detail: meta.detail };
    if (existing >= 0) brief.lineage[existing] = step;
    else brief.lineage.splice(Math.min(1, brief.lineage.length), 0, step);
    if (meta.fallback) {
      brief.gaps = [`Hybrid retrieval fell back to lexical ranking: ${meta.error || 'semantic retrieval unavailable'}.`, ...(brief.gaps || [])];
    }
    return brief;
  }

  async function runHybridBrief() {
    if (running) return;
    const question = questionInput.value.trim();
    if (!question) return;
    running = true;
    button.disabled = true;
    const status = document.querySelector('#statusbar')?.firstElementChild;
    if (status) status.innerHTML = '<i class="pulse"></i> Building hybrid lexical + semantic ranking…';

    const lexical = retrieve(question, 14);
    let retrieved = lexical.slice(0, 7);
    let meta = {
      mode: 'lexical-fallback',
      fallback: true,
      error: 'semantic bridge unavailable',
      detail: `${retrieved.length} lexical passages selected after hybrid bridge fallback`
    };

    try {
      const bridge = window.ResearchLedgerSemantic;
      if (!bridge?.hybridRetrieve) throw new Error('semantic bridge unavailable');
      const hybrid = await bridge.hybridRetrieve(question, lexical, 10);
      const resolved = await resolveFusedResults(hybrid.results || [], 7);
      if (!resolved.length) throw new Error('hybrid fusion returned no local passages');
      retrieved = resolved;
      meta = {
        mode: 'hybrid-rrf',
        fallback: false,
        fusion: hybrid.fusion || 'rrf',
        rrfK: hybrid.rrfK || 60,
        model: hybrid.model || '',
        revision: hybrid.revision || '',
        coverage: hybrid.coverage || {},
        overlap: hybrid.overlap || {},
        detail: `${resolved.length} hybrid RRF passages · semantic coverage ${hybrid.coverage?.indexed || 0}/${hybrid.coverage?.total || 0} · lexical/semantic overlap ${hybrid.overlap?.overlap || 0}/${hybrid.overlap?.limit || 0}`
      };
    } catch (error) {
      meta.error = error?.message || 'semantic retrieval failed';
      meta.detail = `${retrieved.length} lexical passages selected after hybrid failure`;
    }

    renderSearchResults(retrieved);

    try {
      let brief;
      if (state.provider.live) {
        const response = await fetch('/api/research', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            task: 'research',
            question,
            mode: state.mode,
            evidence: retrieved.map(chunk => ({ id: chunk.id, title: chunk.title, text: chunk.text, kind: 'local-document' })),
            capturedSources: state.capturedSources.slice(0, 8)
          })
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Research failed');
        brief = decorateBrief(payload.brief, meta);
      } else {
        brief = decorateBrief(localBrief(question, state.mode, retrieved), meta);
      }
      state.version += 1;
      renderBrief(brief);
      if (status) status.innerHTML = `<i class="pulse"></i> ${meta.fallback ? 'Lexical fallback brief ready' : 'Hybrid grounded brief ready'}`;
    } catch (error) {
      const brief = decorateBrief(localBrief(question, state.mode, retrieved), meta);
      brief.gaps.unshift(`Live generation failed; local fallback used: ${error.message}`);
      renderBrief(brief);
      if (status) status.innerHTML = '<i class="pulse"></i> Local fallback ready';
    } finally {
      running = false;
      button.disabled = false;
    }
  }

  function hybridSelected() {
    return document.querySelector('#briefRetrieval')?.value === 'hybrid';
  }

  button.onclick = function hybridAwareCreateBrief(event) {
    if (!hybridSelected()) return originalCreateBrief?.call(this, event);
    return runHybridBrief();
  };

  questionInput.addEventListener('keydown', event => {
    if (!hybridSelected() || !(event.metaKey || event.ctrlKey) || event.key !== 'Enter') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    runHybridBrief();
  }, true);
})();
