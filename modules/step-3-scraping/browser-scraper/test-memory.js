/**
 * browser-scraper memory + byte-identity tests (B-F1).
 *
 * Root cause fixed: extractTitle/MetaDescription/OgDescription return `.trim()`'d
 * regex captures of the full page HTML, and text_content is a `.substring()` of the
 * full extracted text. In V8 these are SlicedString views that pin their entire
 * multi-MB parent alive, so every result item retained its whole rendered body.
 * At 852 pages (Gate-1 Play'n GO) that blew past the 1.5 GB stage-worker heap → OOM
 * crash-loop → entity terminal-failed at step 3. The fix flattens those fields.
 *
 *   Part A — byte-identity: current execute vs the pre-fix baseline (commit 0180696)
 *            on a mixed multi-page fixture, deep-equal incl. order. Proves the fix
 *            is memory-only, not a behavior change.
 *   Part B — peak memory: the pre-fix baseline OOMs under --max-old-space-size=1536
 *            at 852 pages; the fixed code survives with peak far under the cap.
 *
 * Run: node modules/step-3-scraping/browser-scraper/test-memory.js
 * (self-spawns child probes under the 1536 MB cap for Part B).
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const DIR = __dirname;
const CURRENT = path.join(DIR, 'execute.js');
const BASELINE_SHA = '0180696'; // pre-F1 HEAD, verified at authoring time
const REL = 'modules/step-3-scraping/browser-scraper/execute.js';
const BASELINE_TMP = path.join(DIR, '._baseline_execute.tmp.js'); // in-tree so require() resolves deps

// --- self-probe mode: `node test-memory.js --probe <execPath> <N> <bodyKB>` ---
// Renders N synthetic pages through <execPath>, prints peak heap JSON, exits 0.
// OOMs (nonzero exit) if the code pins page bodies. Used as a child under the cap.
if (process.argv[2] === '--probe') {
  const execPath = process.argv[3];
  const N = parseInt(process.argv[4], 10);
  const bodyKB = parseInt(process.argv[5], 10);
  runProbe(execPath, N, bodyKB).then((peak) => {
    console.log(JSON.stringify({ peakHeapMB: peak }));
    process.exit(0);
  }).catch((e) => { console.error('probe-error', e.message); process.exit(3); });
  return;
}

// Content-heavy rendered page (~kb of extractable article text) — reproduces the
// real leak: the extracted text is large, so `text_content = textContent.substring()`
// pins the full extracted string, and each result item keeps its own copy.
function bigBody(idx, kb) {
  const para = `Studio ${idx} develops premium slot titles for regulated markets worldwide including Malta United Kingdom Sweden and Denmark, with certified random number generation, high return-to-player percentages, bonus features, free spins and progressive jackpots across a broad portfolio. `;
  const target = kb * 1024;
  let paras = '';
  let i = 0;
  while (paras.length < target) {
    paras += `<p>${para} paragraph ${i++} lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>\n`;
  }
  return `<!DOCTYPE html><html><head><title>Studio Page ${idx}</title>
<meta property="og:description" content="Short summary.">
</head><body><nav>Home Games About</nav>
<main><article><h1>Studio ${idx}</h1>${paras}</article></main>
<footer>Copyright 2026</footer></body></html>`;
}

async function runProbe(execPath, N, bodyKB) {
  const execute = require(execPath);
  const items = [];
  for (let i = 0; i < N; i++) items.push({ url: `https://studio.example/game-${i}`, status: 'unique' });
  const input = { entity: { name: 'Studio', items }, entities: null };
  input.entities = [input.entity];
  const options = { concurrency: 4, max_content_length: 50000, request_timeout: 20000, min_word_threshold: 50 };
  let peak = 0;
  const s = setInterval(() => { const h = process.memoryUsage().heapUsed; if (h > peak) peak = h; }, 20);
  const tools = {
    logger: { info() {}, warn() {}, error() {} },
    progress: { update() {} },
    browser: { async fetch(url) { const i = parseInt(url.split('-').pop(), 10); return { status: 200, body: bigBody(i, bodyKB), url }; } },
    http: { async get() { return { status: 404, body: 'not archived' }; } },
    _partialItems: [],
  };
  await execute(input, options, tools);
  clearInterval(s);
  const h = process.memoryUsage().heapUsed; if (h > peak) peak = h;
  return Math.round(peak / 1024 / 1024);
}

// ---------------------------------------------------------------------------
// Part A — byte-identity vs the pre-fix baseline
// ---------------------------------------------------------------------------

// Deterministic-by-URL page bodies covering every extraction/branch path.
const PAGES = {
  // JS-rendered SPA, clean content (readability tier) + unicode/emoji/entities
  'https://s.example/spa': `<html><head><title>Café &amp; Grill — 🎰 Studios</title>
<meta property="og:description" content="short">
</head><body><main><article><h1>Naïve</h1>
<p>Café résumé 🎰 naïve coöperate — this is a full article with well over fifty words so that the readability extractor treats it as real content and marks the page a success rather than falling through to the lower tiers of the extraction chain which we also want to exercise here today.</p></article></main></body></html>`,
  // Elementor CMS page (cms_dom tier)
  'https://s.example/cms': `<html><head><title>CMS Page</title></head><body>
<div class="elementor-widget-text-editor"><div class="elementor-widget-container">
<p>Content spread across an Elementor widget container with more than fifty words present so that the CMS-aware DOM extraction tier is the one that wins here and produces a success status for this particular page under test in the byte-identity comparison run.</p>
</div></div></body></html>`,
  // Cloudflare block page (2 markers) → wayback → wayback empty → error
  'https://s.example/blocked': `<html><head><title>Just a moment</title></head><body>
<p>Why have i been blocked. This website is using a security service to protect itself. Cloudflare Ray ID 123.</p></body></html>`,
  // truncated: body text shorter than a long og:description → wayback path
  'https://s.example/trunc': `<html><head><title>T</title>
<meta property="og:description" content="${'a'.repeat(400)}">
</head><body><main><article><p>short body ${'word '.repeat(60)}</p></article></main></body></html>`,
};

// 3 identical-content pages to trigger post-scrape duplicate demotion
for (const u of ['https://s.example/dup1', 'https://s.example/dup2', 'https://s.example/dup3']) {
  PAGES[u] = `<html><head><title>Dup</title></head><body><main><article><p>${'identical duplicate boilerplate content '.repeat(20)}</p></article></main></body></html>`;
}

function makeTools() {
  return {
    logger: { info() {}, warn() {}, error() {} },
    progress: { update() {} },
    browser: {
      async fetch(url) {
        const body = PAGES[url];
        if (!body) return { status: 500, body: '<html></html>', url };
        return { status: 200, body, url };
      },
    },
    http: { async get() { return { status: 404, body: 'The Wayback Machine has not archived that URL' }; } },
    _partialItems: [],
  };
}

function fixtureInput() {
  const items = [
    // pass-through: already good
    { url: 'https://s.example/ok', status: 'success', word_count: 500, text_content: 'already scraped content '.repeat(30), title: 'OK' },
    // pass-through: skipped (PDF)
    { url: 'https://s.example/doc.pdf', status: 'skipped', word_count: 0 },
    // needs-scrape variants
    { url: 'https://s.example/spa', status: 'unique' },
    { url: 'https://s.example/cms', status: 'unique' },
    { url: 'https://s.example/blocked', status: 'error' },
    { url: 'https://s.example/trunc', status: 'low_content', word_count: 10 },
    { url: 'https://s.example/dup1', status: 'unique' },
    { url: 'https://s.example/dup2', status: 'unique' },
    { url: 'https://s.example/dup3', status: 'unique' },
    { url: 'https://s.example/missing', status: 'unique' }, // 500 → wayback → error
  ];
  const input = { entity: { name: 'Studio', items }, entities: null };
  input.entities = [input.entity];
  return input;
}

async function partA() {
  console.log('Part A — byte-identity vs baseline', BASELINE_SHA);
  // Materialize the pre-fix baseline in-tree so its require('@mozilla/readability') resolves.
  const src = execSync(`git -C ${DIR} show ${BASELINE_SHA}:${REL}`, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  fs.writeFileSync(BASELINE_TMP, src);
  try {
    const baseline = require(BASELINE_TMP);
    const current = require(CURRENT);
    const opts = { concurrency: 3, max_content_length: 50000, request_timeout: 20000, min_word_threshold: 50 };

    const outBase = await baseline(fixtureInput(), opts, makeTools());
    const outCurr = await current(fixtureInput(), opts, makeTools());

    const a = outBase.results[0].items;
    const b = outCurr.results[0].items;
    assert.strictEqual(a.length, b.length, 'item count differs');
    // item-for-item deep equality incl. order
    for (let i = 0; i < a.length; i++) {
      assert.deepStrictEqual(b[i], a[i], `item ${i} (${a[i].url}) differs`);
    }
    // whole-output stringify identity (catches summary/meta drift too)
    assert.strictEqual(JSON.stringify(outCurr), JSON.stringify(outBase), 'full output not byte-identical');

    // explicit code-unit identity on the unicode/emoji/entities fixture
    const spaB = a.find(x => x.url === 'https://s.example/spa');
    const spaC = b.find(x => x.url === 'https://s.example/spa');
    assert.strictEqual(spaC.title, spaB.title, 'unicode title diverged');
    assert.strictEqual(spaC.text_content, spaB.text_content, 'unicode text diverged');
    console.log(`  ✓ ${a.length} items byte-identical (incl. order, unicode, dup-demotion, wayback paths)`);
  } finally {
    fs.rmSync(BASELINE_TMP, { force: true });
  }
}

// Standalone check that flat() is byte-exact for adversarial strings.
function flatFidelity() {
  const flat = (s) => (typeof s === 'string' && s.length > 0 ? s.split('').join('') : s);
  for (const c of ['\uD800', '😀\uDC00', 'café & résumé', '', 'x'.repeat(50000), '&#55296;raw']) {
    assert.strictEqual(flat(c), c, `flat() not byte-exact for ${JSON.stringify(c)}`);
  }
  assert.strictEqual(flat(null), null);
  console.log('  ✓ flat() byte-exact for lone surrogates / emoji / entities / 50KB');
}

// ---------------------------------------------------------------------------
// Part B — peak memory (852 pages under the prod heap cap)
// ---------------------------------------------------------------------------

function partB() {
  console.log('Part B — peak memory at 852 pages under --max-old-space-size=1536');
  const N = 852, KB = 1200; // ~1.2 MB content pages; baseline pins ~3MB/item → >1.5GB
  const src = execSync(`git -C ${DIR} show ${BASELINE_SHA}:${REL}`, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  fs.writeFileSync(BASELINE_TMP, src);
  try {
    const run = (execPath) => spawnSync(
      process.execPath,
      ['--max-old-space-size=1536', __filename, '--probe', execPath, String(N), String(KB)],
      { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
    );

    const base = run(BASELINE_TMP);
    assert.notStrictEqual(base.status, 0, 'EXPECTED baseline to OOM under 1536MB at 852 pages, but it survived');
    // Confirm it died of heap exhaustion specifically, not some unrelated crash
    // (OOM kills the process → status null/signal + V8 prints this to stderr).
    const oom = /heap out of memory|Allocation failed/i.test(base.stderr || '');
    assert.ok(oom, `baseline crashed but not with a heap-OOM signature:\n${(base.stderr || '').slice(-400)}`);
    console.log(`  ✓ baseline OOMs under 1536MB cap (exit ${base.status}, heap-OOM confirmed) — reproduces the Gate-1 crash`);

    const fixed = run(CURRENT);
    assert.strictEqual(fixed.status, 0, `fixed code should survive; got exit ${fixed.status}\n${fixed.stderr}`);
    const peak = JSON.parse(fixed.stdout.trim().split('\n').pop()).peakHeapMB;
    assert.ok(peak < 1536, `fixed peak ${peak}MB not under cap`);
    assert.ok(peak < 600, `fixed peak ${peak}MB higher than expected (want << 1536)`);
    console.log(`  ✓ fixed survives, peak ${peak}MB (was: OOM >1536MB) — ${Math.round(1536 / peak)}x headroom`);
  } finally {
    fs.rmSync(BASELINE_TMP, { force: true });
  }
}

(async () => {
  await partA();
  flatFidelity();
  partB();
  console.log('\nALL PASS');
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
