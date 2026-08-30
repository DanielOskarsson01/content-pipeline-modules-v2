/**
 * api-scraper memory + byte-identity tests (F1b).
 *
 * Root cause (same class as browser-scraper v1.1.1 / F1): extractFromHtml returns
 * title/metaDescription/ogDescription — `.trim()`'d regex captures of the full page
 * HTML — and a text_content that may be a `.substring()` of the full extracted text.
 * In V8 these are SlicedString views that pin their entire multi-MB parent (the
 * ScrapFly-returned page body) alive, so every result item retained its whole HTML.
 * The fix flattens those five fields (title, meta_description, og_description,
 * text_content, text_preview) with a byte-exact copy.
 *
 * Note: api-scraper runs only on the small failed-page SUBSET (pages page-scraper
 * and browser-scraper couldn't handle), so aggregate impact is lower than
 * page-scraper — but the per-item pin is identical, so the fix is warranted.
 *
 *   Part A — byte-identity: current execute vs pre-fix baseline (commit cf505b6) on a
 *            mixed fixture; deep-equal incl. order + full stringify. Covers unicode,
 *            emoji, lone-surrogate (&#55296; via og:description decode), pass-through,
 *            block→wayback→error, truncation-flag, and duplicate-demotion paths.
 *   Part B — live retained set after forced GC at 850 pages, baseline vs fixed.
 *            Reports both MB numbers; asserts the fix strictly reduces the live set.
 *
 * Run: node modules/step-3-scraping/api-scraper/test-memory.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const DIR = __dirname;
const CURRENT = path.join(DIR, 'execute.js');
const BASELINE_SHA = 'cf505b6'; // pre-F1b HEAD (fix not yet applied to api-scraper)
const REL = 'modules/step-3-scraping/api-scraper/execute.js';
const BASELINE_TMP = path.join(DIR, '._baseline_execute.tmp.js'); // in-tree; gitignored

// --- self-probe mode ---
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

// Realistic page: big <script> chrome (stripped) around a modest real article.
function bigBody(idx, kb) {
  const noise = `console.log(${idx});/* padding ${'x'.repeat(64)} */\n`.repeat(Math.ceil((kb * 1024) / 96));
  const para = 'Studio builds premium slot titles for regulated markets worldwide with certified random number generation high return to player bonus features free spins and progressive jackpots across a broad portfolio serving operators in Malta Sweden and the United Kingdom. ';
  return `<!DOCTYPE html><html><head><title>Studio Page ${idx}</title>
<meta property="og:description" content="Short summary."></head>
<body><nav>Home</nav><script>${noise}</script>
<main><article><h1>Studio ${idx}</h1><p>${para.repeat(3)} idx ${idx}</p></article></main>
<footer>Copyright 2026</footer></body></html>`;
}

function scrapflyTools(bodyFor) {
  return {
    logger: { info() {}, warn() {}, error() {} },
    progress: { update() {} },
    http: {
      async get(u) {
        if (u.includes('api.scrapfly.io')) {
          const target = new URL(u).searchParams.get('url');
          const body = bodyFor(target);
          return { status: 200, body: JSON.stringify({ result: { content: body, url: target } }) };
        }
        // wayback — no snapshot
        return { status: 404, body: 'The Wayback Machine has not archived that URL' };
      },
    },
    _partialItems: [],
  };
}

async function runProbe(execPath, N, bodyKB) {
  process.env.SCRAPFLY_KEY = 'test-key';
  const execute = require(execPath);
  const items = [];
  for (let i = 0; i < N; i++) items.push({ url: `https://studio.example/game-${i}`, status: 'error' });
  const input = { entities: [{ name: 'Studio', items }] };
  const options = { concurrency: 8, max_content_length: 50000, request_timeout: 20000, requests_per_minute: 0 };
  const tools = scrapflyTools((target) => bigBody(parseInt(target.split('-').pop(), 10), bodyKB));
  const out = await execute(input, options, tools);
  await new Promise((r) => setTimeout(r, 50));
  global.gc(); global.gc(); global.gc();
  const liveMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
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
function doc(title, seed, n, ogMeta) {
  return `<!DOCTYPE html><html><head><title>${title}</title>${ogMeta || ''}</head>`
    + `<body><main><article><h1>${title}</h1><p>${bodyWords(seed, n)}</p></article></main></body></html>`;
}
const DUP_BODY = `<!DOCTYPE html><html><head><title>Dup</title></head>`
  + `<body><main><article><p>${'identical boilerplate footer content here '.repeat(20)}</p></article></main></body></html>`;

// bodies returned by the mocked ScrapFly for each target URL
const PAGES = {
  'https://s.example/spa': doc('Studio Portfolio', 'spa', 90),
  // og:description carries &#55296; → decodeEntities yields a lone surrogate; og < 100 chars so not truncation-flagged
  'https://s.example/uni': doc('Café 🎰 Studios', 'uni', 90,
    `<meta name="description" content="Cafés &amp; résumés"><meta property="og:description" content="Naïve 🎰 &#55296; café résumé">`),
  // Cloudflare block despite ASP → wayback 404 → error
  'https://s.example/block': `<!DOCTYPE html><html><head><title>Just a moment...</title></head>`
    + `<body><p>Just a moment... Cloudflare Ray ID 12345. cf_chl_opt. ${'x '.repeat(60)}</p></body></html>`,
  // body shorter than a long og:description → success + possibly_truncated
  'https://s.example/trunc': `<!DOCTYPE html><html><head><title>T</title>`
    + `<meta property="og:description" content="${'a'.repeat(400)}"></head>`
    + `<body><main><article><p>tiny body ${'word '.repeat(60)}</p></article></main></body></html>`,
  'https://dup.example/1': DUP_BODY,
  'https://dup.example/2': DUP_BODY,
  'https://dup.example/3': DUP_BODY,
};

function fixtureInput() {
  const items = [
    // pass-through: already good, above threshold
    { url: 'https://s.example/ok', status: 'success', word_count: 500, text_content: 'already scraped '.repeat(30), title: 'OK' },
    // needs-scrape
    { url: 'https://s.example/spa', status: 'error' },
    { url: 'https://s.example/uni', status: 'error' },
    { url: 'https://s.example/block', status: 'error' },
    { url: 'https://s.example/trunc', status: 'error' },
    { url: 'https://dup.example/1', status: 'error' },
    { url: 'https://dup.example/2', status: 'error' },
    { url: 'https://dup.example/3', status: 'error' },
  ];
  return { entities: [{ name: 'Studio', items }] };
}

async function partA() {
  console.log('Part A — byte-identity vs baseline', BASELINE_SHA);
  process.env.SCRAPFLY_KEY = 'test-key';
  const baseline = require(BASELINE_TMP);
  const current = require(CURRENT);
  const opts = { concurrency: 3, max_content_length: 50000, request_timeout: 20000, requests_per_minute: 0 };
  const bodyFor = (t) => PAGES[t] || '<html></html>';

  const outBase = await baseline(fixtureInput(), opts, scrapflyTools(bodyFor));
  const outCurr = await current(fixtureInput(), opts, scrapflyTools(bodyFor));

  const a = outBase.results[0].items;
  const b = outCurr.results[0].items;
  assert.strictEqual(a.length, b.length, 'item count differs');
  for (let i = 0; i < a.length; i++) {
    assert.deepStrictEqual(b[i], a[i], `item ${i} (${a[i].url}) differs`);
  }
  assert.strictEqual(JSON.stringify(outCurr), JSON.stringify(outBase), 'full output not byte-identical');

  const pick = (arr, url) => arr.find((x) => x.url === url);
  const uniB = pick(b, 'https://s.example/uni');
  const uniA = pick(a, 'https://s.example/uni');
  assert.strictEqual(uniB.title, uniA.title, 'unicode title diverged');
  assert.strictEqual(uniB.text_content, uniA.text_content, 'unicode text diverged');
  assert.strictEqual(uniB.og_description, uniA.og_description, 'og_description (surrogate) diverged');
  assert.ok(uniB.og_description.includes('\uD800'), 'lone surrogate not present in og_description (decode path not exercised)');
  console.log(`  ✓ ${a.length} items byte-identical (incl. order, unicode/emoji/surrogate-og, block/trunc/dup/passthrough paths)`);
}

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
  const N = 850, KB = 300;
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
  console.log(`  ${material ? '✓ MATERIAL' : 'ⓘ immaterial'} — per-item pin ${material ? 'confirmed' : 'small at this body size'} (aggregate lower in prod: subset-only module)`);
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
