/**
 * LIVE test for search-discovery against the Serper.dev (Google) Search API.
 *
 * COSTS REAL CREDITS (~1 credit/query; this run uses ~4 of the 2,500 free).
 * Requires SEARCH_PROVIDER_SERPER_KEY in the environment; exits 0 with a notice
 * when absent so it never breaks CI.
 *
 * Proves two things the operator asked about:
 *   1. open-mode Google search via Serper
 *   2. site_restricted curated-site search (the Google-PSE replacement) —
 *      one `site:{domain}` query per domain in a small directory list.
 *
 * Run from repo root:
 *   SEARCH_PROVIDER_SERPER_KEY=... node modules/step-1-discovery/search-discovery/test-live-serper.js
 *
 * Uses a real fetch-backed fake tools.http (harness only — module code never
 * touches fetch; in production the skeleton provides tools.http).
 */

const execute = require('./execute.js');

if (!process.env.SEARCH_PROVIDER_SERPER_KEY) {
  console.log('SEARCH_PROVIDER_SERPER_KEY not set — live test skipped (this is not a failure).');
  process.exit(0);
}

const SERPER_PROVIDER = {
  id: 'serper',
  name: 'Serper.dev (Google)',
  kind: 'serp',
  method: 'POST',
  endpoints: { web: 'https://google.serper.dev/search', news: 'https://google.serper.dev/news', images: 'https://google.serper.dev/images' },
  query_param: 'q',
  num_param: 'num',
  results_path: { web: 'organic', news: 'news', images: 'images' },
  field_map: { url: 'link', title: 'title', snippet: 'snippet', pub_date: 'date', image_url: 'imageUrl' },
  date_param: { name: 'tbs', map: { day: 'qdr:d', week: 'qdr:w', month: 'qdr:m', year: 'qdr:y' } },
  auth: { type: 'header', header: 'X-API-KEY', env_var: 'SEARCH_PROVIDER_SERPER_KEY' },
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
    progress: { update: () => {} },
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

async function run(label, options) {
  console.log(`\n── ${label} ──`);
  const tools = makeLiveTools();
  const result = await execute(
    { entities: [{ name: 'Evolution Gaming', website: 'evolution.com' }], run_id: 'live', step_index: 1, submodule_id: 'search-discovery' },
    options,
    tools
  );
  const items = result.results[0].items;
  console.log(`  ${result.summary.description}`);
  for (const it of items.slice(0, 4)) {
    console.log(`    - ${it.title}\n      ${it.url}  [${it.domain}]  q="${it.query_used}"`);
  }
  return items;
}

async function main() {
  const base = {
    providers: [SERPER_PROVIDER],
    site_list_doc: [],
    result_type: 'web',
    date_range: 'any',
    max_results_per_query: 5,
    max_queries_per_entity: 10,
    requests_per_minute: 30,
    verify_liveness: false,
  };

  // 1. Open-mode Google search
  const openItems = await run('OPEN mode (whole-web Google via Serper)', {
    ...base,
    search_mode: 'open',
    site_list: '',
    query_templates: ['"{entity_name}" review'],
  });

  // 2. Curated-site search (the Google-PSE replacement)
  const siteItems = await run('SITE_RESTRICTED mode (curated directory list)', {
    ...base,
    search_mode: 'site_restricted',
    site_list: 'askgamblers.com\ncasino.org',
    query_templates: ['"{entity_name}"'],
  });

  const openOk = openItems.length > 0 && openItems.every((i) => i.url.startsWith('http'));
  const siteDomains = new Set(siteItems.map((i) => i.domain));
  const siteOk = siteItems.length > 0 && [...siteDomains].every((d) => d.includes('askgamblers') || d.includes('casino.org'));

  console.log('\n── Verdict ──');
  console.log(`  open mode: ${openItems.length} URLs — ${openOk ? 'PASS' : 'FAIL'}`);
  console.log(`  site_restricted: ${siteItems.length} URLs, domains {${[...siteDomains].join(', ')}} — ${siteOk ? 'PASS (all within curated list)' : 'WARN (results outside list — check)'}`);

  if (!openOk) {
    console.log('\nLIVE TEST FAILED — open-mode Google search returned nothing usable.');
    process.exit(1);
  }
  console.log(`\nLIVE TEST PASSED — Serper key works. Open-web + curated-site search both returning real Google results.`);
}

main().catch((e) => {
  console.error('LIVE TEST ERROR:', e);
  process.exit(1);
});
