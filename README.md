# SSCAP landing page

Landing page for **SSCAP — Smart Sewer Capacity Analysis & Planning** by Smart City Water Inc. Primary conversion: book a live demo.

| File | What it is |
| --- | --- |
| `index.html` | Self-contained page (inline CSS/JS). MapLibre GL JS 4.7.1 loads lazily from jsDelivr with SRI. |
| `demo-network.geojson` | Illustrative demo network: 925 conduits, 926 manholes, 4 SMAs, 10 development applications, 6 monitors. Swap it for the open-data demo city model. |
| `hero-poster.svg`, `hero-poster-dark.svg` | Static LCP posters (light and dark themes) of the coloured network, shown until the live map cross-fades in. |
| `og-image.png` | 1200×630 share image rendered from the poster. |
| `favicon.svg` | Smart City Water mark, used as the favicon and the nav logo. |
| `tools/generate-network.mjs` | Regenerates the GeoJSON and poster: `node tools/generate-network.mjs` |
| `sample-design-sheet.pdf`, `design-sheet-preview.webp` | Fictional one-page Sanitary Design Sheet (DA.24.017, 22 pipe segments) and its preview, shown in the "Automated Sanitary Design Sheet" feature block. |
| `tools/generate-design-sheet.mjs` | Rebuilds the sample PDF with Playwright. It uses the same column layout and formulas as a municipal design sheet: 370 L/cap/day, 0.26 L/s/ha infiltration, Harmon PF bounded 2.00–4.00, ICI as equivalent population, Manning n = 0.013. Run `node tools/generate-design-sheet.mjs`, then convert `tools/.build/design-sheet-preview.png` to WebP. |

## Demo form

- **Three required fields:** full name, work email (free-mail domains are rejected) and organization.
- **Optional:**
  - phone (checked only if filled in);
  - a separate, unchecked CASL marketing-consent box.
- **Layout:** two columns (name | email, organization | phone) that stack on narrow screens. The button and the privacy note share one row.
- Role, region, network size and tools are left for the demo call or for CRM enrichment.
- Hidden fields still capture UTM tags, the referrer and the last map layer and scenario viewed.
- A honeypot field and a time-to-submit check catch spam.

## Design language

- The page uses **Material 3** (Google's open design system):
  - colour roles: surface / surface-container tones, outline-variant lines, and a tonal secondary-container for selected states;
  - type: Roboto Flex at a regular-weight display / headline scale, with medium titles and Roboto Mono for numbers;
  - shapes: 28 px cards, pill buttons, 8 px filter chips and 4 px outlined fields;
  - interaction: flat buttons with hover / press state layers and emphasized easing.
- It carries no Google branding. Data-tier colours stay reserved for capacity and condition.

## Themes

- **Light** is the default. The **Dark** night "control app" theme is one click away on the nav button.
- The choice is saved per visitor (`localStorage` key `sscap_theme`) and applied before first paint, so the page doesn't flash the wrong theme.
- Each theme has its own design tokens (`:root` and `:root[data-theme="dark"]`), capacity-tier palette, basemap styling, 3D building glass and hero poster.
- Switching theme rebuilds the map in the new style and keeps the camera where it was.

## Hero map

- A night "control app" look: a dark 3D city (pitch 58°, bearing −16.7° along York Region's concession grid) over OpenFreeMap vector tiles of Vaughan Metropolitan Centre, with a glass control card. The card has scenario tiles, layer chips with live counts, a storm selector, and glowing cards for the most loaded conduits.
- Camera:
  - pan: drag;
  - zoom: wheel, pinch or + / −;
  - rotate and tilt: right-drag, Ctrl+drag, two-finger twist, or the rotate and tilt buttons;
  - compass resets north, and "Reset" returns to the default view.
- The network is **synthetic**. It is laid out around Vaughan Metropolitan Centre (trunk along the Hwy 407 edge from Hwy 400 towards Keele St, laterals north across Hwy 7) on the rotated concession grid, and is not the City of Vaughan's or any municipality's data. It won't line up exactly with real streets. A badge on the map says so.
- **Basemap:** OpenFreeMap vector tiles (Positron style, re-tinted per theme) through MapLibre GL JS. No API key or account, no usage limits, commercial use allowed; keep the OpenStreetMap / OpenFreeMap attribution visible.
- Flows follow Ontario design conventions: 370 L/cap/day, Harmon PF capped at 4.0, 0.26 L/s/ha infiltration, ICI by area, and Manning full-flow capacity with n = 0.013. Each scenario recomputes Q/Qcap in the browser.
- Indicators:
  - conduits are coloured by tier, with patterns as a non-colour backup;
  - surcharged pipes (≥ 100%) get a red-orange heatmap glow;
  - application volumes are extruded in blue.
- If MapLibre or the tiles fail to load, the poster stays in place. Counters, the tour, the scenario announcements and "View as table" still work from the GeoJSON.

## Wiring

- **Leads:** `submitLead(payload)` in `index.html` posts to `LEAD_ENDPOINT`, which is a placeholder. A comment beside it shows the HubSpot Forms API mapping.
- **Analytics:** events go to `window.dataLayer` only after consent. Load your tag manager inside `SSCAP.onConsent(...)`.
- **A/B headline:** add `?h=A|B|C` to the URL.

Every `[CONFIRM]` item is listed in the HTML comment at the top of `index.html` and flagged visibly on the page.
