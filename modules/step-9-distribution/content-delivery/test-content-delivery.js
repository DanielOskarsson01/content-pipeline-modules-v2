/**
 * Standalone test harness for content-delivery (Unit 5.5 / U1-A).
 *
 * Run: node modules/step-9-distribution/content-delivery/test-content-delivery.js
 * From repo root.
 *
 * All HTTP mocked. No network, no credentials. Covers:
 *   1. happy path — envelope shape exact, POST body correct, headers interpolated
 *   2. no providers configured — loud no-op, zero HTTP calls
 *   3. entity without final_json — skipped + reported, others delivered
 *   4. POST fails (500 + network error) — error item written, others still processed, _partialItems pushed
 *   5. missing env var for a header — provider skipped with a warn (api-search convention), no HTTP
 *   6. secrets — resolved header value absent from every log line and every output item
 *   7. field-shape selection — a pool with markdown-output + json-output items picks the final_json item
 */

const execute = require('./execute.js');

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { console.log(`  PASS: ${msg}`); pass++; }
  else { console.log(`  FAIL: ${msg}`); fail++; }
}

// Mock tools. postHandler(url, body, opts) may return {status,...} or throw.
function makeTools(postHandler) {
  const logs = [];
  const calls = { post: [] };
  return {
    logs, calls,
    _partialItems: [],
    logger: {
      info: (m) => logs.push({ level: 'info', message: String(m) }),
      warn: (m) => logs.push({ level: 'warn', message: String(m) }),
      error: (m) => logs.push({ level: 'error', message: String(m) }),
    },
    progress: { update: () => {} },
    http: {
      post: async (url, body, opts) => {
        calls.post.push({ url, body, opts });
        if (postHandler) return postHandler(url, body, opts);
        return { status: 200, headers: {}, body: 'ok' };
      },
    },
  };
}

function makeInput(entities, run_id = 'run-abc-123') {
  return { run_id, step_index: 9, submodule_id: 'content-delivery', entities };
}

const jsonItem = (name, obj) => ({ entity_name: name, final_json: JSON.stringify(obj) });
const mdItem = (name, md) => ({ entity_name: name, content_markdown: md });

// Collect every output item across the module's per-entity results.
function allItems(res) {
  return (res.results || []).flatMap(r => r.items || []);
}

(async () => {
  // ---- Test 1: happy path ---------------------------------------------------
  console.log('\nTest 1: happy path — envelope + headers');
  {
    process.env.T1_KEY = 'header-value-abc';
    const tools = makeTools(() => ({ status: 200, headers: {}, body: 'received' }));
    const providers = [{
      id: 'u1-webhook', name: 'U1 webhook', type: 'json_post',
      endpoint: 'https://example.test/hook', method: 'POST',
      headers: { 'X-Key': '{env:T1_KEY}' },
      source_field: 'final_json', envelope: true,
    }];
    const input = makeInput([{ name: 'Acme', items: [jsonItem('Acme', { name: 'Acme', content: 'body' })] }]);
    const res = await execute(input, { providers }, tools);

    assert(tools.calls.post.length === 1, 'exactly one POST fired');
    const call = tools.calls.post[0] || {};
    assert(call.url === 'https://example.test/hook', 'POST url matches endpoint');
    const b = call.body || {};
    assert(b.entity_name === 'Acme', 'envelope.entity_name correct');
    assert(b.run_id === 'run-abc-123', 'envelope.run_id threaded from input');
    assert(typeof b.delivered_at === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(b.delivered_at), 'envelope.delivered_at is ISO');
    assert(b.payload && b.payload.name === 'Acme' && b.payload.content === 'body', 'envelope.payload is the PARSED final_json');
    assert(call.opts && call.opts.headers && call.opts.headers['X-Key'] === 'header-value-abc', 'header {env:VAR} interpolated to env value');
    const items = allItems(res);
    assert(items.length === 1 && items[0].delivery_status === 'delivered' && items[0].http_status === 200, 'result item delivered, http_status 200');
    assert(tools._partialItems.length === 1, '_partialItems pushed (Rule 10)');
    delete process.env.T1_KEY;
  }

  // ---- Test 2: no providers configured -------------------------------------
  console.log('\nTest 2: no providers — loud no-op');
  {
    const tools = makeTools();
    const input = makeInput([{ name: 'Acme', items: [jsonItem('Acme', { name: 'Acme' })] }]);
    const res = await execute(input, { providers: [] }, tools);
    assert(tools.calls.post.length === 0, 'zero POSTs when no providers');
    assert(tools.logs.some(l => l.level === 'warn' && /provider/i.test(l.message)), 'loud warn about no providers');
    assert(/no active/i.test(res.summary.description) || /no.*provider/i.test(res.summary.description), 'summary description names the no-provider state (not silent success)');
    assert(allItems(res).length === 0, 'no delivery items produced');
  }

  // ---- Test 3: entity without final_json -----------------------------------
  console.log('\nTest 3: one entity has no final_json — skipped + reported, other delivered');
  {
    const tools = makeTools(() => ({ status: 200, headers: {}, body: 'ok' }));
    const providers = [{ id: 'w', type: 'json_post', endpoint: 'https://x.test/h', source_field: 'final_json', envelope: true }];
    const input = makeInput([
      { name: 'HasJson', items: [jsonItem('HasJson', { name: 'HasJson' })] },
      { name: 'NoJson', items: [mdItem('NoJson', '# just markdown')] },
    ]);
    const res = await execute(input, { providers }, tools);
    assert(tools.calls.post.length === 1, 'only the entity with final_json is delivered (1 POST)');
    const items = allItems(res);
    const delivered = items.filter(i => i.delivery_status === 'delivered');
    const skipped = items.filter(i => i.delivery_status === 'skipped');
    assert(delivered.length === 1 && delivered[0].entity_name === 'HasJson', 'HasJson delivered');
    assert(skipped.length === 1 && skipped[0].entity_name === 'NoJson', 'NoJson reported as skipped (not silent)');
    assert(tools.logs.some(l => l.level === 'warn' && /NoJson/.test(l.message)), 'skip logged loudly with entity name');
    assert(/skip/i.test(res.summary.description), 'summary description surfaces the skip count');
  }

  // ---- Test 4: POST fails (500 + network error) ----------------------------
  console.log('\nTest 4: delivery failures — 500 and network error become items, others continue');
  {
    const tools = makeTools((url, body) => {
      if (body.entity_name === 'Boom') throw new Error('network boom');
      if (body.entity_name === 'FiveHundred') return { status: 500, headers: {}, body: 'server error' };
      return { status: 200, headers: {}, body: 'ok' };
    });
    const providers = [{ id: 'w', type: 'json_post', endpoint: 'https://x.test/h', source_field: 'final_json', envelope: true }];
    const input = makeInput([
      { name: 'FiveHundred', items: [jsonItem('FiveHundred', { name: 'FiveHundred' })] },
      { name: 'Boom', items: [jsonItem('Boom', { name: 'Boom' })] },
      { name: 'Fine', items: [jsonItem('Fine', { name: 'Fine' })] },
    ]);
    const res = await execute(input, { providers }, tools);
    const items = allItems(res);
    const byName = Object.fromEntries(items.map(i => [i.entity_name, i]));
    assert(byName.FiveHundred.delivery_status === 'failed' && byName.FiveHundred.http_status === 500, '500 → failed item with http_status 500');
    assert(byName.Boom.delivery_status === 'failed' && byName.Boom.http_status === null && /boom/.test(byName.Boom.error), 'network error → failed item, http_status null, error captured');
    assert(byName.Fine.delivery_status === 'delivered', 'the healthy entity still delivered after two failures');
    assert(tools._partialItems.length === 3, 'all three items pushed to _partialItems');
  }

  // ---- Test 5: missing env var for a header --------------------------------
  console.log('\nTest 5: header {env:VAR} unset — provider skipped (api-search convention)');
  {
    delete process.env.T5_MISSING;
    const tools = makeTools(() => ({ status: 200, headers: {}, body: 'ok' }));
    const providers = [{ id: 'needs-key', type: 'json_post', endpoint: 'https://x.test/h', headers: { 'X-Key': '{env:T5_MISSING}' }, source_field: 'final_json' }];
    const input = makeInput([{ name: 'Acme', items: [jsonItem('Acme', { name: 'Acme' })] }]);
    const res = await execute(input, { providers }, tools);
    assert(tools.calls.post.length === 0, 'no POST when a referenced env var is missing');
    assert(tools.logs.some(l => l.level === 'warn' && /T5_MISSING/.test(l.message) && /skip/i.test(l.message)), 'provider skipped with a warn naming the missing var');
  }

  // ---- Test 6: secrets never leak ------------------------------------------
  console.log('\nTest 6: resolved secret absent from all logs and all output items');
  {
    const SECRET = 'supersecret-DEADBEEF';
    process.env.T6_SECRET = SECRET;
    // Force a failure so error paths are exercised too.
    const tools = makeTools(() => ({ status: 500, headers: {}, body: 'nope' }));
    const providers = [{ id: 'secure', type: 'json_post', endpoint: 'https://x.test/h', headers: { 'X-Secret': '{env:T6_SECRET}' }, source_field: 'final_json', envelope: true }];
    const input = makeInput([{ name: 'Acme', items: [jsonItem('Acme', { name: 'Acme' })] }]);
    const res = await execute(input, { providers }, tools);
    // sanity: the secret WAS interpolated into the actual request header
    assert(tools.calls.post[0].opts.headers['X-Secret'] === SECRET, 'secret correctly interpolated into the live request header');
    const logBlob = JSON.stringify(tools.logs);
    const itemBlob = JSON.stringify(res);
    assert(!logBlob.includes(SECRET), 'secret does NOT appear in any log line');
    assert(!itemBlob.includes(SECRET), 'secret does NOT appear in any output item / summary');
    delete process.env.T6_SECRET;
  }

  // ---- Test 7: field-shape selection ---------------------------------------
  console.log('\nTest 7: picks the final_json item when markdown + json items coexist');
  {
    let postedBody = null;
    const tools = makeTools((url, body) => { postedBody = body; return { status: 200, headers: {}, body: 'ok' }; });
    const providers = [{ id: 'w', type: 'json_post', endpoint: 'https://x.test/h', source_field: 'final_json', envelope: true }];
    // Pool has a markdown-output item AND a json-output item for the same entity.
    const input = makeInput([{ name: 'Acme', items: [
      mdItem('Acme', '# markdown from markdown-output'),
      jsonItem('Acme', { name: 'Acme', picked: 'json-output' }),
    ] }]);
    const res = await execute(input, { providers }, tools);
    assert(tools.calls.post.length === 1, 'one POST');
    assert(postedBody && postedBody.payload && postedBody.payload.picked === 'json-output', 'delivered the final_json item, not the markdown item');
  }

  // ---- Test 8: provider without endpoint -> pre-skipped loudly --------------
  console.log('\nTest 8: provider missing endpoint — skipped up-front, no per-entity failures');
  {
    const tools = makeTools(() => ({ status: 200, headers: {}, body: 'ok' }));
    const providers = [{ id: 'no-endpoint', type: 'json_post', source_field: 'final_json' }];
    const input = makeInput([{ name: 'Acme', items: [jsonItem('Acme', { name: 'Acme' })] }]);
    const res = await execute(input, { providers }, tools);
    assert(tools.calls.post.length === 0, 'no POST when a provider has no endpoint');
    assert(tools.logs.some(l => l.level === 'warn' && /no-endpoint/.test(l.message) && /endpoint/i.test(l.message) && /skip/i.test(l.message)), 'endpoint-less provider skipped up-front with a naming warn');
    assert(!allItems(res).some(i => i.delivery_status === 'failed'), 'no confusing per-entity failed items from a config-level mistake');
  }

  // ---- Test 9: $-safe env interpolation (regression guard) ------------------
  console.log('\nTest 9: env value containing $ sequences is not corrupted');
  {
    process.env.T9_KEY = 'a$&b$$c$1d';
    const tools = makeTools(() => ({ status: 200, headers: {}, body: 'ok' }));
    const providers = [{ id: 'w', type: 'json_post', endpoint: 'https://x.test/h', headers: { 'X-Key': '{env:T9_KEY}' }, source_field: 'final_json' }];
    const input = makeInput([{ name: 'Acme', items: [jsonItem('Acme', { name: 'Acme' })] }]);
    await execute(input, { providers }, tools);
    assert(tools.calls.post[0].opts.headers['X-Key'] === 'a$&b$$c$1d', 'header value with $&/$$/$1 interpolated verbatim (function-form replace)');
    delete process.env.T9_KEY;
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
