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
 * v1.2.0 adds [29-34]: the emit_text_content bridge — off-mode byte-identity
 *   (additive-only proof), on-mode text_content = raw_text + word_count, a free
 *   in-repo integration through the real content-filter (Bright Data LinkedIn-company
 *   fixture → KEPT with text for content-analyzer), empty-updates[] and no-match/
 *   not_found paths.
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
  process.env.TEST_AF_BEARER = 'tok-xyz';
  delete process.env.TEST_AF_MISSING_KEY;
  delete process.env.TEST_AF_MISSING_BEARER;

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

  // ── 17. GET is the default method (regression: no method -> http.get, never http.post) ──
  console.log('\n[17] default method is GET (no method field)');
  {
    const p = {
      id: 'getdefault', response_format: 'json', identifier_source: { entity_field: 'cid' },
      endpoints: [{ id: 'e', url: 'https://api.test/list', params: { id: '{identifier}' }, results_path: 'items', field_map: { url: 'u' } }],
    };
    const tools = makeTools({ get: async () => json(200, { items: [{ u: 'https://r.test/1' }] }) });
    const res = await execute(makeInput([{ name: 'X', cid: 'C1' }]), { ...defaults, providers: [p] }, tools);
    assert(tools.calls.get.length === 1, 'endpoint with no method uses http.get');
    assert(tools.calls.post.length === 0, 'http.post never called for a default (GET) endpoint');
    assert(res.results[0].items.length === 1, 'GET path still maps items (unchanged behaviour)');
  }

  // ── 18. POST endpoint sends the body with placeholders interpolated ──
  console.log('\n[18] POST endpoint sends interpolated body');
  {
    const p = {
      id: 'poster', response_format: 'json', identifier_source: { entity_field: 'cid' },
      endpoints: [{
        id: 'run', method: 'POST', url: 'https://api.test/run-sync',
        body: { query: '{identifier}', limit: '{max_items}' },
        results_path: 'data', field_map: { url: 'link', title: 'name' },
      }],
    };
    const tools = makeTools({
      post: async () => json(200, { data: [{ link: 'https://r.test/a', name: 'A' }] }),
    });
    const res = await execute(
      makeInput([{ name: 'X', cid: 'ID123' }]),
      { ...defaults, providers: [p], max_items: 25 },
      tools
    );
    assert(tools.calls.post.length === 1, 'POST endpoint calls http.post');
    assert(tools.calls.get.length === 0, 'POST endpoint does not call http.get');
    // body is passed as an object; the skeleton's http.post JSON-stringifies it downstream.
    const sent = tools.calls.post[0].body;
    assert(sent.query === 'ID123', '{identifier} interpolated into body');
    assert(sent.limit === '25', '{max_items} interpolated into body (string, like params)');
    assert(res.results[0].items.length === 1 && res.results[0].items[0].url === 'https://r.test/a', 'POST response mapped through field_map');
  }

  // ── 19. Top-level JSON array response maps via field_map with results_path omitted ──
  console.log('\n[19] top-level array response, no results_path');
  {
    const p = {
      id: 'toparray', response_format: 'json', identifier_source: { entity_field: 'cid' },
      // no results_path — response is a bare top-level array (Apify run-sync-get-dataset-items shape)
      endpoints: [{ id: 'e', url: 'https://api.test/items', params: { id: '{identifier}' }, field_map: { url: 'permalink', title: 'headline' } }],
    };
    const tools = makeTools({
      get: async () => ({ status: 200, headers: {}, body: JSON.stringify([
        { permalink: 'https://r.test/1', headline: 'One' },
        { permalink: 'https://r.test/2', headline: 'Two' },
      ]) }),
    });
    const res = await execute(makeInput([{ name: 'X', cid: 'C1' }]), { ...defaults, providers: [p] }, tools);
    const items = res.results[0].items;
    assert(items.length === 2, 'bare top-level array treated as the record list');
    assert(items[0].url === 'https://r.test/1' && items[1].title === 'Two', 'field_map dot-paths resolve per array element');
  }

  // ── 20. bearer auth emits exactly "Authorization: Bearer <token>" ──
  console.log('\n[20] bearer auth header');
  {
    const p = {
      id: 'bear', response_format: 'json', identifier_source: { entity_field: 'cid' },
      auth: { type: 'bearer', env_var: 'TEST_AF_BEARER' },
      endpoints: [{ id: 'e', url: 'https://api.test/b', params: { id: '{identifier}' }, results_path: 'items', field_map: { url: 'u' } }],
    };
    const tools = makeTools({ get: async () => json(200, { items: [{ u: 'https://r.test/1' }] }) });
    await execute(makeInput([{ name: 'X', cid: 'C1' }]), { ...defaults, providers: [p] }, tools);
    const call = tools.calls.get.find((c) => c.url.includes('/b'));
    assert(call && call.opts.headers.Authorization === 'Bearer tok-xyz', 'Authorization header is exactly "Bearer <token>"');
  }

  // ── 21. Missing env var for bearer -> provider skipped (same as other auth types) ──
  console.log('\n[21] missing bearer env var skips provider');
  {
    const p = {
      id: 'bearnokey', response_format: 'json', identifier_source: { entity_field: 'cid' },
      auth: { type: 'bearer', env_var: 'TEST_AF_MISSING_BEARER' },
      endpoints: [{ id: 'e', url: 'https://api.test/b', params: { id: '{identifier}' }, results_path: 'items', field_map: { url: 'u' } }],
    };
    const tools = makeTools({ get: async () => json(200, { items: [{ u: 'https://r.test/1' }] }) });
    const res = await execute(makeInput([{ name: 'X', cid: 'C1' }]), { ...defaults, providers: [p] }, tools);
    assert(tools.calls.get.length === 0, 'no HTTP call for bearer provider with missing env var');
    assert(tools.logs.some((l) => l.level === 'warn' && /TEST_AF_MISSING_BEARER/.test(l.message)), 'warning names the missing bearer env var');
    assert(res.results[0].items.length === 0, 'no items');
  }

  // ── 22. Unsupported method warns and falls back to GET ──
  console.log('\n[22] unsupported method warns, falls back to GET');
  {
    const p = {
      id: 'putish', response_format: 'json', identifier_source: { entity_field: 'cid' },
      endpoints: [{ id: 'e', method: 'PUT', url: 'https://api.test/x', params: { id: '{identifier}' }, results_path: 'items', field_map: { url: 'u' } }],
    };
    const tools = makeTools({ get: async () => json(200, { items: [{ u: 'https://r.test/1' }] }) });
    const res = await execute(makeInput([{ name: 'X', cid: 'C1' }]), { ...defaults, providers: [p] }, tools);
    assert(tools.calls.get.length === 1 && tools.calls.post.length === 0, 'unsupported method falls back to GET (no POST)');
    assert(tools.logs.some((l) => l.level === 'warn' && /unsupported method/i.test(l.message)), 'unsupported method is warned');
    assert(res.results[0].items.length === 1, 'GET fallback still maps items');
  }

  // ── 23. POST body interpolates at depth (nested object, array, non-string leaves) ──
  console.log('\n[23] POST body interpolation at depth');
  {
    const p = {
      id: 'deep', response_format: 'json', identifier_source: { entity_field: 'cid' },
      endpoints: [{
        id: 'run', method: 'POST', url: 'https://api.test/deep',
        body: { filter: { q: '{identifier}' }, tags: ['{identifier}', 'static'], limit: 5, active: true, note: null },
        results_path: 'data', field_map: { url: 'u' },
      }],
    };
    const tools = makeTools({ post: async () => json(200, { data: [{ u: 'https://r.test/1' }] }) });
    await execute(makeInput([{ name: 'X', cid: 'ID9' }]), { ...defaults, providers: [p], max_items: 25 }, tools);
    const sent = tools.calls.post[0].body;
    assert(sent.filter && sent.filter.q === 'ID9', 'nested-object string leaf interpolated');
    assert(Array.isArray(sent.tags) && sent.tags[0] === 'ID9' && sent.tags[1] === 'static', 'array string leaves interpolated');
    assert(sent.limit === 5 && sent.active === true && sent.note === null, 'non-string leaves (number/boolean/null) pass through untouched');
  }

  // ── 24. HTTP 201 (Apify run-sync success code) is accepted, not treated as an error ──
  console.log('\n[24] 2xx success: HTTP 201 response is accepted');
  {
    const p = {
      id: 'sync201', response_format: 'json', identifier_source: { entity_field: 'cid' },
      endpoints: [{
        id: 'run', method: 'POST', url: 'https://api.test/run-sync',
        body: { q: '{identifier}' },
        field_map: { url: 'link', title: 'name' },
      }],
    };
    const tools = makeTools({
      post: async () => ({ status: 201, headers: {}, body: JSON.stringify([{ link: 'https://r.test/a', name: 'A' }]) }),
    });
    const res = await execute(makeInput([{ name: 'X', cid: 'C1' }]), { ...defaults, providers: [p] }, tools);
    const items = res.results[0].items;
    assert(items.length === 1 && items[0].url === 'https://r.test/a', 'HTTP 201 response mapped through field_map (2xx accepted)');
    assert((res.results[0].meta.errors || 0) === 0, 'HTTP 201 is not counted as an error');
  }

  // ── 25. empty_is_error: a 2xx returning zero records is an error, not a silent not_found ──
  // Regression: the v1.1.1 2xx fix moved Apify's `201 []` from the error branch into the
  // success branch, where an empty result becomes a not_found item and errorCount stays 0.
  // A provider whose endpoint MUST return a record (e.g. the harvestapi employees actor,
  // which returns 201 [] for every company) opts in via `empty_is_error` to surface that.
  console.log('\n[25] silent-empty guard: empty 2xx is an error when the provider declares empty unexpected');
  {
    const p = {
      id: 'emp-actor', response_format: 'json', empty_is_error: true,
      identifier_source: { entity_field: 'cid' },
      endpoints: [{
        id: 'run', method: 'POST', url: 'https://api.test/run-sync',
        body: { q: '{identifier}' }, field_map: { url: 'link', title: 'name' },
      }],
    };
    const tools = makeTools({ post: async () => ({ status: 201, headers: {}, body: '[]' }) });
    const res = await execute(makeInput([{ name: 'X', cid: 'C1' }]), { ...defaults, providers: [p] }, tools);
    const meta = res.results[0].meta;
    const item = res.results[0].items[0];
    assert(meta.errors === 1, 'empty 2xx increments error count when empty_is_error is set');
    assert(meta.status === 'error', 'entity meta.status is "error" on an unexpected empty');
    assert(item && item.status === 'error', 'empty item carries status "error" (not "not_found")');
    assert(item && item.reason === 'empty_result', 'empty item carries a distinguishable reason code (vs a failed request)');
  }

  // ── 26. default (flag off): empty 2xx stays a not_found and is NOT an error ──
  console.log('\n[26] default: empty 2xx remains a not_found and is not counted as an error');
  {
    const p = {
      id: 'lookup', response_format: 'json',
      identifier_source: { entity_field: 'cid' },
      endpoints: [{
        id: 'run', method: 'POST', url: 'https://api.test/run-sync',
        body: { q: '{identifier}' }, field_map: { url: 'link' },
      }],
    };
    const tools = makeTools({ post: async () => ({ status: 201, headers: {}, body: '[]' }) });
    const res = await execute(makeInput([{ name: 'X', cid: 'C1' }]), { ...defaults, providers: [p] }, tools);
    const meta = res.results[0].meta;
    assert(meta.errors === 0, 'no flag: empty 2xx is not an error (existing behaviour preserved)');
    assert(res.results[0].items[0].status === 'not_found', 'no flag: empty 2xx stays a not_found item');
    assert(meta.status === 'ok', 'no flag: entity meta.status is "ok"');
  }

  // ── 27. E1: promote name + current_company_name to top-level when the field_map maps them ──
  // (LinkedIn-people provider: the decision-maker-selector roster needs the person's name and the
  //  company both readable at the top level of the pool item, not buried in data_json.)
  console.log('\n[27] E1: name + current_company_name promoted to top-level when mapped');
  {
    const p = {
      id: 'li-people', response_format: 'json', identifier_source: { entity_field: 'company_name' },
      endpoints: [{
        id: 'search', method: 'POST', url: 'https://api.test/search', results_path: 'hits',
        field_map: { name: 'name', title: 'position', current_company_name: 'current_company_name', url: 'url' },
      }],
    };
    const tools = makeTools({
      post: async () => json(200, { hits: [
        { name: 'Maxim C.', position: 'CEO and Co-Founder', current_company_name: 'Vegangster', url: 'https://li.test/maxim' },
      ] }),
    });
    const res = await execute(makeInput([{ name: 'Vegangster', company_name: 'Vegangster' }]), { ...defaults, providers: [p] }, tools);
    const item = res.results[0].items[0];
    assert(item.name === 'Maxim C.', 'E1: name promoted to top-level from field_map');
    assert(item.current_company_name === 'Vegangster', 'E1: current_company_name promoted to top-level from field_map');
    assert(item.title === 'CEO and Co-Founder', 'E1: existing title mapping unchanged');
    assert(item.url === 'https://li.test/maxim', 'E1: existing url mapping unchanged');
  }

  // ── 28. E1 inertness: a provider whose field_map omits name/current_company_name gets no such keys,
  //        even when the raw record itself carries those fields. Item shape stays byte-identical to v1.1.2. ──
  console.log('\n[28] E1 inert: no name/current_company_name keys when the field_map omits them');
  {
    const p = {
      id: 'plain', response_format: 'json', identifier_source: { entity_field: 'cid' },
      endpoints: [{ id: 'e', url: 'https://api.test/items', results_path: 'data', field_map: { url: 'link', title: 'headline' } }],
    };
    const tools = makeTools({
      get: async () => json(200, { data: [{ link: 'https://r.test/a', headline: 'A', name: 'ShouldNotLeak', current_company_name: 'NoLeakCo' }] }),
    });
    const res = await execute(makeInput([{ name: 'X', cid: 'C1' }]), { ...defaults, providers: [p] }, tools);
    const item = res.results[0].items[0];
    assert(!('name' in item), 'E1 inert: no top-level name key when field_map omits it');
    assert(!('current_company_name' in item), 'E1 inert: no top-level current_company_name key when field_map omits it');
    assert(item.url === 'https://r.test/a' && item.title === 'A', 'E1 inert: existing item shape unchanged');
  }

  // ── emit_text_content bridge (v1.2.0) — LinkedIn-company Datasets Search shape ──
  //
  // Live-schema note (verified 2026-08-11 raw sample + 2026-08-25 pushgaming.com probe,
  //   brightdata-live-findings-2026-08-11/): the Bright Data company dataset
  //   (gd_l1vikfnt1wgvvqz95w) Search route returns { hits, total_hits, took }; each hit
  //   carries the top-level fields used in the field_map below (url, name, about,
  //   description, specialties, industries, company_size, headquarters, followers) plus a
  //   `updates[]` array of recent posts { date, text, post_url, likes_count, title }.
  //   `updates` is bimodal per record: populated to the 10-post cap, or empty [].
  //   This fixture mirrors that shape; it is not a live call.
  process.env.BRIGHTDATA_API_KEY = 'test-bd-key-dummy';

  const LI_RECORD = {
    url: 'https://www.linkedin.com/company/push-gaming',
    name: 'Push Gaming',
    about: 'Push Gaming is a game studio that designs and builds premium slot games for the online casino industry. We are trusted by operators around the world for a player-first design philosophy.',
    description: 'Push Gaming | 12,000 followers on LinkedIn. Premium slot games built for the regulated online casino market.',
    specialties: 'Slot games, Game development, iGaming, HTML5 games',
    industries: 'Computer Games',
    company_size: '51-200 employees',
    headquarters: 'London, England',
    followers: 12000,
    updates: [
      { date: '2026-08-07T08:43:35.969Z', text: 'We are thrilled to announce the launch of our newest slot game, which brings a fresh mechanic to the reels and has already been a hit with players in early testing.', post_url: 'https://www.linkedin.com/posts/push-gaming_launch-activity-1', likes_count: 42, title: 'Push Gaming' },
      { date: '2026-07-30T10:00:00.000Z', text: 'Our team had a fantastic time at the industry conference this week, meeting operators and partners from across the world.', post_url: 'https://www.linkedin.com/posts/push-gaming_conf-activity-2', likes_count: 30, title: 'Push Gaming' },
    ],
  };

  // The paste-ready README provider block (kept in sync with README.md).
  const LI_PROVIDER = {
    id: 'linkedin-company',
    name: 'Bright Data — LinkedIn Company (Datasets Search, synchronous)',
    response_format: 'json',
    auth: { type: 'bearer', env_var: 'BRIGHTDATA_API_KEY' },
    identifier_source: { entity_field: 'website' },
    empty_is_error: true,
    endpoints: [{
      id: 'search', method: 'POST',
      url: 'https://api.brightdata.com/datasets/search/gd_l1vikfnt1wgvvqz95w',
      body: { size: 1, filter: { name: 'website', operator: 'includes', value: '{identifier}' } },
      results_path: 'hits',
      field_map: {
        url: 'url', title: 'name', about: 'about', description: 'description',
        specialties: 'specialties', industries: 'industries', company_size: 'company_size',
        headquarters: 'headquarters', followers: 'followers', updates: 'updates',
      },
    }],
  };

  const liMock = (record) => makeTools({ post: async () => json(200, { hits: record ? [record] : [], total_hits: record ? 1 : 0 }) });
  const liInput = () => makeInput([{ name: 'Push Gaming', website: 'pushgaming.com' }]);

  // ── 29. emit_text_content OFF (default): output byte-identical to legacy contract ──
  //   (a) no item carries text_content / word_count keys; (b) the ONLY difference between
  //   off and on is those two additive keys — strip them from the on-output and it deep-
  //   equals the off-output, proving the change is purely additive (nothing else moves).
  console.log('\n[29] emit_text_content OFF is byte-identical (additive-only proof)');
  {
    const off = await execute(liInput(), { ...defaults, providers: [LI_PROVIDER] }, liMock(LI_RECORD));
    const offItems = off.results[0].items;
    assert(offItems.length === 1, 'off: one company item');
    assert(!('text_content' in offItems[0]) && !('word_count' in offItems[0]), 'off: no text_content/word_count keys (legacy shape)');

    const on = await execute(liInput(), { ...defaults, providers: [LI_PROVIDER], emit_text_content: true }, liMock(LI_RECORD));
    const strip = (arr) => arr.map((it) => { const c = { ...it }; delete c.text_content; delete c.word_count; return c; });
    assert(JSON.stringify(strip(on.results[0].items)) === JSON.stringify(offItems),
      'on minus {text_content,word_count} === off output (purely additive, byte-identical)');
  }

  // ── 30. emit_text_content ON: text_content mirrors raw_text; word_count is a real count ──
  console.log('\n[30] emit_text_content ON mirrors raw_text into text_content + word_count');
  {
    const res = await execute(liInput(), { ...defaults, providers: [LI_PROVIDER], emit_text_content: true }, liMock(LI_RECORD));
    const item = res.results[0].items[0];
    assert(item.status === 'success', 'on: success item');
    assert(item.text_content === item.raw_text, 'on: text_content is exactly the flattened raw_text');
    assert(item.text_content.length > 0, 'on: text_content non-empty');
    assert(item.word_count === item.raw_text.split(/\s+/).filter(Boolean).length, 'on: word_count = raw_text word count');
    assert(item.text_content.includes('newest slot game'), 'on: updates[] post text is inline in text_content (field_map maps updates)');
  }

  // ── 31. Realistic record survives Step-4 content-filter and reaches the analyzer ──
  //   assembleEntityContent (content-analyzer/execute.js:17-22) concatenates item.text_content;
  //   so "kept with non-empty text_content" == "lands in {entity_content}".
  console.log('\n[31] emit-on record ≥50 words → content-filter KEEPS it → analyzer sees text');
  {
    const contentFilter = require('../../step-4-filtering/content-filter/execute.js');
    const res = await execute(liInput(), { ...defaults, providers: [LI_PROVIDER], emit_text_content: true }, liMock(LI_RECORD));
    const item = res.results[0].items[0];
    assert(item.word_count >= 50, `on: realistic record yields ≥50 words (got ${item.word_count})`);

    const cfTools = makeTools();
    const cf = await contentFilter(
      makeInput([{ name: 'Push Gaming', items: [item] }]),
      {}, // content-filter defaults (min_word_count 50, require_english true)
      cfTools
    );
    const kept = cf.results[0].items.find((i) => i.filter_status === 'kept');
    assert(kept, 'content-filter KEEPS the emit-on company item (not dropped as too-short/non-english)');
    assert(kept && kept.text_content && kept.text_content.length > 0, 'kept item carries text_content for content-analyzer assembleEntityContent');
  }

  // ── 32. Empty updates[] (bimodal record) still clears 50 words from profile fields ──
  console.log('\n[32] empty updates[] record still ≥50 words (profile fields) and kept');
  {
    const contentFilter = require('../../step-4-filtering/content-filter/execute.js');
    const noUpdates = { ...LI_RECORD, updates: [] };
    const res = await execute(liInput(), { ...defaults, providers: [LI_PROVIDER], emit_text_content: true }, liMock(noUpdates));
    const item = res.results[0].items[0];
    assert(item.status === 'success', 'empty-updates: still a success record');
    assert(!item.text_content.includes('newest slot game'), 'empty-updates: no post text (updates were [])');
    assert(item.word_count >= 50, `empty-updates: profile fields alone clear 50 words (got ${item.word_count})`);
    const cf = await contentFilter(makeInput([{ name: 'Push Gaming', items: [item] }]), {}, makeTools());
    assert(cf.results[0].items.some((i) => i.filter_status === 'kept'), 'empty-updates: content-filter still keeps it');
  }

  // ── 33. No-match (empty hits) with emit on + empty_is_error → error item, empty text ──
  console.log('\n[33] no-match: error item carries text_content "" / word_count 0 (filtered by design)');
  {
    const res = await execute(liInput(), { ...defaults, providers: [LI_PROVIDER], emit_text_content: true }, liMock(null));
    const item = res.results[0].items[0];
    assert(item.status === 'error' && item.reason === 'empty_result', 'no-match: empty_is_error surfaces an error item');
    assert(item.text_content === '' && item.word_count === 0, 'no-match: emit-on error item has empty text_content and word_count 0');
    // and the parallel not_found path (empty_is_error OFF) with emit on:
    const lookup = { ...LI_PROVIDER, id: 'lookup', empty_is_error: false };
    const res2 = await execute(liInput(), { ...defaults, providers: [lookup], emit_text_content: true }, liMock(null));
    const nf = res2.results[0].items[0];
    assert(nf.status === 'not_found', 'not_found: empty hits without empty_is_error stays not_found');
    assert(nf.text_content === '' && nf.word_count === 0, 'not_found: emit-on not_found item has empty text_content and word_count 0');
  }

  // ── 34. Option arrives as the string "true" (UI storage) → fields still emitted ──
  console.log('\n[34] emit_text_content = "true" (string) enables the bridge');
  {
    const res = await execute(liInput(), { ...defaults, providers: [LI_PROVIDER], emit_text_content: 'true' }, liMock(LI_RECORD));
    const item = res.results[0].items[0];
    assert('text_content' in item && item.text_content.length > 0, 'string "true" parsed as on: text_content emitted');
    // a non-"true" string must NOT enable it (only true / "true")
    const off = await execute(liInput(), { ...defaults, providers: [LI_PROVIDER], emit_text_content: 'false' }, liMock(LI_RECORD));
    assert(!('text_content' in off.results[0].items[0]), 'string "false" stays off (no text_content)');
  }

  console.log(`\n${'='.repeat(50)}\nTOTAL: ${pass} passed, ${fail} failed\n`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('HARNESS ERROR:', e);
  process.exit(1);
});
