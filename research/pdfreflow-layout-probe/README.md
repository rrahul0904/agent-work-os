# REA PDFreflow research: layout-aware reader (2026-10-20)

**Governance:** [issue #326](https://github.com/rrahul0904/agent-work-os/issues/326), routes to **RE-227 FreeReader Rebuild**; complements [JustRead #282](https://github.com/rrahul0904/agent-work-os/issues/282). **No new product repo created.** This branch is a clean-room research/reference probe, NOT shipping reader code.

## Grounded public evidence (and what is not proven)
| ID | Link | Evidence type | Scope and limit |
|---|---|---|---|
| PDR-001 | https://www.reddit.com/r/ebooks/comments/1xaqc0y/ | Creator post on 2026-10-20 | Text-based PDF mobile reflow, embedded figures/formulas, offline privacy claim; no binary verification |
| PDR-002 | https://www.pdfreflow.com/ | Vendor marketing | iOS TestFlight/Android links, deep-reading modes, on-device claim; not security certification |
| PDR-003 | https://www.reddit.com/r/SideProject/comments/1wuxniw/ | Creator engineering account | Flutter/PDFium character boxes, heuristic layout engine, no runtime AI; no public target source |
| PDR-004 | https://play.google.com/store/apps/details?id=com.eggnstone.reader | Distribution | Android beta states scanned PDFs unsupported; text selection/search/bookmarks not yet available per listing |
| PDR-005 | https://www.reddit.com/r/ebooks/comments/1xaqc0y/ | Comments | Early request for highlights, notes, sorting and search; small self-selecting sample |
| PDR-006 | https://github.com/josherich/pdf-reflow/tree/6c6233c9e3cbac9f2496806d1f7d7a7007e04bd9 | Independent GitHub repo, MIT source | **Not Mark Eggenstein's application**; independent conversion design and tests. Review PyMuPDF/MuPDF dependencies first |
| PDR-007 | https://github.com/mozilla/pdf.js/blob/master/LICENSE | Parser alternative | Apache-2.0 candidate; separate SBOM + notices still required |
| PDR-008 | https://github.com/chromium/pdfium/blob/main/LICENSE | PDFium license | Candidate native parser subject to notices/dependency BOM |

Beware the distinct AppBlit LLC app at `apps.apple.com/us/app/pdf-reflow/id1461144444`: similar name does NOT establish same vendor.

## RE-227 product capability delta
- **Match:** PDF/EPUB import, customizable text/spacing/dark mode, local reading.
- **Improve:** real two-column order, footnotes, figure/table/formula source fidelity, high-page-count performance, fallback to original PDF, offline provenance, search/selection/bookmark/highlight/notes.
- **New:** deterministic quality receipt, source-coordinate anchors, no-loss gate, isolated layout regression fixtures, per-region fallback, privacy mode and licensing audit.
- **Omit:** cloning UI, proprietary engine logic, branding, telemetry, creator screenshots, undocumented pricing or unverified adoption.

## Portable architecture (proposal, not verified target internals)
```text
authorized local PDF
 -> file classification (digital / scanned / mixed / layout-heavy)
 -> permissively licensed PDF glyph/box extractor
 -> block detector and conservative reading-order estimator
 -> lossless source-rect-linked semantic blocks
 -> figure/table/math raster fallback and preserved captions
 -> canonical RE-227 reader (offline typography, search, anchors, annotations)
 -> quality + privacy receipts; original-PDF fallback for uncertainty
```

### Geometry-only F24 prototype
`reading-order.mjs` accepts *already extracted* synthetic blocks and emits source-preserving order with a deliberately limited two-column heuristic. It:
- checks bounding boxes, duplicate IDs and accepted block kinds;
- handles spanning title/section anchors between column bands;
- falls back to stable spatial order when two columns cannot be safely confirmed;
- never deletes headers, notes, text or math silently;
- keeps source page/id/rectangle and exact text.

Run: `node --test research/pdfreflow-layout-probe/reading-order.test.mjs`.

**Important limitations:** it does not extract text from a real PDF, detect footnotes or headers, crop figures, implement page-to-page paragraph joins, assess confidence statistically, render a mobile app, or prove source-preserving language/technical fidelity. Real world layouts may break this simple midpoint classifier. A false two-column classification is still possible; reference tests are not deployment certification.

## Acceptance sequence
1. F23 source/evidence and routing — researched.
2. F24 reference probe — synthetic tests only; no user PDFs.
3. Integrate licensed parser and build a truth-labeled corpus: one/two/mixed columns, headings, nested tables, vector equations, figures/captions, footnotes, page numbers, rotated pages, citations, multilingual/RTL, scanned and image-only PDFs.
4. Verification: no missing/duplicated source IDs, exact extracted-text retention where appropriate, explicit uncertainty, sourced geometry provenance, golden phone-screen captures, fallback on low confidence; measure column-order error, math/figure integrity, time/memory/battery for 1k pages.
5. Integrate with canonical reader storage, progress, search, TTS and annotations; source immutability and no default network egress.
6. Real-device/browser automated & manual tests, accessibility audits, full dependency/license review, shipping approval, exact-head CI receipt and deployment.

**Completion statement:** source + initial research + synthetic geometry reference, **not** a complete PDF reflow implementation; no verified consumer product, mobile builds or release.
