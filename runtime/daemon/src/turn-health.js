export function createTurnHealthGate({ sessionId, provider, emit, now = () => new Date().toISOString() }) {
  let healthy = false;

  return {
    get healthy() { return healthy; },

    confirm(source, message) {
      if (healthy) return false;
      const cleanSource = String(source ?? '').trim();
      if (!cleanSource) throw new Error('health_source_required');
      healthy = true;
      const at = now();
      emit({
        kind: 'health',
        healthy: true,
        sessionId,
        provider,
        source: cleanSource,
        at
      });
      emit({
        kind: 'status',
        status: 'running',
        message: message || `${provider} turn health confirmed`,
        at
      });
      return true;
    }
  };
}

export function isPositiveProviderAction(action) {
  if (!action || typeof action !== 'object') return false;
  if (action.kind === 'error') return false;
  if (action.kind === 'status' && action.status === 'failed') return false;
  return ['thread', 'text', 'tool', 'usage', 'status'].includes(action.kind);
}
