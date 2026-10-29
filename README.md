# SSCAP landing page

Landing page for **SSCAP — Sanitary Sewer Condition Assessment Platform** by Smart City Water Inc. Primary conversion: book a live demo.

`index.html` is **generated** from the design canvas. Edit `design/sscap.dc.html` (or the files in `tools/`), then rebuild:

```sh
node tools/build-from-canvas.mjs                 # build and prerender (needs Playwright)
node tools/build-from-canvas.mjs --no-prerender  # build only
```

| File | What it is |
| --- | --- |
| `design/sscap.dc.html` | The design canvas: layout, copy, styles, the 3D map and the demo network. Single source of truth. |
| `index.html` | Generated, self-contained page: the canvas template, its script, Preact, the production wiring and a prerendered first view. |
| `tools/build-from-canvas.mjs` | Builds `index.html`: adds the SEO head (JSON-LD FAQ read from the canvas), maps canvas assets to local files, and prerenders the first view. |
| `tools/canvas-runtime.js` | Compiles the canvas template (`{{holes}}`, `<sc-for>`, `<sc-if>`) into a Preact view and re-renders on `setState`. |
| `tools/page-wiring.js` | Production-only: cookie consent, `dataLayer` analytics, lead submission. |
| `tools/vendor/` | Preact 10.24.3 (MIT), inlined into the page. |
| `vaughan-city-light.webp`, `vaughan-city-dark.webp` | The City of Vaughan rendered from OpenStreetMap, under the detailed Vaughan Metropolitan Centre map. Only the image for the current theme downloads. |
| `og-image.png` | 1200×630 share image of the map. |
| `see-application-trace.webp` | SSCAP screenshot (DA.20.041 traced to its outlet) for the first "See it" card. |
| `favicon.svg` | Smart City Water mark. |
| `sample-design-sheet.pdf`, `design-sheet-preview.webp` | Fictional one-page Sanitary Design Sheet and its preview. Rebuild with `node tools/generate-design-sheet.mjs`. |

## Hero map

- A 3D city of Vaughan Metropolitan Centre drawn from OpenStreetMap data (© OpenStreetMap contributors), with no map service, API key or tiles.
- The sewer network is **synthetic**: 187 manholes traced along real street centrelines, draining to one outfall south of the centre. It is not the City of Vaughan's or any municipality's data, and a note on the map says so.
- Flows follow Ontario design conventions (370 L/cap/day, Harmon PF ≤ 4.0, 0.26 L/s/ha infiltration, Manning n = 0.013). Each scenario and storm recomputes Q/Qcap in the browser.
- Capacity tiers: Good 0–0.5, Moderate 0.5–0.8, Poor 0.8–1, Critical ≥ 1, No Data.
- Screen readers get the same conduits as a visually hidden list.

## Demo forms

- Two forms (intro modal and the demo section) share one handler in `tools/page-wiring.js`.
- Required: full name, work email (free-mail domains are rejected), organization. Optional: phone and an unchecked CASL consent box.
- The last map layer and scenario, UTM tags, the referrer and the landing page go with the lead.
- A honeypot field and a 3-second time-to-submit check drop bots silently.

## Wiring

- **Leads:** `SSCAP.submitLead(payload)` posts to `LEAD_ENDPOINT` (`/api/sscap-lead`, a placeholder). A comment beside it shows the HubSpot Forms API mapping. [CONFIRM CRM]
- **Analytics:** events (`cta_click`, `file_download`, `generate_lead`, `form_field_error`, `lead_submit_error`) go to `window.dataLayer` only after consent. Load your tag manager inside `SSCAP.onConsent(...)`.
- **Theme:** light by default; the choice is saved in `localStorage` (`sscap_theme`).
- **A/B headline:** add `?h=A|B|C` to the URL.

Items still marked `[CONFIRM]` / `[ANSWER NEEDED]` are flagged visibly on the page.
