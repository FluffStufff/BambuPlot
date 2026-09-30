// Deterministic unit tests for BambuPlot's tool-offset (pen XY offset) support.
//
//   Run with:  node tests/tool-offset.test.mjs
//
// The coordinate/conversion/validation functions are extracted straight out of
// bambuplot-v1.1.0.html (string/comment-aware brace matching), so the tests
// exercise the real shipped code — not a re-implementation. Zero dependencies.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HTML_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'bambuplot-v1.1.0.html');
const html = readFileSync(HTML_PATH, 'utf8');

/* ---------- extraction ---------- */

function skipString(src, i){
  const quote = src[i];
  i++;
  while(i < src.length){
    if(src[i] === '\\'){ i += 2; continue; }
    if(src[i] === quote) return i + 1;
    i++;
  }
  throw new Error('unterminated string');
}

function extractFunction(name){
  const sig = `function ${name}(`;
  const start = html.indexOf(sig);
  if(start < 0) throw new Error(`function ${name}() not found`);
  let i = html.indexOf('{', start + sig.length);
  if(i < 0) throw new Error(`body of ${name}() not found`);
  const bodyStart = i;
  let depth = 0;
  while(i < html.length){
    const c = html[i];
    if(c === '{') depth++;
    else if(c === '}'){
      depth--;
      if(depth === 0) return html.slice(start, i + 1);
      i++; continue;
    }
    else if(c === "'" || c === '"' || c === '`'){ i = skipString(html, i); continue; }
    else if(c === '/' && html[i + 1] === '/'){ while(i < html.length && html[i] !== '\n') i++; continue; }
    else if(c === '/' && html[i + 1] === '*'){
      const end = html.indexOf('*/', i + 2);
      i = end < 0 ? html.length : end + 2; continue;
    }
    i++;
  }
  throw new Error(`unbalanced braces in ${name}() (started at ${bodyStart})`);
}

const FUNCS = [
  'toMachine', 'penReachRect', 'readToolOffset', 'validateNozzleReach',
  'makeItemTransformer', 'isFinitePt', 'pvMachineToCanvasMm',
  'generateGCode', 'fmt', 'clamp', 'dist',
].map(extractFunction).join('\n');

const NOZZLE_TOL_DECL = (html.match(/const NOZZLE_TOL = [^;]+;/) || [])[0];
if(!NOZZLE_TOL_DECL) throw new Error('NOZZLE_TOL declaration not found');

const PEN_DECL = (html.match(/const pen = \{[\s\S]*?\};/) || [])[0];
if(!PEN_DECL) throw new Error('pen defaults object not found');

// Builds a fresh, isolated harness around the extracted code.
function makeApi(bedW, bedH, items = []){
  const factory = new Function('env', `
    ${PEN_DECL}
    ${NOZZLE_TOL_DECL}
    let bedW = env.bedW, bedH = env.bedH, items = env.items;
    const printer = {name: 'TestPrinter'};
    ${FUNCS}
    return {
      pen,
      setItems(list){ items = list; },
      generateGCode,
      toMachine, penReachRect, readToolOffset, validateNozzleReach,
      makeItemTransformer, isFinitePt, pvMachineToCanvasMm,
    };
  `);
  return factory({bedW, bedH, items});
}

/* ---------- tiny assertion harness ---------- */

let passed = 0, failed = 0;
function ok(cond, msg){
  if(cond) passed++;
  else { failed++; console.error(`  FAIL: ${msg}`); }
}
function eq(actual, expected, msg){
  ok(Object.is(actual, expected), `${msg} (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`);
}
function near(actual, expected, msg, eps = 1e-9){
  ok(Math.abs(actual - expected) <= eps, `${msg} (got ${actual}, want ${expected})`);
}
function section(name){ console.log(`· ${name}`); }

// Item whose local unit box equals its size, so local points are world points
// offset by the item position — enough to exercise the transform pipeline.
function item(label, x, y, pts, visible = true){
  return {
    label, visible, unitW: 10, unitH: 10, width: 10, height: 10,
    rotation: 0, x, y, paths: [pts],
  };
}
// Single-point stroke whose transformed world position is exactly (x, y).
const onBed = (label, x, y) => item(label, x - 5, y - 5, [{x: 5, y: 5}]);

/* ---------- tests ---------- */

section('profile persistence: defaults and field names');
{
  ok(/toolOffsetX\s*:\s*0/.test(PEN_DECL), 'pen defaults declare toolOffsetX: 0');
  ok(/toolOffsetY\s*:\s*0/.test(PEN_DECL), 'pen defaults declare toolOffsetY: 0');
  const api = makeApi(256, 256);
  eq(api.pen.toolOffsetX, 0, 'default toolOffsetX is 0 (old behavior)');
  eq(api.pen.toolOffsetY, 0, 'default toolOffsetY is 0 (old behavior)');
  // The profile export serializes `pen: {...pen}`, so the new keys are included
  // automatically — assert the export shape actually contains them.
  const exported = JSON.stringify({bambuplotProfile: true, pen: {...api.pen}});
  ok(exported.includes('"toolOffsetX"'), 'exported profile JSON contains toolOffsetX');
  ok(exported.includes('"toolOffsetY"'), 'exported profile JSON contains toolOffsetY');
}

section('profile persistence: readToolOffset (load path)');
{
  const api = makeApi(256, 256);
  eq(api.readToolOffset({}, 'X'), 0, 'old profile without offset fields -> toolOffsetX = 0');
  eq(api.readToolOffset({}, 'Y'), 0, 'old profile without offset fields -> toolOffsetY = 0');
  eq(api.readToolOffset({offsetX: -45, offsetY: 12}, 'X'), -45, 'legacy offsetX name still loads (negative X)');
  eq(api.readToolOffset({offsetX: -45, offsetY: 12}, 'Y'), 12, 'legacy offsetY name still loads');
  eq(api.readToolOffset({toolOffsetX: 30}, 'X'), 30, 'new toolOffsetX name loads');
  eq(api.readToolOffset({toolOffsetX: 30, offsetX: 999}, 'X'), 30, 'new name wins over legacy when both present');
  eq(api.readToolOffset({offsetX: 'abc'}, 'X'), 0, 'non-numeric legacy value falls back to 0');
  eq(api.readToolOffset({toolOffsetX: NaN}, 'X'), 0, 'non-finite current value falls back to 0');
  // Both persistence entry points must use the shared reader.
  const loadUses = (html.match(/readToolOffset\(data\.pen,\s*'[XY]'\)/g) || []).length;
  eq(loadUses, 4, 'loadPrefs + applyLoadedProfile both read X and Y via readToolOffset');
}

section('offset 0,0 preserves current behavior');
{
  const api = makeApi(256, 256, [onBed('Shape: Square', 100, 100)]);
  const m = api.toMachine({x: 10, y: 20});
  eq(m.x, 10, 'nozzle X equals canvas X with zero offset');
  eq(m.y, 236, 'only the pre-existing Y flip applies with zero offset');
  const r = api.penReachRect();
  eq(JSON.stringify(r), JSON.stringify({x0: 0, y0: 0, x1: 256, y1: 256}), 'zero offset -> whole bed reachable');
  eq(api.validateNozzleReach(), null, 'on-bed design validates with zero offset');
  const rt = api.pvMachineToCanvasMm(m);
  near(rt.x, 10, 'preview round-trip X'); near(rt.y, 20, 'preview round-trip Y');
}

section('negative X offset (-45: pen left of nozzle, P2S case)');
{
  const api = makeApi(256, 256);
  api.pen.toolOffsetX = -45;
  const m = api.toMachine({x: 100, y: 50});
  eq(m.x, 145, 'nozzle = penX - toolOffsetX = 100 - (-45) = 145');
  eq(m.y, 206, 'Y conversion unaffected by X offset');
  const r = api.penReachRect();
  eq(JSON.stringify(r), JSON.stringify({x0: 0, y0: 0, x1: 211, y1: 256}), 'reachable X is [0, bedW-45]');
  near(api.toMachine({x: r.x1, y: 100}).x, 256, 'right edge of reachable rect maps to nozzle X max');
  near(api.toMachine({x: r.x0, y: 100}).x, 45, 'left edge of reachable rect maps to nozzle X 45');
  // round trip still exact
  const rt = api.pvMachineToCanvasMm(m);
  near(rt.x, 100, 'preview round-trip X with negative offset');
  near(rt.y, 50, 'preview round-trip Y with negative offset');
  // validation: x=215 needs nozzle 260 > 256
  api.setItems([onBed('Shape: Square', 215, 100)]);
  const v = api.validateNozzleReach();
  ok(v && v.outCount >= 1, 'pen point beyond reachable strip is rejected');
  if(v) near(v.worst, 4, 'reported overage is 4mm (260 vs 256)');
  api.setItems([onBed('Shape: Square', 211, 100)]);
  eq(api.validateNozzleReach(), null, 'pen point exactly at reachable edge passes');
}

section('positive X offset (+30: pen right of nozzle)');
{
  const api = makeApi(256, 256);
  api.pen.toolOffsetX = 30;
  const m = api.toMachine({x: 100, y: 50});
  eq(m.x, 70, 'nozzle = 100 - 30');
  const r = api.penReachRect();
  eq(JSON.stringify(r), JSON.stringify({x0: 30, y0: 0, x1: 256, y1: 256}), 'reachable X is [30, bedW]');
  near(api.toMachine({x: r.x0, y: 100}).x, 0, 'left edge of reachable rect maps to nozzle X 0');
  api.setItems([onBed('Shape: Square', 10, 100)]);
  const v = api.validateNozzleReach();
  ok(v && v.outCount >= 1, 'pen point left of reachable strip is rejected');
  if(v) near(v.worst, 20, 'reported overage is 20mm (nozzle -20)');
  api.setItems([onBed('Shape: Square', 30, 100)]);
  eq(api.validateNozzleReach(), null, 'pen point at reachable edge passes');
}

section('negative Y offset (-20: pen toward the front of the nozzle)');
{
  const api = makeApi(256, 256);
  api.pen.toolOffsetY = -20;
  const m = api.toMachine({x: 100, y: 50});
  eq(m.y, 226, 'nozzle Y = (bedH - penCanvasY) - (-20)');
  const r = api.penReachRect();
  eq(JSON.stringify(r), JSON.stringify({x0: 0, y0: 20, x1: 256, y1: 256}), 'reachable canvas Y is [20, bedH] (back strip unreachable)');
  // canvas y=10 is above the reachable rect -> machine Y 266 > 256
  api.setItems([onBed('Shape: Square', 100, 10)]);
  const v = api.validateNozzleReach();
  ok(v && v.outCount >= 1, 'pen point in the back strip is rejected');
  if(v) near(v.worst, 10, 'reported overage is 10mm');
  api.setItems([onBed('Shape: Square', 100, 50)]);
  eq(api.validateNozzleReach(), null, 'pen point inside reachable Y passes');
}

section('positive Y offset (+20: pen toward the back of the nozzle)');
{
  const api = makeApi(256, 256);
  api.pen.toolOffsetY = 20;
  const m = api.toMachine({x: 100, y: 250});
  eq(m.y, -14, 'nozzle Y = (256 - 250) - 20 = -14 (out of range)');
  const r = api.penReachRect();
  eq(JSON.stringify(r), JSON.stringify({x0: 0, y0: 0, x1: 256, y1: 236}), 'reachable canvas Y is [0, bedH-20] (front strip unreachable)');
  api.setItems([onBed('Shape: Square', 100, 250)]);
  const v = api.validateNozzleReach();
  ok(v && v.outCount >= 1, 'pen point in the front strip is rejected');
  if(v) near(v.worst, 14, 'reported overage is 14mm');
  api.setItems([onBed('Shape: Square', 100, 230)]);
  eq(api.validateNozzleReach(), null, 'pen point inside reachable Y passes');
}

section('combined XY offset (-45, +10)');
{
  const api = makeApi(256, 256);
  api.pen.toolOffsetX = -45;
  api.pen.toolOffsetY = 10;
  const m = api.toMachine({x: 100, y: 100});
  eq(m.x, 145, 'combined: nozzle X = penX + 45');
  eq(m.y, 146, 'combined: nozzle Y = (256 - 100) - 10');
  const r = api.penReachRect();
  eq(JSON.stringify(r), JSON.stringify({x0: 0, y0: 0, x1: 211, y1: 246}), 'combined reachable rect');
  // far corner of the bed is unreachable, near corners are fine
  api.setItems([onBed('Shape: Square', 256, 256)]);
  const v = api.validateNozzleReach();
  ok(v && v.outCount >= 1, 'bed corner beyond combined reachable rect is rejected');
  if(v) near(v.worst, 45, 'overage equals the X offset');
  api.setItems([onBed('Shape: Square', 0, 0)]);
  eq(api.validateNozzleReach(), null, 'opposite bed corner passes with combined offset');
}

section('drawable-area math (property check across offset signs)');
{
  for(const [ox, oy] of [[0, 0], [-45, 0], [30, 0], [0, -20], [0, 20], [-45, 10], [30, -15], [100, 100], [-400, -400]]){
    const api = makeApi(256, 256);
    api.pen.toolOffsetX = ox;
    api.pen.toolOffsetY = oy;
    const r = api.penReachRect();
    // rect never leaves the bed
    ok(r.x0 >= 0 && r.y0 >= 0 && r.x1 <= 256 && r.y1 <= 256,
      `(${ox},${oy}): reachable rect stays inside the bed`);
    if(!(r.x1 > r.x0 && r.y1 > r.y0)){
      ok(ox !== 0 || oy !== 0, `(${ox},${oy}): empty rect only happens with nonzero offset`);
      ok(Math.abs(ox) >= 256 || Math.abs(oy) >= 256, `(${ox},${oy}): empty rect requires offset >= bed size`);
      continue;
    }
    // reachable width/height shrink by exactly the offset magnitude
    near(r.x1 - r.x0, 256 - Math.min(256, Math.abs(ox)), `(${ox},${oy}): reachable width = bedW - |offX|`);
    near(r.y1 - r.y0, 256 - Math.min(256, Math.abs(oy)), `(${ox},${oy}): reachable height = bedH - |offY|`);
    // corners of the reachable rect map inside the nozzle range…
    for(const [px, py] of [[r.x0, r.y0], [r.x1, r.y0], [r.x0, r.y1], [r.x1, r.y1]]){
      const m = api.toMachine({x: px, y: py});
      ok(m.x >= -1e-9 && m.x <= 256 + 1e-9 && m.y >= -1e-9 && m.y <= 256 + 1e-9,
        `(${ox},${oy}): reachable corner (${px},${py}) maps inside nozzle range`);
    }
    // …and points just outside it map outside
    const cy = (r.y0 + r.y1) / 2, cx = (r.x0 + r.x1) / 2;
    if(r.x0 > 0) ok(api.toMachine({x: r.x0 - 0.5, y: cy}).x < -1e-9, `(${ox},${oy}): just left of rect is out of range`);
    if(r.x1 < 256) ok(api.toMachine({x: r.x1 + 0.5, y: cy}).x > 256 + 1e-9, `(${ox},${oy}): just right of rect is out of range`);
    if(r.y0 > 0) ok(api.toMachine({x: cx, y: r.y0 - 0.5}).y > 256 + 1e-9, `(${ox},${oy}): just above rect is out of range`);
    if(r.y1 < 256) ok(api.toMachine({x: cx, y: r.y1 + 0.5}).y < -1e-9, `(${ox},${oy}): just below rect is out of range`);
  }
}

section('out-of-bounds rejection details');
{
  const api = makeApi(256, 256);
  api.pen.toolOffsetX = -45;
  api.setItems([
    item('Hidden: ignore me', 300, 100, [{x: 5, y: 0}, {x: 10, y: 10}], false), // invisible -> not checked
    onBed('Text: Hello world', 250, 100),   // nozzle 295 -> 39mm out
    onBed('Shape: Circle', 240, 100),       // nozzle 285 -> 29mm out
  ]);
  const v = api.validateNozzleReach();
  ok(v, 'mixed design with out-of-bounds items is flagged');
  if(v){
    eq(v.outCount, 2, 'only visible items are counted (2 items flagged)');
    near(v.worst, 39, 'worst overage reported');
    eq(v.firstLabel, 'Text: Hello world', 'first offending item label reported');
  }
  api.setItems([item('Text: broken', 100, 100, [{x: NaN, y: 0}, {x: 10, y: 10}])]);
  eq(api.validateNozzleReach(), null, 'non-finite points are not reach violations (reported separately)');
}

section('NOZZLE_TOL: float noise tolerated, real overshoot rejected');
{
  const api = makeApi(256, 256);
  api.pen.toolOffsetX = -45;
  const tol = parseFloat((html.match(/const NOZZLE_TOL = ([\d.]+);/) || [])[1]);
  ok(Number.isFinite(tol) && tol > 0, 'NOZZLE_TOL is a positive number');
  api.setItems([onBed('Shape: Square', 211 + tol / 2, 100)]); // half a tolerance out
  eq(api.validateNozzleReach(), null, 'overshoot within NOZZLE_TOL passes (float noise)');
  api.setItems([onBed('Shape: Square', 211 + tol * 5, 100)]); // 5x tolerance out
  ok(api.validateNozzleReach(), 'overshoot beyond NOZZLE_TOL is rejected');
}

section('G-code compensation: nozzle = pen - toolOffset for every point');
{
  for(const [ox, oy] of [[0, 0], [-45, 0], [30, 0], [0, -20], [0, 20], [-45, 10]]){
    const api = makeApi(256, 256);
    api.pen.toolOffsetX = ox;
    api.pen.toolOffsetY = oy;
    for(const p of [{x: 0, y: 0}, {x: 256, y: 256}, {x: 123.456, y: 65.432}, {x: 7.5, y: 300}]){
      const m = api.toMachine(p);
      near(m.x, p.x - ox, `(${ox},${oy}): nozzleX = penX - toolOffsetX at ${p.x}`);
      near(m.y, (256 - p.y) - oy, `(${ox},${oy}): nozzleY = (bedH - penY) - toolOffsetY at ${p.y}`);
    }
  }
}

section('defensive generation path: fails rather than dropping unsafe points');
{
  // Normal generation still works (baseline for the checks below).
  const good = makeApi(256, 256, [item('Shape: Square', 0, 0, [{x: 100, y: 100}, {x: 120, y: 100}])]);
  const g1 = good.generateGCode();
  ok(typeof g1.text === 'string' && g1.text.includes('X100.000 Y156.000'),
    'in-range stroke generates the expected nozzle move');

  // A point beyond the nozzle range makes generateGCode() THROW — this
  // simulates validation/generation divergence — instead of returning a file
  // with the point silently removed.
  const bad = makeApi(256, 256, [item('Shape: Square', 0, 0, [{x: 300, y: 100}, {x: 320, y: 100}])]);
  bad.pen.toolOffsetX = -45; // nozzle would sit at X345 — far outside X0-256
  let threw = null, text = null;
  try { text = bad.generateGCode().text; } catch(e){ threw = e; }
  ok(threw instanceof Error, 'generateGCode throws on an out-of-range point');
  ok(threw && /out of range/i.test(threw.message), 'error names the out-of-range condition');
  ok(threw && threw.message.includes('X0-256'), 'error states the allowed nozzle range');
  ok(text === null, 'no G-code is produced when a point is unsafe');

  // The exact scenario dropping would corrupt: a MIDDLE point of a stroke is
  // out of range. Dropping it would connect its neighbours with a straight
  // segment that never existed on the canvas — the defensive path must fail
  // the whole generation instead of emitting that altered toolpath.
  const mid = makeApi(256, 256, [item('Shape: mid OOB', 0, 0, [
    {x: 50, y: 50}, {x: 400, y: 50}, {x: 60, y: 60},
  ])]);
  let threw2 = null, text2 = null;
  try { text2 = mid.generateGCode().text; } catch(e){ threw2 = e; }
  ok(threw2 instanceof Error, 'mid-stroke out-of-range point fails generation (no point removal)');
  ok(text2 === null, 'altered toolpath with the middle point removed is never produced');

  // Overshoot within NOZZLE_TOL still snaps to the boundary and generates.
  const edge = makeApi(256, 256, [item('Shape: edge', 0, 0, [
    {x: 256.005, y: 100}, {x: 256.005, y: 110},
  ])]);
  const g3 = edge.generateGCode();
  ok(g3.text.includes('X256.000'), 'within-tolerance overshoot is snapped to the boundary');
  ok(!g3.text.includes('X256.005'), 'unsnapped out-of-limit coordinate never reaches the file');
}

section('canvas/machine round trip (preview matches G-code)');
{
  for(const [ox, oy] of [[0, 0], [-45, 0], [30, 0], [0, -20], [0, 20], [-45, 10], [12.5, -7.25]]){
    const api = makeApi(256, 256);
    api.pen.toolOffsetX = ox;
    api.pen.toolOffsetY = oy;
    for(const p of [{x: 10, y: 20}, {x: 200.5, y: 100.25}, {x: 0, y: 0}, {x: 256, y: 256}]){
      const rt = api.pvMachineToCanvasMm(api.toMachine(p));
      near(rt.x, p.x, `(${ox},${oy}): round-trip X for ${p.x}`);
      near(rt.y, p.y, `(${ox},${oy}): round-trip Y for ${p.y}`);
    }
  }
}

section('generation wiring (static checks)');
{
  ok(html.includes('const reach = validateNozzleReach();'), 'Generate handler runs reach validation');
  const validateAt = html.indexOf('const reach = validateNozzleReach();');
  const generateAt = html.indexOf('const result = generateGCode();');
  ok(validateAt > -1 && generateAt > validateAt, 'validation runs before G-code generation');
  ok(!html.includes('clampPt'), 'silent clamping helper is gone');
  ok(!/got clamped to the edge/.test(html), 'old "clamped to the edge" message is gone');
  ok(html.includes('Drawing exceeds the drawable area'), 'clear out-of-bounds warning text exists');
  ok(!html.includes('unsafeCount'), 'silent skip counter is gone from generation');
  ok(/throw new Error\(`nozzle coordinate out of range/.test(html), 'defensive generation path throws instead of dropping');
  ok(html.includes('pen: {...pen}'), 'profile export serializes the pen object (incl. tool offsets)');
}

/* ---------- result ---------- */
console.log(`\n${passed} passed, ${failed} failed`);
if(failed > 0) process.exitCode = 1;
