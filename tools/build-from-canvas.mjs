#!/usr/bin/env node
/*
  Builds index.html from the design canvas.

    node tools/build-from-canvas.mjs            # build + prerender (needs Playwright)
    node tools/build-from-canvas.mjs --no-prerender

  design/sscap.dc.html is the single source of truth for layout, copy, styles and the 3D map.
  This script wraps it with production pieces the canvas doesn't have:
    - <head>: SEO / Open Graph / JSON-LD (FAQ built from the canvas FAQ list)
    - consent banner, analytics dataLayer and lead submission (tools/page-wiring.js)
    - the Preact-based runtime that renders the canvas template (tools/canvas-runtime.js)
  and prerenders the initial view into the HTML so the copy is crawlable and paints before JS.
*/
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const src = read('design/sscap.dc.html');

// ---------- split the canvas ----------
const between = (s, a, b) => { const i = s.indexOf(a); const j = s.indexOf(b, i + a.length); if (i < 0 || j < 0) throw new Error('missing ' + a); return s.slice(i + a.length, j); };
const xdc = between(src, '<x-dc>', '</x-dc>');
const helmet = between(xdc, '<helmet>', '</helmet>');
let template = xdc.slice(xdc.indexOf('</helmet>') + '</helmet>'.length);
const scriptTag = src.slice(src.indexOf('<script type="text/x-dc"'));
const script = between(scriptTag, '>', '</script>');
const propsDecl = JSON.parse(between(scriptTag, "data-props='", "'"));
const props = {};
for (const [k, v] of Object.entries(propsDecl)) if (!k.startsWith('$') && 'default' in v) props[k] = v.default;

// ---------- production patches to the template ----------
const PATCHES = [
  // uploaded canvas assets → files next to index.html
  ['/_blob/32ce8765e019806e8f496263f1999762', 'vaughan-city-light.webp'],
  ['/_blob/d277f24f73a064b2660cfc32aeb1fadb', 'vaughan-city-dark.webp'],
  ['/_blob/bbd52348099698ccc1bd60a58e1782be', 'sample-design-sheet.pdf'],
  ['/_blob/500d5b755f0904dbbb4c2fb58838867d', 'design-sheet-preview.webp'],
  ['/_blob/4c0ce387e2649440b12a66a7851e609c', 'see-application-trace.webp'],
  ['/_blob/2db0d1eaa02df93c326dbc79526f29e0', 'see-flow-verified.webp'],
  ['/_blob/a6c8aa0ee04e3d62d57966103e5fc1b1', 'see-masterplan-scores.webp'],
  ['/_blob/efa1efc62218550c2637de76aea2bea2', 'see-performance-score.webp'],
  // only the city image for the current theme downloads (the other one is display: none)
  ['<img class="city-light" ', '<img class="city-light" loading="lazy" decoding="async" '],
  ['<img class="city-dark" ', '<img class="city-dark" loading="lazy" decoding="async" '],
  // real policy pages, plus a way back to the cookie choice
  ['<a id="privacy" href="#privacy" style="color: var(--ink3)">Privacy</a><a href="#legal" style="color: var(--ink3)">Legal</a>',
   '<a href="/privacy-policy/" style="color: var(--ink3)">Privacy</a><a href="/legal/" style="color: var(--ink3)">Legal</a><button type="button" data-consent-reopen="" style="background: none; border: 0; padding: 0; font: inherit; color: var(--ink3); text-decoration: underline; cursor: pointer">Cookie settings</button>'],
];
const OPTIONAL = new Set(['/_blob/bbd52348099698ccc1bd60a58e1782be', '/_blob/500d5b755f0904dbbb4c2fb58838867d']); // design-sheet assets: only if the canvas still shows them
for (const [a, b] of PATCHES) {
  if (!template.includes(a)) { if (OPTIONAL.has(a)) continue; throw new Error('patch target not found: ' + a.slice(0, 60)); }
  template = template.split(a).join(b);
}
template = template.split('href="#privacy"').join('href="/privacy-policy/"');

// ---------- FAQ for JSON-LD, read from the canvas data ----------
const faqSrc = script.slice(script.indexOf('var FAQS = '));
const FAQS = vm.runInNewContext(faqSrc.slice(0, faqSrc.indexOf('\n];') + 3) + '; FAQS');
const clean = t => t.replace(/\s*\[(CONFIRM|ANSWER NEEDED)[^\]]*\]/g, '').replace(/\s*Options for municipalities without a current model:\s*\./, '').trim();
const faqLd = FAQS.filter(f => !/^\[ANSWER NEEDED\]$/.test(f.a.trim()))
  .map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: clean(f.a) } }))
  .filter(f => f.acceptedAnswer.text && !/:\s*$/.test(f.acceptedAnswer.text));

const TITLE = 'SSCAP | Sanitary Sewer Condition Assessment Platform | Smart City Water';
const DESC = 'Real-time sanitary sewer insights for condition and capacity. Know your collection system hydraulic capacity and asset condition, and plan with confidence. Book a live demo.';
const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'SoftwareApplication', name: 'SSCAP — Sanitary Sewer Condition Assessment Platform', applicationCategory: 'BusinessApplication', operatingSystem: 'Web',
      description: 'Cloud platform that combines the hydraulic model, flow monitoring, development applications and CCTV condition data on one map, so engineers can test servicing capacity for every application, alone and cumulatively.',
      url: 'https://www.smartcitywater.ca/sscap/', publisher: { '@id': 'https://www.smartcitywater.ca/#org' } },
    { '@type': 'Organization', '@id': 'https://www.smartcitywater.ca/#org', name: 'Smart City Water Inc.', slogan: 'Changing the Way We Plan and Operate.', url: 'https://www.smartcitywater.ca/',
      email: 'solutions@smartcitywater.ca', telephone: '+1-866-473-0453',
      address: { '@type': 'PostalAddress', streetAddress: '155 Winges Rd, Unit 8', addressLocality: 'Woodbridge', addressRegion: 'ON', postalCode: 'L4L 6C7', addressCountry: 'CA' },
      contactPoint: { '@type': 'ContactPoint', contactType: 'sales', email: 'solutions@smartcitywater.ca', telephone: '+1-866-473-0453', areaServed: ['CA', 'US'] } },
    { '@type': 'FAQPage', mainEntity: faqLd },
  ],
};

// ---------- assemble ----------
const safeJson = o => JSON.stringify(o).replace(/</g, '\\u003c');
const inline = f => read(f).replace(/<\/script/gi, '<\\/script');

function page(prerendered) {
  return `<!doctype html>
<!--
  SSCAP landing page · Smart City Water Inc.
  GENERATED by tools/build-from-canvas.mjs from design/sscap.dc.html — edit the canvas or the tools, then rebuild.
  Items still marked [CONFIRM] / [ANSWER NEEDED] are flagged visibly on the page.
-->
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${TITLE}</title>
<meta name="description" content="${DESC}">
<link rel="canonical" href="https://www.smartcitywater.ca/sscap/">
<meta name="theme-color" content="#F8F9FC" id="meta-theme">
<meta name="color-scheme" content="light dark">
<script>/* light is the default; a saved choice wins */try{if(localStorage.getItem("sscap_theme")==="dark")document.documentElement.dataset.theme="dark"}catch(e){}</script>
<meta property="og:type" content="website">
<meta property="og:site_name" content="Smart City Water">
<meta property="og:title" content="SSCAP | Sanitary Sewer Condition Assessment Platform">
<meta property="og:description" content="${DESC}">
<meta property="og:url" content="https://www.smartcitywater.ca/sscap/">
<meta property="og:image" content="https://www.smartcitywater.ca/sscap/og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Sanitary sewer network in a 3D city view, each pipe coloured by used capacity">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="SSCAP | Sanitary Sewer Condition Assessment Platform">
<meta name="twitter:description" content="${DESC}">
<meta name="twitter:image" content="https://www.smartcitywater.ca/sscap/og-image.png">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
${helmet.trim()}
<style>
body{margin:0}
/* production-only: cookie consent banner */
.sscap-consent{position:fixed;left:16px;right:16px;bottom:16px;z-index:90;max-width:560px;margin:0 auto;display:flex;flex-wrap:wrap;gap:12px;align-items:center;padding:16px;border-radius:16px;background:#FFFFFF;color:#1F1F1F;border:1px solid rgba(0,0,0,0.12);box-shadow:0 8px 28px rgba(0,0,0,0.18);font:14px/1.5 "Roboto Flex",system-ui,sans-serif}
[data-theme="dark"] .sscap-consent{background:#1E1F20;color:#E3E3E3;border-color:rgba(255,255,255,0.14)}
.sscap-consent[hidden]{display:none}
.sscap-consent p{margin:0;flex:1 1 280px}
.sscap-consent a{color:inherit}
.sscap-consent button{min-height:44px;padding:0 16px;border-radius:999px;font:600 14px "Roboto Flex",system-ui,sans-serif;cursor:pointer}
.sscap-consent .ghost{background:transparent;color:inherit;border:1px solid currentColor}
.sscap-consent .primary{background:#0B57D0;color:#FFFFFF;border:0}
</style>
<script type="application/ld+json">${safeJson(jsonLd)}</script>
</head>
<body>
<div id="sscap-root">${prerendered}</div>

<div class="sscap-consent" id="consent" role="region" aria-label="Cookie consent" hidden>
  <p>We'd like to use analytics cookies to understand how this page is used. Nothing is set until you agree. <a href="/privacy-policy/">Privacy Policy</a></p>
  <button type="button" class="ghost" id="consent-no">Decline</button>
  <button type="button" class="primary" id="consent-yes">Accept analytics</button>
</div>

<script>
window.SSCAP_CANVAS = ${safeJson({ template, script, props })};
(function () { var h = (new URLSearchParams(location.search).get('h') || '').toUpperCase(); if (/^[ABC]$/.test(h)) SSCAP_CANVAS.props.headlineVariant = h; })();
</script>
<script>/* Preact 10.24.3 · MIT · https://preactjs.com */
${inline('tools/vendor/preact-10.24.3.min.js').replace(/\n\/\/# sourceMappingURL=.*$/m, '')}
</script>
<script>
${inline('tools/page-wiring.js')}
</script>
<script>
${inline('tools/canvas-runtime.js')}
</script>
</body>
</html>
`;
}

const out = path.join(ROOT, 'index.html');
fs.writeFileSync(out, page(''));

// ---------- prerender the first view ----------
if (!process.argv.includes('--no-prerender')) {
  const { createRequire } = await import('node:module');
  const { execSync } = await import('node:child_process');
  const require = createRequire(import.meta.url);
  let pw;
  try { pw = require('playwright'); } catch (e) { pw = require(path.join(execSync('npm root -g').toString().trim(), 'playwright')); }
  const { chromium } = pw;
  const browser = await chromium.launch();
  const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  await p.route('**/*', r => (r.request().url().startsWith('file:') ? r.continue() : r.abort()));
  await p.goto(pathToFileURL(out).href);
  await p.waitForSelector('#sscap-root section');
  const html = await p.evaluate(() => {
    const root = document.getElementById('sscap-root').cloneNode(true);
    // the 3D city is thousands of nodes; the runtime draws it on load, so ship it empty
    root.querySelectorAll('.map-inner').forEach(n => { n.innerHTML = ''; });
    root.querySelectorAll('.lead-fail').forEach(n => n.remove());
    return root.innerHTML;
  });
  await browser.close();
  if (errors.length) throw new Error('page errors during prerender:\n' + errors.join('\n'));
  fs.writeFileSync(out, page(html));
}
console.log('wrote', path.relative(process.cwd(), out), (fs.statSync(out).size / 1024).toFixed(0) + ' KB');
