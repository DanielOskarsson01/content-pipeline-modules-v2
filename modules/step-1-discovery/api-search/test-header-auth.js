/**
 * Standalone test harness for api-search custom-header auth (BACKLOG #48/#46).
 *
 * Run: node modules/step-1-discovery/api-search/test-header-auth.js
 * From repo root.
 *
 * Covers the new per-provider `headers` map (static custom headers with
 * {env:VAR} interpolation) alongside the existing bearer / query_param auth:
 *   - custom header interpolated from env and applied to the request (Pexels:
 *     `Authorization: <key>`, no "Bearer" prefix)
 *   - multiple + static (non-env) custom headers
 *   - {env:VAR} referencing a MISSING var -> provider skipped with a warning
 *   - $-safe interpolation (env value with $&/$$ is not mangled)
 *   - backwards-compat: bearer auth still `Authorization: Bearer <key>`
 *   - backwards-compat: query_param auth still puts the key in the URL
 *   - no `headers` -> getProviderHeaders returns {} (no regression)
 *
 * All HTTP mocked. No credentials, no network.
 */

const execute = require('./execute.js');
const { getProviderHeaders, interpolateEnvTokens, collectHeaderEnvRefs } = execute.__testing;

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
    http: {
      get: async (url, opts) => {
        calls.get.push({ url, opts });
        return getHandler ? getHandler(url, opts) : { status: 200, headers: {}, body: '{}' };
      },
    },
  };
}

function makeInput(entities) {
  return { entities, run_id: 'test', step_index: 1, submodule_id: 'api-search' };
}

// A Pexels-shaped search provider using the new custom `headers` map.
function pexelsProvider(extra = {}) {
  return {
    id: 'pexels', name: 'Pexels', mode: 'search',
    url: 'https://api.pexels.com/v1/search', keyword_param: 'query', limit_param: 'per_page',
    results_path: 'photos',
    field_map: { url: 'url', title: 'alt', externalId: 'id' },
    headers: { Authorization: '{env:PEXELS_API_KEY}' },
    ...extra,
  };
}

const baseOptions = { search_input: 'keywords', keywords: ['nature'], max_results: 5, requests_per_minute: 0 };

async function main() {
  process.env.PEXELS_API_KEY = 'test-pexels-key-123';
  delete process.env.AS_MISSING_KEY;

  // ── 1. Unit: interpolateEnvTokens ──
  console.log('\n[1] interpolateEnvTokens');
  assert(interpolateEnvTokens('{env:PEXELS_API_KEY}') === 'test-pexels-key-123', 'interpolates a present env var');
  assert(interpolateEnvTokens('X {env:AS_MISSING_KEY} Y') === 'X  Y', 'missing env var -> empty');
  assert(interpolateEnvTokens('literal-value') === 'literal-value', 'no token -> verbatim');

  // ── 1b. $-safe interpolation ──
  console.log('\n[1b] $-safe interpolation');
  process.env.AS_DOLLAR_KEY = 'a$&b$$c$1d';
  assert(interpolateEnvTokens('{env:AS_DOLLAR_KEY}') === 'a$&b$$c$1d', 'env value with $ sequences interpolated verbatim');
  delete process.env.AS_DOLLAR_KEY;

  // ── 2. Unit: collectHeaderEnvRefs ──
  console.log('\n[2] collectHeaderEnvRefs');
  assert(JSON.stringify(collectHeaderEnvRefs({ A: '{env:FOO}', B: 'static', C: '{env:BAR}' })) === JSON.stringify(['FOO', 'BAR']), 'collects env refs across header values');
  assert(collectHeaderEnvRefs({}).length === 0 && collectHeaderEnvRefs(undefined).length === 0, 'empty / undefined -> []');

  // ── 3. Unit: getProviderHeaders ──
  console.log('\n[3] getProviderHeaders');
  assert(getProviderHeaders(pexelsProvider()).Authorization === 'test-pexels-key-123', 'custom header interpolated (Pexels: raw key, no "Bearer")');
  assert(JSON.stringify(getProviderHeaders({ id: 'x' })) === '{}', 'no auth / no headers -> {} (backwards-compat)');
  assert(getProviderHeaders({ id: 'b', auth: { type: 'bearer', env_var: 'PEXELS_API_KEY' } }).Authorization === 'Bearer test-pexels-key-123', 'bearer auth still works');
  const multi = getProviderHeaders({ id: 'm', headers: { 'X-Auth-Key': '{env:PEXELS_API_KEY}', 'X-Static': 'v1' } });
  assert(multi['X-Auth-Key'] === 'test-pexels-key-123' && multi['X-Static'] === 'v1', 'multiple + static custom headers all applied');

  // ── 4. End-to-end: custom header applied to the request ──
  console.log('\n[4] custom header reaches the HTTP request');
  {
    const tools = makeTools(() => ({ status: 200, headers: {}, body: JSON.stringify({ photos: [{ url: 'https://pexels.test/1', alt: 'a cat', id: 42 }] }) }));
    const res = await execute(makeInput([{ name: 'Cats' }]), { ...baseOptions, providers: [pexelsProvider()] }, tools);
    assert(tools.calls.get.length === 1, 'one request made');
    assert(tools.calls.get[0].opts.headers.Authorization === 'test-pexels-key-123', 'Authorization header carries the raw key (no Bearer)');
    assert(res.results[0].items.length === 1 && res.results[0].items[0].url === 'https://pexels.test/1', 'item produced from the response');
  }

  // ── 5. Missing env var referenced by headers -> provider skipped ──
  console.log('\n[5] missing header env var -> provider skipped');
  {
    const p = pexelsProvider({ headers: { Authorization: '{env:AS_MISSING_KEY}' } });
    const tools = makeTools(() => ({ status: 200, headers: {}, body: '{"photos":[]}' }));
    const res = await execute(makeInput([{ name: 'Cats' }]), { ...baseOptions, providers: [p] }, tools);
    assert(tools.calls.get.length === 0, 'no request made when the header env var is missing');
    assert(tools.logs.some(l => l.level === 'warn' && /AS_MISSING_KEY/.test(l.message)), 'warning names the missing env var');
    assert(res.results[0].items.length === 0, 'no items');
  }

  // ── 6. Backwards-compat: query_param auth still puts the key in the URL ──
  console.log('\n[6] query_param auth (backwards-compat)');
  {
    process.env.AS_QP_KEY = 'qp-secret';
    const p = {
      id: 'pixabay', name: 'Pixabay', mode: 'search',
      url: 'https://pixabay.com/api/', keyword_param: 'q', limit_param: 'per_page',
      results_path: 'hits', field_map: { url: 'pageURL', externalId: 'id' },
      auth: { type: 'query_param', key: 'key', env_var: 'AS_QP_KEY' },
    };
    const tools = makeTools(() => ({ status: 200, headers: {}, body: JSON.stringify({ hits: [{ pageURL: 'https://pix/1', id: 7 }] }) }));
    const res = await execute(makeInput([{ name: 'Cats' }]), { ...baseOptions, providers: [p] }, tools);
    assert(tools.calls.get[0].url.includes('key=qp-secret'), 'query_param key placed in the URL');
    assert(res.results[0].items.length === 1, 'query_param provider still produces items');
    delete process.env.AS_QP_KEY;
  }

  // ── 7. bearer + custom headers coexist (headers can override) ──
  console.log('\n[7] bearer + headers coexist');
  {
    const p = pexelsProvider({ auth: { type: 'bearer', env_var: 'PEXELS_API_KEY' }, headers: { Authorization: '{env:PEXELS_API_KEY}', 'X-Extra': 'e' } });
    const tools = makeTools(() => ({ status: 200, headers: {}, body: '{"photos":[]}' }));
    await execute(makeInput([{ name: 'Cats' }]), { ...baseOptions, providers: [p] }, tools);
    const h = tools.calls.get[0].opts.headers;
    assert(h.Authorization === 'test-pexels-key-123', 'headers map overrides the bearer Authorization (raw key wins)');
    assert(h['X-Extra'] === 'e', 'extra custom header also present');
  }

  console.log(`\n${'='.repeat(50)}\nTOTAL: ${pass} passed, ${fail} failed\n`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error('HARNESS ERROR:', e); process.exit(1); });
