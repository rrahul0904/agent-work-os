export const PROTOCOL_VERSION = 1;

export function encodeMessage(value) {
  return JSON.stringify(value);
}

export function decodeMessage(value) {
  const parsed = JSON.parse(value);
  if (!parsed || typeof parsed !== "object" || typeof parsed.type !== "string") {
    throw new Error("Invalid protocol message");
  }
  return parsed;
}

export function isoNow() {
  return new Date().toISOString();
}
