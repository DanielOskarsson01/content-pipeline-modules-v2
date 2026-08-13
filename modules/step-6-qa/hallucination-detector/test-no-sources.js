/**
 * H20 -- hallucination-detector must NOT pass when it has no sources to verify against.
 *
 * Run: node modules/step-6-qa/hallucination-detector/test-no-sources.js
 * From repo root. No network -- ai.complete is mocked (and must NOT be called).
 *
 * The defect: sourceItems.length === 0 returned qa_pass:true, hallucination_score:1,
 * skipped:true -- content asserting factual claims with NOTHING to ground them
 * against, certified with a perfect score. UNIT_50 Decision 1 calls this "THE
 * SEVERE ONE." The fix fails closed by default (no_sources_behavior='fail'),
 * extracts claims first so the failure can report how many were unverifiable,
 * and keeps a carve-out for pipelines that legitimately have no sources.
 *
 * RED before the fix (case 1 passes green), GREEN after (case 1 fails closed).
 */

const execute = require('./execute.js');

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { console.log(`  PASS: ${msg}`); pass++; }
  else { console.log(`  FAIL: ${msg}`); fail++; }
}
function makeTools(respond) {
  const state = { calls: 0 };
  return {
    state,
    tools: {
      logger: { info: () => {}, warn: () => {}, error: () => {} },
      progress: { update: () => {} },
      ai: { complete: async () => { state.calls++; return { text: respond ? respond() : '[]' }; } },
      _partialItems: [],
    },
  };
}

// Content that DOES make a factual claim, but with no source items to check it.
const CLAIMFUL = '# Acme\n\nAcme was founded in 2005 and employs 5,000 people.';
const contentNoSources = { name: 'Acme', items: [{ content_markdown: CLAIMFUL }] };

(async () => {
  console.log('\n=== H20: hallucination-detector fails closed with no sources ===\n');

  // --- 1. THE DEFECT: claimful content, zero sources -> must NOT pass ---
  console.log('1. Claimful content, no sources -> fail closed (was pass-with-score-1)');
  {
    const { tools, state } = makeTools();
    const res = await execute({ entities: [contentNoSources] }, {}, tools);
    const item = res.results[0].items[0];
    console.log(`     -> qa_pass=${item.qa_pass}, score=${item.hallucination_score}`);
    assert(item.qa_pass === false, `does NOT certify unverifiable content (qa_pass=${item.qa_pass})`);
    assert(item.hallucination_score === 0, `score is 0, not 1 (got ${item.hallucination_score})`);
    assert(res.results[0].meta.qa_pass === false, 'meta.qa_pass is false (a verdict, not a silent skip)');
    assert(res.summary.failed === 1 && res.summary.passed === 0, 'summary counts it failed, not passed');
    assert(state.calls === 0, 'no LLM call -- there was nothing to verify against');
  }

  // --- 2. The failure reports the unverifiable claims (extracted before the guard) ---
  console.log('\n2. The no-sources failure reports how many claims are unverifiable');
  {
    const { tools } = makeTools();
    const res = await execute({ entities: [contentNoSources] }, {}, tools);
    const item = res.results[0].items[0];
    assert(item.total_claims_count >= 1, `claims were extracted before failing (${item.total_claims_count})`);
    assert(/unverifiable|no source/i.test(item.summary_text), 'summary explains why it failed');
  }

  // --- 3. Carve-out: no_sources_behavior='pass' restores legacy skip-with-pass ---
  console.log('\n3. Carve-out: no_sources_behavior=pass -> legacy skip-with-pass');
  {
    const { tools } = makeTools();
    const res = await execute({ entities: [contentNoSources] }, { no_sources_behavior: 'pass' }, tools);
    const item = res.results[0].items[0];
    assert(item.qa_pass === true, 'opt-out passes');
    assert(res.results[0].meta.skipped === true, 'opt-out marks it skipped (distinct from a verified pass)');
  }

  console.log(`\n=== Result: ${pass} pass, ${fail} fail ===`);
  process.exit(fail === 0 ? 0 : 1);
})();
