/**
 * B034 -- domain_source option: resolve the entity domain from the pool.
 *
 * Run: node modules/step-3-scraping/api-fetcher/test-domain-source.js
 * From repo root. All HTTP mocked, no network.
 *
 * R0 proof: api-fetcher returned 0 LinkedIn records. Cause (verified in
 * execute.js:resolveIdentifiers + the R0 capture): the per-step entity is rebuilt
 * from the pool and autoExecutor sends only {entity_name}, so identifier_source
 * {entity_field:"website"} resolves to nothing at step 3 -- seed fields don't
 * survive past step 1. domain_source:"pool_url_host" derives the registrable
 * domain from the entity's own pool item urls instead (M2b pool-item read).
 *
 * This suite proves:
 *   1. default ("entity_field") is BYTE-IDENTICAL to git HEAD.
 *   2. pool_url_host derives pushgaming.com from an R0-shaped pool (no website field).
 *   3. mixed-host pool picks the dominant host; obvious third-party hosts are ignored.
 *   4. empty / urlless pool degrades LOUDLY (a warn) with no silent empty fetch.
 */

const { execSync } = require('child_process');
const path = require('path');

const execute = require('./execute.js');
const MANIFEST = require('./manifest.json');

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { console.log(`  PASS: ${msg}`); pass++; }
  else { console.log(`  FAIL: ${msg}`); fail++; }
}

// git-HEAD version for A/B byte-identity.
const SCRATCH = process.env.CLAUDE_SCRATCH ||
  '/private/tmp/claude-501/-Users-danieloskarsson-dev-content-pipeline-modules-v2/9b8a2a13-f373-4387-a5d1-51dc6e0a8d28/scratchpad';
const headPath = path.join(SCRATCH, 'af-head-execute.js');
const REPO = '/Users/danieloskarsson/dev/content-pipeline-modules-v2';
execSync(`git -C ${REPO} show HEAD:modules/step-3-scraping/api-fetcher/execute.js > ${headPath}`,
  { stdio: ['ignore', 'ignore', 'inherit'] });
const executeHead = require(headPath);

const defaults = { ...MANIFEST.options_defaults };

function makeTools() {
  const logs = [];
  const calls = { get: [], post: [] };
  return {
    logs, calls,
    tools: {
      logger: {
        info: (m) => logs.push({ level: 'info', message: m }),
        warn: (m) => logs.push({ level: 'warn', message: m }),
        error: (m) => logs.push({ level: 'error', message: m }),
      },
      progress: { update: () => {} },
      _partialItems: [],
      http: {
        get: async (url) => { calls.get.push(url); return { status: 200, headers: {}, body: JSON.stringify({ results: [{ profile_url: 'https://linkedin.com/company/x', name: 'X' }] }) }; },
        post: async (url, body) => { calls.post.push({ url, body }); return { status: 200, headers: {}, body: '{}' }; },
      },
    },
  };
}

// A provider that looks up by domain (like the Bright Data LinkedIn-company block).
const DOMAIN_PROVIDER = {
  id: 'linkedin-company',
  name: 'LinkedIn Company',
  response_format: 'json',
  identifier_source: { entity_field: 'website' },
  endpoints: [{
    id: 'lookup',
    url: 'https://api.example.com/company',
    params: { domain: '{identifier}' },
    results_path: 'results',
    field_map: { url: 'profile_url', title: 'name' },
  }],
};

function poolItems(urls) { return urls.map((u, i) => ({ url: u, externalId: `p${i}` })); }

(async () => {
  console.log('\n=== B034: domain_source (pool_url_host) ===\n');

  // --- 1. default ("entity_field") byte-identical to git HEAD --------------------
  console.log('1. default entity_field: byte-identical vs git HEAD');
  {
    const entity = { name: 'Push Gaming', website: 'pushgaming.com',
      items: poolItems(['https://pushgaming.com/', 'https://www.pushgaming.com/games/']) };
    const optsDefault = { ...defaults, providers: [DOMAIN_PROVIDER] };
    const a = makeTools(); const b = makeTools();
    const resHead = await executeHead({ entities: [entity] }, optsDefault, a.tools);
    const resNew = await execute({ entities: [entity] }, optsDefault, b.tools);
    assert(JSON.stringify(resNew) === JSON.stringify(resHead), 'new output === HEAD output (default mode)');
    assert(a.calls.get[0] === b.calls.get[0] && /domain=pushgaming\.com/.test(b.calls.get[0]),
      'both query the entity_field website (pushgaming.com), same URL');
  }

  // --- 1b. R0 shape in default mode: no website -> skipped (bug preserved) --------
  console.log('\n1b. default mode, R0 shape (no website): 0 identifiers -> provider skipped');
  {
    const entity = { name: 'Push Gaming', items: poolItems(['https://pushgaming.com/']) };
    const { tools, calls } = makeTools();
    const res = await execute({ entities: [entity] }, { ...defaults, providers: [DOMAIN_PROVIDER] }, tools);
    assert(calls.get.length === 0, 'no fetch (website unresolved) -- the R0 defect, intact in default mode');
    assert(res.results[0].items.length === 0, '0 items for the entity');
  }

  // --- 2. pool_url_host derives pushgaming.com from an R0-shaped pool -------------
  console.log('\n2. pool_url_host: derive pushgaming.com from pool item urls (no website field)');
  {
    const entity = { name: 'Push Gaming', items: poolItems([
      'https://pushgaming.com/', 'https://www.pushgaming.com/games/',
      'https://www.pushgaming.com/blog/prizeflex.html', 'https://pushgaming.com/employment-ex-offenders/',
    ]) };
    const { tools, calls, logs } = makeTools();
    const res = await execute({ entities: [entity] },
      { ...defaults, providers: [DOMAIN_PROVIDER], domain_source: 'pool_url_host' }, tools);
    assert(calls.get.length === 1, 'one fetch made using the derived domain');
    assert(/domain=pushgaming\.com/.test(calls.get[0] || ''), `derived domain is pushgaming.com (url: ${calls.get[0]})`);
    assert(logs.some(l => l.level === 'info' && /pushgaming\.com/.test(l.message)), 'derived domain logged at info (R1 provable)');
    assert(res.results[0].items.length === 1, 'record returned (R0 leg no longer inert)');
  }

  // --- 3. mixed-host pool picks the dominant host; third-party hosts ignored ------
  console.log('\n3. mixed/third-party pool: dominant own-host wins, social/CDN excluded');
  {
    // pushgaming.com x2 (own), but youtube x3 + linkedin x2 (more frequent third parties).
    const entity = { name: 'Push Gaming', items: poolItems([
      'https://www.pushgaming.com/', 'https://pushgaming.com/games/',
      'https://www.youtube.com/watch?v=1', 'https://youtu.be/2', 'https://m.youtube.com/watch?v=3',
      'https://www.linkedin.com/company/push', 'https://linkedin.com/feed',
    ]) };
    const { tools, calls } = makeTools();
    await execute({ entities: [entity] },
      { ...defaults, providers: [DOMAIN_PROVIDER], domain_source: 'pool_url_host' }, tools);
    assert(/domain=pushgaming\.com/.test(calls.get[0] || ''),
      `picked pushgaming.com despite more youtube/linkedin urls (url: ${calls.get[0]})`);
  }
  {
    // Pure frequency tie-break among own hosts: example.com x2 vs acme.io x4 -> acme.io.
    const entity = { name: 'Acme', items: poolItems([
      'https://example.com/a', 'https://example.com/b',
      'https://acme.io/1', 'https://www.acme.io/2', 'https://acme.io/3', 'https://acme.io/4',
    ]) };
    const { tools, calls } = makeTools();
    await execute({ entities: [entity] },
      { ...defaults, providers: [DOMAIN_PROVIDER], domain_source: 'pool_url_host' }, tools);
    assert(/domain=acme\.io/.test(calls.get[0] || ''), `dominant host acme.io wins by frequency (url: ${calls.get[0]})`);
  }

  // --- 4. empty / urlless pool degrades loudly, no silent fetch -------------------
  console.log('\n4. pool_url_host with no usable host: loud warn, no fetch');
  {
    for (const [label, items] of [
      ['empty items', []],
      ['urlless items', [{ externalId: 'x', title: 'no url here' }]],
      ['garbage urls', poolItems(['not-a-url', 'mailto:foo@bar'])],
    ]) {
      const entity = { name: 'Ghost', items };
      const { tools, calls, logs } = makeTools();
      const res = await execute({ entities: [entity] },
        { ...defaults, providers: [DOMAIN_PROVIDER], domain_source: 'pool_url_host' }, tools);
      assert(calls.get.length === 0, `${label}: no HTTP fetch (no silent empty fetch)`);
      assert(res.results[0].items.length === 0, `${label}: 0 items`);
      assert(logs.some(l => l.level === 'warn' && /pool_url_host/.test(l.message)),
        `${label}: loud warn naming pool_url_host`);
    }
  }

  // --- 5. fallback-only: a co-provider that resolves its OWN id keeps it ----------
  console.log('\n5. pool_url_host is fallback-only: a provider with its own identifier is not clobbered');
  {
    // A channel-keyed provider (item_field) + the domain-keyed provider, same run.
    const CHANNEL_PROVIDER = {
      id: 'yt', name: 'YT', response_format: 'json',
      identifier_source: { item_field: 'channel_id' },
      endpoints: [{ id: 'ch', url: 'https://yt.example/channel', params: { id: '{identifier}' },
        results_path: 'results', field_map: { url: 'profile_url' } }],
    };
    const entity = { name: 'Push Gaming', items: [
      { url: 'https://pushgaming.com/', channel_id: 'UC_push_123' },
      { url: 'https://www.pushgaming.com/games/' },
    ] };
    const { tools, calls } = makeTools();
    await execute({ entities: [entity] },
      { ...defaults, providers: [CHANNEL_PROVIDER, DOMAIN_PROVIDER], domain_source: 'pool_url_host' }, tools);
    const urls = calls.get.join(' | ');
    assert(/id=UC_push_123/.test(urls), `channel provider kept its OWN item_field id (urls: ${urls})`);
    assert(/domain=pushgaming\.com/.test(urls), 'domain provider (no own id) used the derived domain');
  }

  console.log(`\n=== Result: ${pass} pass, ${fail} fail ===`);
  process.exit(fail === 0 ? 0 : 1);
})();
