/**
 * Standalone test harness for seo-planner v2.3.0 — keyword_data_providers layer.
 *
 * Run: node modules/step-5-generation/seo-planner/test-keyword-data.js
 * From repo root.
 *
 * Covers the ADDITIVE keyword-data extension (unit 4.6):
 *   - Inert-when-empty (the zero-regression guarantee: no providers → no I/O, no output change)
 *   - deriveSeedKeywords generic (Rule-13) seed extraction
 *   - autocomplete expansion handler (mocked tools.http.get)
 *   - dataforseo metrics handler (inert without creds; parse with creds; Basic auth)
 *   - gsc metrics handler (REAL RS256 JWT signing verified with a throwaway keypair; mocked http)
 *   - orchestrator budget cap (per_run_budget_usd refuses paid lookups, warns, continues)
 *   - metrics_required loud-fail on empty (W1.1 discipline — never silent)
 *   - normalizeMetricRow schema + merge-by-keyword
 *   - renderKeywordMetricsTable
 *   - execute.js integration: providers:[] → seo_plan_json backbone byte-unchanged (no keyword_metrics key)
 *   - execute.js integration: metrics provider → additive seo_plan_json.keyword_metrics, backbone intact
 *   - buildPrompt {keyword_metrics} no-op safety + $-replacement safety
 *
 * No network. tools.http and tools.ai are mocked. GSC uses an in-test RSA keypair,
 * so the real signing code path runs with zero real credentials.
 */

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const execute = require('./execute.js');
const kd = require('./keyword-data-providers.js');
const { buildPrompt } = execute.__testing;
const {
  fetchKeywordData,
  deriveSeedKeywords,
  normalizeMetricRow,
  renderKeywordMetricsTable,
  buildGscJwt,
  __handlers,
} = kd;

let pass = 0;
let fail = 0;
function assert(cond, msg) {
  if (cond) { console.log(`  PASS: ${msg}`); pass++; }
  else { console.log(`  FAIL: ${msg}`); fail++; }
}

function makeTools({ httpGet, httpPost, aiText } = {}) {
  const calls = { get: [], post: [] };
  const logs = [];
  return {
    calls,
    logs,
    logger: {
      info: (m) => logs.push({ level: 'info', message: m }),
      warn: (m) => logs.push({ level: 'warn', message: m }),
      error: (m) => logs.push({ level: 'error', message: m }),
    },
    progress: { update: () => {} },
    http: {
      get: async (url, opts) => {
        calls.get.push({ url, opts });
        if (httpGet) return httpGet(url, opts);
        return { status: 200, headers: {}, body: '[]', url };
      },
      post: async (url, body, opts) => {
        calls.post.push({ url, body, opts });
        if (httpPost) return httpPost(url, body, opts);
        return { status: 200, headers: {}, body: '{}' };
      },
    },
    ai: {
      complete: async () => ({
        text: aiText || '{"target_keywords":{"primary":"p","secondary":["s"],"long_tail":["lt"]},"keyword_sources":{"primary":"analysis","secondary":["analysis"],"long_tail":["analysis"]},"keyword_distribution":{},"meta":{"title":"T","description":"D"},"faqs":[],"tone_notes":"n","warnings":[]}',
        citations: [],
      }),
    },
    _partialItems: [],
  };
}

const base64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

(async () => {
  // ------------------------------------------------------------------
  // A. Inert when empty — the zero-regression guarantee
  // ------------------------------------------------------------------
  console.log('\n=== A. Inert when providers empty (no I/O, no output) ===');
  for (const providers of [[], undefined, '[]', '   ', 'not-json']) {
    const tools = makeTools();
    const out = await fetchKeywordData({ providers, entityName: 'E', seeds: ['e'] }, tools);
    const label = JSON.stringify(providers);
    assert(Array.isArray(out.keyword_metrics) && out.keyword_metrics.length === 0, `A(${label}): keyword_metrics is empty`);
    assert(out.warnings.length === 0, `A(${label}): no warnings`);
    assert(out.provider_ids.length === 0, `A(${label}): no provider_ids`);
    assert(tools.calls.get.length === 0 && tools.calls.post.length === 0, `A(${label}): ZERO http calls (no network when inert)`);
  }

  // ------------------------------------------------------------------
  // B. deriveSeedKeywords — generic (Rule 13) extraction
  // ------------------------------------------------------------------
  console.log('\n=== B. deriveSeedKeywords generic extraction ===');
  {
    const seeds = deriveSeedKeywords(
      { name: 'Acme Corp' },
      {
        analysis_json: {
          primary_category: 'payments',
          industry: 'igaming',
          categories: ['casino platforms', { name: 'sportsbook' }, { slug: 'lottery' }],
          tags: ['b2b', { name: 'b2b' }],
          keywords: ['acme api'],
        },
      },
      25,
    );
    assert(seeds.includes('Acme Corp'), 'B: entity name is always a seed');
    assert(seeds.includes('payments') && seeds.includes('igaming'), 'B: primary_category + industry pulled');
    assert(seeds.includes('casino platforms') && seeds.includes('sportsbook') && seeds.includes('lottery'), 'B: categories as strings and {name}/{slug} pulled');
    assert(seeds.filter((s) => s.toLowerCase() === 'b2b').length === 1, 'B: dedupe is case-insensitive');
    assert(seeds.includes('acme api'), 'B: keywords[] pulled');
  }
  {
    const seeds = deriveSeedKeywords({ name: 'Solo' }, { analysis_json: {} }, 25);
    assert(seeds.length === 1 && seeds[0] === 'Solo', 'B: no analysis fields → just [entity.name]');
  }
  {
    const many = Array.from({ length: 50 }, (_, i) => `kw${i}`);
    const seeds = deriveSeedKeywords({ name: 'Cap' }, { analysis_json: { keywords: many } }, 10);
    assert(seeds.length === 10, 'B: capped at maxSeeds');
  }

  // ------------------------------------------------------------------
  // C. autocomplete expansion handler
  // ------------------------------------------------------------------
  console.log('\n=== C. autocomplete expansion handler ===');
  {
    const tools = makeTools({
      httpGet: async (url) => {
        const q = decodeURIComponent(url.split('q=')[1] || '');
        return { status: 200, headers: {}, body: JSON.stringify([q, [`${q} bonus`, `${q} review`]]), url };
      },
    });
    const out = await __handlers.autocomplete({ id: 'ac', kind: 'autocomplete' }, { seeds: ['casino'], candidate: ['casino'] }, tools, tools.logger);
    assert(out.role === 'expansion', 'C: role is expansion');
    assert(out.keywords.includes('casino bonus') && out.keywords.includes('casino review'), 'C: suggestion strings returned as expansion keywords');
    assert(tools.calls.get.length === 1, 'C: one GET per seed');
  }
  {
    const tools = makeTools({ httpGet: async (url) => ({ status: 429, headers: {}, body: '', url }) });
    const out = await __handlers.autocomplete({ id: 'ac', kind: 'autocomplete' }, { seeds: ['x'], candidate: ['x'] }, tools, tools.logger);
    assert(out.keywords.length === 0 && out.warnings.some((w) => /429|throttl/i.test(w)), 'C: 429 → warning, no throw, no keywords');
  }

  // ------------------------------------------------------------------
  // D. dataforseo metrics handler
  // ------------------------------------------------------------------
  console.log('\n=== D. dataforseo metrics handler ===');
  {
    delete process.env.DATAFORSEO_LOGIN;
    delete process.env.DATAFORSEO_PASSWORD;
    const tools = makeTools();
    const out = await __handlers.dataforseo({ id: 'dfs', kind: 'dataforseo' }, { seeds: ['a'], candidate: ['a'] }, tools, tools.logger);
    assert((out.metrics || []).length === 0, 'D: inert without creds — no metrics');
    assert(out.warnings.some((w) => /inert|credential/i.test(w)), 'D: inert warning names credentials');
    assert(tools.calls.post.length === 0, 'D: inert → no http call');
  }
  {
    process.env.DATAFORSEO_LOGIN = 'login@test';
    process.env.DATAFORSEO_PASSWORD = 'secret';
    let captured = null;
    const tools = makeTools({
      httpPost: async (url, body, opts) => {
        captured = { url, body, opts };
        return {
          status: 200, headers: {},
          body: JSON.stringify({ tasks: [{ result: [{ keyword: 'casino platforms', search_volume: 1900, cpc: 3.1, competition: 0.42 }] }] }),
        };
      },
    });
    const out = await __handlers.dataforseo(
      { id: 'dfs', kind: 'dataforseo', location_code: 2840, language_code: 'en' },
      { seeds: ['casino platforms'], candidate: ['casino platforms'] }, tools, tools.logger,
    );
    assert(out.metrics.length === 1 && out.metrics[0].search_volume === 1900, 'D: parses search_volume');
    assert(out.metrics[0].cpc === 3.1 && out.metrics[0].competition === 0.42, 'D: parses cpc + competition');
    assert(out.metrics[0].source === 'dfs', 'D: source tagged with provider id');
    assert(out.metrics[0].difficulty === null && out.metrics[0].current_rank === null, 'D: absent fields normalized to null');
    assert(captured && /Basic\s+/.test(captured.opts.headers.Authorization), 'D: sends Basic auth header');
    delete process.env.DATAFORSEO_LOGIN;
    delete process.env.DATAFORSEO_PASSWORD;
  }

  // ------------------------------------------------------------------
  // E. gsc metrics handler — REAL RS256 JWT signing
  // ------------------------------------------------------------------
  console.log('\n=== E. gsc metrics handler (real JWT signing, mocked http) ===');
  {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    const tmpKey = path.join(os.tmpdir(), `test-gsc-sa-${process.pid}.json`);
    fs.writeFileSync(tmpKey, JSON.stringify({
      client_email: 'svc@proj.iam.gserviceaccount.com',
      private_key: privateKey,
      token_uri: 'https://oauth2.googleapis.com/token',
    }));
    process.env.TEST_GSC_KEY_PATH = tmpKey;

    // Standalone buildGscJwt signs verifiably with the private key
    const jwt = buildGscJwt(
      { client_email: 'svc@proj.iam.gserviceaccount.com', private_key: privateKey, token_uri: 'https://oauth2.googleapis.com/token' },
      { scope: 'https://www.googleapis.com/auth/webmasters.readonly', nowSec: 1000 },
    );
    const [h, c, s] = jwt.split('.');
    const verified = crypto.createVerify('RSA-SHA256').update(`${h}.${c}`).verify(publicKey, Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64'));
    assert(verified, 'E: buildGscJwt produces a signature that verifies against the public key');
    const claim = JSON.parse(Buffer.from(c.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
    assert(claim.iss === 'svc@proj.iam.gserviceaccount.com', 'E: JWT iss = client_email');
    assert(claim.scope === 'https://www.googleapis.com/auth/webmasters.readonly', 'E: JWT scope = webmasters.readonly');
    assert(claim.aud === 'https://oauth2.googleapis.com/token', 'E: JWT aud = token endpoint');
    assert(claim.exp - claim.iat === 3600, 'E: JWT exp = iat + 3600');

    // Full handler through mocked token + query endpoints
    let tokenCall = null, queryCall = null;
    const tools = makeTools({
      httpPost: async (url, body, opts) => {
        if (url.includes('oauth2.googleapis.com/token')) {
          tokenCall = { url, body, opts };
          return { status: 200, headers: {}, body: JSON.stringify({ access_token: 'ya29.mock', expires_in: 3599 }) };
        }
        if (url.includes('searchAnalytics/query')) {
          queryCall = { url, body, opts };
          return { status: 200, headers: {}, body: JSON.stringify({ rows: [{ keys: ['casino platforms'], clicks: 12, impressions: 340, ctr: 0.035, position: 7.4 }] }) };
        }
        return { status: 404, headers: {}, body: '{}' };
      },
    });
    const out = await __handlers.gsc(
      { id: 'gsc', kind: 'gsc', site_url: 'sc-domain:example.com', auth: { env_var: 'TEST_GSC_KEY_PATH' } },
      { seeds: ['casino platforms'], candidate: ['casino platforms'] }, tools, tools.logger,
    );
    assert(out.role === 'metrics', 'E: gsc role is metrics');
    assert(tokenCall && /application\/x-www-form-urlencoded/.test(tokenCall.opts.headers['Content-Type']), 'E: token exchange uses form-encoding');
    assert(typeof tokenCall.body === 'string' && tokenCall.body.includes('grant_type=') && tokenCall.body.includes('assertion='), 'E: token body is form-encoded jwt-bearer grant');
    assert(queryCall && queryCall.opts.headers.Authorization === 'Bearer ya29.mock', 'E: query call carries Bearer access token');
    assert(queryCall.body.dimensions && queryCall.body.dimensions[0] === 'query', 'E: query body requests the query dimension');
    assert(queryCall.url.includes(encodeURIComponent('sc-domain:example.com')), 'E: site_url is URL-encoded into the path');
    assert(out.metrics.length === 1, 'E: one metric row from the GSC response');
    const row = out.metrics[0];
    assert(row.keyword === 'casino platforms', 'E: keyword from row.keys[0]');
    assert(row.current_rank === 7, 'E: position 7.4 rounded to current_rank 7');
    assert(row.impressions === 340 && row.clicks === 12, 'E: impressions + clicks mapped');
    assert(row.search_volume === null && row.difficulty === null, 'E: GSC-absent fields normalized to null');
    assert(row.source === 'gsc', 'E: source tagged gsc');

    // Inert when env unset
    delete process.env.TEST_GSC_KEY_PATH;
    const tools2 = makeTools();
    const out2 = await __handlers.gsc({ id: 'gsc', kind: 'gsc', site_url: 'sc-domain:example.com', auth: { env_var: 'TEST_GSC_KEY_PATH' } }, { seeds: ['x'], candidate: ['x'] }, tools2, tools2.logger);
    assert((out2.metrics || []).length === 0 && out2.warnings.some((w) => /inert/i.test(w)), 'E: inert when key path env unset — warning, no throw');
    assert(tools2.calls.post.length === 0, 'E: inert gsc → no http call');
    fs.unlinkSync(tmpKey);
  }

  // ------------------------------------------------------------------
  // F. orchestrator budget cap
  // ------------------------------------------------------------------
  console.log('\n=== F. per_run_budget_usd cap ===');
  {
    process.env.DATAFORSEO_LOGIN = 'l';
    process.env.DATAFORSEO_PASSWORD = 'p';
    const tools = makeTools({
      httpPost: async () => ({ status: 200, headers: {}, body: JSON.stringify({ tasks: [{ result: [{ keyword: 'x', search_volume: 10 }] }] }) }),
    });
    const out = await fetchKeywordData({
      providers: [{ id: 'dfs', kind: 'dataforseo', est_cost_per_lookup: 5.0 }],
      entityName: 'E', seeds: ['x'], budgetUsd: 0.5,
    }, tools);
    assert(out.keyword_metrics.length === 0, 'F: paid provider skipped when est cost exceeds budget');
    assert(out.warnings.some((w) => /budget/i.test(w)), 'F: loud budget warning emitted');
    assert(tools.calls.post.length === 0, 'F: no paid http call made past budget');
    delete process.env.DATAFORSEO_LOGIN;
    delete process.env.DATAFORSEO_PASSWORD;
  }

  // ------------------------------------------------------------------
  // G. metrics_required loud-fail on empty (never silent)
  // ------------------------------------------------------------------
  console.log('\n=== G. metrics_required loud-fail ===');
  {
    const tools = makeTools();
    const out = await fetchKeywordData({
      providers: [{ id: 'gsc', kind: 'gsc', site_url: 'sc-domain:x.com', auth: { env_var: 'UNSET_GSC' } }],
      entityName: 'E', seeds: ['x'], metricsRequired: true,
    }, tools);
    assert(out.keyword_metrics.length === 0, 'G: no metrics (provider inert)');
    assert(out.warnings.some((w) => /metrics_required/i.test(w)), 'G: metrics_required → loud warning on empty');
  }
  {
    const tools = makeTools();
    const out = await fetchKeywordData({
      providers: [{ id: 'gsc', kind: 'gsc', site_url: 'sc-domain:x.com', auth: { env_var: 'UNSET_GSC' } }],
      entityName: 'E', seeds: ['x'], metricsRequired: false,
    }, tools);
    assert(!out.warnings.some((w) => /metrics_required/i.test(w)), 'G: no metrics_required warning when flag is false');
  }

  // ------------------------------------------------------------------
  // H. normalizeMetricRow + merge-by-keyword
  // ------------------------------------------------------------------
  console.log('\n=== H. normalize + merge ===');
  {
    const row = normalizeMetricRow({ keyword: 'k', search_volume: 100 }, 'src');
    const keys = ['keyword', 'search_volume', 'difficulty', 'cpc', 'competition', 'current_rank', 'impressions', 'clicks', 'source'];
    assert(keys.every((k) => k in row), 'H: normalized row has the full documented schema');
    assert(row.difficulty === null && row.cpc === null, 'H: absent metric fields are null');
    assert(row.source === 'src', 'H: source set');
  }
  {
    // autocomplete (expansion) + dataforseo (metrics) on the same keyword merge into one row
    process.env.DATAFORSEO_LOGIN = 'l';
    process.env.DATAFORSEO_PASSWORD = 'p';
    const tools = makeTools({
      httpGet: async (url) => ({ status: 200, headers: {}, body: JSON.stringify(['seo', ['seo tools']]), url }),
      httpPost: async () => ({ status: 200, headers: {}, body: JSON.stringify({ tasks: [{ result: [{ keyword: 'seo', search_volume: 500 }, { keyword: 'seo tools', search_volume: 90 }] }] }) }),
    });
    const out = await fetchKeywordData({
      providers: [
        { id: 'ac', kind: 'autocomplete' },
        { id: 'dfs', kind: 'dataforseo', est_cost_per_lookup: 0.0001 },
      ],
      entityName: 'E', seeds: ['seo'], budgetUsd: 5,
    }, tools);
    const seoRow = out.keyword_metrics.find((r) => r.keyword === 'seo');
    const toolsRow = out.keyword_metrics.find((r) => r.keyword === 'seo tools');
    assert(seoRow && seoRow.search_volume === 500, 'H: metrics scored the seed keyword');
    assert(toolsRow && toolsRow.search_volume === 90, 'H: expansion keyword flowed into metrics scoring');
    assert(out.provider_ids.includes('ac') && out.provider_ids.includes('dfs'), 'H: provider_ids records both providers');
    delete process.env.DATAFORSEO_LOGIN;
    delete process.env.DATAFORSEO_PASSWORD;
  }

  // ------------------------------------------------------------------
  // I. renderKeywordMetricsTable
  // ------------------------------------------------------------------
  console.log('\n=== I. renderKeywordMetricsTable ===');
  {
    assert(renderKeywordMetricsTable([]) === '', 'I: empty metrics → empty string');
    const t = renderKeywordMetricsTable([normalizeMetricRow({ keyword: 'casino platforms', search_volume: 1900, current_rank: 7 }, 'gsc')]);
    assert(t.includes('casino platforms') && t.includes('1900') && t.includes('7'), 'I: table shows keyword + numbers');
  }

  // ------------------------------------------------------------------
  // J. execute.js integration
  // ------------------------------------------------------------------
  console.log('\n=== J. execute.js additive integration ===');
  const MANIFEST = require('./manifest.json');
  const analyzerEntity = {
    name: 'Acme',
    items: [{ source_submodule: 'content-analyzer', analysis_json: { primary_category: 'payments', description: 'x' } }],
  };
  const baseOpts = { ...MANIFEST.options_defaults, keyword_research: false };

  {
    // providers:[] (default) → seo_plan_json must NOT gain a keyword_metrics key (zero-regression)
    const tools = makeTools();
    const result = await execute({ entities: [analyzerEntity] }, { ...baseOpts, keyword_data_providers: [] }, tools);
    const item = result.results[0].items[0];
    assert(item.status === 'planned', 'J: default providers → plan produced');
    assert(!('keyword_metrics' in item.seo_plan_json), 'J: providers:[] → seo_plan_json has NO keyword_metrics key (byte-identical backbone)');
    assert(tools.calls.get.length === 0 && tools.calls.post.length === 0, 'J: providers:[] → no keyword-data I/O');
  }
  {
    // metrics provider → additive seo_plan_json.keyword_metrics; backbone intact
    process.env.DATAFORSEO_LOGIN = 'l';
    process.env.DATAFORSEO_PASSWORD = 'p';
    const tools = makeTools({
      httpPost: async (url) => {
        if (url.includes('dataforseo')) return { status: 200, headers: {}, body: JSON.stringify({ tasks: [{ result: [{ keyword: 'payments', search_volume: 800 }] }] }) };
        return { status: 200, headers: {}, body: '{}' };
      },
    });
    const result = await execute(
      { entities: [analyzerEntity] },
      { ...baseOpts, keyword_data_providers: [{ id: 'dfs', kind: 'dataforseo', est_cost_per_lookup: 0.0001 }], per_run_budget_usd: 5 },
      tools,
    );
    const item = result.results[0].items[0];
    assert(item.status === 'planned', 'J: metrics provider → plan produced');
    assert(Array.isArray(item.seo_plan_json.keyword_metrics) && item.seo_plan_json.keyword_metrics.length >= 1, 'J: seo_plan_json.keyword_metrics populated (additive)');
    assert(item.seo_plan_json.target_keywords && item.seo_plan_json.meta && Array.isArray(item.seo_plan_json.faqs), 'J: backbone fields (target_keywords/meta/faqs) intact');
    delete process.env.DATAFORSEO_LOGIN;
    delete process.env.DATAFORSEO_PASSWORD;
  }

  // ------------------------------------------------------------------
  // K. buildPrompt {keyword_metrics} no-op + $-safety
  // ------------------------------------------------------------------
  console.log('\n=== K. buildPrompt {keyword_metrics} placeholder ===');
  {
    const noPlaceholder = 'Plan for {entity_content}. No metrics placeholder.';
    const withArg = buildPrompt(noPlaceholder, 'A', {}, 'R', 0, 'TABLE');
    const withoutArg = buildPrompt(noPlaceholder, 'A', {}, 'R', 0);
    assert(withArg === withoutArg, 'K: prompt without {keyword_metrics} is unaffected by the new arg (backward-compatible)');
  }
  {
    const withPlaceholder = 'Metrics:\n{keyword_metrics}\nEnd.';
    const out = buildPrompt(withPlaceholder, 'A', {}, 'R', 0, 'MYTABLE');
    assert(out.includes('MYTABLE'), 'K: {keyword_metrics} replaced with the metrics table');
  }
  {
    // $-replacement safety: a metrics table containing $& / $1 must inject literally
    const out = buildPrompt('{keyword_metrics}', 'A', {}, 'R', 0, 'cost $5 $& $1 done');
    assert(out === 'cost $5 $& $1 done', 'K: $-sequences in the metrics table inject literally (function replacer)');
  }
  {
    // manifest default prompt has NO {keyword_metrics} — templates opt in via override
    assert(!MANIFEST.options_defaults.prompt.includes('{keyword_metrics}'), 'K: manifest default prompt does NOT contain {keyword_metrics} (opt-in via override only)');
  }

  console.log(`\n=== Result: ${pass} pass, ${fail} fail ===`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('HARNESS ERROR:', e); process.exit(2); });
