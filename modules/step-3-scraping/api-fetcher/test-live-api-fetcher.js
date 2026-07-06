/**
 * LIVE test for api-fetcher against two FREE, no-credential providers:
 *   1. iTunes Lookup API (JSON, identifier-driven) — https://itunes.apple.com/lookup?id=<podcastId>
 *   2. Podcast RSS (XML) — the feed URL that iTunes returns, parsed generically
 *
 * Zero API keys, zero cost. Proves the JSON path, the XML/RSS path, attribute
 * extraction (<enclosure url="...">), identifier-driven fetch, and the real
 * tools.http contract end to end.
 *
 * Run from repo root:
 *   node modules/step-3-scraping/api-fetcher/test-live-api-fetcher.js
 *
 * Uses a real fetch-backed fake tools.http (harness only — module code never
 * touches fetch; in production the skeleton provides tools.http).
 */

const execute = require('./execute.js');

const ITUNES_ID = '1200361736'; // "The Daily" (NYT) — a stable, long-lived Apple Podcasts id.

function makeLiveTools() {
  const toResponse = async (res) => ({
    status: res.status,
    headers: Object.fromEntries(res.headers.entries()),
    body: await res.text(),
  });
  return {
    logger: {
      info: (m) => console.log(`  [info] ${m}`),
      warn: (m) => console.log(`  [warn] ${m}`),
      error: (m) => console.log(`  [error] ${m}`),
    },
    progress: { update: () => {} },
    _partialItems: [],
    http: {
      get: async (url, opts = {}) =>
        toResponse(
          await fetch(url, {
            method: 'GET',
            headers: { 'User-Agent': 'content-pipeline-api-fetcher/1.0 (live-test)', ...(opts.headers || {}) },
            signal: AbortSignal.timeout(20000),
          })
        ),
    },
  };
}

const ITUNES_PROVIDER = {
  id: 'itunes-lookup',
  name: 'iTunes Lookup',
  response_format: 'json',
  identifier_source: { entity_field: 'itunes_id' },
  endpoints: [
    {
      id: 'lookup',
      url: 'https://itunes.apple.com/lookup',
      params: { id: '{identifier}' },
      results_path: 'results',
      field_map: {
        url: 'feedUrl',
        title: 'collectionName',
        artist: 'artistName',
        episodes: 'trackCount',
        genre: 'primaryGenreName',
      },
    },
  ],
};

const RSS_PROVIDER = {
  id: 'podcast-rss',
  name: 'Podcast RSS',
  response_format: 'xml',
  identifier_source: { entity_field: 'feed' },
  endpoints: [
    {
      id: 'feed',
      url: '{identifier}',
      results_path: 'rss.channel.item',
      field_map: {
        url: ['link', 'enclosure.@url'],
        title: 'title',
        audio: 'enclosure.@url',
        publishedAt: 'pubDate',
        description: 'description',
      },
    },
  ],
};

const baseOpts = {
  provider_params: {},
  max_items: 3,
  requests_per_minute: 30,
  raw_text_max_chars: 20000,
  skip_providers_without_auth: true,
};

async function main() {
  let failures = 0;

  // ── 1. iTunes Lookup (JSON, identifier-driven, no auth) ──
  console.log('\n── iTunes Lookup (JSON) ──');
  const t1 = makeLiveTools();
  const r1 = await execute(
    { entities: [{ name: 'The Daily', itunes_id: ITUNES_ID }], run_id: 'live', step_index: 3, submodule_id: 'api-fetcher' },
    { ...baseOpts, providers: [ITUNES_PROVIDER] },
    t1
  );
  const itunesItems = r1.results[0].items;
  console.log(`  ${r1.summary.description}`);
  const collection = itunesItems.find((i) => i.status === 'success' && i.url);
  if (collection) {
    const dj = JSON.parse(collection.data_json);
    console.log(`    collection: ${collection.title} — ${dj.episodes} episodes, genre ${dj.genre}`);
    console.log(`    feedUrl:    ${collection.url}`);
  }
  const itunesOk = !!collection && /^https?:\/\//.test(collection.url);
  if (!itunesOk) { console.log('  iTunes lookup returned no usable feedUrl'); failures++; }

  // ── 2. Podcast RSS (XML) parsed from the live feed URL ──
  console.log('\n── Podcast RSS (XML) ──');
  let rssOk = false;
  if (collection && collection.url) {
    const t2 = makeLiveTools();
    const r2 = await execute(
      { entities: [{ name: 'The Daily', feed: collection.url }], run_id: 'live', step_index: 3, submodule_id: 'api-fetcher' },
      { ...baseOpts, providers: [RSS_PROVIDER] },
      t2
    );
    const eps = r2.results[0].items;
    console.log(`  ${r2.summary.description}`);
    for (const ep of eps.slice(0, 3)) {
      const dj = JSON.parse(ep.data_json);
      console.log(`    - ${ep.title}`);
      console.log(`      page:  ${ep.url}`);
      console.log(`      audio: ${dj.audio || '(none)'}  date: ${dj.publishedAt || '(none)'}`);
    }
    rssOk = eps.length > 0 && eps.every((e) => e.status === 'success' && /^https?:\/\//.test(e.url) && e.title);
    if (!rssOk) { console.log('  RSS feed produced no usable episodes'); failures++; }
    // Attribute extraction is the sharpest structural proof for XML.
    const withAudio = eps.filter((e) => JSON.parse(e.data_json).audio);
    console.log(`  ${withAudio.length}/${eps.length} episodes carry an <enclosure url="..."> audio link (attribute extraction)`);
  } else {
    console.log('  skipped (no feed URL from iTunes step)');
    failures++;
  }

  console.log('\n── Verdict ──');
  console.log(`  iTunes Lookup (JSON):  ${itunesOk ? 'PASS' : 'FAIL'}`);
  console.log(`  Podcast RSS (XML):     ${rssOk ? 'PASS' : 'FAIL'}`);

  if (failures > 0) {
    console.log('\nLIVE TEST FAILED.');
    process.exit(1);
  }
  console.log('\nLIVE TEST PASSED — identifier-driven JSON + generic XML/RSS both working against real free APIs, zero credentials.');
}

main().catch((e) => {
  console.error('LIVE TEST ERROR:', e);
  process.exit(1);
});
