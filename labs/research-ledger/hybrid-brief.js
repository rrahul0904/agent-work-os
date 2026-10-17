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

  async function resolveRankedResults(ranked, limit) {
    const liveById = new Map(state.chunks.map(chunk => [chunk.id, chunk]));
    const missing = ranked.some(item => !liveById.has(item.id));
    const persisted = missing ? await persistedCaptureChunks() : [];
    const persistedById = new Map(persisted.map(chunk => [chunk.id, chunk]));
    const selected = [];
    const seen = new Set();

    for (const item of ranked) {
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
      brief.gaps = [`${meta.requestedMode || 'Experimental'} retrieval fell back to lexical ranking: ${meta.error || 'semantic retrieval unavailable'}.`, ...(brief.gaps || [])];
    }
    return brief;
  }

  function selectedRetrieval() {
    const value = document.querySelector('#briefRetrieval')?.value;
    return value === 'semantic' || value === 'hybrid' ? value : 'lexical';
  }

  async function runExperimentalBrief() {
    if (running) return;
    const question = questionInput.value.trim();
    if (!question) return;
    const requestedMode = selectedRetrieval();
    if (requestedMode === 'lexical') return originalCreateBrief?.call(button);

    running = true;
    button.disabled = true;
    const status = document.querySelector('#statusbar')?.firstElementChild;
    if (status) status.innerHTML = `<i class="pulse"></i> Building ${requestedMode === 'semantic' ? 'semantic' : 'hybrid lexical + semantic'} ranking…`;

    const lexical = retrieve(question, 14);
    let retrieved = lexical.slice(0, 7);
    let meta = {
      requestedMode,
      mode: 'lexical-fallback',
      fallback: true,
      error: 'semantic bridge unavailable',
      detail: `${retrieved.length} lexical passages selected after ${requestedMode} bridge fallback`
    };

    try {
      const bridge = window.ResearchLedgerSemantic;
      if (!bridge) throw new Error('semantic bridge unavailable');

      if (requestedMode === 'semantic') {
        if (!bridge.semanticRetrieve) throw new Error('semantic retriever unavailable');
        const semantic = await bridge.semanticRetrieve(question, 10);
        const resolved = await resolveRankedResults(semantic.results || [], 7);
        if (!resolved.length) throw new Error('semantic retrieval returned no local passages');
        retrieved = resolved;
        meta = {
          requestedMode,
          mode: 'semantic-e5',
          fallback: false,
          model: semantic.model || '',
          revision: semantic.revision || '',
          coverage: semantic.coverage || {},
          detail: `${resolved.length} semantic passages · coverage ${semantic.coverage?.indexed || 0}/${semantic.coverage?.total || 0} · pinned multilingual E5`
        };
      } else {
        if (!bridge.hybridRetrieve) throw new Error('hybrid retriever unavailable');
        const hybrid = await bridge.hybridRetrieve(question, lexical, 10);
        const resolved = await resolveRankedResults(hybrid.results || [], 7);
        if (!resolved.length) throw new Error('hybrid fusion returned no local passages');
        retrieved = resolved;
        meta = {
          requestedMode,
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
      }
    } catch (error) {
      meta.error = error?.message || 'semantic retrieval failed';
      meta.detail = `${retrieved.length} lexical passages selected after ${requestedMode} failure`;
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
      if (status) {
        const label = meta.fallback ? 'Lexical fallback' : meta.mode === 'semantic-e5' ? 'Semantic' : 'Hybrid';
        status.innerHTML = `<i class="pulse"></i> ${label} grounded brief ready`;
      }
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

  function experimentalSelected() {
    return selectedRetrieval() !== 'lexical';
  }

  button.onclick = function retrievalAwareCreateBrief(event) {
    if (!experimentalSelected()) return originalCreateBrief?.call(this, event);
    return runExperimentalBrief();
  };

  questionInput.addEventListener('keydown', event => {
    if (!experimentalSelected() || !(event.metaKey || event.ctrlKey) || event.key !== 'Enter') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    runExperimentalBrief();
  }, true);
})();
