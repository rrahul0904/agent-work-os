# ReasonPT Lab — REA / Clean-Room Record

## Source identity

Public reference supplied by the user: Reddit post `r/founder/comments/1x508id/big_dayy/`, which points to the publicly available Infera learning product and store listing.

## Public behavior observed

The public material describes a physiotherapy-student learning experience centered on realistic patient cases, questioning, differential ranking, information/test requests, commitment, feedback, foundational learning, daily practice, progression, groups, leaderboards, and community. The public listing also explicitly positions the product as educational rather than clinical decision support.

Recent public beta feedback highlighted two UX problems worth avoiding: crowded/horizontally scrolling navigation on mobile and progress that appeared stuck before jumping later in a case.

## Capability decomposition

1. Case library and daily challenge.
2. Structured case state machine.
3. History / safety / differential / information request / commit stages.
4. Immediate explanatory feedback.
5. Progress and habit mechanics.
6. Foundational reference modules.
7. Group/leaderboard layer.
8. Safety and educational-use boundary.

## Clean-room implementation decisions

ReasonPT Lab does **not** copy source code, assets, branding, screenshots, private APIs, text, datasets, or proprietary case content from the reference product. Publicly observable behavior is used only to derive requirements. The implementation has an original name, original UI, original copy, original fictional case content, and original code.

Known beta friction is intentionally redesigned:

- Mobile case navigation uses a fixed five-cell stepper rather than a horizontally scrolling tab bar.
- Progress is computed directly from the current case state and updates on every step.
- Mobile does not retain a clipped persistent sidebar.

## Safety gates

- No real-patient data or PHI in the MVP.
- No clinical diagnosis or treatment advice.
- Community/user-generated content is disabled pending identity, moderation, privacy, and abuse review.
- New clinical-learning case content is gated for educational review.
- Store packaging is a separate release phase with device testing and platform-policy review.

## Release evidence expected

A release may be called deployed only when the exact branch SHA is recorded, the Vercel deployment is `READY`, and the live URL is fetched successfully. Production-readiness beyond this MVP (identity, backend persistence, content governance, analytics, moderation, native store packaging) must not be inferred from a successful static deployment.