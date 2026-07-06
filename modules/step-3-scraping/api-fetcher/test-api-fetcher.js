/**
 * Standalone test harness for api-fetcher v1.0.0.
 *
 * Run: node modules/step-3-scraping/api-fetcher/test-api-fetcher.js
 * From repo root.
 *
 * Covers the v1 contract (brief: docs/submodule-briefs-rev-2026-07-03/step3-api-data-fetcher.md):
 *   - identifier resolution: entity seed field first, then pool-item field; no identifier -> note, not error
 *   - endpoint chaining: {identifier}, {max_items}, {endpoint_id.field} placeholder substitution
 *   - chained placeholder missing -> dependent endpoint skipped with a reason (not a throw)
 *   - JSON providers: results_path + field_map (dot-notation + fallback arrays)
 *   - XML/RSS -> JSON normalization on a canned feed (CDATA, attributes, namespaced + repeated tags)
 *   - url_template synthesis for bare ids; chain-only endpoints (no url) emit no items
 *   - output item shape: source_api, url, externalId, data_json (stringified), raw_text, fetch_date, status
 *   - raw_text flattening (default Key: value) + raw_text_template + raw_text_max_chars truncation
 *   - auth: query_param, header, basic; missing env var -> provider skipped (skip_providers_without_auth)
 *   - per-provider error isolation; empty result -> not_found item (entity not failed)
 *   - max_items cap enforced locally; _partialItems pushed after each provider; providers as JSON string
 *   - no providers -> loud no-op (inert by default); manifest contract shape
 *
 * All HTTP mocked. No credentials, no network.
 */

const execute = require('./execute.js');
const MANIFEST = require('./manifest.json');

let pass = 0;
let fail = 0;

function assert(cond, msg) {
  if (cond) {
    console.log(`  PASS: ${msg}`);
    pass++;
  } else {
    console.log(`  FAIL: ${msg}`);
    fail++;
  }
}

function makeTools(handlers = {}) {
  const logs = [];
  const calls = { get: [], post: [] };
  return {
    logs,
    calls,
    logger: {
      info: (m) => logs.push({ level: 'info', message: m }),
      warn: (m) => logs.push({ level: 'warn', message: m }),
      error: (m) => logs.push({ level: 'error', message: m }),
    },
    progress: { update: () => {} },
    _partialItems: [],
    http: {
      get: async (url, opts) => {
        calls.get.push({ url, opts });
        if (handlers.get) return handlers.get(url, opts);
        return { status: 200, headers: {}, body: '{}' };
      },
      post: async (url, body, opts) => {
        calls.post.push({ url, body, opts });
        if (handlers.post) return handlers.post(url, body, opts);
        return { status: 200, headers: {}, body: '{}' };
      },
    },
  };
}

const defaults = { ...MANIFEST.options_defaults };

function makeInput(entities) {
  return { entities, run_id: 'test-run', step_index: 3, submodule_id: 'api-fetcher' };
}

function json(status, obj) {
  return { status, headers: {}, body: JSON.stringify(obj) };
}

// ── Canned podcast RSS fixture (CDATA, attributes, namespaced + repeated tags) ──
const RSS_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>Test Cast</title>
    <link>https://podcast.test</link>
    <item>
      <title><![CDATA[Episode 1: Hello & Welcome]]></title>
      <link>https://podcast.test/ep1</link>
      <pubDate>Mon, 01 Jun 2026 10:00:00 GMT</pubDate>
      <enclosure url="https://cdn.test/ep1.mp3" type="audio/mpeg" length="12345"/>
      <itunes:duration>1830</itunes:duration>
      <description>First &amp; best episode</description>
    </item>
    <item>
      <title>Episode 2</title>
      <link>https://podcast.test/ep2</link>
      <pubDate>Tue, 02 Jun 2026 10:00:00 GMT</pubDate>
      <enclosure url="https://cdn.test/ep2.mp3" type="audio/mpeg" length="23456"/>
      <itunes:duration>2400</itunes:duration>
      <description>Second episode</description>
    </item>
  </channel>
</rss>`;

const RSS_PROVIDER = {
  id: 'podcast-rss',
  name: 'Podcast RSS',
  response_format: 'xml',
  identifier_source: { entity_field: 'feed_url', item_field: 'feed_url' },
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
        duration: 'itunes:duration',
        description: 'description',
      },
    },
  ],
};

// ── YouTube-shaped 2-hop JSON provider (channel -> uploads playlist -> videos) ──
function ytProvider() {
  return {
    id: 'yt',
    name: 'YouTube-like',
    response_format: 'json',
    identifier_source: { entity_field: 'channel_id' },
    auth: { type: 'query_param', key: 'key', env_var: 'TEST_AF_YT_KEY' },
    endpoints: [
      {
        id: 'channel',
        url: 'https://api.test/channels',
        params: { id: '{identifier}' },
        results_path: 'items',
        // no url mapped and no url_template -> chain-only (feeds the next endpoint, emits nothing)
        field_map: { uploads_playlist: 'contentDetails.uploads', title: 'snippet.title', subscribers: 'stats.subs' },
      },
      {
        id: 'videos',
        url: 'https://api.test/playlistItems',
        params: { playlistId: '{channel.uploads_playlist}', maxResults: '{max_items}' },
        results_path: 'items',
        field_map: { url: 'videoId', title: 'snippet.title', published: 'snippet.publishedAt' },
        url_template: 'https://youtube.test/watch?v={url}',
      },
    ],
  };
}

async function main() {
  process.env.TEST_AF_YT_KEY = 'yt-key-abc';
  delete process.env.TEST_AF_MISSING_KEY;

  // ── 1. XML/RSS normalization: CDATA, attributes, namespaced + repeated tags ──
  console.log('\n[1] XML/RSS provider (podcast feed)');
  {
    const tools = makeTools({
      get: async (url) => {
        if (url === 'https://podcast.test/feed.xml') return { status: 200, headers: {}, body: RSS_FIXTURE };
        return { status: 404, headers: {}, body: '' };
      },
    });
    const res = await execute(
      makeInput([{ name: 'Test Show', feed_url: 'https://podcast.test/feed.xml' }]),
      { ...defaults, providers: [RSS_PROVIDER] },
      tools
    );
    const items = res.results[0].items;
    assert(items.length === 2, `two RSS items mapped (got ${items.length})`);
    assert(items[0].url === 'https://podcast.test/ep1', 'field_map fallback array picks <link> first');
    assert(items[0].title === 'Episode 1: Hello & Welcome', 'CDATA + entity decode in title');
    assert(items[0].source_api === 'podcast-rss', 'source_api = provider id');
    assert(items[0].status === 'success', 'status success');
    const dj = JSON.parse(items[0].data_json);
    assert(dj.audio === 'https://cdn.test/ep1.mp3', 'enclosure @url attribute extracted into data_json');
    assert(dj.duration === '1830', 'namespaced tag itunes:duration mapped');
    assert(items[0].raw_text.includes('First & best episode'), 'raw_text has decoded description (&amp; -> &)');
    assert(/^\d{4}-\d{2}-\d{2}/.test(items[0].fetch_date), 'fetch_date is ISO');
  }

  // ── 2. Endpoint chaining: {identifier}, {max_items}, {endpoint.field} ──
  console.log('\n[2] endpoint chaining (channel -> videos)');
  {
    const tools = makeTools({
      get: async (url) => {
        if (url.includes('/channels')) {
          return json(200, { items: [{ contentDetails: { uploads: 'PL123' }, snippet: { title: 'My Channel' }, stats: { subs: '1000' } }] });
        }
        if (url.includes('/playlistItems')) {
          return json(200, { items: [
            { videoId: 'v1', snippet: { title: 'Video 1', publishedAt: '2026-06-01' } },
            { videoId: 'v2', snippet: { title: 'Video 2', publishedAt: '2026-06-02' } },
          ] });
        }
        return json(404, {});
      },
    });
    const res = await execute(
      makeInput([{ name: 'Chan', channel_id: 'UC_test' }]),
      { ...defaults, providers: [ytProvider()], max_items: 25 },
      tools
    );
    const items = res.results[0].items;
    assert(items.length === 2, `only videos emitted; channel is chain-only (got ${items.length})`);
    const videosCall = tools.calls.get.find((c) => c.url.includes('/playlistItems'));
    assert(videosCall && videosCall.url.includes('playlistId=PL123'), '{channel.uploads_playlist} chained into videos request');
    assert(videosCall && videosCall.url.includes('maxResults=25'), '{max_items} substituted into params');
    const channelCall = tools.calls.get.find((c) => c.url.includes('/channels'));
    assert(channelCall && channelCall.url.includes('id=UC_test'), '{identifier} substituted into channel request');
    assert(channelCall && channelCall.url.includes('key=yt-key-abc'), 'query_param auth key appended');
    assert(items[0].url === 'https://youtube.test/watch?v=v1', 'url_template synthesizes url from bare id');
    assert(items[0].source_api === 'yt', 'source_api = yt');
  }

  // ── 3. Chained placeholder missing -> dependent endpoint skipped (reason) ──
  console.log('\n[3] chained placeholder unresolved skips the dependent endpoint');
  {
    const tools = makeTools({
      get: async (url) => {
        if (url.includes('/channels')) return json(200, { items: [{ snippet: { title: 'No uploads here' } }] }); // no contentDetails.uploads
        if (url.includes('/playlistItems')) return json(200, { items: [{ videoId: 'x' }] });
        return json(404, {});
      },
    });
    const res = await execute(
      makeInput([{ name: 'Chan', channel_id: 'UC_x' }]),
      { ...defaults, providers: [ytProvider()] },
      tools
    );
    assert(!tools.calls.get.some((c) => c.url.includes('/playlistItems')), 'videos endpoint never requested (placeholder unresolved)');
    assert(res.results[0].items.length === 0, 'no items emitted');
    assert(tools.logs.some((l) => /uploads_playlist|placeholder|unresolved|skip/i.test(l.message)), 'skip reason logged');
  }

  // ── 4. Missing identifier -> note, not error, entity yields 0 items, no throw ──
  console.log('\n[4] no identifier for entity -> note, not error');
  {
    const tools = makeTools({ get: async () => json(200, { items: [] }) });
    const res = await execute(
      makeInput([{ name: 'NoId' }]), // no channel_id field, no items
      { ...defaults, providers: [ytProvider()] },
      tools
    );
    assert(tools.calls.get.length === 0, 'no HTTP call when identifier absent');
    assert(res.results[0].items.length === 0, 'entity yields 0 items');
    assert((res.results[0].meta.errors || 0) === 0, 'missing identifier is NOT an error');
    assert(tools.logs.some((l) => /identifier/i.test(l.message)), 'missing-identifier noted');
  }

  // ── 5. Identifier from a pool item (entity.items[].feed_url) ──
  console.log('\n[5] identifier resolved from a pool item');
  {
    const tools = makeTools({
      get: async (url) => (url === 'https://podcast.test/feed.xml' ? { status: 200, headers: {}, body: RSS_FIXTURE } : json(404, {})),
    });
    const res = await execute(
      makeInput([{ name: 'Show', items: [{ url: 'x', feed_url: 'https://podcast.test/feed.xml' }] }]),
      { ...defaults, providers: [RSS_PROVIDER] },
      tools
    );
    assert(res.results[0].items.length === 2, 'pool-item identifier used when entity seed field absent');
  }

  // ── 6. Missing env var -> provider skipped (skip_providers_without_auth) ──
  console.log('\n[6] missing auth env var skips provider');
  {
    const p = { ...ytProvider(), id: 'nokey', auth: { type: 'query_param', key: 'key', env_var: 'TEST_AF_MISSING_KEY' } };
    const tools = makeTools({ get: async () => json(200, { items: [] }) });
    const res = await execute(
      makeInput([{ name: 'Chan', channel_id: 'UC_1' }]),
      { ...defaults, providers: [p] },
      tools
    );
    assert(tools.calls.get.length === 0, 'no HTTP call for auth-less provider');
    assert(tools.logs.some((l) => l.level === 'warn' && /TEST_AF_MISSING_KEY/.test(l.message)), 'warning names the missing env var');
    assert(res.results[0].items.length === 0, 'no items');
  }

  // ── 6b. skip_providers_without_auth=false still runs (no key sent) ──
  console.log('\n[6b] skip_providers_without_auth=false keeps the provider');
  {
    const p = { ...ytProvider(), id: 'nokey2', auth: { type: 'query_param', key: 'key', env_var: 'TEST_AF_MISSING_KEY' } };
    const tools = makeTools({
      get: async (url) => (url.includes('/channels') ? json(200, { items: [{ contentDetails: { uploads: 'PL9' } }] }) : json(200, { items: [{ videoId: 'z' }] })),
    });
    const res = await execute(
      makeInput([{ name: 'Chan', channel_id: 'UC_2' }]),
      { ...defaults, providers: [p], skip_providers_without_auth: false },
      tools
    );
    assert(tools.calls.get.length >= 1, 'provider ran despite missing key when skip disabled');
    assert(!tools.calls.get[0].url.includes('key='), 'no key param appended when env var absent');
  }

  // ── 7. Per-provider error isolation (one provider 500, another OK) ──
  console.log('\n[7] per-provider error isolation');
  {
    // Distinct URLs so the mock can route: bad -> 500, good (RSS) -> feed.
    const bad = {
      id: 'bad', response_format: 'json', identifier_source: { entity_field: 'cid' },
      endpoints: [{ id: 'e', url: 'https://bad.test/api', params: { id: '{identifier}' }, results_path: 'items', field_map: { url: 'u' } }],
    };
    const good = { ...RSS_PROVIDER, id: 'good' };
    const tools = makeTools({
      get: async (url) => (url.includes('bad.test') ? json(500, {}) : { status: 200, headers: {}, body: RSS_FIXTURE }),
    });
    const res = await execute(
      makeInput([{ name: 'Show', cid: 'C1', feed_url: 'https://podcast.test/feed.xml' }]),
      { ...defaults, providers: [bad, good] },
      tools
    );
    // bad provider errors, good still produces items; no throw
    assert(res.results[0].items.length === 2, `good provider still produced items after bad provider failed (got ${res.results[0].items.length})`);
    assert((res.results[0].meta.errors || 0) >= 1, 'bad provider error counted in meta');
  }

  // ── 8. Empty result -> not_found item; entity not failed ──
  console.log('\n[8] empty result yields a not_found item');
  {
    const tools = makeTools({ get: async () => json(200, { items: [] }) });
    const res = await execute(
      makeInput([{ name: 'Chan', channel_id: 'UC_dead' }]),
      { ...defaults, providers: [ytProvider()] },
      tools
    );
    const items = res.results[0].items;
    assert(items.length === 1 && items[0].status === 'not_found', 'one not_found item for a dead identifier');
    assert(typeof items[0].url === 'string' && items[0].url.length > 0 && !items[0].url.includes('yt-key-abc'), 'not_found item has a key with no secret leaked');
    assert((res.results[0].meta.errors || 0) === 0, 'not_found is not an error');
  }

  // ── 9. raw_text_template + raw_text_max_chars truncation ──
  console.log('\n[9] raw_text template + truncation');
  {
    const p = {
      ...RSS_PROVIDER,
      id: 'tmpl',
      endpoints: [{ ...RSS_PROVIDER.endpoints[0], raw_text_template: 'TITLE={title} :: DESC={description}' }],
    };
    const tools = makeTools({ get: async () => ({ status: 200, headers: {}, body: RSS_FIXTURE }) });
    const res = await execute(
      makeInput([{ name: 'Show', feed_url: 'https://podcast.test/feed.xml' }]),
      { ...defaults, providers: [p], raw_text_max_chars: 20 },
      tools
    );
    const rt = res.results[0].items[0].raw_text;
    assert(rt.startsWith('TITLE=Episode 1'), 'raw_text_template applied with {field} placeholders');
    assert(rt.length <= 20, `raw_text truncated to raw_text_max_chars (len ${rt.length})`);
  }

  // ── 10. max_items cap enforced locally ──
  console.log('\n[10] max_items cap');
  {
    const many = { items: Array.from({ length: 5 }, (_, i) => ({ videoId: 'v' + i, snippet: { title: 'V' + i } })) };
    const tools = makeTools({
      get: async (url) => (url.includes('/channels') ? json(200, { items: [{ contentDetails: { uploads: 'PLx' } }] }) : json(200, many)),
    });
    const res = await execute(
      makeInput([{ name: 'Chan', channel_id: 'UC_many' }]),
      { ...defaults, providers: [ytProvider()], max_items: 2 },
      tools
    );
    assert(res.results[0].items.length === 2, `5 records capped to max_items=2 (got ${res.results[0].items.length})`);
  }

  // ── 11. header + basic auth ──
  console.log('\n[11] header and basic auth');
  {
    process.env.TEST_AF_HDR = 'hdr-secret';
    process.env.TEST_AF_BASIC = 'basic-user-key';
    const hdr = {
      id: 'hdr', response_format: 'json', identifier_source: { entity_field: 'cid' },
      auth: { type: 'header', key: 'X-cb-user-key', env_var: 'TEST_AF_HDR' },
      endpoints: [{ id: 'e', url: 'https://api.test/h', params: { id: '{identifier}' }, results_path: 'items', field_map: { url: 'u' } }],
    };
    const bas = {
      id: 'bas', response_format: 'json', identifier_source: { entity_field: 'cid' },
      auth: { type: 'basic', env_var: 'TEST_AF_BASIC' },
      endpoints: [{ id: 'e', url: 'https://api.test/b', params: { id: '{identifier}' }, results_path: 'items', field_map: { url: 'u' } }],
    };
    const tools = makeTools({ get: async () => json(200, { items: [{ u: 'https://r.test/1' }] }) });
    await execute(makeInput([{ name: 'X', cid: 'C1' }]), { ...defaults, providers: [hdr, bas] }, tools);
    const hCall = tools.calls.get.find((c) => c.url.includes('/h'));
    const bCall = tools.calls.get.find((c) => c.url.includes('/b'));
    assert(hCall && hCall.opts.headers['X-cb-user-key'] === 'hdr-secret', 'header auth injects custom header');
    const expectedBasic = 'Basic ' + Buffer.from('basic-user-key:').toString('base64');
    assert(bCall && bCall.opts.headers.Authorization === expectedBasic, 'basic auth = base64(key:) as username');
  }

  // ── 12. _partialItems pushed after each provider ──
  console.log('\n[12] _partialItems accumulation');
  {
    const tools = makeTools({ get: async () => ({ status: 200, headers: {}, body: RSS_FIXTURE }) });
    const res = await execute(
      makeInput([{ name: 'A', feed_url: 'https://podcast.test/feed.xml' }, { name: 'B', feed_url: 'https://podcast.test/feed.xml' }]),
      { ...defaults, providers: [RSS_PROVIDER] },
      tools
    );
    const total = res.results.reduce((s, r) => s + r.items.length, 0);
    assert(tools._partialItems.length === total, `_partialItems holds all ${total} items across entities (got ${tools._partialItems.length})`);
    assert(tools._partialItems.every((i) => i.entity_name), 'partial items carry entity_name for regrouping');
  }

  // ── 13. No providers -> loud no-op (inert by default) ──
  console.log('\n[13] no providers configured -> inert no-op');
  {
    const tools = makeTools();
    const res = await execute(makeInput([{ name: 'A' }]), { ...defaults }, tools);
    assert(tools.calls.get.length === 0, 'no HTTP calls with default (empty) providers');
    assert(res.results[0].items.length === 0, 'no items');
    assert(/no.*provider/i.test(res.summary.description), 'summary explains no providers');
  }

  // ── 14. providers option as JSON string (UI storage) ──
  console.log('\n[14] providers option arrives as a JSON string');
  {
    const tools = makeTools({ get: async () => ({ status: 200, headers: {}, body: RSS_FIXTURE }) });
    const res = await execute(
      makeInput([{ name: 'Show', feed_url: 'https://podcast.test/feed.xml' }]),
      { ...defaults, providers: JSON.stringify([RSS_PROVIDER]) },
      tools
    );
    assert(res.results[0].items.length === 2, 'string-typed providers parsed');
  }

  // ── 15. summary shape ──
  console.log('\n[15] summary');
  {
    const tools = makeTools({ get: async () => ({ status: 200, headers: {}, body: RSS_FIXTURE }) });
    const res = await execute(
      makeInput([{ name: 'A', feed_url: 'https://podcast.test/feed.xml' }, { name: 'B', feed_url: 'https://podcast.test/feed.xml' }]),
      { ...defaults, providers: [RSS_PROVIDER] },
      tools
    );
    assert(res.summary.total_entities === 2 && res.summary.total_items === 4, 'summary counts entities + items');
    assert(typeof res.summary.description === 'string' && res.summary.description.length > 0, 'description present');
    assert(Array.isArray(res.summary.errors), 'errors is an array');
  }

  // ── 16. manifest contract (inert-by-default + pool semantics) ──
  console.log('\n[16] manifest contract');
  {
    assert(MANIFEST.step === 3, 'step 3');
    assert(MANIFEST.data_operation_default === 'add', 'data_operation_default add');
    assert(MANIFEST.pool_precondition === 'empty_ok', 'pool_precondition empty_ok');
    assert(MANIFEST.item_key === 'url', 'item_key url');
    assert(MANIFEST.cost === 'medium', 'cost medium');
    assert(Array.isArray(MANIFEST.options_defaults.providers) && MANIFEST.options_defaults.providers.length === 0, 'default providers empty (inert, Rule 13)');
    assert(MANIFEST.output_schema.flagged_when && Array.isArray(MANIFEST.output_schema.flagged_when.status), 'flagged_when.status present');
  }

  console.log(`\n${'='.repeat(50)}\nTOTAL: ${pass} passed, ${fail} failed\n`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('HARNESS ERROR:', e);
  process.exit(1);
});
