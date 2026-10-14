# ReasonPT Lab Release Gate

This commit exists after the Vercel Git project was linked so the non-production branch can exercise the normal Git-integrated preview pipeline.

Release requirements:

- deployment source must match this branch head;
- Vercel state must be `READY`;
- live root must return ReasonPT Lab content;
- production promotion/deployment is allowed only after preview verification;
- native App Store / Play Store packaging remains a separate gate.