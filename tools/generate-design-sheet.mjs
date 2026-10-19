#!/usr/bin/env node
// Builds the illustrative "Automated Sanitary Design Sheet" sample used on the page:
//   sample-design-sheet.pdf          (tabloid landscape, one page)
//   design-sheet-preview.png         (page preview for the file card; converted to WebP by the caller)
//
// All data is fictional. Layout and formulas follow a municipal sanitary design sheet:
//   avg domestic flow 370 L/cap/day, infiltration 0.26 L/s/ha,
//   Harmon K = 1 + 14 / (4 + sqrt(P / 1000)) bounded to [2.00, 4.00],
//   ICI flow converted to an equivalent population, Manning n = 0.013.
// Run:  node tools/generate-design-sheet.mjs   (needs Playwright + Chromium)

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { chromium } = require(join(execSync('npm root -g').toString().trim(), 'playwright'));

const Q_DOM = 370, INF = 0.26, N = 0.013, PF_MAX = 4, PF_MIN = 2;
const harmon = P => Math.min(PF_MAX, Math.max(PF_MIN, 1 + 14 / (4 + Math.sqrt(P / 1000))));
const qcap = (d, s) => { const D = d / 1000, A = Math.PI * D * D / 4, R = D / 4; return 1000 * (1 / N) * A * Math.pow(R, 2 / 3) * Math.sqrt(s / 100); };
let seed = 24017; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;

// a fictional chain of 22 pipe segments from the site to the trunk
const rows = [];
let accRes = 0, accPop = 0, accOther = 0, accEq = 0, node = 4101;
for (let i = 0; i < 22; i++) {
  const from = 'MH-' + node, to = 'MH-' + (node + 1); node++;
  const site = i === 2 || i === 3;                       // the subject development enters here
  const resA = site ? +(1.6 + rnd() * 1.2).toFixed(2) : rnd() < 0.55 ? +(0.2 + rnd() * 1.4).toFixed(2) : 0;
  const ppu = resA ? +(2.4 + rnd() * 0.8).toFixed(2) : 0;
  const units = resA ? Math.round(resA * (site ? 140 : 32 + rnd() * 30)) : 0;
  const pop = Math.round(units * ppu);
  accRes += resA; accPop += pop;
  const othA = i === 5 || i === 11 || i === 16 ? +(1.5 + rnd() * 3).toFixed(2) : 0;
  const rate = othA ? 0.21 : 0;                          // ICI flow rate, L/s/ha
  const eq = othA ? Math.round(othA * rate * 86400 / Q_DOM) : 0;
  accOther += othA; accEq += eq;
  const infl = INF * (accRes + accOther);
  const totPop = accPop + accEq;
  const avgDom = pop * Q_DOM / 86400, accAvg = accPop * Q_DOM / 86400;
  const pf = harmon(Math.max(totPop, 1));
  const peaked = pf * accAvg, ici = accEq * Q_DOM / 86400, total = infl + peaked + ici;
  const len = +(40 + rnd() * 90).toFixed(2);
  const slope = +(i < 8 ? 0.6 + rnd() * 0.6 : 0.3 + rnd() * 0.4).toFixed(3);
  const dias = [250, 300, 375, 450, 525];
  let d = dias.find(dd => qcap(dd, slope) * (0.45 + rnd() * 0.4) >= total) || 525;
  const cap = qcap(d, slope), vel = cap / 1000 / (Math.PI * (d / 1000) ** 2 / 4);
  rows.push({ id: from + '.1', from, to, resA, accRes, units, ppu, pha: resA ? pop / resA : 0, pop, accPop, othA, accOther, pdens: othA ? eq / othA : 0, rate, accEq, infl, totPop, avgDom, accAvg, pf, peaked, ici, total, len, d, slope, cap, vel, used: total / cap * 100 });
}

const f = (v, n) => Number(v).toLocaleString('en-CA', { minimumFractionDigits: n, maximumFractionDigits: n, useGrouping: false });
const head = `
<tr class="g"><th colspan="3">Location</th><th colspan="7">Residential</th><th colspan="5">Other</th><th colspan="8">Flow Calculations</th><th colspan="6">Pipe Data</th></tr>
<tr class="h"><th rowspan="2">Pipe Segment ID</th><th colspan="2">Node ID</th>
<th rowspan="2">Area</th><th rowspan="2">Accum.<br>Area</th><th rowspan="2">Units</th><th colspan="2">Density</th><th rowspan="2">Population</th><th rowspan="2">Accum.<br>Population</th>
<th rowspan="2">Area</th><th rowspan="2">Accum.<br>Area</th><th rowspan="2">Population<br>Density</th><th rowspan="2">Flow<br>Rate</th><th rowspan="2">Accum.<br>Equiv.<br>Population</th>
<th rowspan="2">Infiltration</th><th rowspan="2">Total Accum.<br>Population</th><th rowspan="2">Avg.<br>Domestic<br>Flow</th><th rowspan="2">Accum. Avg.<br>Domestic Flow</th><th rowspan="2">Peaking<br>Factor</th><th rowspan="2">Peaked<br>Residential<br>Flow</th><th rowspan="2">ICI<br>Flow</th><th rowspan="2">Total<br>Flow</th>
<th rowspan="2">Length</th><th rowspan="2">Pipe<br>Diameter</th><th rowspan="2">Slope</th><th rowspan="2">Full Flow<br>Capacity</th><th rowspan="2">Full Flow<br>Velocity</th><th rowspan="2">Used<br>Capacity</th></tr>
<tr class="h"><th>From</th><th>To</th><th>Per Unit</th><th>Per ha</th></tr>
<tr class="u"><td></td><td></td><td></td><td>(ha)</td><td>(ha)</td><td>(#)</td><td>(p/unit)</td><td>(p/ha)</td><td>(#)</td><td>(#)</td><td>(ha)</td><td>(ha)</td><td>(p/ha)</td><td>(L/s/ha)</td><td>(#)</td><td>(L/s)</td><td>(#)</td><td>(L/s)</td><td>(L/s)</td><td></td><td>(L/s)</td><td>(L/s)</td><td>(L/s)</td><td>(m)</td><td>(mm)</td><td>(%)</td><td>(L/s)</td><td>(m/s)</td><td>(%)</td></tr>`;
const body = rows.map(r => `<tr${r.used >= 100 ? ' class="over"' : ''}><td class="l">${r.id}</td><td class="l">${r.from}</td><td class="l">${r.to}</td>
<td>${f(r.resA, 2)}</td><td>${f(r.accRes, 2)}</td><td>${r.units}</td><td>${f(r.ppu, 2)}</td><td>${f(r.pha, 2)}</td><td>${r.pop}</td><td>${r.accPop}</td>
<td>${f(r.othA, 2)}</td><td>${f(r.accOther, 2)}</td><td>${f(r.pdens, 2)}</td><td>${f(r.rate, 2)}</td><td>${r.accEq}</td>
<td>${f(r.infl, 3)}</td><td>${r.totPop}</td><td>${f(r.avgDom, 3)}</td><td>${f(r.accAvg, 3)}</td><td>${f(r.pf, 2)}</td><td>${f(r.peaked, 3)}</td><td>${f(r.ici, 3)}</td><td>${f(r.total, 3)}</td>
<td>${f(r.len, 2)}</td><td>${r.d}</td><td>${f(r.slope, 3)}</td><td>${f(r.cap, 2)}</td><td>${f(r.vel, 2)}</td><td>${f(r.used, 2)}</td></tr>`).join('');

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Sample Sanitary Design Sheet — DA.24.017</title><style>
@page{size:17in 11in;margin:0.45in}
*{box-sizing:border-box}body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#222;font-size:9px}
.top{display:flex;align-items:center;border-bottom:1.5px solid #555;padding-bottom:10px;margin-bottom:22px}
.top h1{flex:1;margin:0;font-size:22px}
.mark{display:flex;align-items:center;gap:8px;font-weight:700;font-size:17px;color:#0B57D0}
.meta{display:flex;align-items:flex-start;margin-bottom:22px}
.meta .who{flex:1}.meta h2{margin:0 0 6px;font-size:18px}.meta p{margin:0 0 4px;font-size:12px}
.params{display:grid;grid-template-columns:auto auto;column-gap:10px;row-gap:3px;font-size:11px;text-align:right;margin-right:28px}
.params b{text-align:left}.params small{font-size:8px}
.k{font-size:11px;text-align:center}.k i{display:block;font-size:9px;margin-top:4px}
table{width:100%;border-collapse:collapse}
th,td{border:1px solid #c9c9c9;padding:3px 4px;text-align:center;white-space:nowrap}
tr.g th{background:#b9b9b9;font-size:10px;padding:6px}
tr.h th{background:#cfcfcf;font-size:9px;line-height:1.15}
tr.u td{background:#cfcfcf;font-size:7px;color:#555;padding:1px}
tbody tr:nth-child(odd) td{background:#ececec}
td.l{text-align:left}
tr.over td{background:#f6d3d3!important}
.foot{margin-top:14px;font-size:9px;color:#666;display:flex;justify-content:space-between}
</style></head><body>
<div class="top"><h1>418 Riverside Ave - DA.24.017</h1><div class="mark"><svg width="22" height="22" viewBox="0 0 28 28"><circle cx="14" cy="14" r="12.5" fill="none" stroke="#0B57D0" stroke-width="2"/><path d="M6 17 11 12 15 15 22 8" fill="none" stroke="#0B57D0" stroke-width="2.2" stroke-linecap="round"/></svg>SSCAP</div></div>
<div class="meta"><div class="who"><h2>Sanitary Sewer Design</h2><p>Riverside Commons Inc. (fictional)</p><p>Demo Municipality</p></div>
<div class="params"><span>Avg. Domestic Flow <small>(L/cap/day)</small></span><b>370</b><span>Infiltration Rate <small>(L/s/ha)</small></span><b>0.26</b><span>Max. Harmon Peaking Factor</span><b>4.00</b><span>Min. Harmon Peaking Factor</span><b>2.00</b></div>
<div class="k">Harmon Peaking Factor:<br><br>K = 1 + 14 / (4 + √P)<i>Where P = Population in 1000's</i></div></div>
<table><thead>${head}</thead><tbody>${body}</tbody></table>
<div class="foot"><span>Illustrative sample generated for the SSCAP demo. Fictional network and development; not real municipal data.</span><span>Scenario: Subject + Active + Approved · Dry weather · Page 1 of 1</span></div>
</body></html>`;

mkdirSync(join(ROOT, 'tools', '.build'), { recursive: true });
const htmlPath = join(ROOT, 'tools', '.build', 'design-sheet.html');
writeFileSync(htmlPath, html);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1632, height: 1056 }, deviceScaleFactor: 2 });
await p.goto('file://' + htmlPath);
await p.pdf({ path: join(ROOT, 'sample-design-sheet.pdf'), width: '17in', height: '11in', printBackground: true, margin: { top: '0.45in', bottom: '0.45in', left: '0.45in', right: '0.45in' } });
await p.setViewportSize({ width: 1632, height: 1056 });
await p.addStyleTag({ content: 'body{padding:43px}' });
await p.screenshot({ path: join(ROOT, 'tools', '.build', 'design-sheet-preview.png') });
await b.close();
console.log(`rows ${rows.length}; max used ${Math.max(...rows.map(r => r.used)).toFixed(1)}%; last total ${rows.at(-1).total.toFixed(3)} L/s`);
