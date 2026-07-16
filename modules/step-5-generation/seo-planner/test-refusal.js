/**
 * Standalone test harness for seo-planner v2.2.0.
 *
 * Run: node modules/step-5-generation/seo-planner/test-refusal.js
 * From repo root.
 *
 * Covers:
 *   - Refusal mechanism (4 scenarios: flag×override matrix)
 *   - {faq_count} placeholder interpolation
 *   - Defensive parser (markdown headings stripped, raw text preserved on failure)
 *   - parseResearchQueries marker-vs-flat-line behavior (regression test)
 *
 * No network, no Perplexity, no Anthropic calls. Mocks tools.ai.complete to
 * return a fixed JSON response so the planning-path test is deterministic.
 */

const execute = require('./execute.js');
const MANIFEST = require('./manifest.json');
const { parseJsonResponse, parseResearchQueries, buildPrompt, MANIFEST_DEFAULT_PROMPT } = execute.__testing;

let pass = 0;
let fail = 0;

function assert(cond, msg) {
  if (cond) {
    console.log(`  PASS: ${msg}`);
    pass++;
  } else {
    console.log(`  FAIL: ${msg}`);
    fail++;
  }
}

function makeTools(aiResponse = null) {
  const logs = [];
  return {
    logs,
    logger: {
      info: (m) => logs.push({ level: 'info', message: m }),
      warn: (m) => logs.push({ level: 'warn', message: m }),
      error: (m) => logs.push({ level: 'error', message: m }),
    },
    progress: { update: () => {} },
    ai: {
      complete: async () => aiResponse || { text: '{"target_keywords":{"primary":"test","secondary":[],"long_tail":[]},"meta":{"title":"T","description":"D"},"faqs":[]}', citations: [] },
    },
    _partialItems: [],
  };
}

const mockEntity = {
  name: 'TestEntity',
  items: [
    {
      source_submodule: 'content-analyzer',
      analysis_json: { primary_category: 'test-category', description: 'Test description' },
      section_categories: 'Primary: test-category',
      section_tags: 'tag1',
    },
  ],
};

const baseOptions = {
  ...MANIFEST.options_defaults,
  keyword_research: false, // skip Perplexity in tests
};

// -------------------------------------------------------------------------
// Manifest-load sanity
// -------------------------------------------------------------------------
console.log('\n=== Manifest sanity ===');
assert(MANIFEST.version === '2.3.1', 'manifest version is 2.3.1');
assert(typeof MANIFEST_DEFAULT_PROMPT === 'string' && MANIFEST_DEFAULT_PROMPT.length > 1000, 'MANIFEST_DEFAULT_PROMPT loaded (>1000 chars)');
assert(MANIFEST.options.some(o => o.name === 'requires_prompt_override'), 'requires_prompt_override option present');
assert(MANIFEST.options.some(o => o.name === 'faq_count'), 'faq_count option present');
assert(MANIFEST.options_defaults.requires_prompt_override === false, 'requires_prompt_override default is false');
assert(MANIFEST.options_defaults.faq_count === 0, 'faq_count default is 0');
assert(MANIFEST.options_defaults.prompt === MANIFEST_DEFAULT_PROMPT, 'options[prompt].default === options_defaults.prompt (load-bearing for refusal)');

// -------------------------------------------------------------------------
// Refusal mechanism (4 scenarios)
// -------------------------------------------------------------------------
console.log('\n=== Refusal mechanism (4 scenarios) ===');

(async () => {
  // Scenario A: flag=true + no override → MUST REFUSE
  {
    const tools = makeTools();
    const opts = { ...baseOptions, requires_prompt_override: true, prompt: MANIFEST_DEFAULT_PROMPT };
    const result = await execute({ entities: [mockEntity] }, opts, tools);
    assert(result.summary.total_items === 0, 'A: refused — 0 items produced');
    assert(result.summary.errors.length === 1, 'A: refused — 1 error per entity');
    assert(result.results[0].items[0].error.includes('requires a seo-planner prompt override'), 'A: error message names the actual cause');
    assert(tools.logs.some(l => l.level === 'error' && l.message.includes('refused run')), 'A: refusal logged as error');
    assert(!tools.logs.some(l => l.message.includes('keyword research')), 'A: refusal fires BEFORE keyword research (no research logs)');
  }

  // Scenario B: flag=true + valid override → PROCEED
  {
    const tools = makeTools();
    const opts = { ...baseOptions, requires_prompt_override: true, prompt: 'Custom override prompt. Return ONLY JSON: ' };
    const result = await execute({ entities: [mockEntity] }, opts, tools);
    assert(result.summary.errors.length === 0, 'B: no refusal — override present');
    assert(result.results[0].items[0].status === 'planned', 'B: planning completed');
  }

  // Scenario C: flag=false + manifest default → PROCEED (agnostic legitimate path)
  {
    const tools = makeTools();
    const opts = { ...baseOptions, requires_prompt_override: false, prompt: MANIFEST_DEFAULT_PROMPT };
    const result = await execute({ entities: [mockEntity] }, opts, tools);
    assert(result.summary.errors.length === 0, 'C: no refusal — flag false, agnostic default is legitimate');
    assert(result.results[0].items[0].status === 'planned', 'C: agnostic default planning completed');
  }

  // Scenario D: flag missing (undefined) + manifest default → PROCEED (default behavior)
  {
    const tools = makeTools();
    const opts = { ...baseOptions, prompt: MANIFEST_DEFAULT_PROMPT };
    delete opts.requires_prompt_override;
    const result = await execute({ entities: [mockEntity] }, opts, tools);
    assert(result.summary.errors.length === 0, 'D: no refusal — flag missing treated as false');
  }

  // -------------------------------------------------------------------------
  // Defensive parser
  // -------------------------------------------------------------------------
  console.log('\n=== Defensive parser ===');

  // Clean JSON
  try {
    const r = parseJsonResponse('{"a":1}');
    assert(r.a === 1, 'parser: clean JSON parses correctly');
  } catch (e) {
    assert(false, `parser: clean JSON parses correctly (threw: ${e.message})`);
  }

  // JSON with markdown heading BEFORE the JSON (Wazdan-style leak)
  try {
    const r = parseJsonResponse('# KEYWORD PLAN\n\n{"a":1}');
    assert(r.a === 1, 'parser: markdown heading BEFORE JSON stripped by first-brace logic');
  } catch (e) {
    assert(false, `parser: markdown heading BEFORE JSON (threw: ${e.message})`);
  }

  // JSON with markdown heading INSIDE the JSON region (Pronet-style leak)
  try {
    const r = parseJsonResponse('{\n# KEYWORD PLAN\n"a":1\n}');
    assert(r.a === 1, 'parser: markdown heading INSIDE JSON stripped by defensive cleaner');
  } catch (e) {
    assert(false, `parser: markdown heading INSIDE JSON (threw: ${e.message})`);
  }

  // JSON wrapped in code fence
  try {
    const r = parseJsonResponse('```json\n{"a":1}\n```');
    assert(r.a === 1, 'parser: code fence stripped');
  } catch (e) {
    assert(false, `parser: code fence (threw: ${e.message})`);
  }

  // Unrecoverable garbage → throws with rawText preserved
  try {
    parseJsonResponse('# Heading only no JSON here at all');
    assert(false, 'parser: garbage should throw');
  } catch (err) {
    assert(typeof err.rawText === 'string' && err.rawText.length > 0, 'parser: throw error includes rawText for forensic logging');
    assert(err.rawText.includes('Heading only'), 'parser: rawText preserves the original LLM response');
  }

  // -------------------------------------------------------------------------
  // {faq_count} interpolation
  // -------------------------------------------------------------------------
  console.log('\n=== {faq_count} interpolation ===');

  {
    const interpolated = buildPrompt(
      'Produce {faq_count} FAQs.',
      'analysis',
      {},
      'research',
      7
    );
    assert(interpolated === 'Produce 7 FAQs.', 'buildPrompt: {faq_count} replaced with 7');
  }
  {
    const interpolated = buildPrompt(
      'Produce {faq_count} FAQs.',
      'analysis',
      {},
      'research',
      0
    );
    assert(interpolated === 'Produce 0 FAQs.', 'buildPrompt: {faq_count} replaced with 0');
  }
  {
    const interpolated = buildPrompt(
      'No placeholder here. Override prompt with hardcoded 5 FAQs.',
      'analysis',
      {},
      'research',
      0
    );
    assert(interpolated.includes('hardcoded 5 FAQs'), 'buildPrompt: faq_count does not touch override prompts that omit the placeholder');
  }
  {
    // Manifest default contains {faq_count} placeholder
    assert(MANIFEST_DEFAULT_PROMPT.includes('{faq_count}'), 'manifest default contains {faq_count} placeholder');
  }

  // -------------------------------------------------------------------------
  // parseResearchQueries (regression — fixed yesterday in v2.1.0+)
  // -------------------------------------------------------------------------
  console.log('\n=== parseResearchQueries regression ===');

  {
    const queries = parseResearchQueries(
      MANIFEST.options_defaults.research_queries,
      'TestEnt',
      'test-context'
    );
    assert(queries.length === 3, `manifest default research_queries → 3 queries (got ${queries.length})`);
  }

  {
    const queries = parseResearchQueries('A\nB\nC', 'X', 'Y');
    assert(queries.length === 3, 'flat lines → 3 queries (backward-compat)');
  }

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log(`\n=== Result: ${pass} pass, ${fail} fail ===`);
  process.exit(fail === 0 ? 0 : 1);
})();
