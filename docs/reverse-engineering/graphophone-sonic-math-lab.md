# Graphophone → Sonic Math Lab clean-room dossier

Source intake: `r/SideProject` post “built a website where you can plot formulas with sound” (2026-10-11) and its public demo.

## Evidence
Observed public capabilities: Cartesian and parametric formulas, preset functions/shapes, live parameters, animated tracing, browser-synthesized sound controls, local saves, share links, sequencing and browser-side video export. Public launch feedback specifically called out the teaching value of hearing `sin(x)` change pitch while manipulating a frequency parameter, and the shareability of video export.

Unknowns stay UNKNOWN: donor source code, private architecture, analytics, conversion funnel, internal storage formats, exact synthesis implementation, export implementation details and production telemetry were not available and are not inferred.

## Workflow reconstruction
1. Pick a preset or enter a formula.
2. Parse and sample the function into points.
3. Draw the curve and axes in-browser.
4. Manipulate parameters while the curve updates.
5. Trace points over time and map curve values to synthesized sound.
6. Optionally save locally, copy state into a share URL, or record the canvas plus generated audio.

## User value and failure modes
Primary jobs: learn frequency/amplitude/parametric relationships, create audiovisual math sketches, and export a shareable result.

Failure boundaries: malformed formula; unsupported identifier; discontinuity/non-finite output; WebAudio unavailable or blocked pending user gesture; MediaRecorder/canvas capture unavailable; clipboard unavailable; localStorage unavailable/quota exceeded. The rebuild fails formula execution closed and does not require microphone, account, backend, or user-content upload.

## Product thesis
Build an original **Sonic Math Lab**, not a Graphophone clone. Prioritize a guided educational layer on top of a creative graph-to-audio instrument: each preset explains what the user should hear and see, while advanced users can still enter formulas directly.

## Original behavior choices
- Original visual language and product naming.
- Three explicit live parameters `a`, `b`, `c`.
- Safe identifier allowlist before any expression compilation.
- Fixed browser-only execution boundary.
- Y-to-pitch and X-to-stereo mappings plus a combined mode.
- One-click learning presets for frequency, amplitude, chirp, beating, wave packet and orbit.
- Local-only saves and URL-encoded sharing.
- Canvas + synthesized-audio WebM export when supported.

## Acceptance gates
- Valid whitelisted formulas evaluate deterministically.
- Unsupported identifiers and code punctuation are rejected.
- Cartesian and parametric sampling remain finite for valid presets.
- Live parameter changes redraw immediately.
- Playback moves a trace point and updates coordinate/frequency readouts.
- WebAudio begins only after user interaction.
- Save/share require no server.
- Export records the canvas plus generated audio when browser APIs are supported.
- Exact branch SHA must pass repository CI before hosted certification.
- Hosted URL must be fetched after deployment; “deployment created” alone is not SHIPPED.
