const MAX_TERMINAL_SNAPSHOT_CHARS = 131_072;

export function isEphemeralSessionEvent(event) {
  return event?.kind === 'terminal.snapshot';
}

export function sanitizeTerminalSnapshot(event) {
  if (!isEphemeralSessionEvent(event)) throw new Error('terminal_snapshot_required');
  return {
    kind: 'terminal.snapshot',
    text: String(event.text ?? '').slice(-MAX_TERMINAL_SNAPSHOT_CHARS),
    digest: String(event.digest ?? '').slice(0, 128),
    cols: boundedInt(event.cols, 120, 40, 300),
    rows: boundedInt(event.rows, 36, 10, 120),
    at: validIso(event.at) ?? new Date().toISOString()
  };
}

function boundedInt(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function validIso(value) {
  const time = Date.parse(String(value ?? ''));
  return Number.isFinite(time) ? new Date(time).toISOString() : undefined;
}
