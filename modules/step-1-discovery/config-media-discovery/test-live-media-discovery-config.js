/**
 * LIVE test for the media-discovery CONFIG: runs the iTunes Podcasts provider
 * preset THROUGH the real api-search against the real iTunes Search API.
 *
 * FREE, zero credentials (iTunes Search API needs no auth). Always runs.
 *
 * Run from repo root:
 *   node modules/step-1-discovery/config-media-discovery/test-live-media-discovery-config.js
 *
 * Proves end-to-end: the preset drives api-search, entity-name search returns
 * real podcasts, and each item carries a real RSS feedUrl (the handoff into the
 * built rss-feeds module for episode enumeration).
 *
 * Uses a real fetch-backed tools.http (harness only — api-search uses tools.http;
 * in production the skeleton provides it).
 */

const apiSearch = require('../api-search/execute.js');
const AS_MANIFEST = require('../api-search/manifest.json');
const PRESET = require('./providers.json');

function makeLiveTools() {
  return {
    logger: {
      info: (m) => console.log(`  [info] ${m}`),
      warn: (m) => console.log(`  [warn] ${m}`),
      error: (m) => console.log(`  [error] ${m}`),
    },
    progress: { update: () => {} },
    _partialItems: [],
    http: {
      get: async (url) => {
        const res = await fetch(url, { method: 'GET', headers: { 'User-Agent': 'content-pipeline-media-discovery/1.0 (live-test)' }, signal: AbortSignal.timeout(20000) });
        return { status: res.status, headers: Object.fromEntries(res.headers.entries()), body: await res.text() };
      },
    },
  };
}

async function main() {
  const options = { ...AS_MANIFEST.options_defaults, ...PRESET };
  const tools = makeLiveTools();

  console.log('\n── Live: iTunes Podcasts preset through api-search (entity = "NPR") ──');
  const res = await apiSearch(
    { entities: [{ name: 'NPR' }], run_id: 'live', step_index: 1, submodule_id: 'api-search' },
    options,
    tools
  );
  const items = res.results[0].items;
  console.log(`  ${res.summary.description}`);
  for (const it of items.slice(0, 4)) {
    console.log(`    - ${it.title}  [${it.company}]`);
    console.log(`      feed: ${it.url}`);
  }

  const rssUrl = /^https?:\/\//;
  const feedItems = items.filter((i) => rssUrl.test(i.url || ''));
  const allSourced = items.every((i) => i.source === 'itunes-podcasts');
  const titled = items.every((i) => i.title);

  console.log('\n── Verdict ──');
  console.log(`  podcasts found:        ${items.length > 0 ? 'PASS' : 'FAIL'} (${items.length})`);
  console.log(`  items carry an http feed url: ${feedItems.length === items.length && items.length > 0 ? 'PASS' : 'FAIL'} (${feedItems.length}/${items.length})`);
  console.log(`  source + title set:    ${allSourced && titled ? 'PASS' : 'FAIL'}`);

  const ok = items.length > 0 && feedItems.length === items.length && allSourced && titled;
  if (!ok) { console.log('\nLIVE TEST FAILED.'); process.exit(1); }
  console.log('\nLIVE TEST PASSED — iTunes preset drove real podcast discovery through api-search; every item carries an RSS feed url for the rss-feeds handoff.');
}

main().catch((e) => { console.error('LIVE TEST ERROR:', e); process.exit(1); });
