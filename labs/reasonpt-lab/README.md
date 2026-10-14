# ReasonPT Lab

ReasonPT Lab is a clean-room educational clinical-reasoning practice MVP for physiotherapy learners. It uses fictional cases to teach a repeatable reasoning sequence: focused history → safety screen → differential ranking → discriminating information → commitment → feedback.

## Safety boundary

- Fictional educational cases only.
- Do not enter or upload real patient information.
- No diagnosis, treatment, or clinical decision-support claims.
- Community posting is disabled until identity, moderation, privacy, and abuse controls are reviewed.
- Additional cases remain locked until educational content review.

## MVP features

- Responsive desktop/mobile experience with fixed five-step case navigation.
- Immediate progress derived from the active step.
- One complete interactive knee reasoning case.
- Differential ranking and commit-before-feedback flow.
- Local-only XP, completion, accuracy, and case state using `localStorage`.
- Foundations, Body Lab, and Study Group demo surfaces.
- No third-party runtime dependencies and no credentials.

## Run locally

```bash
python3 -m http.server 4173 --directory labs/reasonpt-lab
```

Open `http://127.0.0.1:4173`.

## Verification

This lab is intentionally self-contained. Release verification should include:

1. Static HTML parse / local HTTP 200.
2. Vercel build reaches `READY` from the exact branch SHA.
3. Live root returns the ReasonPT Lab title/body.
4. Mobile layout is checked at a narrow viewport before store packaging.

See `REVERSE_ENGINEERING.md` for the public-evidence and clean-room record.