/**
 * page-scraper memory + byte-identity tests (F1b).
 *
 * Root cause (same class as browser-scraper v1.1.1 / F1): extractTitle/
 * MetaDescription/OgDescription return `.trim()`'d regex captures of the full page
 * HTML — and when decodeEntities makes no replacement (the common no-entity case)
 * that capture is handed back unchanged — plus text_content passes through a
 * `.substring()` truncation. In V8 these are SlicedString views that pin their
 * entire multi-MB parent (the page body) alive, so every result item retained its
 * whole HTML. At 850+ pages that blows past the 1.5 GB stage-worker heap → OOM. The
 * fix flattens those five retained fields (title, meta_description, og_description,
 * text_content, text_preview) with a byte-exact copy.
 *
 *   Part A — byte-identity: current execute vs the pre-fix baseline (commit cf505b6)
 *            on a mixed multi-page fixture, deep-equal incl. order + full stringify.
 *            Proves the fix is memory-only, not a behavior change. Covers unicode,
 *            emoji, lone-surrogate (&#55296;), entity-decode, block/trunc/dup paths.
 *   Part B — live retained set after forced GC at 850 pages, baseline vs fixed.
 *            Reports both MB numbers; asserts the fix strictly reduces the live set.
 *
 * Run: node modules/step-3-scraping/page-scraper/test-memory.js
 * (self-spawns child probes with --expose-gc for Part B).
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const DIR = __dirname;
const CURRENT = path.join(DIR, 'execute.js');
const BASELINE_SHA = 'cf505b6'; // pre-F1b HEAD (fix not yet applied to page-scraper)
const REL = 'modules/step-3-scraping/page-scraper/execute.js';
const BASELINE_TMP = path.join(DIR, '._baseline_execute.tmp.js'); // in-tree so require() resolves deps; gitignored

// --- self-probe mode: `node --expose-gc test-memory.js --probe <execPath> <N> <bodyKB>` ---
// Renders N synthetic pages through <execPath>, forces GC, prints live heap JSON.
if (process.argv[2] === '--probe') {
  if (!global.gc) { console.error('probe needs --expose-gc'); process.exit(3); }
  const execPath = process.argv[3];
  const N = parseInt(process.argv[4], 10);
  const bodyKB = parseInt(process.argv[5], 10);
  runProbe(execPath, N, bodyKB).then((r) => {
    console.log(JSON.stringify(r));
    process.exit(0);
  }).catch((e) => { console.error('probe-error', e.message); process.exit(3); });
  return;
}

// A realistic page: substantial HTML (big <script> chrome that Readability/regex
// strip) wrapping a modest real article. text_content is a small real output for
// BOTH baseline and fixed; the only thing baseline pins extra is the whole HTML
// body (via the title/og SlicedString), which is exactly the leak.
function bigBody(idx, kb) {
  const noise = `console.log(${idx});/* padding ${'x'.repeat(64)} */\n`.repeat(Math.ceil((kb * 1024) / 96));
  const para = 'Studio builds premium slot titles for regulated markets worldwide with certified random number generation high return to player bonus features free spins and progressive jackpots across a broad portfolio serving operators in Malta Sweden and the United Kingdom. ';
  return `<!DOCTYPE html><html><head><title>Studio Page ${idx}</title>
<meta property="og:description" content="Short summary."></head>
<body><nav>Home Games About</nav>
<script>${noise}</script>
<main><article><h1>Studio ${idx}</h1><p>${para.repeat(3)} idx ${idx}</p></article></main>
<footer>Copyright 2026</footer></body></html>`;
}

async function runProbe(execPath, N, bodyKB) {
  const execute = require(execPath);
  const items = [];
  for (let i = 0; i < N; i++) items.push({ url: `https://studio.example/game-${i}`, status: 'unique' });
  const input = { entities: [{ name: 'Studio', items }] };
  const options = { concurrency: 8, max_content_length: 50000, request_timeout: 20000, delay_between_requests: 0 };
  const tools = {
    logger: { info() {}, warn() {}, error() {} },
    progress: { update() {} },
    http: {
      async get(url) {
        const i = parseInt(url.split('-').pop(), 10);
        return { status: 200, headers: { 'content-type': 'text/html' }, body: bigBody(i, bodyKB) };
      },
    },
    _partialItems: [],
  };
  const out = await execute(input, options, tools);
  await new Promise((r) => setTimeout(r, 50));
  global.gc(); global.gc(); global.gc();
  const liveMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
  // keep `out` reachable through the measurement so its retained fields count
  const itemCount = out.results.reduce((s, e) => s + e.items.length, 0);
  return { liveMB, itemCount, bodyKB };
}

// ---------------------------------------------------------------------------
// Part A — byte-identity vs the pre-fix baseline
// ---------------------------------------------------------------------------

function bodyWords(seed, n) {
  const bank = ('studio builds premium slot titles for regulated markets worldwide with certified random '
    + 'number generation high return to player bonus features free spins progressive jackpots across a broad portfolio').split(' ');
  let s = `seed${seed}`;
  for (let i = 0; i < n; i++) s += ' ' + bank[i % bank.length];
  return s;
}
function doc(title, seed, n) {
  return `<!DOCTYPE html><html><head><title>${title}</title></head>`
    + `<body><main><article><h1>${title}</h1><p>${bodyWords(seed, n)}</p></article></main></body></html>`;
}
const DUP_BODY = `<!DOCTYPE html><html><head><title>Dup</title></head>`
  + `<body><main><article><p>${'identical boilerplate footer content here '.repeat(20)}</p></article></main></body></html>`;

const PAGES = {
  // plain success — the LEAK path (no entity in title → baseline returns a raw slice)
  'https://s.example/plain': { status: 200, ct: 'text/html', body: doc('Studio Portfolio', 'plain', 80) },
  // unicode / emoji / entity-decode in title + meta_description
  'https://s.example/uni': {
    status: 200, ct: 'text/html; charset=utf-8', body:
      `<!DOCTYPE html><html><head><title>Café &amp; Grill — 🎰 Studios</title>`
      + `<meta name="description" content="Cafés &amp; résumés — naïve 🎰">`
      + `<meta property="og:description" content="short"></head>`
      + `<body><main><article><h1>Naïve</h1><p>Café résumé 🎰 naïve coöperate — ${bodyWords('uni', 70)}.</p></article></main></body></html>`,
  },
  // lone-surrogate via &#55296; entity-decode path in the title
  'https://s.example/surr': { status: 200, ct: 'text/html', body: doc('Raw&#55296;End', 'surr', 80) },
  // < 50 words → low_content
  'https://s.example/low': { status: 200, ct: 'text/html', body: doc('Low', 'low', 20) },
  // truncated: body shorter than a long og:description → low_content
  'https://s.example/trunc': {
    status: 200, ct: 'text/html', body:
      `<!DOCTYPE html><html><head><title>T</title><meta property="og:description" content="${'a'.repeat(400)}"></head>`
      + `<body><main><article><p>tiny body ${'word '.repeat(60)}</p></article></main></body></html>`,
  },
  // Cloudflare block page (3 markers in extracted text) → error
  'https://s.example/block': {
    status: 200, ct: 'text/html', body:
      `<!DOCTYPE html><html><head><title>Just a moment</title></head>`
      + `<body><main><article><p>Why have I been blocked. This website is using a security service to protect itself. `
      + `Cloudflare Ray ID 12345. ${'filler word '.repeat(40)}</p></article></main></body></html>`,
  },
  // non-HTML → skipped
  'https://s.example/doc.pdf': { status: 200, ct: 'application/pdf', body: '%PDF-1.4 binary' },
  // HTTP 404 → error
  'https://s.example/err': { status: 404, ct: 'text/html', body: 'not found' },
  // 3 identical pages, same host → boilerplate demotion to low_content
  'https://dup.example/1': { status: 200, ct: 'text/html', body: DUP_BODY },
  'https://dup.example/2': { status: 200, ct: 'text/html', body: DUP_BODY },
  'https://dup.example/3': { status: 200, ct: 'text/html', body: DUP_BODY },
};

function makeTools() {
  return {
    logger: { info() {}, warn() {}, error() {} },
    progress: { update() {} },
    http: {
      async get(url) {
        const p = PAGES[url];
        if (!p) return { status: 500, headers: { 'content-type': 'text/html' }, body: '<html></html>' };
        return { status: p.status, headers: { 'content-type': p.ct }, body: p.body };
      },
    },
    _partialItems: [],
  };
}

function fixtureInput() {
  const items = Object.keys(PAGES).map((url) => ({ url, status: 'unique' }));
  return { entities: [{ name: 'Studio', items }] };
}

async function partA() {
  console.log('Part A — byte-identity vs baseline', BASELINE_SHA);
  const baseline = require(BASELINE_TMP);
  const current = require(CURRENT);
  const opts = { concurrency: 3, max_content_length: 50000, request_timeout: 10000, delay_between_requests: 0 };

  const outBase = await baseline(fixtureInput(), opts, makeTools());
  const outCurr = await current(fixtureInput(), opts, makeTools());

  const a = outBase.results[0].items;
  const b = outCurr.results[0].items;
  assert.strictEqual(a.length, b.length, 'item count differs');
  for (let i = 0; i < a.length; i++) {
    assert.deepStrictEqual(b[i], a[i], `item ${i} (${a[i].url}) differs`);
  }
  assert.strictEqual(JSON.stringify(outCurr), JSON.stringify(outBase), 'full output not byte-identical');

  // explicit code-unit identity on the adversarial fixtures
  const pick = (arr, url) => arr.find((x) => x.url === url);
  assert.strictEqual(pick(b, 'https://s.example/uni').title, pick(a, 'https://s.example/uni').title, 'unicode title diverged');
  assert.strictEqual(pick(b, 'https://s.example/uni').text_content, pick(a, 'https://s.example/uni').text_content, 'unicode text diverged');
  assert.strictEqual(pick(b, 'https://s.example/surr').title, pick(a, 'https://s.example/surr').title, 'lone-surrogate title diverged');
  assert.strictEqual(pick(b, 'https://s.example/surr').title, 'Raw\uD800End', 'surrogate decode wrong'); // sanity: real lone surrogate present
  console.log(`  ✓ ${a.length} items byte-identical (incl. order, unicode/emoji/surrogate, block/trunc/dup/skip/error paths)`);
}

// Standalone check that flat() is byte-exact for adversarial strings.
function flatFidelity() {
  const flat = (s) => (typeof s === 'string' && s.length > 0 ? s.split('').join('') : s);
  for (const c of ['\uD800', '😀\uDC00', 'café & résumé', '', 'x'.repeat(50000), '&#55296;raw', '🎰']) {
    assert.strictEqual(flat(c), c, `flat() not byte-exact for ${JSON.stringify(c)}`);
  }
  assert.strictEqual(flat(null), null);
  assert.strictEqual(flat(undefined), undefined);
  console.log('  ✓ flat() byte-exact for lone surrogates / emoji / entities / empty / 50KB');
}

// ---------------------------------------------------------------------------
// Part B — live retained set after forced GC at 850 pages
// ---------------------------------------------------------------------------

function partB() {
  const N = 850, KB = 300; // realistic ~300KB pages, modest article text
  console.log(`Part B — live retained set after forced GC (${N} pages, ~${KB}KB each)`);
  const run = (execPath) => spawnSync(
    process.execPath,
    ['--expose-gc', '--max-old-space-size=4096', __filename, '--probe', execPath, String(N), String(KB)],
    { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
  );

  const base = run(BASELINE_TMP);
  assert.strictEqual(base.status, 0, `baseline probe failed: ${base.stderr}`);
  const baseR = JSON.parse(base.stdout.trim().split('\n').pop());

  const fix = run(CURRENT);
  assert.strictEqual(fix.status, 0, `fixed probe failed: ${fix.stderr}`);
  const fixR = JSON.parse(fix.stdout.trim().split('\n').pop());

  assert.strictEqual(baseR.itemCount, N, 'baseline item count');
  assert.strictEqual(fixR.itemCount, N, 'fixed item count');
  const delta = baseR.liveMB - fixR.liveMB;
  console.log(`  baseline live set: ${baseR.liveMB} MB`);
  console.log(`  fixed    live set: ${fixR.liveMB} MB`);
  console.log(`  reclaimed: ${delta} MB (${(delta / N * 1024).toFixed(0)} KB/item ≈ pinned page body)`);
  assert.ok(fixR.liveMB < baseR.liveMB, `fix did not reduce live set (${fixR.liveMB} !< ${baseR.liveMB})`);
  const material = delta > 50;
  console.log(`  ${material ? '✓ MATERIAL' : 'ⓘ immaterial'} — leak ${material ? 'confirmed' : 'small at this body size'}; baseline pins full HTML, fixed frees it`);
}

(async () => {
  const src = execSync(`git -C ${DIR} show ${BASELINE_SHA}:${REL}`, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  fs.writeFileSync(BASELINE_TMP, src);
  try {
    await partA();
    flatFidelity();
    partB();
    console.log('\nALL PASS');
  } finally {
    fs.rmSync(BASELINE_TMP, { force: true });
  }
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
