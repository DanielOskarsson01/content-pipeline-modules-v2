/**
 * Standalone test harness for the seo-planner keyword-research context fix +
 * content-gate rawText capture (run 85bc05e1 diagnosis, 2026-07-20).
 *
 * Run: node modules/step-5-generation/seo-planner/test-entity-context.js  (repo root)
 *
 * CHANGE 1 — buildEntityContext fed the keyword research the BARE entity name.
 * It read primary_category / categories[].name / industry / description — fields
 * the CURRENT content-analyzer does not emit (it emits categories as an object
 * {primary:[{slug}]...}, plus key_facts) — so every branch missed and it fell
 * through to entity.name. The Sonar research then ran on "Hacksawgaming is in the
 * Hacksawgaming space", a meaningless self-reference, and the plan came back with
 * no usable keywords. The fix harvests a rich descriptor GENERICALLY from the
 * analysis the analyzer actually produces (naming no analysis key), so it does
 * not rebreak on the next schema change.
 *
 * CHANGE 2 — the content-gate throw discarded the model output (unlike the
 * JSON-parse path, which preserves rawText). So a keyword-less plan left us
 * guessing what the model returned. The gate now captures the (parsed) model
 * output onto the error item + meta, so the next hollow plan is diagnosable.
 *
 * No network — ai.complete is mocked.
 */

const execute = require('./execute.js');
const MANIFEST = require('./manifest.json');
const { MANIFEST_DEFAULT_PROMPT, buildEntityContext, parseResearchQueries } = execute.__testing;

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { console.log(`  PASS: ${msg}`); pass++; }
  else { console.log(`  FAIL: ${msg}`); fail++; }
}

// ---------------------------------------------------------------------------
// CHANGE 1 — buildEntityContext on the CURRENT analyzer output shape.
// This is the assertion that matters: a rich, non-degenerate context.
// ---------------------------------------------------------------------------
console.log('\n=== buildEntityContext: rich context from the CURRENT analyzer shape ===');

// Reconstructed real analyzer output (from run 85bc05e1): categories as an
// object with slug arrays, tags, key_facts. NO primary_category/industry/
// description flat fields — which is exactly why the old code collapsed.
const currentAnalyzerItem = {
  entity_name: 'Hacksawgaming',
  analysis_json: {
    categories: {
      primary: [{ slug: 'game-providers', evidence: 'Hacksaw creates and supplies an extensive portfolio of 100+ slots and instant-win titles.' }],
      secondary: [{ slug: 'game-developers' }, { slug: 'game-aggregators' }],
    },
    tags: { existing: [{ slug: 'slots' }, { slug: 'instant-win' }, { slug: 'mobile' }] },
    key_facts: { founded: '2018', headquarters: 'Zebbug, Malta' },
    source_citations: [{ url: 'https://hacksawgaming.com/', title: 'Home' }],
  },
};
{
  const ctx = buildEntityContext({ name: 'Hacksawgaming' }, currentAnalyzerItem);
  assert(ctx !== 'Hacksawgaming',
    `context is NOT the bare entity name (got: ${JSON.stringify(ctx).slice(0, 140)})`);
  assert(ctx.toLowerCase() !== 'hacksawgaming',
    'entity_context !== entity_name — kills the "X is in the X space" degenerate prompt');
  assert(/game-providers|game-aggregators|slots|instant-win/.test(ctx),
    'context contains real category/tag terms from the analysis');
  assert(ctx.length > 'Hacksawgaming'.length,
    'context is materially richer than the entity name');
  assert(!/https?:\/\//.test(ctx),
    'context does not leak source-citation URLs');
}

// ---------------------------------------------------------------------------
// REGRESSION — an analysis that DID carry the old flat fields still yields a
// meaningful context (don't break the path that happened to work).
// ---------------------------------------------------------------------------
console.log('\n=== Regression: legacy flat fields still produce a context ===');
{
  const legacyItem = { analysis_json: { primary_category: 'iGaming slot provider', industry: 'Online gambling' } };
  const ctx = buildEntityContext({ name: 'Acme' }, legacyItem);
  assert(ctx !== 'Acme', 'legacy shape: context is not the bare name');
  assert(/iGaming slot provider|Online gambling/i.test(ctx), 'legacy shape: context carries the old-field content');
}

// ---------------------------------------------------------------------------
// PROSE-ONLY shape — an analysis whose only text is a long prose field (no
// short slug/fact leaves) must STILL yield a meaningful context, not collapse
// to the bare entity name. This is the same degenerate-self-reference class the
// fix targets, re-triggered by shape rather than field name (review WARNING 1).
// ---------------------------------------------------------------------------
console.log('\n=== Prose-only analysis → truncated prose context (not bare name) ===');
{
  const proseItem = { analysis_json: { description: 'Acme is a leading provider of online gambling software and instant-win games serving operators across regulated European markets.' } };
  const ctx = buildEntityContext({ name: 'Acme' }, proseItem);
  assert(ctx !== 'Acme', 'prose-only: context is not the bare name');
  assert(/gambling|provider|instant-win/i.test(ctx), 'prose-only: context carries the real prose content');
}

// ---------------------------------------------------------------------------
// $-SAFETY — a harvested term containing a $-replacement sequence must land in
// the research query LITERALLY (parseResearchQueries used string-form replace,
// like the bug buildPrompt was already hardened against; review WARNING 2).
// ---------------------------------------------------------------------------
console.log('\n=== parseResearchQueries: $-sequences in context are literal ===');
{
  const qs = parseResearchQueries('Research {entity_name} in the {entity_context} niche.', 'Acme', 'slots $& bonus');
  assert(qs.length === 1, 'one query parsed');
  assert(qs[0].includes('slots $& bonus'), `context $-sequence inserted literally (got: ${qs[0]})`);
  assert(!qs[0].includes('{entity_context}'), 'the placeholder was actually replaced (no re-inserted token)');
}

// ---------------------------------------------------------------------------
// FALLBACK — a genuinely empty analysis returns the entity name (the ONLY
// acceptable fallback; not a crash, not "undefined").
// ---------------------------------------------------------------------------
console.log('\n=== Fallback: empty analysis → entity name ===');
{
  assert(buildEntityContext({ name: 'Acme' }, { analysis_json: {} }) === 'Acme', 'empty analysis_json → entity name');
  assert(buildEntityContext({ name: 'Acme' }, {}) === 'Acme', 'no analysis at all → entity name');
}

// ---------------------------------------------------------------------------
// CHANGE 2 — the content-gate (hollow) throw now captures the model output.
// ---------------------------------------------------------------------------
console.log('\n=== rawText capture on the content-gate (hollow) throw ===');
function makeTools(aiResponse) {
  return {
    logger: { info: () => {}, warn: () => {}, error: () => {} },
    progress: { update: () => {} },
    ai: { complete: async () => aiResponse },
    _partialItems: [],
  };
}
const baseOptions = {
  ...MANIFEST.options_defaults,
  keyword_research: false,          // skip Perplexity in the unit test
  requires_prompt_override: false,
  prompt: MANIFEST_DEFAULT_PROMPT,
};
const entity = { name: 'TestEntity', items: [{ source_submodule: 'content-analyzer', analysis_json: { categories: { primary: [{ slug: 'test' }] } } }] };

(async () => {
  // A valid-but-keyword-less plan: parses fine, but hasUsableKeywords → false.
  const hollowPlan = { meta: { title: 'A Real Meta Title', description: 'x'.repeat(155) }, faqs: [{ question: 'Q?', answer_brief: 'A' }] };
  const tools = makeTools({ text: JSON.stringify(hollowPlan), citations: [] });
  const res = await execute({ entities: [entity] }, baseOptions, tools);
  const result = res.results[0];
  const item = result.items[0];

  assert(item.status === 'error', 'hollow plan still errors (A1 behavior unchanged)');
  assert(/keyword|head_term/i.test(item.error || ''), 'error still names the cause (A1 message intact)');
  assert(typeof item.raw_response === 'string' && item.raw_response.length > 0,
    'error item now carries raw_response (the model output is visible, not inferred)');
  assert(typeof item.raw_response === 'string' && item.raw_response.includes('A Real Meta Title'),
    'raw_response contains the actual keyword-less model output');
  assert(typeof result.meta.raw_response === 'string' && result.meta.raw_response.includes('A Real Meta Title'),
    'meta carries raw_response too');

  console.log(`\n=== Result: ${pass} pass, ${fail} fail ===`);
  process.exit(fail === 0 ? 0 : 1);
})();
