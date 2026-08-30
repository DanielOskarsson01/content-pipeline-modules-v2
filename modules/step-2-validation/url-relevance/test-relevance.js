/**
 * url-relevance F2 tests — hostname visibility + entity own-domain derivation.
 *
 * F2 changes ONLY what the module SHOWS the model (the prompt), not the criteria:
 *   - include_hostname: render each URL with its full host, not just the path.
 *   - entity_domain_source=pool_dominant_host: derive the entity's own domain from
 *     the dominant host among its OWN-CRAWL pool items (no search/scout found_via)
 *     and state it as "Website:", so the model can tell own pages from third-party
 *     pages about a DIFFERENT same-named company (Gate-1: Pocket Rockets).
 *
 *   A — default-off byte-identity: with both options at defaults, the prompt AND
 *       output are byte-identical to the pre-F2 baseline (commit 0180696).
 *   B — derivation: picks pocketrocketsgaming.com from a Gate-1-shaped pool.
 *   C — include_hostname (true and "true"): hosts become visible in the prompt.
 *   D — loud degrade: empty / ambiguous own-crawl → Website stays "unknown" + warn.
 *
 * Deterministic, offline (ai.complete mocked). Run:
 *   node modules/step-2-validation/url-relevance/test-relevance.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DIR = __dirname;
const CURRENT = path.join(DIR, 'execute.js');
const BASELINE_SHA = '0180696';
const REL = 'modules/step-2-validation/url-relevance/execute.js';
const BASELINE_TMP = path.join(DIR, '._baseline_execute.tmp.js');

// ai.complete mock: capture every prompt, return a deterministic all-KEEP response.
function captureTools() {
  const prompts = [];
  const warns = [];
  const infos = [];
  return {
    prompts, warns, infos,
    tools: {
      logger: { info: (m) => infos.push(m), warn: (m) => warns.push(m), error() {} },
      progress: { update() {} },
      ai: {
        async complete({ prompt }) {
          prompts.push(prompt);
          // count numbered items in the prompt to size the response
          const n = (prompt.match(/^\d+\. \//gm) || prompt.match(/^\d+\. /gm) || []).length;
          const lines = [];
          for (let i = 1; i <= n; i++) lines.push(`${i}. KEEP`);
          return { text: lines.join('\n') };
        },
      },
      _partialItems: [],
    },
  };
}

const DEFAULT_OPTS = {
  ai_model: 'haiku', ai_provider: 'anthropic',
  keep_criteria: 'about, team', drop_criteria: 'single game pages',
  confidence_threshold: 'balanced', max_urls_per_prompt: 200, metadata_fields: ['found_via'],
};

function mixedInput() {
  return {
    entity: {
      name: 'Acme Co',
      items: [
        { url: 'https://acme.com/about', found_via: null, link_text: 'About', source_location: 'nav' },
        { url: 'https://acme.com/team?x=1', link_text: 'Team' },
        { url: 'https://news.example.com/acme-raises-funding', found_via: 'search-discovery:open' },
        { url: 'not a url', link_text: 'broken' },
        { url: 'https://acme.com/careers', found_via: undefined },
      ],
    },
    entities: null,
  };
}
function toLegacy(inp) { inp.entities = [inp.entity]; return inp; }

// --- Part A: default-off byte-identity vs baseline ---
async function partA() {
  console.log('Part A — default-off byte-identity vs baseline', BASELINE_SHA);
  fs.writeFileSync(BASELINE_TMP, execSync(`git -C ${DIR} show ${BASELINE_SHA}:${REL}`, { encoding: 'utf8' }));
  try {
    const baseline = require(BASELINE_TMP);
    const current = require(CURRENT);

    const capB = captureTools();
    const outB = await baseline(toLegacy(mixedInput()), { ...DEFAULT_OPTS }, capB.tools);
    const capC = captureTools();
    // defaults: include_hostname absent(false), entity_domain_source absent(none)
    const outC = await current(toLegacy(mixedInput()), { ...DEFAULT_OPTS }, capC.tools);

    assert.strictEqual(capC.prompts.length, capB.prompts.length, 'prompt count differs');
    for (let i = 0; i < capB.prompts.length; i++) {
      assert.strictEqual(capC.prompts[i], capB.prompts[i], `prompt ${i} not byte-identical to baseline`);
    }
    assert.strictEqual(JSON.stringify(outC), JSON.stringify(outB), 'output not byte-identical');
    console.log(`  ✓ prompt + output byte-identical with options at defaults (${capB.prompts.length} prompt(s))`);
  } finally {
    fs.rmSync(BASELINE_TMP, { force: true });
  }
}

// Gate-1-shaped pool: 5 own (pocketrocketsgaming.com) + 1 own-crawl noise
// (en-gb.wordpress.org, a "Powered by WordPress" link) + third-party wrong-company
// hosts stamped with search/scout found_via.
function prgShapedInput() {
  const items = [
    { url: 'https://pocketrocketsgaming.com/', found_via: null, link_text: 'Home' },
    { url: 'https://pocketrocketsgaming.com/about', found_via: null },
    { url: 'https://www.pocketrocketsgaming.com/games', found_via: null },
    { url: 'https://pocketrocketsgaming.com/contact', found_via: null },
    { url: 'https://pocketrocketsgaming.com/news', found_via: null },
    { url: 'https://en-gb.wordpress.org/', found_via: null, link_text: 'Powered by WordPress' },
    { url: 'https://www.pgsoft.com/pocket-games', found_via: 'search-discovery:site_restricted' },
    { url: 'https://nintendo.com/pocket-rockets', found_via: 'search-discovery:open' },
    { url: 'https://pocket.watch/shows', found_via: 'ai_scout' },
    { url: 'https://rocketplay.com/casino', found_via: 'search-discovery:open' },
  ];
  return toLegacy({ entity: { name: 'Pocket Rockets Gaming', items }, entities: null });
}

async function partB() {
  console.log('Part B — derivation picks pocketrocketsgaming.com');
  const current = require(CURRENT);
  const cap = captureTools();
  await current(prgShapedInput(), { ...DEFAULT_OPTS, entity_domain_source: 'pool_dominant_host' }, cap.tools);
  const prompt = cap.prompts[0];
  assert.ok(/Website: pocketrocketsgaming\.com/.test(prompt),
    `expected derived own domain in prompt; got:\n${prompt.split('\n').slice(0, 4).join('\n')}`);
  assert.ok(!/Website: (unknown|en-gb\.wordpress\.org)/.test(prompt), 'should not fall back / pick the wrong host');
  assert.ok(cap.infos.some((m) => /derived "pocketrocketsgaming\.com" from 6 own-crawl/.test(m)), 'expected info log of derivation');
  console.log('  ✓ derived pocketrocketsgaming.com (dominant 5>1 over the wordpress.org noise); stated as Website');
}

async function partC() {
  console.log('Part C — include_hostname (true and "true") shows hosts');
  const current = require(CURRENT);
  for (const val of [true, 'true']) {
    const cap = captureTools();
    await current(prgShapedInput(), { ...DEFAULT_OPTS, include_hostname: val }, cap.tools);
    const prompt = cap.prompts[0];
    assert.ok(/\bpgsoft\.com\/pocket-games/.test(prompt), `host not visible for include_hostname=${JSON.stringify(val)}`);
    assert.ok(/\bnintendo\.com\/pocket-rockets/.test(prompt), 'third-party host not shown');
  }
  // control: default off → host NOT shown (path only)
  const off = captureTools();
  await current(prgShapedInput(), { ...DEFAULT_OPTS }, off.tools);
  assert.ok(!/pgsoft\.com\/pocket-games/.test(off.prompts[0]), 'host leaked with include_hostname off');
  assert.ok(/^\d+\. \/pocket-games/m.test(off.prompts[0]), 'default should show path only');
  console.log('  ✓ hosts visible for true and "true"; hidden (path only) when off');
}

async function partD() {
  console.log('Part D — loud degrade on empty / ambiguous own-crawl');
  const current = require(CURRENT);

  // empty own-crawl: every item is search/scout
  const emptyOwn = toLegacy({ entity: { name: 'Ghost Co', items: [
    { url: 'https://a.com/x', found_via: 'search-discovery:open' },
    { url: 'https://b.com/y', found_via: 'ai_scout' },
  ] }, entities: null });
  let cap = captureTools();
  await current(emptyOwn, { ...DEFAULT_OPTS, entity_domain_source: 'pool_dominant_host' }, cap.tools);
  assert.ok(/Website: unknown/.test(cap.prompts[0]), 'empty own-crawl should keep Website unknown');
  assert.ok(cap.warns.some((m) => /could not derive a domain/.test(m)), 'expected loud warn on empty own-crawl');

  // ambiguous own-crawl: two own hosts tie 1–1
  const tie = toLegacy({ entity: { name: 'Tie Co', items: [
    { url: 'https://one.com/a', found_via: null },
    { url: 'https://two.com/b', found_via: null },
  ] }, entities: null });
  cap = captureTools();
  await current(tie, { ...DEFAULT_OPTS, entity_domain_source: 'pool_dominant_host' }, cap.tools);
  assert.ok(/Website: unknown/.test(cap.prompts[0]), 'ambiguous own-crawl should keep Website unknown (no silent wrong domain)');
  assert.ok(cap.warns.some((m) => /ambiguous=true/.test(m)), 'expected loud warn naming ambiguity');
  console.log('  ✓ empty and ambiguous own-crawl both degrade to unknown + warn (no silent wrong domain)');
}

(async () => {
  await partA();
  await partB();
  await partC();
  await partD();
  console.log('\nALL PASS');
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
