// Standalone regression tests. All requests and time are mocked; no keys/network.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const manifest = require('./manifest.json');
let now = 100000, waits = [];
const sandbox = { module: { exports: {} }, process: { env: {} }, URL, URLSearchParams,
  Date: class extends Date { static now() { return now; } },
  setTimeout: (fn, ms) => { waits.push(ms); now += ms; fn(); } };
vm.runInNewContext(fs.readFileSync(require.resolve('./execute.js'), 'utf8'), sandbox);
const execute = sandbox.module.exports;
const provider = { id: 'test', kind: 'serp', method: 'POST', endpoints: { web: 'https://search.test/api' },
  query_param: 'q', num_param: 'num', results_path: 'organic', field_map: { url: 'link', title: 'title', snippet: 'snippet' },
  pagination: { param: 'page', start: 1, step: 1 } };
const response = (items = []) => ({ status: 200, body: { organic: items } });
const item = (id, snippet = '') => ({ link: `https://result.test/${id}`, snippet });
function fixture(handler, options = {}) {
  const calls = [], logs = [], partial = [];
  const tools = { logger: Object.fromEntries(['info','warn','error'].map(k => [k, m => logs.push(m)])),
    progress: { update() {} }, _partialItems: partial,
    http: { post: async (url, body, opts) => { calls.push({ url, body, at: now }); return handler(body, calls.length, partial, opts); },
      get: async (url, opts) => { const body = Object.fromEntries(new URL(url).searchParams); calls.push({ url, body, at: now }); return handler(body, calls.length, partial, opts); },
      head: async () => ({ status: 200 }) } };
  return { calls, logs, partial, async run(entities = [{ name: 'Example' }]) {
    const result = await execute({ entities }, { ...manifest.options_defaults, providers: [provider], query_templates: ['{entity_name}'],
      requests_per_minute: 0, max_pages_per_query: 6, ...options }, tools);
    // Convert VM-realm objects before strict equality checks.
    return JSON.parse(JSON.stringify(result));
  } };
}
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log('PASS', name); }
(async () => {
  await test('POST pages 1–6, short pages continue, partial items and provenance', async () => {
    const f = fixture((b, n, partial) => { assert.equal(partial.length, n - 1); return response([item(b.page)]); });
    const r = await f.run();
    assert.deepEqual(f.calls.map(c => c.body.page), [1,2,3,4,5,6]);
    assert.equal(r.results[0].items.length, 6);
    assert.equal(r.results[0].meta.search_routes[0].stop_reason, 'page_limit');
    assert.equal(f.partial[5].entity_name, 'Example');
    assert.equal(f.partial[5].search_provenance[0].page, 6);
  });
  await test('default one page is backward compatible', async () => {
    const noPagination = { ...provider }; delete noPagination.pagination;
    const f = fixture(() => response([item('one')]), { max_pages_per_query: 1, providers: [noPagination] });
    await f.run(); assert.equal(f.calls.length, 1); assert.equal(f.calls[0].body.page, undefined);
  });
  await test('unconfigured provider never repeats identical requests', async () => {
    const p = { ...provider }; delete p.pagination;
    const f = fixture(() => response([]), { providers: [p] });
    const r = await f.run(); assert.equal(f.calls.length, 1);
    assert.equal(r.results[0].meta.search_routes[0].stop_reason, 'pagination_not_configured');
  });
  await test('two consecutive empty arrays stop; one empty page can recover', async () => {
    const f = fixture(b => response(b.page === 2 ? [item('recovered')] : []));
    const r = await f.run(); assert.equal(f.calls.length, 4);
    assert.equal(r.results[0].items.length, 1);
    assert.equal(r.results[0].meta.search_routes[0].stop_reason, 'empty_pages');
  });
  await test('duplicate stop is local to query and richer snippets survive', async () => {
    const f = fixture((b, n) => response([item('same', 'x'.repeat(n))]), { query_templates: ['a', 'b'] });
    const r = await f.run(); assert.equal(f.calls.length, 8);
    assert.equal(r.results[0].items.length, 1);
    assert.equal(r.results[0].items[0].search_provenance.length, 8);
    assert.equal(r.results[0].items[0].snippet, 'xxxxxxxx');
    assert.deepEqual(r.results[0].meta.search_routes.map(x => x.stop_reason), ['duplicate_pages','duplicate_pages']);
  });
  await test('breadth first across queries, sites and providers; shared request budget', async () => {
    const f = fixture(b => response([item(`${b.q}/${b.page}`)]), { search_mode: 'site_restricted', site_list: 'one.test\ntwo.test',
      providers: [provider, { ...provider, id: 'second' }], max_search_requests_per_entity: 5 });
    const r = await f.run(); assert.deepEqual(f.calls.map(c => c.body.page), [1,1,1,1,2]);
    assert.deepEqual(f.calls.slice(0,4).map(c => c.body.q), ['Example site:one.test','Example site:two.test','Example site:one.test','Example site:two.test']);
    assert.equal(r.results[0].meta.search_requests, 5);
    assert.ok(r.results[0].meta.search_routes.every(x => x.stop_reason === 'request_limit'));
  });
  await test('GET offsets and existing endpoint parameters are preserved', async () => {
    const p = { ...provider, method: 'GET', endpoints: { web: 'https://search.test/api?locale=en' },
      pagination: { param: 'start', start: 0, step: 'page_size' } };
    const f = fixture(b => response([item(b.start)]), { providers: [p], max_pages_per_query: 3, max_results_per_query: 10 });
    await f.run(); assert.deepEqual(f.calls.map(c => c.body.start), ['0','10','20']);
    assert.ok(f.calls.every(c => c.body.locale === 'en'));
  });
  await test('site filter arrays persist on every POST page', async () => {
    const p = { ...provider, site_filter: { type: 'param', name: 'domains', format: 'array' } };
    const f = fixture(b => response([item(b.page)]), { providers: [p], search_mode: 'site_restricted', site_list: 'one.test' });
    await f.run(); assert.ok(f.calls.every(c => c.body.domains[0] === 'one.test' && c.body.q === 'Example'));
  });
  await test('400 restrictions are errors, not exhaustion; other queries continue', async () => {
    const f = fixture(b => b.q === 'a' && b.page === 2 ? { status: 400, body: { message: 'account restriction' } } : response([item(`${b.q}${b.page}`)]), { query_templates: ['a','b'] });
    const r = await f.run(); const routes = r.results[0].meta.search_routes;
    assert.equal(routes[0].stop_reason, 'provider_http_error'); assert.equal(routes[1].pages.length, 6);
    assert.deepEqual(routes[0].pages[1].statuses, [400]);
  });
  await test('429 retries same page, honors Retry-After and global spacing', async () => {
    const f = fixture((b,n) => n === 1 ? { status: 429, headers: { 'Retry-After': '3' } } : response([item(b.page)]), { requests_per_minute: 120, max_pages_per_query: 2 });
    const r = await f.run(); assert.deepEqual(f.calls.map(c => c.body.page), [1,1,2]);
    assert.ok(f.calls[1].at - f.calls[0].at >= 3000); assert.ok(f.calls[2].at - f.calls[1].at >= 500);
    assert.deepEqual(r.results[0].meta.search_routes[0].pages[0].statuses, [429,200]);
  });
  await test('429 retries bounded and provider disabled across entities', async () => {
    const f = fixture(() => ({ status: 429 }), { query_templates: ['a','b'] });
    const r = await f.run([{ name: 'A' }, { name: 'B' }]); assert.equal(f.calls.length, 3);
    assert.ok(r.results.every(e => e.meta.search_routes.every(q => q.stop_reason === 'provider_rate_limit')));
  });
  await test('request budget includes retries', async () => {
    const f = fixture(() => ({ status: 429 }), { max_search_requests_per_entity: 1 });
    const r = await f.run(); assert.equal(f.calls.length, 1);
    assert.equal(r.results[0].meta.search_routes[0].stop_reason, 'request_limit');
  });
  await test('long Retry-After stops rather than retrying early', async () => {
    const f = fixture(() => ({ status: 429, headers: { 'retry-after': '120' } }));
    const r = await f.run(); assert.equal(f.calls.length, 1);
    assert.equal(r.results[0].meta.search_routes[0].stop_reason, 'provider_cooldown');
  });
  await test('401/402/403 stop provider across entities, isolate other providers', async () => {
    for (const status of [401,402,403]) {
      const f = fixture(b => b.secret ? { status } : response([item(b.page)]), { providers: [{ ...provider, extra_params: { secret: true } }, { ...provider, id: 'other' }], max_pages_per_query: 2 });
      const r = await f.run([{ name: 'A' }, { name: 'B' }]);
      assert.equal(f.calls.filter(c => c.body.secret).length, 1); assert.equal(f.calls.length, 5);
      assert.ok(r.results.every(e => e.items.length === 2));
    }
  });
  await test('malformed JSON, missing result arrays, and unmapped URLs are not empty pages', async () => {
    for (const body of ['{broken', {}, { organic: {} }, { organic: [{ title: 'No URL' }] }]) {
      const f = fixture(() => ({ status: 200, body })); const r = await f.run();
      assert.equal(f.calls.length, 1); assert.equal(r.results[0].meta.search_routes[0].stop_reason, 'invalid_response');
    }
  });
  await test('transport failures preserve prior pages and do not log secrets', async () => {
    const f = fixture(b => { if (b.page === 2) throw new Error('url?api_key=SECRET'); return response([item('first')]); });
    const r = await f.run(); assert.equal(f.partial.length, 1); assert.equal(r.results[0].meta.search_requests, 2);
    assert.equal(r.results[0].meta.search_routes[0].stop_reason, 'request_error');
    assert.ok(!f.logs.join('').includes('SECRET'));
  });
  await test('query/template truncation is visible in metadata', async () => {
    const f = fixture(() => response([]), { query_templates: ['a','b','c','{alt_names}'], max_queries_per_entity: 2 });
    const r = await f.run(); const m = r.results[0].meta;
    assert.equal(m.queries_planned_per_provider, 3); assert.equal(m.queries_truncated_per_provider, 1); assert.equal(m.templates_skipped, 1);
  });
  await test('invalid options and pagination conflicts fail before making requests', async () => {
    for (const options of [{ max_pages_per_query: 0 }, { max_pages_per_query: 1.5 }, { max_search_requests_per_entity: -1 },
      { providers: [{ ...provider, pagination: { param: 'q' } }] }, { providers: [{ ...provider, pagination: { param: 'page', step: 0 } }] }]) {
      const f = fixture(() => response([]), options); await assert.rejects(f.run()); assert.equal(f.calls.length, 0);
    }
  });
  await test('pagination can be restricted to configured verticals', async () => {
    const f = fixture(() => response([]), { providers: [{ ...provider, pagination: { param: 'page', result_types: ['news'] } }] });
    const r = await f.run(); assert.equal(f.calls.length, 1);
    assert.equal(r.results[0].meta.search_routes[0].stop_reason, 'pagination_not_configured');
  });
  await test('offset steps use effective page size after extra_params overrides', async () => {
    const p = { ...provider, pagination: { param: 'offset', start: 0, step: 'page_size' }, extra_params: { num: 5 } };
    const f = fixture(b => response([item(b.offset)]), { providers: [p], max_pages_per_query: 3, max_results_per_query: 10 });
    await f.run(); assert.deepEqual(f.calls.map(c => c.body.offset), [0,5,10]);
    assert.ok(f.calls.every(c => c.body.num === 5));
    const noCount = { ...p }; delete noCount.num_param;
    const bad = fixture(() => response([]), { providers: [noCount] }); await assert.rejects(bad.run()); assert.equal(bad.calls.length, 0);
  });
  await test('configured HTTP 400 account exhaustion disables provider; other 400 stays query-local', async () => {
    const p = { ...provider, account_limit_errors: [{ status: 400, message_path: 'message', contains: 'not enough credits' }] };
    const f = fixture(() => ({ status: 400, body: JSON.stringify({ message: 'Not enough credits' }) }), { providers: [p], query_templates: ['a','b'] });
    const r = await f.run([{ name: 'A' }, { name: 'B' }]); assert.equal(f.calls.length, 1);
    assert.ok(r.results.every(e => e.meta.search_routes.every(q => q.stop_reason === 'provider_account_limit')));
    const g = fixture(() => ({ status: 400, body: { message: 'Query pattern not allowed' } }), { providers: [p], query_templates: ['a','b'] });
    const other = await g.run(); assert.equal(g.calls.length, 2);
    assert.ok(other.results[0].meta.search_routes.every(q => q.stop_reason === 'provider_http_error'));
  });
  await test('SERP results enrich lookup duplicates with full metadata in either provider order', async () => {
    const serp = { ...provider, field_map: { ...provider.field_map, pub_date: 'date', image_url: 'image' } };
    const lookup = { id: 'lookup', kind: 'lookup', url_template: 'https://result.test/same' };
    for (const providers of [[serp, lookup], [lookup, serp]]) {
      const f = fixture(() => response([{ ...item('same', 'Article evidence'), date: '2026-09-10', image: 'https://result.test/photo.jpg' }]),
        { providers, max_pages_per_query: 1 });
      const r = await f.run(); const found = r.results[0].items[0];
      assert.equal(r.results[0].items.length, 1);
      assert.equal(found.pub_date, '2026-09-10');
      assert.equal(found.image_url, 'https://result.test/photo.jpg');
      assert.equal(found.query_used, 'Example');
      assert.equal(found.source, 'test');
      assert.equal(found.found_via, 'search-discovery:open');
      assert.equal(found.search_provenance.length, 1);
      assert.equal(f.partial.length, 1);
      assert.equal(f.partial[0].pub_date, found.pub_date);
      assert.equal(f.partial[0].entity_name, 'Example');
    }
  });
  console.log(`${passed} pagination scenarios passed`);
})().catch(error => { console.error(error); process.exitCode = 1; });
