/**
 * Standalone test harness for content-writer W1.2.
 *
 * Run: node modules/step-5-generation/content-writer/test-slug-loud-fail.js
 * From repo root.
 *
 * Covers the W1.2 contract-hardening change (Plan 2 / Rule 13 rollout):
 *   - When allowed_slug_paths is CONFIGURED (non-empty) but no slugs resolve
 *     from any path for an entity, the writer previously OMITTED the closed-
 *     vocabulary block silently and let the model emit potentially-invalid
 *     slugs. Now it WARNS (default) so the silent omission is visible.
 *   - New option require_slug_paths (default false): when true, hard-FAIL the
 *     entity instead of warning.
 *   - Slugs present → no warning, content written (baseline no-change guard).
 *   - Empty allowed_slug_paths → no slug warning at all (unchanged generic path).
 *
 * No network — ai.complete is mocked.
 */

const execute = require('./execute.js');
const MANIFEST = require('./manifest.json');

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { console.log(`  PASS: ${msg}`); pass++; }
  else { console.log(`  FAIL: ${msg}`); fail++; }
}

function makeTools() {
  const logs = [];
  let aiCalls = 0;
  return {
    logs,
    get aiCalls() { return aiCalls; },
    logger: {
      info: (m) => logs.push({ level: 'info', message: m }),
      warn: (m) => logs.push({ level: 'warn', message: m }),
      error: (m) => logs.push({ level: 'error', message: m }),
    },
    progress: { update: () => {} },
    ai: { complete: async () => { aiCalls++; return { text: '# Title\n\nContent [#1].', tokens_in: 10, tokens_out: 10, model: 'haiku', provider: 'anthropic' }; } },
    _partialItems: [],
  };
}

const SLUG_CONFIG = 'Primary Category=categories.primary[].slug\nTag=tags.existing[].slug';

// Analyzer output WITH matching slugs.
const entityWithSlugs = {
  name: 'HasSlugs',
  items: [
    { source_submodule: 'content-analyzer', analysis_json: { categories: { primary: [{ slug: 'casino-platforms' }] }, tags: { existing: [{ slug: 'api' }] } } },
    { source_submodule: 'page-scraper', text_content: 'Source page content.', url: 'https://x.example/p' },
  ],
};

// Analyzer output WITHOUT any of the configured fields → zero slugs resolve.
const entityNoSlugs = {
  name: 'NoSlugs',
  items: [
    { source_submodule: 'content-analyzer', analysis_json: { headline: 'Something', unrelated: 'field' } },
    { source_submodule: 'page-scraper', text_content: 'Source page content.', url: 'https://x.example/p' },
  ],
};

const base = { ...MANIFEST.options_defaults };

(async () => {
  // ----------------------------------------------------------------------
  // Manifest sanity (config part of W1.2)
  // ----------------------------------------------------------------------
  console.log('\n=== Manifest sanity ===');
  assert(MANIFEST.version === '1.6.1', `manifest version bumped to 1.6.1 (got ${MANIFEST.version})`);
  assert(MANIFEST.options.some(o => o.name === 'require_slug_paths'), 'require_slug_paths option present');
  assert(MANIFEST.options_defaults.require_slug_paths === false, 'require_slug_paths default is false');

  // ----------------------------------------------------------------------
  // 1. Configured + no slugs resolve, default flag → WARN, still proceeds
  // ----------------------------------------------------------------------
  console.log('\n=== Configured but unresolved → WARN (default) ===');
  {
    const tools = makeTools();
    const opts = { ...base, allowed_slug_paths: SLUG_CONFIG };
    const result = await execute({ entities: [entityNoSlugs] }, opts, tools);
    assert(
      tools.logs.some(l => l.level === 'warn' && /allowed_slug_paths/.test(l.message)),
      'unresolved: a warning about allowed_slug_paths is emitted'
    );
    assert(result.results[0].items[0].status === 'written', 'unresolved (default): still proceeds and writes');
    assert(tools.aiCalls === 1, 'unresolved (default): LLM still called');
  }

  // ----------------------------------------------------------------------
  // 2. Configured + no slugs resolve + require_slug_paths → HARD FAIL
  // ----------------------------------------------------------------------
  console.log('\n=== Configured but unresolved + require_slug_paths → HARD FAIL ===');
  {
    const tools = makeTools();
    const opts = { ...base, allowed_slug_paths: SLUG_CONFIG, require_slug_paths: true };
    const result = await execute({ entities: [entityNoSlugs] }, opts, tools);
    assert(result.results[0].items[0].status === 'error', 'require_slug_paths: entity hard-fails (status error)');
    assert(/allowed_slug_paths/.test(result.results[0].items[0].error), 'require_slug_paths: error names the cause');
    assert(result.summary.total_items === 0, 'require_slug_paths: 0 items written');
    assert(tools.logs.some(l => l.level === 'error' && /allowed_slug_paths/.test(l.message)), 'require_slug_paths: failure logged at error level');
    assert(tools.aiCalls === 0, 'require_slug_paths: fails BEFORE the LLM call (no tokens spent)');
  }

  // ----------------------------------------------------------------------
  // 3. Configured + slugs DO resolve → no warning, writes (baseline no-change)
  // ----------------------------------------------------------------------
  console.log('\n=== Configured + slugs resolve → no warning (baseline) ===');
  {
    const tools = makeTools();
    const opts = { ...base, allowed_slug_paths: SLUG_CONFIG };
    const result = await execute({ entities: [entityWithSlugs] }, opts, tools);
    assert(!tools.logs.some(l => /allowed_slug_paths/.test(l.message)), 'resolved: no slug-path warning/error');
    assert(result.results[0].items[0].status === 'written', 'resolved: content written normally');
  }

  // Same, but with require_slug_paths true — must NOT fail when slugs resolve.
  {
    const tools = makeTools();
    const opts = { ...base, allowed_slug_paths: SLUG_CONFIG, require_slug_paths: true };
    const result = await execute({ entities: [entityWithSlugs] }, opts, tools);
    assert(result.results[0].items[0].status === 'written', 'resolved + require_slug_paths: still writes (flag only fires on empty)');
  }

  // ----------------------------------------------------------------------
  // 4. No allowed_slug_paths configured → no slug warning (unchanged path)
  // ----------------------------------------------------------------------
  console.log('\n=== No allowed_slug_paths → no slug warning (unchanged) ===');
  {
    const tools = makeTools();
    const opts = { ...base, allowed_slug_paths: '' };
    const result = await execute({ entities: [entityNoSlugs] }, opts, tools);
    assert(!tools.logs.some(l => /allowed_slug_paths/.test(l.message)), 'no config: no slug-path warning (generic content types unaffected)');
    assert(result.results[0].items[0].status === 'written', 'no config: content written normally');
  }

  console.log(`\n=== Result: ${pass} pass, ${fail} fail ===`);
  process.exit(fail === 0 ? 0 : 1);
})();
