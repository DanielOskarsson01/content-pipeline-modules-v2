/**
 * Standalone test harness for search-discovery v1.0.0.
 *
 * Run: node modules/step-1-discovery/search-discovery/test-search-discovery.js
 * From repo root.
 *
 * Covers the v1 contract (brief: docs/submodule-briefs-rev-2026-07-03/step1-google-pse-directories.md):
 *   - serp providers: POST (Serper-shaped) and GET query-param providers
 *   - query templating: {entity_name}, {website_domain}, {site}; missing-field template skip
 *   - open vs site_restricted modes; site: operator vs provider site_filter param
 *   - max_queries_per_entity cap; date_range mapping; header/bearer/query auth
 *   - missing env var -> provider skipped with warning
 *   - dedupe by normalized URL across templates and providers
 *   - per-query errors logged and survived; empty results not an error
 *   - no providers -> loud no-op; site_restricted without site list -> throws
 *   - lookup providers: url_template + HEAD verification
 *   - verify_liveness drops 404s, keeps 403s (bot walls are not dead links)
 *   - _partialItems pushed per query
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
  const calls = { get: [], post: [], head: [] };
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
      head: async (url, opts) => {
        calls.head.push({ url, opts });
        if (handlers.head) return handlers.head(url, opts);
        return { status: 200, headers: {}, body: '' };
      },
    },
  };
}

const defaults = { ...MANIFEST.options_defaults };

function makeInput(entities) {
  return { entities, run_id: 'test-run', step_index: 1, submodule_id: 'search-discovery' };
}

function serperResponse(items) {
  return { status: 200, headers: {}, body: JSON.stringify({ organic: items }) };
}

const SERPER = {
  id: 'serper',
  name: 'Serper.dev',
  kind: 'serp',
  method: 'POST',
  endpoints: { web: 'https://google.serper.dev/search', news: 'https://google.serper.dev/news' },
  query_param: 'q',
  num_param: 'num',
  results_path: { web: 'organic', news: 'news' },
  field_map: { url: 'link', title: 'title', snippet: 'snippet', pub_date: 'date' },
  date_param: { name: 'tbs', map: { day: 'qdr:d', week: 'qdr:w', month: 'qdr:m', year: 'qdr:y' } },
  auth: { type: 'header', header: 'X-API-KEY', env_var: 'TEST_SD_SERPER_KEY' },
};

async function main() {
  process.env.TEST_SD_SERPER_KEY = 'test-key-123';
  delete process.env.TEST_SD_MISSING_KEY;

  // ── 1. Basic POST serp provider: templating, mapping, metadata ──
  console.log('\n[1] POST serp provider basics');
  {
    const tools = makeTools({
      post: async () =>
        serperResponse([
          { link: 'https://askgamblers.com/betsson-review', title: 'Betsson Review', snippet: 'A review', date: '2026-06-01' },
          { link: 'https://askgamblers.com/betsson-news', title: 'Betsson News', snippet: 'News' },
        ]),
    });
    const res = await execute(
      makeInput([{ name: 'Betsson' }]),
      { ...defaults, providers: [SERPER], query_templates: ['"{entity_name}" review'] },
      tools
    );
    assert(tools.calls.post.length === 1, 'one POST call for one template');
    assert(tools.calls.post[0].body && tools.calls.post[0].body.q === '"Betsson" review', 'query rendered with entity name');
    assert(tools.calls.post[0].opts.headers['X-API-KEY'] === 'test-key-123', 'header auth applied');
    const items = res.results[0].items;
    assert(items.length === 2, 'two items mapped');
    assert(items[0].url === 'https://askgamblers.com/betsson-review', 'field_map url');
    assert(items[0].title === 'Betsson Review', 'field_map title');
    assert(items[0].pub_date === '2026-06-01', 'field_map pub_date');
    assert(items[0].source === 'serper', 'source = provider id');
    assert(items[0].domain === 'askgamblers.com', 'domain extracted');
    assert(items[0].result_type === 'web', 'result_type recorded');
    assert(items[0].query_used === '"Betsson" review', 'query_used recorded');
    assert(typeof items[0].found_via === 'string' && items[0].found_via.length > 0, 'found_via present');
    assert(tools._partialItems.length === 2, '_partialItems pushed after query');
  }

  // ── 2. site_restricted fan-out with site: operator ──────────────
  console.log('\n[2] site_restricted fan-out (site: operator)');
  {
    const tools = makeTools({ post: async () => serperResponse([]) });
    await execute(
      makeInput([{ name: 'Betsson' }]),
      {
        ...defaults,
        providers: [SERPER],
        search_mode: 'site_restricted',
        site_list: 'askgamblers.com\n# a comment\nthepogg.com',
        query_templates: ['"{entity_name}"'],
      },
      tools
    );
    assert(tools.calls.post.length === 2, 'one call per site (comment line ignored)');
    assert(tools.calls.post[0].body.q === '"Betsson" site:askgamblers.com', 'site: operator appended');
    assert(tools.calls.post[1].body.q === '"Betsson" site:thepogg.com', 'second site');
  }

  // ── 3. site_filter param provider (no site: operator) ───────────
  console.log('\n[3] site_filter param provider');
  {
    const paramProvider = {
      ...SERPER,
      id: 'perp',
      site_filter: { type: 'param', name: 'search_domain_filter', format: 'array' },
    };
    const tools = makeTools({ post: async () => serperResponse([]) });
    await execute(
      makeInput([{ name: 'Betsson' }]),
      {
        ...defaults,
        providers: [paramProvider],
        search_mode: 'site_restricted',
        site_list: 'askgamblers.com',
        query_templates: ['"{entity_name}"'],
      },
      tools
    );
    assert(tools.calls.post[0].body.q === '"Betsson"', 'query has NO site: operator');
    assert(
      Array.isArray(tools.calls.post[0].body.search_domain_filter) &&
        tools.calls.post[0].body.search_domain_filter[0] === 'askgamblers.com',
      'domain passed via provider param as array'
    );
  }

  // ── 4. max_queries_per_entity cap ────────────────────────────────
  console.log('\n[4] query cap');
  {
    const tools = makeTools({ post: async () => serperResponse([]) });
    await execute(
      makeInput([{ name: 'Betsson' }]),
      {
        ...defaults,
        providers: [SERPER],
        search_mode: 'site_restricted',
        site_list: 's1.com\ns2.com\ns3.com',
        query_templates: ['"{entity_name}"', '{entity_name} news'],
        max_queries_per_entity: 4,
      },
      tools
    );
    assert(tools.calls.post.length === 4, `6 combinations capped to 4 (got ${tools.calls.post.length})`);
    assert(tools.logs.some((l) => l.level === 'warn' && /cap/i.test(l.message)), 'cap logged loudly');
  }

  // ── 5. Missing env var → provider skipped ───────────────────────
  console.log('\n[5] missing env var skips provider');
  {
    const noKey = { ...SERPER, id: 'nokey', auth: { type: 'header', header: 'X-API-KEY', env_var: 'TEST_SD_MISSING_KEY' } };
    const tools = makeTools({ post: async () => serperResponse([{ link: 'https://x.com/a', title: 'A' }]) });
    const res = await execute(
      makeInput([{ name: 'Betsson' }]),
      { ...defaults, providers: [noKey], query_templates: ['{entity_name}'] },
      tools
    );
    assert(tools.calls.post.length === 0, 'no HTTP call made');
    assert(tools.logs.some((l) => l.level === 'warn' && /TEST_SD_MISSING_KEY/.test(l.message)), 'warning names the env var');
    assert(res.results[0].items.length === 0, 'no items');
  }

  // ── 6. Dedupe by normalized URL ──────────────────────────────────
  console.log('\n[6] dedupe by normalized URL');
  {
    const tools = makeTools({
      post: async () =>
        serperResponse([
          { link: 'https://Site.com/Article/', title: 'A' },
          { link: 'https://site.com/Article', title: 'A dupe' },
          { link: 'https://site.com/other', title: 'B' },
        ]),
    });
    const res = await execute(
      makeInput([{ name: 'Betsson' }]),
      { ...defaults, providers: [SERPER], query_templates: ['{entity_name}', '{entity_name} review'] },
      tools
    );
    // 2 queries x 3 results = 6 raw, but only 2 unique after host-lowercase + trailing-slash normalization...
    // note: path case is preserved (paths are case-sensitive on the web) — /Article/ and /Article are the same
    // after trailing-slash strip; host casing normalized.
    assert(res.results[0].items.length === 2, `dedupe leaves 2 unique (got ${res.results[0].items.length})`);
  }

  // ── 7. Per-query error survived ──────────────────────────────────
  console.log('\n[7] per-query error handling');
  {
    let call = 0;
    const tools = makeTools({
      post: async () => {
        call++;
        if (call === 1) throw new Error('socket hangup');
        return serperResponse([{ link: 'https://ok.com/a', title: 'OK' }]);
      },
    });
    const res = await execute(
      makeInput([{ name: 'Betsson' }]),
      { ...defaults, providers: [SERPER], query_templates: ['{entity_name}', '{entity_name} review'] },
      tools
    );
    assert(res.results[0].items.length === 1, 'second query still ran after first failed');
    assert(res.results[0].meta.errors === 1, 'error counted in meta');
    assert(tools.logs.some((l) => l.level === 'error' && /socket hangup/.test(l.message)), 'error logged');
  }

  // ── 8. No providers → loud no-op ─────────────────────────────────
  console.log('\n[8] no providers configured');
  {
    const tools = makeTools();
    const res = await execute(makeInput([{ name: 'Betsson' }]), { ...defaults }, tools);
    assert(res.results.length === 1 && res.results[0].items.length === 0, 'empty results per entity');
    assert(/no.*provider/i.test(res.summary.description), 'summary explains no providers');
  }

  // ── 9. site_restricted without site list → throws ────────────────
  console.log('\n[9] site_restricted without sites is a loud misconfiguration');
  {
    const tools = makeTools();
    let threw = null;
    try {
      await execute(
        makeInput([{ name: 'Betsson' }]),
        { ...defaults, providers: [SERPER], search_mode: 'site_restricted', site_list: '' },
        tools
      );
    } catch (e) {
      threw = e;
    }
    assert(threw && /site_restricted/.test(threw.message), 'throws naming the misconfiguration');
  }

  // ── 10. {website_domain} placeholder + missing-field skip ────────
  console.log('\n[10] website_domain placeholder');
  {
    const tools = makeTools({ post: async () => serperResponse([]) });
    await execute(
      makeInput([{ name: 'Betsson', website: 'https://www.betsson.com/en' }, { name: 'NoSite' }]),
      { ...defaults, providers: [SERPER], query_templates: ['link to {website_domain}'] },
      tools
    );
    assert(tools.calls.post.length === 1, 'only the entity with a website generated a query');
    assert(tools.calls.post[0].body.q === 'link to betsson.com', 'website normalized to bare domain');
    assert(tools.logs.some((l) => l.level === 'warn' && /NoSite/.test(l.message)), 'missing-field skip warned');
  }

  // ── 11. date_range mapping ───────────────────────────────────────
  console.log('\n[11] date_range mapped via provider date_param');
  {
    const tools = makeTools({ post: async () => serperResponse([]) });
    await execute(
      makeInput([{ name: 'Betsson' }]),
      { ...defaults, providers: [SERPER], query_templates: ['{entity_name}'], date_range: 'month' },
      tools
    );
    assert(tools.calls.post[0].body.tbs === 'qdr:m', 'date_range=month → tbs=qdr:m');
  }

  // ── 12. GET provider with query_param + bearer auth ──────────────
  console.log('\n[12] GET provider');
  {
    const getProvider = {
      id: 'getprov',
      kind: 'serp',
      method: 'GET',
      endpoints: { web: 'https://api.example.com/search' },
      query_param: 'q',
      num_param: 'count',
      results_path: 'results',
      field_map: { url: 'u', title: 't' },
      auth: { type: 'bearer', env_var: 'TEST_SD_SERPER_KEY' },
    };
    const tools = makeTools({
      get: async () => ({ status: 200, headers: {}, body: JSON.stringify({ results: [{ u: 'https://r.com/1', t: 'R1' }] }) }),
    });
    const res = await execute(
      makeInput([{ name: 'Betsson' }]),
      { ...defaults, providers: [getProvider], query_templates: ['{entity_name}'], max_results_per_query: 7 },
      tools
    );
    const calledUrl = tools.calls.get[0].url;
    assert(calledUrl.includes('q=Betsson'), 'query in URL');
    assert(calledUrl.includes('count=7'), 'max_results_per_query via num_param');
    assert(tools.calls.get[0].opts.headers.Authorization === 'Bearer test-key-123', 'bearer auth header');
    assert(res.results[0].items[0].url === 'https://r.com/1', 'GET provider items mapped');
  }

  // ── 13. result_type without endpoint → provider skipped ─────────
  console.log('\n[13] provider without endpoint for result_type skipped');
  {
    const tools = makeTools({ post: async () => serperResponse([]) });
    const res = await execute(
      makeInput([{ name: 'Betsson' }]),
      { ...defaults, providers: [SERPER], query_templates: ['{entity_name}'], result_type: 'images' },
      tools
    );
    assert(tools.calls.post.length === 0, 'no call — serper config has no images endpoint');
    assert(tools.logs.some((l) => l.level === 'warn' && /images/.test(l.message)), 'skip warned with the vertical');
    assert(res.results[0].items.length === 0, 'no items');
  }

  // ── 14. lookup provider: url_template + HEAD verify ──────────────
  console.log('\n[14] lookup provider');
  {
    const lookup = {
      id: 'logo-cdn',
      kind: 'lookup',
      url_template: 'https://cdn.logos.test/{website_domain}',
    };
    const tools = makeTools({
      head: async (url) => ({ status: url.includes('betsson') ? 200 : 404, headers: {}, body: '' }),
    });
    const res = await execute(
      makeInput([
        { name: 'Betsson', website: 'betsson.com' },
        { name: 'DeadCo', website: 'deadco.example' },
      ]),
      { ...defaults, providers: [lookup] },
      tools
    );
    assert(tools.calls.head.length === 2, 'HEAD called per entity');
    assert(res.results[0].items.length === 1 && res.results[0].items[0].url === 'https://cdn.logos.test/betsson.com', 'live lookup URL kept');
    assert(res.results[1].items.length === 0, '404 lookup dropped');
  }

  // ── 15. verify_liveness drops 404, keeps 403 ─────────────────────
  console.log('\n[15] verify_liveness');
  {
    const tools = makeTools({
      post: async () =>
        serperResponse([
          { link: 'https://ok.com/live', title: 'Live' },
          { link: 'https://gone.com/dead', title: 'Dead' },
          { link: 'https://walled.com/bot', title: 'Bot-walled' },
        ]),
      head: async (url) => ({
        status: url.includes('gone.com') ? 404 : url.includes('walled.com') ? 403 : 200,
        headers: {},
        body: '',
      }),
    });
    const res = await execute(
      makeInput([{ name: 'Betsson' }]),
      { ...defaults, providers: [SERPER], query_templates: ['{entity_name}'], verify_liveness: true },
      tools
    );
    const urls = res.results[0].items.map((i) => i.url);
    assert(urls.includes('https://ok.com/live'), '200 kept');
    assert(!urls.includes('https://gone.com/dead'), '404 dropped');
    assert(urls.includes('https://walled.com/bot'), '403 kept (bot wall is not a dead link)');
  }

  // ── 16. HTTP non-200 counted, run continues ──────────────────────
  console.log('\n[16] HTTP error status');
  {
    const tools = makeTools({ post: async () => ({ status: 429, headers: {}, body: 'rate limited' }) });
    const res = await execute(
      makeInput([{ name: 'Betsson' }]),
      { ...defaults, providers: [SERPER], query_templates: ['{entity_name}'] },
      tools
    );
    assert(res.results[0].items.length === 0 && res.results[0].meta.errors === 1, '429 counted as error, no throw');
  }

  // ── 16b. Auth failure (401/403) skips the rest of the provider ──
  // Brief: "provider 401/403 → skip provider, loud in meta." Don't keep
  // hammering a dead-auth provider for every remaining query.
  console.log('\n[16b] 401/403 aborts remaining queries for that provider');
  {
    const tools = makeTools({ post: async () => ({ status: 401, headers: {}, body: 'unauthorized' }) });
    const res = await execute(
      makeInput([{ name: 'Betsson' }]),
      { ...defaults, providers: [SERPER], query_templates: ['a {entity_name}', 'b {entity_name}', 'c {entity_name}'] },
      tools
    );
    assert(tools.calls.post.length === 1, `only 1 call despite 3 templates (got ${tools.calls.post.length})`);
    assert(res.results[0].meta.errors >= 1, 'auth failure counted');
    assert(tools.logs.some((l) => l.level === 'warn' && /auth|401|skip/i.test(l.message)), 'auth-skip logged loudly');
  }

  // ── 16c. Auth failure on provider A does not stop provider B ────
  console.log('\n[16c] auth failure isolates to the failing provider');
  {
    const provA = { ...SERPER, id: 'a', endpoints: { web: 'https://a.example/search' } };
    const provB = { ...SERPER, id: 'b', endpoints: { web: 'https://b.example/search' } };
    const tools = makeTools({
      post: async (url) => {
        if (url.startsWith('https://a.example')) return { status: 403, headers: {}, body: 'forbidden' };
        return serperResponse([{ link: 'https://b.com/1', title: 'B1' }]);
      },
    });
    const res = await execute(
      makeInput([{ name: 'X' }]),
      { ...defaults, providers: [provA, provB], query_templates: ['{entity_name}', '{entity_name} more'] },
      tools
    );
    const aCalls = tools.calls.post.filter((c) => c.url.startsWith('https://a.example')).length;
    const bCalls = tools.calls.post.filter((c) => c.url.startsWith('https://b.example')).length;
    assert(aCalls === 1, `provider A aborted after first 403 (got ${aCalls} calls)`);
    assert(bCalls === 2, `provider B ran both its queries (got ${bCalls} calls)`);
    assert(res.results[0].items.some((i) => i.url === 'https://b.com/1'), 'provider B produced items despite A failing');
  }

  // ── 17. Providers option as JSON string (UI storage) ─────────────
  console.log('\n[17] providers option arrives as a JSON string');
  {
    const tools = makeTools({ post: async () => serperResponse([{ link: 'https://s.com/a', title: 'A' }]) });
    const res = await execute(
      makeInput([{ name: 'Betsson' }]),
      { ...defaults, providers: JSON.stringify([SERPER]), query_templates: JSON.stringify(['{entity_name}']) },
      tools
    );
    assert(res.results[0].items.length === 1, 'string-typed providers/query_templates parsed');
  }

  // ── 18. Summary shape ────────────────────────────────────────────
  console.log('\n[18] summary');
  {
    const tools = makeTools({ post: async () => serperResponse([{ link: 'https://s.com/a', title: 'A' }]) });
    const res = await execute(
      makeInput([{ name: 'A' }, { name: 'B' }]),
      { ...defaults, providers: [SERPER], query_templates: ['{entity_name}'] },
      tools
    );
    assert(res.summary.total_entities === 2 && res.summary.total_items === 2, 'summary counts');
    assert(typeof res.summary.description === 'string' && res.summary.description.length > 0, 'description present');
  }

  console.log(`\n${'='.repeat(50)}\nTOTAL: ${pass} passed, ${fail} failed\n`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('HARNESS ERROR:', e);
  process.exit(1);
});
