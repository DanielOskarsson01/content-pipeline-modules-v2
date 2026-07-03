/**
 * LIVE test for search-discovery against the Perplexity Search API.
 *
 * COSTS REAL MONEY (~$0.005/request, 2 requests). Requires PERPLEXITY_API_KEY
 * in the environment; exits 0 with a notice when absent so it never breaks CI.
 *
 * Run from repo root:
 *   PERPLEXITY_API_KEY=... node modules/step-1-discovery/search-discovery/test-live-perplexity.js
 *
 * Uses a real fetch-backed tools.http (test harness only — module code itself
 * never touches fetch; in production the skeleton provides tools.http).
 */

const execute = require('./execute.js');

if (!process.env.PERPLEXITY_API_KEY) {
  console.log('PERPLEXITY_API_KEY not set — live test skipped (this is not a failure).');
  process.exit(0);
}

const PERPLEXITY_PROVIDER = {
  id: 'perplexity',
  name: 'Perplexity Search API',
  kind: 'serp',
  method: 'POST',
  endpoints: { web: 'https://api.perplexity.ai/search' },
  query_param: 'query',
  num_param: 'max_results',
  results_path: 'results',
  field_map: { url: 'url', title: 'title', snippet: 'snippet', pub_date: ['date', 'last_updated'] },
  auth: { type: 'bearer', env_var: 'PERPLEXITY_API_KEY' },
};

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
    progress: { update: (a, b, msg) => console.log(`  [progress] ${a}/${b} ${msg}`) },
    _partialItems: [],
    http: {
      get: async (url, opts = {}) => toResponse(await fetch(url, { method: 'GET', headers: opts.headers || {} })),
      post: async (url, body, opts = {}) =>
        toResponse(
          await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
            body: JSON.stringify(body),
          })
        ),
      head: async (url, opts = {}) => toResponse(await fetch(url, { method: 'HEAD', headers: opts.headers || {} })),
    },
  };
}

async function main() {
  const tools = makeLiveTools();
  const result = await execute(
    {
      entities: [{ name: 'Evolution Gaming', website: 'evolution.com' }],
      run_id: 'live-test',
      step_index: 1,
      submodule_id: 'search-discovery',
    },
    {
      providers: [PERPLEXITY_PROVIDER],
      search_mode: 'open',
      site_list: '',
      site_list_doc: [],
      query_templates: ['"{entity_name}" review', '"{entity_name}" news'],
      result_type: 'web',
      date_range: 'any',
      max_results_per_query: 5,
      max_queries_per_entity: 2,
      requests_per_minute: 30,
      verify_liveness: false,
    },
    tools
  );

  console.log('\n── Summary ──');
  console.log(result.summary.description);
  const items = result.results[0].items;
  console.log(`items: ${items.length}`);
  for (const it of items.slice(0, 5)) {
    console.log(`  - [${it.source}] ${it.title}\n    ${it.url}\n    query: ${it.query_used}`);
  }

  const ok = items.length > 0 && items.every((i) => typeof i.url === 'string' && i.url.startsWith('http'));
  if (!ok) {
    console.log('\nLIVE TEST FAILED — no items or malformed urls. Raw meta:', JSON.stringify(result.results[0].meta));
    process.exit(1);
  }
  console.log(`\nLIVE TEST PASSED — ${items.length} real URLs via Perplexity Search API.`);
}

main().catch((e) => {
  console.error('LIVE TEST ERROR:', e);
  process.exit(1);
});
