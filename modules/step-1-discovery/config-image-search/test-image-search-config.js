/**
 * Standalone test harness for the image-search CONFIG (config-only presets).
 * Brief: docs/submodule-briefs-rev-2026-07-03/step1-image-logo-search.md
 *
 * Run: node modules/step-1-discovery/config-image-search/test-image-search-config.js
 * From repo root.
 *
 * NOT a module — two provider presets:
 *   - providers-stock.json     : api-search stock imagery (Pixabay/Unsplash query-param,
 *                                Pexels via the v1.1.0 custom-header auth)
 *   - providers-image-serp.json: search-discovery images vertical (Serper /images)
 *
 * Proves both are CONFIG-ONLY (every field_map value is a supported form; no
 * {template} form; Pexels rides the header-auth already shipped) and that each
 * ROUTES THROUGH its real module (only tools.http mocked). Live-verify is
 * deferred (no image-provider keys in this environment).
 */

const STOCK = require('./providers-stock.json');
const IMAGE_SERP = require('./providers-image-serp.json');
const apiSearch = require('../api-search/execute.js');
const AS_MANIFEST = require('../api-search/manifest.json');
const searchDiscovery = require('../search-discovery/execute.js');
const SD_MANIFEST = require('../search-discovery/manifest.json');

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { console.log(`  PASS: ${msg}`); pass++; }
  else { console.log(`  FAIL: ${msg}`); fail++; }
}

function makeTools(handlers = {}) {
  const logs = [];
  const calls = { get: [], post: [], head: [] };
  return {
    logs, calls,
    logger: {
      info: (m) => logs.push({ level: 'info', message: m }),
      warn: (m) => logs.push({ level: 'warn', message: m }),
      error: (m) => logs.push({ level: 'error', message: m }),
    },
    progress: { update: () => {} },
    _partialItems: [],
    http: {
      get: async (url, opts) => { calls.get.push({ url, opts }); return (handlers.get || (() => ({ status: 200, headers: {}, body: '{}' })))(url, opts); },
      post: async (url, body, opts) => { calls.post.push({ url, body, opts }); return (handlers.post || (() => ({ status: 200, headers: {}, body: '{}' })))(url, body, opts); },
      head: async (url, opts) => { calls.head.push({ url, opts }); return (handlers.head || (() => ({ status: 200, headers: {}, body: '' })))(url, opts); },
    },
  };
}

function isSupportedApiSearchField(v) {
  return typeof v === 'string' || v === null || (Array.isArray(v) && v.every((x) => typeof x === 'string'));
}

async function main() {
  process.env.PIXABAY_API_KEY = 'pix-key';
  process.env.UNSPLASH_ACCESS_KEY = 'uns-key';
  process.env.PEXELS_API_KEY = 'pex-key';
  process.env.SEARCH_PROVIDER_SERPER_KEY = 'serper-key';

  // ── 1. Stock preset: config-only shape ──
  console.log('\n[1] stock preset — config-only');
  const byId = Object.fromEntries(STOCK.providers.map((p) => [p.id, p]));
  assert(byId.pixabay && byId.unsplash && byId.pexels, 'pixabay + unsplash + pexels providers present');
  assert(byId.pixabay.auth && byId.pixabay.auth.type === 'query_param', 'pixabay uses query_param auth (supported today)');
  assert(byId.unsplash.auth && byId.unsplash.auth.type === 'query_param' && byId.unsplash.auth.key === 'client_id', 'unsplash uses client_id query param');
  assert(byId.pexels.headers && /\{env:PEXELS_API_KEY\}/.test(byId.pexels.headers.Authorization), 'pexels uses the v1.1.0 custom-header auth ({env:PEXELS_API_KEY})');
  assert(!byId.pexels.auth, 'pexels needs no query_param/bearer auth (header only)');
  for (const p of STOCK.providers) {
    const bad = Object.entries(p.field_map).filter(([, v]) => !isSupportedApiSearchField(v));
    assert(bad.length === 0, `${p.id}: field_map uses only supported forms (bad: ${JSON.stringify(bad.map(([k]) => k))})`);
    assert(typeof p.field_map.image_url === 'string', `${p.id}: maps image_url (for step-8 company-media shape-routing)`);
  }

  // ── 2. Stock preset routes through the REAL api-search ──
  console.log('\n[2] stock routes through real api-search');
  {
    const tools = makeTools({
      get: (url) => {
        if (url.includes('pixabay.com')) return { status: 200, headers: {}, body: JSON.stringify({ hits: [{ pageURL: 'https://pixabay.test/p1', webformatURL: 'https://pixabay.test/i1.jpg', tags: 'tech', id: 1, user: 'u' }] }) };
        if (url.includes('unsplash.com')) return { status: 200, headers: {}, body: JSON.stringify({ results: [{ id: 'u1', urls: { regular: 'https://unsplash.test/i.jpg' }, links: { html: 'https://unsplash.test/p' }, alt_description: 'tech', user: { name: 'Ann' } }] }) };
        if (url.includes('pexels.com')) return { status: 200, headers: {}, body: JSON.stringify({ photos: [{ id: 9, url: 'https://pexels.test/p', src: { large: 'https://pexels.test/i.jpg' }, alt: 'tech', photographer: 'Bo' }] }) };
        return { status: 404, headers: {}, body: '{}' };
      },
    });
    const options = { ...AS_MANIFEST.options_defaults, ...STOCK };
    const res = await apiSearch({ entities: [{ name: 'AnyCo' }], run_id: 't', step_index: 1, submodule_id: 'api-search' }, options, tools);
    const items = res.results[0].items;
    assert(items.length === 3, `one item per stock provider (got ${items.length})`);
    const pexelsCall = tools.calls.get.find((c) => c.url.includes('pexels.com'));
    assert(pexelsCall && pexelsCall.opts.headers.Authorization === 'pex-key', 'Pexels request carries the raw-key Authorization header (via W2-A)');
    assert(tools.calls.get.some((c) => c.url.includes('pixabay.com') && c.url.includes('key=pix-key')), 'Pixabay key in query string');
    assert(tools.calls.get.some((c) => c.url.includes('unsplash.com') && c.url.includes('client_id=uns-key')), 'Unsplash client_id in query string');
    const imageUrls = items.map((i) => i.image_url).filter(Boolean);
    assert(imageUrls.length === 3, 'every stock item carries an image_url');
  }

  // ── 3. Pexels skipped when its key is unset (via api-search header-env policy) ──
  console.log('\n[3] pexels skipped without its key');
  {
    delete process.env.PEXELS_API_KEY;
    const tools = makeTools({ get: () => ({ status: 200, headers: {}, body: '{"photos":[],"hits":[],"results":[]}' }) });
    const onlyPexels = { ...AS_MANIFEST.options_defaults, ...STOCK, providers: [byId.pexels] };
    await apiSearch({ entities: [{ name: 'AnyCo' }], run_id: 't', step_index: 1, submodule_id: 'api-search' }, onlyPexels, tools);
    assert(tools.calls.get.length === 0, 'no Pexels request when PEXELS_API_KEY unset');
    assert(tools.logs.some((l) => l.level === 'warn' && /PEXELS_API_KEY/.test(l.message)), 'warning names the missing Pexels key');
    process.env.PEXELS_API_KEY = 'pex-key';
  }

  // ── 4. Image-SERP preset: config-only + no lookup-blocker forms ──
  console.log('\n[4] image-serp preset — config-only');
  const serper = IMAGE_SERP.providers.find((p) => p.id === 'serper-images');
  assert(IMAGE_SERP.result_type === 'images', 'result_type = images');
  assert(serper && serper.kind === 'serp', 'serper-images is a serp provider (not lookup)');
  assert(serper.endpoints && serper.endpoints.images, 'has an images endpoint');
  assert(typeof serper.field_map.image_url === 'string' && typeof serper.field_map.url === 'string', 'maps url + image_url');
  const anyEnvTemplate = IMAGE_SERP.providers.some((p) => /\{env:/.test(p.url_template || ''));
  assert(!anyEnvTemplate, 'no {env:} url_template form (the lookup-provider blocker) in this preset');

  // ── 5. Image-SERP routes through the REAL search-discovery ──
  console.log('\n[5] image-serp routes through real search-discovery');
  {
    const tools = makeTools({
      post: () => ({ status: 200, headers: {}, body: JSON.stringify({ images: [{ imageUrl: 'https://img.test/logo.png', title: 'AnyCo logo', source: 'anyco.com', link: 'https://anyco.com/press' }] }) }),
      head: () => ({ status: 200, headers: {}, body: '' }),
    });
    const options = { ...SD_MANIFEST.options_defaults, ...IMAGE_SERP };
    const res = await searchDiscovery({ entities: [{ name: 'AnyCo', website: 'anyco.com' }], run_id: 't', step_index: 1, submodule_id: 'search-discovery' }, options, tools);
    const items = res.results[0].items;
    assert(items.length >= 1, `image results produced (got ${items.length})`);
    assert(items[0].image_url === 'https://img.test/logo.png', 'image_url mapped from the images endpoint');
    assert(items[0].result_type === 'images', 'result_type carried as images');
    assert(tools.calls.post.length >= 1 && tools.calls.post[0].url.includes('/images'), 'POSTed to the images endpoint');
    assert(tools.calls.post[0].opts.headers['X-API-KEY'] === 'serper-key', 'Serper X-API-KEY header applied');
  }

  console.log(`\n${'='.repeat(50)}\nTOTAL: ${pass} passed, ${fail} failed\n`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error('HARNESS ERROR:', e); process.exit(1); });
