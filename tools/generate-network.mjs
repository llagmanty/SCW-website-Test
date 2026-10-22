#!/usr/bin/env node
// Generates the illustrative SSCAP demo network (demo-network.geojson) and the
// static hero posters (hero-poster.svg light, hero-poster-dark.svg dark). Everything is synthetic: a dendritic
// sanitary network over a generic downtown grid, draining along a river valley
// to a treatment-plant outlet. Re-run after changing parameters:
//   node tools/generate-network.mjs
//
// Hydraulics follow the same Ontario design conventions the page uses at runtime
// (370 L/cap/day, Harmon PF capped at 4.0, 0.26 L/s/ha infiltration, ICI by area,
// Manning n = 0.013). Diameters are sized here so the existing scenario is
// mostly under capacity and the stacked application queue pushes the trunk over.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ---------- parameters ----------
const COLS = 40;            // north–south streets
const DX = 80.5;            // m between local north–south streets
const DY = 75;              // m between manholes along a street
const ROW_TOP = 0;          // y (m, southward) of the northernmost possible manhole
const TRUNK_Y = 1290;       // y of the trunk sewer (river valley)
// Illustrative placement around Vaughan Metropolitan Centre (VMC), Ontario: the trunk
// runs east along the Hwy 407 edge from Hwy 400 towards Keele St, and laterals run north
// across the Hwy 7 corridor. York Region's concession grid is rotated about 16.7° counter-
// clockwise from true north, so "east" here bears about 73.3°.
const ORIGIN = { lon: -79.5385, lat: 43.7845 };   // trunk at x = 0, near Hwy 400 south of VMC
const GRID_BEARING = 73.3;                        // bearing of the trunk (x axis), degrees
const SMA_NAMES = ['SMA-1 Black Creek', 'SMA-2 VMC Centre', 'SMA-3 VMC East', 'SMA-4 Creditstone']; // west to east
const DIAS = [200, 250, 300, 375, 450, 525, 600, 675, 750, 825, 900, 1050, 1200, 1350, 1500];
const DESIGN = { domestic_L_cap_day: 370, infiltration_L_s_ha: 0.26, ici_L_s_ha: 0.35, harmon_cap: 4.0, manning_n: 0.013, density_p_ha: 55 };

function rng(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
const r = rng(20517), r2 = rng(777), r3 = rng(4242);

const qcap = (d, s) => { const D = d / 1000, A = Math.PI * D * D / 4, R = D / 4; return 1000 * (1 / DESIGN.manning_n) * A * Math.pow(R, 2 / 3) * Math.sqrt(s / 100); };
const pf = P => Math.min(DESIGN.harmon_cap, 1 + 14 / (4 + Math.sqrt(P / 1000)));

// ---------- topology ----------
const nodes = [];
const add = (x, y, pop, ici, sma, kind = 'mh') => { nodes.push({ x, y, pop, ici, sma, kind, down: null }); return nodes.length - 1; };
const smaOf = i => Math.min(3, Math.floor(i / (COLS / 4)));
const trunkY = i => Math.round(TRUNK_Y + 34 * Math.sin(i * 0.33));

const outlet = add(COLS * DX + 140, TRUNK_Y + 70, 0, 0, 3, 'outlet');
const T = [];
for (let i = COLS - 1; i >= 0; i--) T[i] = add(i * DX, trunkY(i), 0, 0, smaOf(i), 'trunk');
for (let i = 0; i < COLS; i++) nodes[T[i]].down = i === COLS - 1 ? outlet : T[i + 1];

for (let i = 0; i < COLS; i++) {
  const x = i * DX, sma = smaOf(i);
  const top = ROW_TOP + Math.floor(r() * 4) * DY;
  let prev = null;
  for (let y = top; y < trunkY(i) - DY / 2; y += DY) {
    const core = i >= 13 && i <= 26 && y >= 600;
    const pop = Math.round(110 + r() * 260);
    const n = add(x, y, pop, core ? +(1 + r() * 2.5).toFixed(2) : 0, sma);
    if (prev !== null) nodes[prev].down = n;
    prev = n;
    if (r() < 0.42 && i < COLS - 1) { const st = add(x + DX / 2, y, Math.round(60 + r() * 140), 0, sma); nodes[st].down = n; }
  }
  nodes[prev].down = T[i];
}
nodes.forEach((n, k) => { n.id = n.kind === 'outlet' ? 'OUTFALL-1' : 'SANMH-' + (1000 + k); n.area = n.pop / DESIGN.density_p_ha; });
nodes.forEach(n => { n.ground = +(3 + Math.max(0, TRUNK_Y + 60 - n.y) * 0.014 + 2 * Math.sin(n.x / 700)).toFixed(2); }); // m, low along the river, rising inland
const depth = k => { let d = 0; while (nodes[k].down !== null) { k = nodes[k].down; d++; } return d; };
const order = nodes.map((n, k) => k).sort((a, b) => depth(b) - depth(a));

const pipes = [];
nodes.forEach((n, k) => {
  if (n.down === null) return;
  const b = nodes[n.down], trunk = n.kind === 'trunk';
  const len = Math.round(Math.hypot(n.x - b.x, n.y - b.y));
  pipes.push({ up: k, dn: n.down, id: n.id + '.1', len, slope: trunk ? 0.15 : +(0.4 + r2() * 0.4).toFixed(2), trunk, sma: n.sma });
});

// base dry-weather flow for sizing
const P = nodes.map(n => n.pop), A = nodes.map(n => n.area), I = nodes.map(n => n.ici);
order.forEach(k => { const d = nodes[k].down; if (d !== null) { P[d] += P[k]; A[d] += A[k]; I[d] += I[k]; } });
pipes.forEach((p, k) => {
  const k0 = p.up, Q = pf(Math.max(1, P[k0])) * P[k0] * DESIGN.domestic_L_cap_day / 86400 + DESIGN.infiltration_L_s_ha * A[k0] + DESIGN.ici_L_s_ha * I[k0];
  const tgt = p.trunk ? 0.6 + r2() * 0.22 : 0.26 + r2() * 0.5;
  p.d = DIAS.find(d => qcap(d, p.slope) * tgt >= Q) || 1500;
  if (!p.trunk && p.d > 900) p.d = 900;
  const inspected = r3() > 0.22;
  p.lof = inspected ? 1 + Math.floor(r3() * 6) : null;
  p.cof = inspected ? 1 + Math.floor(r3() * 5) : null;
});

// ---------- projection ----------
// local (x along the trunk, y southward toward it) -> lon/lat on the rotated grid.
// x = 0 is the western end at Hwy 400; the trunk flows east to the outlet.
const M_PER_DEG_LAT = 111320, M_PER_DEG_LON = 111320 * Math.cos(ORIGIN.lat * Math.PI / 180);
const B = GRID_BEARING * Math.PI / 180;
const ll = (x, y) => {
  const X = x;                          // metres along the trunk, eastward
  const Y = TRUNK_Y - y;                // metres north of the trunk
  const e = X * Math.sin(B) - Y * Math.cos(B), n = X * Math.cos(B) + Y * Math.sin(B);
  return [+(ORIGIN.lon + e / M_PER_DEG_LON).toFixed(5), +(ORIGIN.lat + n / M_PER_DEG_LAT).toFixed(5)];
};

// ---------- applications ----------
const APPS = [
  ['DA.24.017', '418 Riverside Ave', 'Proposed – In Progress', 9, 825, 3800, 'Mid-rise residential, ground-floor retail', 'Riverside Commons Inc.'],
  ['DA.23.104', '77 Mill St', 'Proposed – Under Appeal', 4, 450, 2600, 'Stacked townhouses', 'Millrace Homes Ltd.'],
  ['DA.24.009', '1200 King Rd', 'Proposed – In Progress', 15, 675, 3100, 'High-rise residential', 'Kingsview Developments'],
  ['DA.22.061', '15 Orchard Cres', 'Draft Approved – In Engineering', 19, 300, 2200, 'Low-rise residential', 'Orchard Park Group'],
  ['DA.23.088', '640 Station Blvd', 'Approved', 23, 600, 2800, 'Mixed use, office podium', 'Station Square Partners'],
  ['DA.21.032', '9 Ferry Ln', 'Occupied', 27, 900, 1900, 'Residential apartments', 'Ferry Landing Corp.'],
  ['DA.24.022', '300 Ridge Dr', 'Proposed – In Progress', 33, 375, 2400, 'Subdivision, singles and semis', 'East Ridge Estates'],
  ['DA.25.003', '52 Elm Ave', 'Sandbox', 2, 975, 1500, 'Concept, seniors residence', 'Internal what-if'],
  ['DA.24.031', '88 Canal St', 'Draft Approved – In Engineering', 29, 1050, 1600, 'Institutional, school and housing', 'Canal Works Ltd.'],
  ['DA.24.040', '210 Foundry Rd', 'Proposed – In Progress', 36, 750, 2100, 'Employment lands, light industrial', 'Foundry Yards LP']
];
const apps = APPS.map(([file, address0, status, col, y, population, land_use, developer]) => {
  const x = col * DX;
  let best = 0, bd = Infinity, address;
  nodes.forEach((n, k) => { if (n.kind !== 'mh') return; const d = (n.x - x) ** 2 + (n.y - y) ** 2; if (d < bd) { bd = d; best = k; } });
  const n = nodes[best];
  address = `${address0} (fictional)`;
  return { file, address, status, population, land_use, developer, node: nodes[best].id, sma: SMA_NAMES[n.sma], area_ha: +(population / 420).toFixed(1), cx: n.x + 22, cy: n.y - 30 };
});

// ---------- GeoJSON ----------
const F = [];
// SMAs
for (let s = 0; s < 4; s++) {
  const x0 = s * (COLS / 4) * DX - DX / 2 + 6, x1 = (s + 1) * (COLS / 4) * DX - DX / 2 - 6;
  F.push({ type: 'Feature', properties: { kind: 'sma', name: SMA_NAMES[s] }, geometry: { type: 'Polygon', coordinates: [[ll(x0, -80), ll(x1, -80), ll(x1, TRUNK_Y + 380), ll(x0, TRUNK_Y + 380), ll(x0, -80)]] } });
}
// conduits & manholes
pipes.forEach((p, k) => {
  const a = nodes[p.up], b = nodes[p.dn];
  F.push({ type: 'Feature', id: k, properties: { kind: 'conduit', us: p.up, ds: p.dn, d: p.d, len: p.len, s: p.slope, ...(p.lof ? { lof: p.lof, cof: p.cof } : {}), ...(p.trunk ? { trunk: 1 } : {}) }, geometry: { type: 'LineString', coordinates: [ll(a.x, a.y), ll(b.x, b.y)] } });
});
nodes.forEach((n, k) => {
  F.push({ type: 'Feature', properties: { kind: n.kind === 'outlet' ? 'outlet' : 'manhole', n: k, pop: n.pop, ...(n.ici ? { ici: n.ici } : {}), g: n.ground, sma: n.sma }, geometry: { type: 'Point', coordinates: ll(n.x, n.y) } });
});
apps.forEach(a => {
  const w = 34, h = 26;
  F.push({ type: 'Feature', properties: { kind: 'application', file: a.file, address: a.address, sma: a.sma, status: a.status, developer: a.developer, area_ha: a.area_ha, population: a.population, land_use: a.land_use, node: a.node }, geometry: { type: 'Polygon', coordinates: [[ll(a.cx - w, a.cy - h), ll(a.cx + w, a.cy - h), ll(a.cx + w, a.cy + h), ll(a.cx - w, a.cy + h), ll(a.cx - w, a.cy - h)]] } });
});
[
  ['FM-01', 'flow_monitor', T[30]], ['FM-02', 'flow_monitor', T[18]], ['FM-03', 'flow_monitor', T[8]], ['FM-04', 'flow_monitor', null, 24 * DX, 900]
].forEach(([id, type, k, x, y]) => {
  const n = k != null ? nodes[k] : { x, y };
  F.push({ type: 'Feature', properties: { kind: 'monitor', id, type }, geometry: { type: 'Point', coordinates: ll(n.x, n.y + (k != null ? 0 : 0)) } });
});
F.push({ type: 'Feature', properties: { kind: 'monitor', id: 'RG-01', type: 'rain_gauge', source: 'Environment Canada' }, geometry: { type: 'Point', coordinates: ll(11 * DX + 30, 60) } });
F.push({ type: 'Feature', properties: { kind: 'monitor', id: 'RG-02', type: 'rain_gauge', source: 'NOAA' }, geometry: { type: 'Point', coordinates: ll(31 * DX + 30, 140) } });

const fc = {
  type: 'FeatureCollection',
  metadata: {
    name: 'SSCAP illustrative demo network',
    notice: 'Illustrative demo network - not real municipal data.',
    synthetic: true,
    design: DESIGN,
    sma_names: SMA_NAMES,
    subject_default: 'DA.24.017',
    id_scheme: 'manhole id = SANMH-(1000 + n); outlet n is OUTFALL-1; conduit id = upstream manhole id + ".1"; conduit us/ds = manhole n',
    generated_by: 'tools/generate-network.mjs'
  },
  features: F
};
writeFileSync(join(ROOT, 'demo-network.geojson'), JSON.stringify(fc));

// ---------- poster (existing scenario, dry weather, pseudo-3D like the map) ----------
// one poster per page theme; tier colours match index.html
const THEMES = {
  light: { file: 'hero-poster.svg', tier: ['#A3A9B1', '#2A9D8F', '#F2C230', '#E8772E', '#A51D24'], sky: ['#9DBCCE', '#C9D7DF', '#E7E6E2'], water: '#4A7C9C', street: '#A9AEB3', glow: false },
  dark: { file: 'hero-poster-dark.svg', tier: ['#5E6678', '#22A699', '#F7D154', '#F2913F', '#FF4D6D'], sky: ['#1A1F3A', '#0A0D18', '#05070C'], water: '#05070C', street: '#1F2839', glow: true }
};
const tierOf = u => u < 0.5 ? 1 : u < 0.75 ? 2 : u < 1 ? 3 : 4;
const W = 1600, H = 900;
// ground coords: u = eastward across the grid, v = uptown (depth)
const gx = (x, y) => ({ u: y - TRUNK_Y, v: COLS * DX - x });
const all = nodes.map(n => gx(n.x, n.y));
const uMin = Math.min(...all.map(p => p.u)), uMax = Math.max(...all.map(p => p.u));
const vMin = Math.min(...all.map(p => p.v)), vMax = Math.max(...all.map(p => p.v));
const K = 1.4 / (vMax - vMin), S0 = 1.15 * W / (uMax - uMin + 900);
const proj = (x, y) => { const g = gx(x, y), z = 1 + (g.v - vMin) * K; return [+(W * 0.56 + (g.u - (uMin + uMax) / 2) * S0 / z).toFixed(1), +(H * 0.98 - (g.v - vMin) * S0 * 0.62 / z).toFixed(1)]; };
const byTier = [[], [], [], [], []];
pipes.forEach(p => {
  const k0 = p.up, Q = pf(Math.max(1, P[k0])) * P[k0] * 370 / 86400 + 0.26 * A[k0] + 0.35 * I[k0];
  const u = Q / qcap(p.d, p.slope), a = nodes[p.up], b = nodes[p.dn];
  const z = 1 + (gx(a.x, a.y).v - vMin) * K, w = Math.max(1, +((0.8 + p.d / 240) / z).toFixed(2));
  const [x1, y1] = proj(a.x, a.y), [x2, y2] = proj(b.x, b.y);
  byTier[tierOf(u)].push(`<path d="M${x1} ${y1}L${x2} ${y2}" stroke-width="${w}"/>`);
});
const shore = [];
for (let x = -400; x <= COLS * DX + 400; x += 80) shore.push(proj(x, trunkY(x / DX) + 70));
for (const T of Object.values(THEMES)) {
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Illustrative sanitary sewer network in a 3D view of Manhattan's East Side, coloured by used capacity">`;
  svg += `<defs><radialGradient id="sky" cx="0.5" cy="0" r="1"><stop offset="0" stop-color="${T.sky[0]}"/><stop offset="0.45" stop-color="${T.sky[1]}"/><stop offset="1" stop-color="${T.sky[2]}"/></radialGradient>`;
  if (T.glow) svg += `<filter id="g" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
  svg += `</defs><rect width="${W}" height="${H}" fill="url(#sky)"/>`;
  svg += `<path fill="${T.water}" d="M${shore.map(p => p.join(' ')).join('L')}L${W} ${H}L${W} 0Z"/>`;
  svg += `<g stroke="${T.street}" fill="none">`;
  for (let i = 0; i <= COLS; i += 1) { const [a1, b1] = proj(i * DX, -200), [a2, b2] = proj(i * DX, trunkY(i) + 40); svg += `<path d="M${a1} ${b1}L${a2} ${b2}" stroke-width="${i % 4 ? 1.2 : 2.4}"/>`; }
  for (let y = -200; y < TRUNK_Y; y += 230) { const [a1, b1] = proj(-200, y), [a2, b2] = proj(COLS * DX + 200, y); svg += `<path d="M${a1} ${b1}L${a2} ${b2}" stroke-width="2.4"/>`; }
  svg += `</g><g fill="none" stroke-linecap="round"${T.glow ? ' filter="url(#g)"' : ''}>`;
  byTier.forEach((arr, t) => { if (arr.length) svg += `<g stroke="${T.tier[t]}"${t === 4 ? ' stroke-dasharray="6 3"' : ''}>${arr.join('')}</g>`; });
  svg += `</g></svg>`;
  writeFileSync(join(ROOT, T.file), svg);
}

const counts = byTier.map(a => a.length);
console.log(`nodes ${nodes.length}, conduits ${pipes.length}, apps ${apps.length}; existing tiers [grey,<50,50-75,75-100,>=100] = ${counts.join(', ')}`);
console.log('trunk diameters (mm):', pipes.filter(p => p.trunk).map(p => p.d).join(' '));
