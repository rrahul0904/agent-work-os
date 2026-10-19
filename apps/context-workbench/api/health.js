export default function handler(_req, res) {
  res.status(200).setHeader("content-type", "application/json; charset=utf-8").send(JSON.stringify({
    ok: true,
    service: "context-continuity",
    version: "0.1.0",
    modules: ["session-handoff", "research-frame", "capture-extension", "voice-capture"]
  }));
}
