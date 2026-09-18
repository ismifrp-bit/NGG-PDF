# PDFForge — All-in-One PDF Editor SaaS

A complete, working PDF SaaS product: marketing site, mock auth, pricing/checkout, account dashboard, and **20 genuinely functional PDF tools** that run 100% in the browser. No backend, no uploads.

## Run it

```bash
cd pdfforge
python3 -m http.server 3000
# open http://localhost:3000
```

Any static host works (Netlify, Vercel, S3, GitHub Pages) — it's all static files.

## Pages

| File | Purpose |
|---|---|
| `index.html` | Landing page — hero, tool grid w/ category filter, security section, testimonials, pricing teaser, FAQ |
| `app.html` | The workspace — sidebar nav, dashboard, all 20 tools, history log |
| `pricing.html` | 4 plans, monthly/yearly toggle, feature matrix, working mock checkout |
| `account.html` | Profile, billing, usage analytics, API keys, preferences, data & privacy |

## The 20 tools

**Organize** — Merge · Split · Organize Pages · Extract Pages · Rotate · N-up/Booklet
**Optimize** — Compress · Crop · Repair
**Convert** — PDF→Images · Images→PDF · PDF→Text · Scan & Read (OCR coverage)
**Edit** — PDF Studio · Sign · Watermark · Page Numbers
**Secure** — Redact · Protect · Metadata

### Notable implementations

- **PDF Studio** — WYSIWYG overlay editor on the live rendered page. Add text/images/boxes, drag to move, corner-handle to resize, live inspector for font/size/colour/opacity, "apply to all pages". Flattened into the real PDF on export.
- **Sign** — three modes: draw on a canvas pad (with auto-trim of whitespace), type-and-stylise, or upload a PNG. Place and drag onto any page.
- **Redact** — drag boxes on page thumbnails. Output is **rasterised**, so the underlying text is destroyed, not merely covered. Verified: `pypdf` extracts zero text from redacted output.
- **Organize** — drag-to-reorder thumbnails, multi-select, per-page rotate/duplicate/delete, plus quick actions (reverse, keep odd/even, rotate all).
- **Compress** — re-renders pages at a chosen scale + JPEG quality, optional grayscale, with live before/after size reporting.
- **Split** — by interval or by custom ranges (`1-3`, `5`, `8-`), output as a ZIP.

## Architecture

```
index.html  app.html  pricing.html  account.html
css/app.css            — design system (dark, one file)
js/icons.js            — inline SVG icon set
js/core.js             — state/localStorage, router, modals, toasts, auth, quota gating
js/engine.js           — the PDF engine (all real document operations)
js/tools.js            — tool registry, option panels, run handlers
js/workspace.js        — workspace UI, page grids, studio canvas, signature pad, redaction
vendor/                — pdf-lib, pdf.js, fontkit, JSZip (vendored, so it works offline)
```

**pdf-lib** writes PDFs, **pdf.js** renders and extracts text, **JSZip** bundles multi-file output. All vendored locally — load the page once and every tool keeps working with the network off.

## SaaS layer

- Mock auth (signup/signin) persisted to `localStorage`
- Plan gating: Free (15 ops/month, 15 MB) → Pro → Team → Enterprise
- Pro tools (Redact, Crop, N-up, OCR, Protect) show an upgrade modal on the free plan
- Quota tracking with a live usage meter, upgrade prompt at zero
- Mock Stripe-style checkout with card formatting; instantly unlocks features
- History log, usage analytics with per-tool bar charts, API key management

## Testing

Verified end-to-end with Playwright against real PDFs — every one of the 20 tools was driven through the UI and its output validated with `pypdf`:

- Merge 4+3 → 7 pages ✓
- Organize reverse/rotate/delete → correct count and `/Rotate` values ✓
- Extract `1,3` → 2 pages ✓ · Split ranges → 2 files × 2 pages ✓
- Watermark text present ✓ · Page numbers `Page 1 of 4` present ✓
- Redaction destroys text layer ✓ · Studio text flattened into output ✓
- Signature embeds an image XObject ✓ · Metadata round-trips ✓
- Signup → checkout → Pro unlock flow ✓ · Zero console errors across all pages ✓

## Notes / honest limits

- **Compression** rasterises pages, so text stops being selectable. That's the tradeoff for large size reductions on scans; it's stated in the UI.
- **Protect** flattens and marks restrictions client-side. Writing certified AES-256 encryption needs native crypto, so the UI points users to the API for that — it doesn't pretend otherwise.
- **OCR** reports text-layer coverage per page rather than running raster OCR (that would need a Tesseract WASM bundle, ~15 MB).
- Auth, payments and the API are mocked — this is a product demo, not a billing integration.
