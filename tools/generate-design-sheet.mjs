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
<div class="top"><h1>418 Riverside Ave - DA.24.017</h1><div class="mark"><svg width="30" height="22" viewBox="0 0 473 350" fill="none" aria-hidden="true"><path d="M269.887 122.706C259.703 85.667 240.006 55.2465 211.346 32.2839C187.641 13.2934 161.265 2.71418 132.853 0.726105C131.164 0.654247 115.551 0.00389874 111.18 0.00389874H76.3609C73.9856 -9.33776e-05 71.5662 1.87589e-07 69.0911 1.87589e-07C68.2367 1.87589e-07 67.387 0.00389874 66.5326 0.00389874H0.00390625V25.4215V38.2604V50.9833V349.996H72.1017H109.783C121.716 349.996 132.043 349.138 141.357 347.373C192.476 337.68 230.76 309.867 255.136 264.705C278.785 220.895 283.747 173.118 269.887 122.706ZM184.927 223.187C175.944 242.026 162.906 255.742 146.179 263.954C137.496 268.218 128.362 270.418 119.032 270.494C114.665 270.526 110.298 270.538 105.934 270.538L89.4386 270.521C88.9635 270.521 88.4893 270.494 87.9464 270.462L81.8257 270.138V130.422V82.8802V80.6766H93.4268C95.0156 80.6686 96.601 80.6642 98.1898 80.6522C101.04 80.6322 103.891 80.6122 106.741 80.6122C109.5 80.6122 111.999 80.6327 114.326 80.6727C116.797 80.7166 119.076 80.7844 121.244 80.8803C139.049 81.6547 154.945 89.2275 168.49 103.388C182.331 117.859 190.983 136.19 194.204 157.876C197.657 181.066 194.532 203.043 184.927 223.187Z" fill="#8F8F8F"/><path d="M211.346 32.2839C187.641 13.2934 161.265 2.71418 132.853 0.726112C131.164 0.654254 115.551 0.00390625 111.18 0.00390625H98.1898H81.8257H0V45.6218C0 64.9676 15.6807 80.6483 35.0265 80.6483H81.8218V80.6727H93.4229C95.0117 80.6647 96.5971 80.6603 98.1859 80.6483C101.036 80.6283 103.886 80.6083 106.736 80.6083C109.495 80.6083 111.995 80.6289 114.322 80.6688C116.793 80.7127 119.072 80.7806 121.24 80.8764C139.045 81.6508 154.941 89.2236 168.487 103.384C182.327 117.855 190.979 136.187 194.2 157.872C194.576 160.391 194.859 162.89 195.075 165.377H277.152C276.269 151.389 273.851 137.153 269.879 122.702C259.703 85.6671 240.006 55.2425 211.346 32.2839Z" fill="#8F8F8F"/><path d="M35.0304 80.6483C15.6846 80.6483 0.00390625 64.9676 0.00390625 45.6218V350H81.8296V80.6726V80.6483H35.0304Z" fill="url(#sheetLogo0_linear_1026_4057)"/><path d="M195.545 176.156C195.509 192.655 191.973 208.416 184.927 223.187C175.944 242.026 162.906 255.742 146.179 263.954C137.496 268.218 128.362 270.418 119.032 270.494C114.665 270.526 110.298 270.538 105.934 270.538L89.4386 270.521C88.9635 270.521 88.4893 270.494 87.9464 270.462L81.8257 270.138V350H109.779C121.712 350 132.039 349.142 141.353 347.377C192.472 337.684 230.756 309.871 255.132 264.708C270.254 236.7 277.703 207.063 277.507 176.16L195.545 176.156Z" fill="url(#sheetLogo1_linear_1026_4057)"/><path d="M365.656 349.996C372.259 349.996 378.966 349.602 385.598 348.828C418.036 345.025 447.25 332.541 472.502 311.705L418.084 249.67C403.038 261.731 384.477 268.331 365.385 268.331C348.512 268.331 332.197 263.22 318.212 253.556C291.284 234.943 277.655 208.402 277.69 174.679C277.726 142.999 290.45 117.36 315.511 98.476C329.879 87.6514 347.861 81.6864 366.147 81.6864C381.58 81.6864 396.435 85.8511 409.111 93.7312C412.319 95.7262 415.286 98.0128 418.155 100.239L472.483 38.2959C441.202 12.8801 405.906 0 367.523 0C359.24 0 350.674 0.602472 342.068 1.78748C300.345 7.53697 264.986 27.3872 236.973 60.7909C191.615 114.882 182.69 190.922 214.238 254.518C243.457 313.409 301.474 349.996 365.656 349.996Z" fill="url(#sheetLogo2_linear_1026_4057)"/><path d="M365.389 268.33C348.516 268.33 332.201 263.219 318.216 253.556C291.288 234.943 277.659 208.406 277.695 174.679C277.731 142.999 290.454 117.36 315.515 98.4756C329.883 87.651 347.865 81.686 366.151 81.686C381.584 81.686 396.439 85.8507 409.115 93.7308C412.323 95.7258 415.292 98.0124 418.16 100.239C418.16 100.239 382.498 65.7535 312.195 63.1361C249.147 60.7861 195.929 110.836 195.566 173.929C195.406 201.312 201.543 228.922 214.243 254.517C243.457 313.413 301.474 350 365.656 350C372.26 350 378.967 349.605 385.598 348.831C418.036 345.029 447.25 332.544 472.503 311.713L418.084 249.673C403.038 261.731 384.477 268.33 365.389 268.33Z" fill="url(#sheetLogo3_linear_1026_4057)"/><defs><linearGradient id="sheetLogo0_linear_1026_4057" x1="40.9151" y1="257.998" x2="40.9151" y2="2.15012" gradientUnits="userSpaceOnUse"><stop stop-color="#8F8F8F"/><stop offset="1"/></linearGradient><linearGradient id="sheetLogo1_linear_1026_4057" x1="179.078" y1="263.078" x2="30.5309" y2="263.078" gradientUnits="userSpaceOnUse"><stop stop-color="#8F8F8F"/><stop offset="1"/></linearGradient><linearGradient id="sheetLogo2_linear_1026_4057" x1="334.025" y1="0" x2="334.025" y2="349.996" gradientUnits="userSpaceOnUse"><stop stop-color="#01FEFF"/><stop offset="0.495" stop-color="#3A93FC"/></linearGradient><linearGradient id="sheetLogo3_linear_1026_4057" x1="331.206" y1="343.134" x2="361.13" y2="23.9396" gradientUnits="userSpaceOnUse"><stop stop-color="#3A84FC"/><stop offset="0.39" stop-color="#3A84FC"/><stop offset="0.809116" stop-color="#084657"/></linearGradient></defs></svg>SSCAP</div></div>
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
