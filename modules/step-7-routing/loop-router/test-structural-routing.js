/**
 * Standalone test harness for loop-router C3 (Program A / A2).
 *
 * Run: node modules/step-7-routing/loop-router/test-structural-routing.js
 * From repo root.
 *
 * Covers the C3 fix: loop-router silently APPROVED a structural-only QA
 * failure because `structural` was omitted from the `failures[]` list that
 * drives the routing decision (and had no single-failure routing rule).
 *
 *   1. Structural-ONLY failure  -> decision is NOT 'approve' (the fix).
 *   2. Structural + another fail -> flag_manual, and structural now appears
 *      in the reported failures[] (proves it's counted).
 *   3. All checks pass (incl. structural) -> 'approve' (regression guard).
 *   4. Keyword-only failure -> loop_tone, unchanged (no perturbation).
 *
 * No network. Pure decision logic -- mocks only logger/progress/_partialItems.
 */

const execute = require('./execute.js');
const MANIFEST = require('./manifest.json');

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

function makeTools() {
  const logs = [];
  return {
    logs,
    logger: {
      info: (m) => logs.push({ level: 'info', message: m }),
      warn: (m) => logs.push({ level: 'warn', message: m }),
      error: (m) => logs.push({ level: 'error', message: m }),
    },
    progress: { update: () => {} },
    _partialItems: [],
  };
}

// Enough source pages that the dead-site (0 pages) and min_source_pages (8)
// gates never fire -- keeps every scenario on the QA-verdict routing path.
function sourcePages(n) {
  return Array.from({ length: n }, (_, i) => ({
    url: `https://example.com/page-${i}`,
    word_count: 500,
  }));
}

const PASS = (fields) => ({ ...fields, qa_pass: true });
const FAIL = (fields) => ({ ...fields, qa_pass: false });

// A full QA run where the ONLY failing check is structural.
const structuralOnly = {
  name: 'StructuralOnlyFail',
  items: [
    FAIL({ structural_score: 0.3 }),
    PASS({ keyword_score: 0.9 }),
    PASS({ meta_title_ok: true }),
    PASS({ citation_score: 0.9 }),
    PASS({ hallucination_score: 0.95 }),
    ...sourcePages(10),
  ],
};

// Structural fails AND keyword fails (two failures).
const structuralPlusKeyword = {
  name: 'StructuralPlusKeywordFail',
  items: [
    FAIL({ structural_score: 0.3 }),
    FAIL({ keyword_score: 0.2 }),
    PASS({ meta_title_ok: true }),
    PASS({ citation_score: 0.9 }),
    PASS({ hallucination_score: 0.95 }),
    ...sourcePages(10),
  ],
};

// Everything passes, structural included.
const allPass = {
  name: 'AllPass',
  items: [
    PASS({ structural_score: 0.95 }),
    PASS({ keyword_score: 0.9 }),
    PASS({ meta_title_ok: true }),
    PASS({ citation_score: 0.9 }),
    PASS({ hallucination_score: 0.95 }),
    ...sourcePages(10),
  ],
};

// Keyword-only failure, structural passes (unchanged behavior).
const keywordOnly = {
  name: 'KeywordOnlyFail',
  items: [
    PASS({ structural_score: 0.95 }),
    FAIL({ keyword_score: 0.2 }),
    PASS({ meta_title_ok: true }),
    PASS({ citation_score: 0.9 }),
    PASS({ hallucination_score: 0.95 }),
    ...sourcePages(10),
  ],
};

const baseOptions = { default_no_qa: 'flag_manual', max_loops: 3, min_source_pages: 8 };

async function decide(entity) {
  const tools = makeTools();
  const result = await execute({ entities: [entity] }, baseOptions, tools);
  return result.results[0];
}

(async () => {
  // 0. Manifest sanity (config part of the C3 fix).
  console.log('\n=== Manifest sanity ===');
  assert(MANIFEST.version === '1.0.1', 'manifest version bumped to 1.0.1');
  assert(
    MANIFEST.depends_on.includes('qa-structural'),
    'qa-structural declared in depends_on'
  );

  // 1. THE fix: a structural-only failure must not silently approve.
  console.log('\n=== Structural-only failure -> NOT approve ===');
  {
    const r = await decide(structuralOnly);
    assert(r.meta.decision !== 'approve', 'structural-only: decision is NOT approve (was approve)');
    assert(r.meta.decision === 'loop_generation', 'structural-only: routes to loop_generation');
    assert(r.meta.failed_checks.includes('structural'), 'structural-only: structural reported as a failed check');
  }

  // 2. Structural alongside another failure -> flag_manual, structural counted.
  console.log('\n=== Structural + keyword failure -> flag_manual, structural in failures[] ===');
  {
    const r = await decide(structuralPlusKeyword);
    assert(r.meta.decision !== 'approve', 'multi-fail: decision is NOT approve');
    assert(r.meta.decision === 'flag_manual', 'multi-fail: two failures -> flag_manual');
    assert(
      /structural/.test(r.items[0].route_reason),
      'multi-fail: structural appears in the failures[] listed in route_reason'
    );
  }

  // 3. Regression: all pass (incl. structural) still approves.
  console.log('\n=== All checks pass (incl. structural) -> approve ===');
  {
    const r = await decide(allPass);
    assert(r.meta.decision === 'approve', 'all-pass: decision is approve (good path untouched)');
  }

  // 4. No perturbation: keyword-only failure still routes to loop_tone.
  console.log('\n=== Keyword-only failure -> loop_tone (unchanged) ===');
  {
    const r = await decide(keywordOnly);
    assert(r.meta.decision === 'loop_tone', 'keyword-only: still loop_tone (other check types unperturbed)');
  }

  console.log(`\n=== Result: ${pass} pass, ${fail} fail ===`);
  process.exit(fail === 0 ? 0 : 1);
})();
