export async function syncCanvasSessionEvent(canvases, session, event) {
  if (!session?.id || !event || typeof event !== 'object') return [];
  const bindings = canvases.listCanvases().flatMap((canvas) =>
    canvas.nodes
      .filter((node) => node.sessionId === session.id)
      .map((node) => ({ canvasId: canvas.id, nodeId: node.id }))
  );
  const changed = new Set();

  for (const binding of bindings) {
    const snapshot = canvases.publicCanvas(binding.canvasId);
    const node = snapshot?.nodes.find((candidate) => candidate.id === binding.nodeId);
    if (!node) continue;

    if (event.kind === 'health' && event.healthy === true) {
      if (node.status === 'idle') {
        await canvases.transitionNode(binding.canvasId, binding.nodeId, {
          to: 'starting',
          reason: 'session_health_received'
        });
      }
      const current = canvases.publicCanvas(binding.canvasId).nodes.find((candidate) => candidate.id === binding.nodeId);
      if (current?.status === 'starting') {
        await canvases.transitionNode(binding.canvasId, binding.nodeId, {
          to: 'running',
          reason: 'provider_health_confirmed',
          healthEvidence: {
            healthy: true,
            sessionId: session.id,
            observedAt: event.at ?? new Date().toISOString(),
            source: event.source ?? `${event.provider ?? session.agent ?? 'provider'}.health`
          }
        });
        changed.add(binding.canvasId);
      }
      continue;
    }

    if (event.kind !== 'status') continue;

    // A legacy status=running event is never accepted as health proof. Only the
    // explicit positive health event above can move starting -> running.
    if (event.status === 'running') continue;

    if (event.status === 'failed') {
      let current = canvases.publicCanvas(binding.canvasId).nodes.find((candidate) => candidate.id === binding.nodeId);
      if (current?.status === 'idle') {
        await canvases.transitionNode(binding.canvasId, binding.nodeId, {
          to: 'starting',
          reason: 'session_failed_before_health'
        });
        current = canvases.publicCanvas(binding.canvasId).nodes.find((candidate) => candidate.id === binding.nodeId);
      }
      if (['starting', 'running', 'needs_input'].includes(current?.status)) {
        await canvases.transitionNode(binding.canvasId, binding.nodeId, {
          to: 'error',
          reason: 'session_failed'
        });
        changed.add(binding.canvasId);
      }
      continue;
    }

    if (event.status === 'completed') {
      const current = canvases.publicCanvas(binding.canvasId).nodes.find((candidate) => candidate.id === binding.nodeId);
      if (['running', 'needs_input'].includes(current?.status)) {
        await canvases.transitionNode(binding.canvasId, binding.nodeId, {
          to: 'completed',
          reason: 'session_completed'
        });
        changed.add(binding.canvasId);
      }
      continue;
    }

    if (event.status === 'interrupted') {
      const current = canvases.publicCanvas(binding.canvasId).nodes.find((candidate) => candidate.id === binding.nodeId);
      if (['starting', 'running', 'needs_input'].includes(current?.status)) {
        await canvases.transitionNode(binding.canvasId, binding.nodeId, {
          to: 'stopped',
          reason: 'session_interrupted'
        });
        changed.add(binding.canvasId);
      }
    }
  }

  return [...changed];
}

export async function reconcileCanvasNodeFromSession(canvases, canvasId, nodeId, session) {
  if (!session?.id) return canvases.publicCanvas(canvasId);
  const current = canvases.publicCanvas(canvasId)?.nodes.find((node) => node.id === nodeId);
  if (!current) throw new Error('canvas_node_not_found');

  if (current.status === 'idle') {
    await canvases.transitionNode(canvasId, nodeId, {
      to: 'starting',
      reason: 'session_bound'
    });
  }

  for (const event of session.events ?? []) {
    if (event.kind === 'health' || event.kind === 'status') {
      await syncCanvasSessionEvent(canvases, session, event);
    }
  }

  return canvases.publicCanvas(canvasId);
}
