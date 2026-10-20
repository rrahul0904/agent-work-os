# Beesnote · Last-Done Activity Memory Lab

Original, minimal, zero-dependency research implementation staged under Agent Work OS. **Not** part of Agent Work OS runtime; candidate for migration into Beesnote Rebuild after product ownership is established.

## Run and verify
```sh
node --test labs/beesnote-last-done/engine.test.mjs
python3 -m http.server 8765 --directory labs/beesnote-last-done
# Open http://localhost:8765
```

The app is a static HTML/ESM demo. It stores personal data in **unencrypted browser localStorage**, with JSON export; browser data can be lost, cleared or accessed by browser extensions. Avoid safety-critical or sensitive tracking. No analytics, login, remote network calls or payments. Browser UI/manual interaction was not device-tested in this intake.

Core file contracts: `engine.mjs` owns deterministic event logging, time-derived state, median gap, due estimate, strict import validation. `app.mjs` and `index.html` provide a small local preview. `engine.test.mjs` uses Node's built-in test runner.

Evidence and clean-room boundary: `../../docs/rea/doneago-intake-2026-10-20.md`.

### Deferred deliberately
- React Native/Expo integration, SQLite encryption, OS native widgets/watch, sync, calendar-week schedules, shared households, deletion/undo audit, localized timezone nudge scheduling, accessibility/device QA, backend auth and production release.
- Inference is informational. Do **not** use to decide medication dosing or other safety-critical actions.
