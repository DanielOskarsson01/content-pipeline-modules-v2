/**
 * keyword-data — mocked fixture tests. No credentials, no network.
 * Run: node modules/step-5-generation/keyword-data/test-keyword-data.js
 */
const assert = require('assert');
const path = require('path');
const execute = require('./execute.js');

let passed = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  passed++;
}

// ── mock tools ─────────────────────────────────────────────────────

function makeTools(responder) {
  const calls = [];
  return {
    calls,
    logger: { info: () => {}, warn: () => {}, error: () => {} },
    progress: { update: () => {} },
    _partialItems: [],
    http: {
      post: async (url, body, opts) => {
        calls.push({ url, body, opts });
        return responder(url, body, opts);
      },
    },
  };
}

function dfsTask(cost, items, statusCode = 20000, statusMessage = 'Ok.') {
  return {
    status: 200,
    body: JSON.stringify({
      status_code: 20000,
      tasks: [{ id: 't', status_code: statusCode, status_message: statusMessage, cost, result: [{ items }] }],
    }),
  };
}

const OVERVIEW_ITEMS = [
  { keyword: 'ELK Studios', keyword_info: { search_volume: 5400, cpc: 0.4, competition: 0.12 }, keyword_properties: { keyword_difficulty: 38 } },
  { keyword: 'game providers', keyword_info: { search_volume: 720, cpc: null, competition: null }, keyword_properties: { keyword_difficulty: 21 } },
  { keyword: 'slot studios', keyword_info: { search_volume: 90, cpc: 1.1, competition: 0.4 }, keyword_properties: { keyword_difficulty: 15 } },
];
const RELATED_ITEMS = [
  { keyword_data: { keyword: 'ELK Studios' } }, // seed echo — must be filtered out
  { keyword_data: { keyword: 'elk studios slots' } },
  { keyword_data: { keyword: 'best slot providers uk' } },
];

const ENTITY_WITH_ANALYSIS = {
  name: 'ELK Studios',
  items: [
    { url: 'https://x.com/a', text_content: 'irrelevant' },
    { entity_name: 'ELK Studios', analysis_json: { primary_category: 'game providers', categories: [{ slug: 'slot studios' }], tags: ['ignored-by-cap?'] } },
  ],
};
const ENTITY_SEED_ONLY = { name: 'Pocket Rockets Gaming', category: 'game providers', items: [] };

const BASE_OPTS = { max_terms: 3, related_terms_for: 1, related_limit: 5, cost_cap_usd: 0.15 };

(async () => {
  process.env.KD_TEST_LOGIN = 'login';
  process.env.KD_TEST_PASSWORD = 'password';
  const provider = {
    id: 'dataforseo_labs',
    base_url: 'https://api.example.test',
    auth: { type: 'basic_env', login_env: 'KD_TEST_LOGIN', password_env: 'KD_TEST_PASSWORD' },
    endpoints: { overview: '/v3/overview', related: '/v3/related' },
  };

  // 1) happy path: analysis_json derivation, full field shape
  {
    const tools = makeTools((url) => url.endsWith('/v3/overview') ? dfsTask(0.0134, OVERVIEW_ITEMS) : dfsTask(0.0128, RELATED_ITEMS));
    const out = await execute({ entities: [ENTITY_WITH_ANALYSIS] }, { ...BASE_OPTS, provider }, tools);
    const r = out.results[0];
    const item = r.items[0];
    ok(item.status === 'success', 'happy: success');
    ok(item.derivation === 'analysis_json', 'happy: derivation analysis_json');
    const kd = item.keyword_data;
    ok(kd && Array.isArray(kd.terms), 'happy: keyword_data.terms array');
    ok(kd.terms.length === 3, 'happy: max_terms=3 respected (name + 2 harvested)');
    const elk = kd.terms.find((t) => t.term === 'ELK Studios');
    ok(elk && elk.volume === 5400 && elk.difficulty === 38 && elk.cpc === 0.4, 'happy: metrics mapped');
    ok(elk.related.includes('elk studios slots') && !elk.related.some((k) => k.toLowerCase() === 'elk studios'), 'happy: related filled for top term, seed echo filtered');
    const other = kd.terms.find((t) => t.term === 'game providers');
    ok(other && Array.isArray(other.related) && other.related.length === 0, 'happy: related empty beyond top-N');
    ok(kd.market === 'United Kingdom' && kd.gsc_terms.length === 0, 'happy: market default + gsc_terms placeholder');
    ok(!Number.isNaN(Date.parse(kd.fetched_at)), 'happy: fetched_at ISO');
    ok(r.meta.api_usage.total_cost_usd === Number((0.0134 + 0.0128).toFixed(6)), 'happy: cost summed from responses');
    ok(r.meta.api_usage.calls.length === 2 && r.meta.api_usage.calls[0].endpoint === 'overview', 'happy: per-call accounting');
    ok(tools._partialItems.length === 1, 'happy: _partialItems pushed');
    ok(tools.calls[0].opts.headers.Authorization.startsWith('Basic '), 'happy: basic auth header');
    ok(Array.isArray(tools.calls[0].body) && tools.calls[0].body[0].keywords.length === 3, 'happy: task body is array with keywords');
  }

  // 1b) grouped-taxonomy analysis_json (the production content-analyzer shape:
  //     categories.{primary}[] / tags.{existing}[] objects with slug entries)
  {
    const grouped = {
      name: 'ELK Studios',
      items: [{
        entity_name: 'ELK Studios',
        analysis_json: JSON.stringify({
          categories: { primary: [{ slug: 'game-providers', why: 'x' }], secondary: [{ slug: 'slot-studios' }] },
          tags: { existing: [{ slug: 'slots' }, { slug: 'studio' }], new: [] },
          key_facts: { founded: '2013' },
        }),
      }],
    };
    const tools = makeTools(() => dfsTask(0.013, OVERVIEW_ITEMS));
    const out = await execute({ entities: [grouped] }, { ...BASE_OPTS, max_terms: 12, related_terms_for: 0, provider }, tools);
    const item = out.results[0].items[0];
    ok(item.derivation === 'analysis_json', 'grouped: analysis_json derivation');
    const sent = tools.calls[0].body[0].keywords;
    ok(sent.includes('game-providers') && sent.includes('slot-studios') && sent.includes('slots') && sent.includes('studio'), 'grouped: slugs harvested from grouped objects');
    ok(sent[0] === 'ELK Studios' && sent.length === 5, 'grouped: name + 4 slugs, key_facts not harvested');
  }

  // 2) seed-fields fallback
  {
    const tools = makeTools(() => dfsTask(0.011, [{ keyword: 'Pocket Rockets Gaming', keyword_info: { search_volume: 30 }, keyword_properties: { keyword_difficulty: 5 } }]));
    const out = await execute({ entities: [ENTITY_SEED_ONLY] }, { ...BASE_OPTS, related_terms_for: 0, provider }, tools);
    const item = out.results[0].items[0];
    ok(item.status === 'success' && item.derivation === 'seed_fields', 'fallback: seed_fields derivation');
    ok(item.keyword_data.terms.some((t) => t.term === 'game providers'), 'fallback: seed category harvested');
    ok(tools.calls.length === 1, 'fallback: related disabled makes exactly 1 call');
  }

  // 3) missing credentials — global loud failure
  {
    const badProvider = { ...provider, auth: { type: 'basic_env', login_env: 'KD_ABSENT_L', password_env: 'KD_ABSENT_P' } };
    const tools = makeTools(() => { throw new Error('must not be called'); });
    const out = await execute({ entities: [ENTITY_WITH_ANALYSIS, ENTITY_SEED_ONLY] }, { ...BASE_OPTS, provider: badProvider }, tools);
    ok(out.results.length === 2 && out.results.every((r) => r.meta.status === 'error'), 'creds: every entity meta error');
    ok(out.results.every((r) => r.items[0].status === 'error' && /missing credentials/.test(r.items[0].error)), 'creds: loud error items');
    ok(out.summary.errors.length > 0, 'creds: summary errors non-empty');
    ok(tools.calls.length === 0, 'creds: zero network calls');
  }

  // 4) provider task error (auth/quota, e.g. 40200/40203) — loud per entity,
  //    and a rejected task's nonzero cost still counts against accounting
  {
    const tools = makeTools(() => dfsTask(0.005, [], 40203, 'The money limit per day has been exceeded'));
    const out = await execute({ entities: [ENTITY_WITH_ANALYSIS] }, { ...BASE_OPTS, provider }, tools);
    const item = out.results[0].items[0];
    ok(item.status === 'error' && /40203/.test(item.error), 'quota: loud error with provider code');
    ok(out.results[0].meta.status === 'error', 'quota: meta.status error');
    ok(out.results[0].meta.api_usage.total_cost_usd === 0.005, 'quota: rejected-task cost still counted');
  }

  // 4b) malformed provider JSON — loud global failure, never a silent default fallback
  {
    const tools = makeTools(() => { throw new Error('must not be called'); });
    const out = await execute({ entities: [ENTITY_WITH_ANALYSIS] }, { ...BASE_OPTS, provider: '{broken json' }, tools);
    ok(out.results[0].items[0].status === 'error' && /JSON parse failure/.test(out.results[0].items[0].error), 'provider-json: loud parse failure');
    ok(tools.calls.length === 0, 'provider-json: zero network calls');
  }

  // 5) HTTP-level failure — loud
  {
    const tools = makeTools(() => ({ status: 429, body: 'slow down' }));
    const out = await execute({ entities: [ENTITY_WITH_ANALYSIS] }, { ...BASE_OPTS, provider }, tools);
    ok(out.results[0].items[0].status === 'error' && /HTTP 429/.test(out.results[0].items[0].error), 'http: loud 429');
  }

  // 6) cost cap trips before related — loud, partial data preserved, no further calls
  {
    const tools = makeTools((url) => url.endsWith('/v3/overview') ? dfsTask(0.2, OVERVIEW_ITEMS) : dfsTask(0.0128, RELATED_ITEMS));
    const out = await execute({ entities: [ENTITY_WITH_ANALYSIS] }, { ...BASE_OPTS, provider }, tools);
    const item = out.results[0].items[0];
    ok(item.status === 'error' && /cost cap/.test(item.error), 'cap: loud error');
    ok(item.keyword_data && item.keyword_data.terms.length === 3, 'cap: partial keyword_data preserved');
    ok(tools.calls.length === 1, 'cap: related call not made');
  }

  // 7) empty candidate terms: success-with-empty by default, error when empty_is_error
  {
    const bare = { name: '', items: [] };
    const tools = makeTools(() => { throw new Error('must not be called'); });
    const out = await execute({ entities: [bare] }, { ...BASE_OPTS, provider }, tools);
    ok(out.results[0].items[0].status === 'success' && out.results[0].items[0].keyword_data.terms.length === 0, 'empty: soft by default');
    const out2 = await execute({ entities: [bare] }, { ...BASE_OPTS, provider, empty_is_error: true }, tools);
    ok(out2.results[0].items[0].status === 'error', 'empty: loud when empty_is_error');
  }

  // 8) multi-market: overview per market, other_markets present, related only for primary
  {
    const tools = makeTools((url, body) => {
      if (url.endsWith('/v3/overview')) return dfsTask(0.0134, OVERVIEW_ITEMS);
      return dfsTask(0.0128, RELATED_ITEMS);
    });
    const out = await execute({ entities: [ENTITY_WITH_ANALYSIS] }, { ...BASE_OPTS, provider, markets: ['United Kingdom', 'Brazil'] }, tools);
    const kd = out.results[0].items[0].keyword_data;
    ok(kd.market === 'United Kingdom' && kd.other_markets && kd.other_markets[0].market === 'Brazil', 'markets: primary + other_markets');
    const overviewCalls = tools.calls.filter((c) => c.url.endsWith('/v3/overview'));
    const relatedCalls = tools.calls.filter((c) => c.url.endsWith('/v3/related'));
    ok(overviewCalls.length === 2 && relatedCalls.length === 1, 'markets: 2 overview + 1 related');
    ok(relatedCalls[0].body[0].location_name === 'United Kingdom', 'markets: related on primary only');
  }

  // 8b) multi-market secondary failure preserves the primary market's billed data
  {
    let n = 0;
    const tools = makeTools((url) => {
      if (url.endsWith('/v3/overview')) { n++; return n === 1 ? dfsTask(0.0134, OVERVIEW_ITEMS) : dfsTask(0.002, [], 40501, 'Invalid Field'); }
      return dfsTask(0.0128, RELATED_ITEMS);
    });
    const out = await execute({ entities: [ENTITY_WITH_ANALYSIS] }, { ...BASE_OPTS, provider, markets: ['United Kingdom', 'Brazil'] }, tools);
    const item = out.results[0].items[0];
    ok(item.status === 'error' && /overview\(Brazil\)/.test(item.error), 'mm-fail: loud secondary-market error');
    ok(item.keyword_data && item.keyword_data.terms.length === 3 && item.keyword_data.market === 'United Kingdom', 'mm-fail: primary data preserved');
    ok(!tools.calls.some((c) => c.url.endsWith('/v3/related')), 'mm-fail: no further spend after error');
    ok(out.results[0].meta.api_usage.total_cost_usd === Number((0.0134 + 0.002).toFixed(6)), 'mm-fail: both call costs counted');
  }

  // 9) markets option accepts JSON string and comma string
  {
    const tools = makeTools(() => dfsTask(0.01, OVERVIEW_ITEMS));
    const out = await execute({ entities: [ENTITY_SEED_ONLY] }, { ...BASE_OPTS, related_terms_for: 0, provider, markets: '["Brazil"]' }, tools);
    ok(out.results[0].items[0].keyword_data.market === 'Brazil', 'markets: JSON string parsed');
    const out2 = await execute({ entities: [ENTITY_SEED_ONLY] }, { ...BASE_OPTS, related_terms_for: 0, provider, markets: 'Brazil, United Kingdom' }, tools);
    const kd2 = out2.results[0].items[0].keyword_data;
    ok(kd2.market === 'Brazil' && kd2.other_markets && kd2.other_markets[0].market === 'United Kingdom', 'markets: comma string parsed');
  }

  // 10) manifest contract sanity
  {
    const manifest = require(path.join(__dirname, 'manifest.json'));
    for (const f of ['id', 'name', 'description', 'version', 'step', 'category', 'cost', 'data_operation_default', 'pool_precondition', 'requires_columns', 'item_key', 'output_schema']) {
      ok(manifest[f] !== undefined, `manifest: ${f} present`);
    }
    ok(manifest.id === 'keyword-data' && manifest.step === 5 && manifest.item_key === 'entity_name', 'manifest: identity');
    ok(manifest.data_operation_default === 'add' && manifest.pool_precondition === 'empty_ok', 'manifest: pool contract');
    ok(manifest.output_schema.downloadable_fields.some((d) => d.field === 'keyword_data'), 'manifest: keyword_data downloadable (§7b persistence)');
    ok(manifest.output_schema.flagged_when.status.includes('error'), 'manifest: flagged_when error');
    ok(JSON.stringify(manifest.options_defaults.provider) === JSON.stringify(manifest.options.find((o) => o.key === 'provider').default), 'manifest: provider default mirrored');
  }

  console.log(`keyword-data tests: ${passed} assertions passed`);
})().catch((err) => {
  console.error('TEST FAILURE:', err.message);
  process.exit(1);
});
