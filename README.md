# SSCAP landing page

Landing page for **SSCAP — Smart Sewer Capacity Analysis & Planning** by Smart City Water Inc. Primary conversion: book a live demo.

| File | What it is |
| --- | --- |
| `index.html` | Self-contained page (inline CSS/JS). MapLibre GL JS 4.7.1 loads lazily from jsDelivr with SRI. |
| `demo-network.geojson` | Illustrative demo network: 925 conduits, 926 manholes, 4 SMAs, 10 development applications, 6 monitors. Swap it for the open-data demo city model. |
| `hero-poster.svg`, `hero-poster-dark.svg` | Static LCP posters (light and dark themes) of the coloured network, shown until the live map cross-fades in. |
| `og-image.png` | 1200×630 share image rendered from the poster. |
| `tools/generate-network.mjs` | Regenerates the GeoJSON and poster: `node tools/generate-network.mjs` |

## Themes

- **Light** is the default. The **Dark** night "control app" theme is one click away on the nav button.
- The choice is saved per visitor (`localStorage` key `sscap_theme`) and applied before first paint, so the page doesn't flash the wrong theme.
- Each theme has its own design tokens (`:root` and `:root[data-theme="dark"]`), capacity-tier palette, basemap styling, 3D building glass and hero poster.
- Switching theme rebuilds the map in the new style and keeps the camera where it was.

## Hero map

- A night "control app" look: a dark 3D city (pitch 58°, bearing 29° along Manhattan's grid) over OpenFreeMap vector tiles, with a glass control card. The card has scenario tiles, layer chips with live counts, a storm selector, and glowing cards for the most loaded conduits.
- Camera:
  - pan: drag;
  - zoom: wheel, pinch or + / −;
  - rotate and tilt: right-drag, Ctrl+drag, two-finger twist, or the rotate and tilt buttons;
  - compass resets north, and "Reset" returns to the default view.
- The network is **synthetic**. It is drawn on Manhattan's East Side street grid (14th–53rd St) and is not NYC or any municipality's data. A badge on the map says so.
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
