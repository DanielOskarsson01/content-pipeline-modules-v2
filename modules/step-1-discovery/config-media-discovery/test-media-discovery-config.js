/**
 * Standalone test harness for the media-discovery CONFIG (config-only api-search
 * provider preset). Brief: docs/submodule-briefs-rev-2026-07-03/step1-youtube-podcast-discovery.md
 *
 * Run: node modules/step-1-discovery/config-media-discovery/test-media-discovery-config.js
 * From repo root.
 *
 * This is NOT a module — it's an api-search `providers` preset (providers.json).
 * These tests prove:
 *   - the preset is CONFIG-ONLY: every field_map value uses an api-search-supported
 *     form (string path / fallback array / null) — NO {template:...} object, so it
 *     needs zero api-search code (the iTunes leg; YouTube — which DOES need the
 *     template form — is deliberately excluded, see README).
 *   - the preset ROUTES THROUGH the real api-search execute (only tools.http mocked):
 *     an iTunes podcast search returns items keyed by feedUrl, with the media=podcast
 *     provider_param applied and entity-name search wired.
 *
 * No network — tools.http is mocked with a canned iTunes Search response.
 */

const PRESET = require('./providers.json');
const apiSearch = require('../api-search/execute.js');
const AS_MANIFEST = require('../api-search/manifest.json');

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { console.log(`  PASS: ${msg}`); pass++; }
  else { console.log(`  FAIL: ${msg}`); fail++; }
}

function makeTools(getHandler) {
  const logs = [];
  const calls = { get: [] };
  return {
    logs, calls,
    logger: {
      info: (m) => logs.push({ level: 'info', message: m }),
      warn: (m) => logs.push({ level: 'warn', message: m }),
      error: (m) => logs.push({ level: 'error', message: m }),
    },
    progress: { update: () => {} },
    _partialItems: [],
    http: { get: async (url, opts) => { calls.get.push({ url, opts }); return getHandler(url, opts); } },
  };
}

// Canned iTunes Search (media=podcast) response.
const ITUNES_RESPONSE = {
  resultCount: 2,
  results: [
    { collectionName: 'The iGaming Podcast', artistName: 'Host A', feedUrl: 'https://feeds.test/igaming', collectionViewUrl: 'https://podcasts.apple.com/x/1', collectionId: 111, releaseDate: '2026-06-01' },
    { collectionName: 'Casino Talk', artistName: 'Host B', collectionViewUrl: 'https://podcasts.apple.com/x/2', collectionId: 222, releaseDate: '2026-05-01' }, // no feedUrl -> fallback to collectionViewUrl
  ],
};

// api-search-supported field_map value forms (string / fallback array / null).
function isSupportedFieldMapValue(v) {
  return typeof v === 'string' || v === null || (Array.isArray(v) && v.every((x) => typeof x === 'string'));
}

async function main() {
  const itunes = PRESET.providers.find((p) => p.id === 'itunes-podcasts');

  // ── 1. Preset shape ──
  console.log('\n[1] preset shape');
  assert(PRESET.search_input === 'entity_names', 'search_input = entity_names (searches per entity)');
  assert(Array.isArray(PRESET.providers) && itunes, 'itunes-podcasts provider present');
  assert(PRESET.provider_params && PRESET.provider_params['itunes-podcasts'] && PRESET.provider_params['itunes-podcasts'].media === 'podcast', 'media=podcast provider_param set');
  assert(!itunes.auth, 'iTunes needs no auth (free, no key)');

  // ── 2. CONFIG-ONLY: field_map uses only api-search-supported value forms ──
  console.log('\n[2] config-only (no api-search code needed for iTunes)');
  const badFields = Object.entries(itunes.field_map).filter(([, v]) => !isSupportedFieldMapValue(v));
  assert(badFields.length === 0, `every iTunes field_map value is string/array/null (unsupported: ${JSON.stringify(badFields.map(([k]) => k))})`);
  assert(Array.isArray(itunes.field_map.url) && itunes.field_map.url[0] === 'feedUrl', 'url is a fallback array [feedUrl, ...] (RSS handoff)');
  // Confirm NO provider in this preset uses the {template:...} form (that would force api-search code).
  const templateForms = PRESET.providers.flatMap((p) => Object.entries(p.field_map || {})).filter(([, v]) => v && typeof v === 'object' && !Array.isArray(v));
  assert(templateForms.length === 0, 'no {template:...} field_map form in the preset (YouTube excluded until api-search gains it)');

  // ── 3. Routes through the REAL api-search execute ──
  console.log('\n[3] routes through real api-search');
  {
    const options = { ...AS_MANIFEST.options_defaults, ...PRESET };
    const tools = makeTools(() => ({ status: 200, headers: {}, body: JSON.stringify(ITUNES_RESPONSE) }));
    const res = await apiSearch({ entities: [{ name: 'Evolution Gaming' }], run_id: 't', step_index: 1, submodule_id: 'api-search' }, options, tools);
    const items = res.results[0].items;
    assert(items.length === 2, `two podcast items produced (got ${items.length})`);
    assert(items[0].url === 'https://feeds.test/igaming', 'item 1 url = feedUrl (RSS feed for rss-feeds handoff)');
    assert(items[1].url === 'https://podcasts.apple.com/x/2', 'item 2 falls back to collectionViewUrl when feedUrl absent');
    assert(items[0].source === 'itunes-podcasts', 'source = provider id');
    assert(items[0].title === 'The iGaming Podcast', 'title = collectionName');
    // Request wiring: entity name as term, media=podcast param, limit applied.
    const url = tools.calls.get[0].url;
    assert(/term=Evolution(\+|%20)Gaming/.test(url), 'entity name used as the search term');
    assert(/media=podcast/.test(url), 'media=podcast provider_param sent');
    assert(/limit=/.test(url), 'limit param sent');
  }

  console.log(`\n${'='.repeat(50)}\nTOTAL: ${pass} passed, ${fail} failed\n`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error('HARNESS ERROR:', e); process.exit(1); });
