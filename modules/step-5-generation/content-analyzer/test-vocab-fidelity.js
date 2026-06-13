/**
 * Standalone test harness for content-analyzer W1.3.
 *
 * Run: node modules/step-5-generation/content-analyzer/test-vocab-fidelity.js
 * From repo root.
 *
 * Covers the W1.3 contract-hardening change (Plan 2 / Rule 13 rollout):
 *   - vocabulary_checks option (default "") — config-driven, Rule-13-agnostic.
 *     Format: "<analysis_json.path[].slug>=<reference_doc_name.md>" per line.
 *   - Pre-flight: if a referenced vocab doc is missing/empty, REFUSE all
 *     entities BEFORE any LLM call.
 *   - Fidelity gate: every assigned slug at each configured path MUST appear in
 *     the named vocab doc; an out-of-vocabulary slug FAILS that entity.
 *   - Empty config → gate inert (fully agnostic; generic content types and the
 *     no-vocabulary case are unaffected).
 *
 * No network — ai.complete is mocked to return a fixed analysis JSON.
 */

const execute = require('./execute.js');
const MANIFEST = require('./manifest.json');

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { console.log(`  PASS: ${msg}`); pass++; }
  else { console.log(`  FAIL: ${msg}`); fail++; }
}

function makeTools(analysisObj) {
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
    ai: { complete: async () => { aiCalls++; return { text: JSON.stringify(analysisObj) }; } },
    _partialItems: [],
  };
}

const entity = { name: 'Acme', items: [{ source_submodule: 'page-scraper', text_content: 'About Acme.', url: 'https://acme.example', word_count: 3 }] };

const VOCAB_CHECKS = [
  'categories.primary[].slug=master_categories.md',
  'categories.secondary[].slug=master_categories.md',
  'tags.existing[].slug=master_tags.md',
].join('\n');

// Vocab docs (mirror the real format: backtick-wrapped + heading slugs).
const refDocsGood = {
  'master_categories.md': '## Categories\n### casino-platforms - Casino Platforms\n### sportsbook-platform - Sportsbook\nAlso `casino-platforms` and `sportsbook-platform`.',
  'master_tags.md': '## Tags\n- `api` — api\n- `white-label` — white label',
};

const analysisInVocab = {
  categories: { primary: [{ slug: 'casino-platforms' }], secondary: [{ slug: 'sportsbook-platform' }] },
  tags: { existing: [{ slug: 'api' }], suggested_new: [] },
  key_facts: {},
};
const analysisOutOfVocab = {
  categories: { primary: [{ slug: 'totally-made-up-category' }], secondary: [] },
  tags: { existing: [{ slug: 'api' }], suggested_new: [] },
  key_facts: {},
};

const base = { ...MANIFEST.options_defaults };

(async () => {
  // ----------------------------------------------------------------------
  // Manifest sanity (config part of W1.3)
  // ----------------------------------------------------------------------
  console.log('\n=== Manifest sanity ===');
  assert(MANIFEST.version === '1.4.1', `manifest version bumped to 1.4.1 (got ${MANIFEST.version})`);
  assert(MANIFEST.options.some(o => o.name === 'vocabulary_checks'), 'vocabulary_checks option present');
  assert(MANIFEST.options_defaults.vocabulary_checks === '', 'vocabulary_checks default is empty string');

  // ----------------------------------------------------------------------
  // 1. Empty config → gate inert (agnostic; unchanged behavior)
  // ----------------------------------------------------------------------
  console.log('\n=== Empty vocabulary_checks → gate inert ===');
  {
    const tools = makeTools(analysisOutOfVocab); // even an "invalid" slug must pass when no gate configured
    const opts = { ...base, vocabulary_checks: '', reference_docs: refDocsGood };
    const result = await execute({ entities: [entity] }, opts, tools);
    assert(result.results[0].items[0].status === 'analyzed', 'empty config: entity analyzed normally (no gate)');
    assert(tools.aiCalls === 1, 'empty config: LLM called as usual');
  }

  // ----------------------------------------------------------------------
  // 2. Pre-flight: vocab doc missing → REFUSE all entities before LLM
  // ----------------------------------------------------------------------
  console.log('\n=== Pre-flight: missing vocab doc → refuse before LLM ===');
  {
    const tools = makeTools(analysisInVocab);
    const opts = { ...base, vocabulary_checks: VOCAB_CHECKS, reference_docs: {} }; // no docs attached
    const result = await execute({ entities: [entity] }, opts, tools);
    assert(result.results[0].items[0].status === 'error', 'pre-flight: entity errored');
    assert(/missing or empty/i.test(result.results[0].items[0].error || ''), 'pre-flight: error says doc missing or empty');
    assert(/master_categories\.md/.test(result.results[0].items[0].error || ''), 'pre-flight: error names the missing doc');
    assert(tools.aiCalls === 0, 'pre-flight: fails BEFORE any LLM call (no tokens spent)');
  }

  // ----------------------------------------------------------------------
  // 3. Fidelity gate PASS: all assigned slugs are in the vocab
  // ----------------------------------------------------------------------
  console.log('\n=== Fidelity gate: in-vocabulary slugs → pass ===');
  {
    const tools = makeTools(analysisInVocab);
    const opts = { ...base, vocabulary_checks: VOCAB_CHECKS, reference_docs: refDocsGood };
    const result = await execute({ entities: [entity] }, opts, tools);
    assert(result.results[0].items[0].status === 'analyzed', 'gate pass: entity analyzed (all slugs in vocab)');
    assert(!result.results[0].items[0].error, 'gate pass: no error');
  }

  // ----------------------------------------------------------------------
  // 4. Fidelity gate FAIL: an out-of-vocabulary slug
  // ----------------------------------------------------------------------
  console.log('\n=== Fidelity gate: out-of-vocabulary slug → fail ===');
  {
    const tools = makeTools(analysisOutOfVocab);
    const opts = { ...base, vocabulary_checks: VOCAB_CHECKS, reference_docs: refDocsGood };
    const result = await execute({ entities: [entity] }, opts, tools);
    assert(result.results[0].items[0].status === 'error', 'gate fail: entity errored');
    assert(/totally-made-up-category/.test(result.results[0].items[0].error || ''), 'gate fail: error names the offending slug');
    assert(/master_categories\.md/.test(result.results[0].items[0].error || ''), 'gate fail: error names the vocab source');
    assert(tools.logs.some(l => l.level === 'error'), 'gate fail: logged at error level');
  }

  // ----------------------------------------------------------------------
  // Direct helper checks
  // ----------------------------------------------------------------------
  console.log('\n=== Helpers ===');
  const { extractVocabSlugs, walkSlugPath, parseVocabularyChecks } = execute.__testing;
  const set = extractVocabSlugs(refDocsGood['master_categories.md']);
  assert(set.has('casino-platforms'), 'extractVocabSlugs: finds hyphenated slug');
  assert(!set.has('totally-made-up-category'), 'extractVocabSlugs: absent slug not in set');
  assert(JSON.stringify(walkSlugPath(analysisInVocab, 'categories.primary[].slug')) === JSON.stringify(['casino-platforms']), 'walkSlugPath: extracts assigned slug');
  assert(parseVocabularyChecks(VOCAB_CHECKS).length === 3, 'parseVocabularyChecks: 3 entries');
  assert(parseVocabularyChecks('').length === 0, 'parseVocabularyChecks: empty → []');

  console.log(`\n=== Result: ${pass} pass, ${fail} fail ===`);
  process.exit(fail === 0 ? 0 : 1);
})();
