/**
 * Fail-closed test harness for hallucination-detector (A3 / MODERATE M1).
 *
 * Run: node modules/step-6-qa/hallucination-detector/test-fail-closed.js
 * From repo root. No network -- ai.complete is mocked.
 *
 * The Program A principle under test: a QA checker must never emit "pass" for
 * content it did not actually verify. "I couldn't check" must be distinguishable
 * from "I checked and it's fine," and must not flow downstream as success.
 *
 * Covers:
 *   (a) Absent/empty content_markdown -> qa_pass:false (fail closed), because
 *       content was expected but is absent (content_markdown is base-hydrated;
 *       requires_items means an empty-pool entity is skipped upstream, so
 *       reaching here with no content_markdown means generation produced nothing).
 *       Opt-out allow_empty_content restores skip-with-pass for pipelines that
 *       legitimately have no content to check.
 *   (b) Unparseable LLM verification -> qa_pass:false (fail closed). Regression
 *       guard: the check-failure path already treats unparseable claims as
 *       unsupported, dragging the score below threshold. "Unverifiable is not
 *       verified."
 *   Regression guards for the untouched good paths (real content, parseable).
 */

const execute = require('./execute.js');

let pass = 0;
let fail = 0;
function assert(cond, msg) {
  if (cond) { console.log(`  PASS: ${msg}`); pass++; }
  else { console.log(`  FAIL: ${msg}`); fail++; }
}

// Mock tools. ai.complete returns whatever `respond` yields, and records calls.
function makeTools(respond) {
  const state = { calls: 0 };
  const tools = {
    logger: { info: () => {}, warn: () => {}, error: () => {} },
    progress: { update: () => {} },
    ai: {
      complete: async () => {
        state.calls++;
        return { text: respond() };
      },
    },
  };
  return { tools, state };
}

const CLAIM = 'Acme was founded in 2005.';
const SOURCE = 'Acme was founded in 2005 in London.';

// One entity with real content + a source (yields one extractable claim).
function entityWithContent() {
  return { name: 'Acme', items: [{ content_markdown: CLAIM }, { text_content: SOURCE }] };
}
// An entity whose pool has items (scraping ran) but NO content_markdown.
function entityNoContent() {
  return { name: 'Acme', items: [{ text_content: SOURCE }] };
}

(async () => {
  console.log('\n=== A3 hallucination-detector fail-closed on empty content ===\n');

  // --- 1. Regression: real content + parseable + no hallucinations -> pass ---
  console.log('1. Good path: real content, all claims supported -> pass');
  {
    const { tools, state } = makeTools(() =>
      `[{"claim":"${CLAIM}","verdict":"supported","quote":"${SOURCE}","severity":"low"}]`);
    const res = await execute({ entities: [entityWithContent()] }, {}, tools);
    const item = res.results[0].items[0];
    assert(state.calls === 1, 'the LLM was actually called (real verification happened)');
    assert(item.qa_pass === true, 'qa_pass is true when every claim is supported');
    assert(res.summary.passed === 1 && res.summary.failed === 0, 'summary counts it as passed');
  }

  // --- 2. Regression: real content + parseable + hallucination -> fail ---
  console.log('2. Good path: real content, claim unsupported -> fail');
  {
    const { tools } = makeTools(() =>
      `[{"claim":"${CLAIM}","verdict":"unsupported","quote":null,"severity":"high"}]`);
    const res = await execute({ entities: [entityWithContent()] }, {}, tools);
    const item = res.results[0].items[0];
    assert(item.qa_pass === false, 'qa_pass is false when a claim is unsupported');
  }

  // --- 3. (a) Absent content_markdown -> fail closed (the M1 fix) ---
  console.log('3. Empty content: no content_markdown -> qa_pass:false, does NOT pass downstream');
  {
    const { tools, state } = makeTools(() => '[]');
    const res = await execute({ entities: [entityNoContent()] }, {}, tools);
    const entity = res.results[0];
    assert(entity.items[0].qa_pass === false, 'item.qa_pass is false (fail closed)');
    assert(entity.meta.qa_pass === false, 'meta.qa_pass is false (verdict, not a silent skip-pass)');
    assert(state.calls === 0, 'no LLM call -- nothing was verified');
    // The load-bearing assertion: it must NOT flow downstream as verified-success.
    assert(res.summary.passed === 0 && res.summary.failed === 1,
      'summary counts it as failed, not passed -- no silent-salvage green');
  }

  // --- 4. (a) Opt-out: allow_empty_content restores skip-with-pass ---
  console.log('4. Opt-out: allow_empty_content=true -> skip-with-pass, distinguishable from a real pass');
  {
    const { tools } = makeTools(() => '[]');
    const res = await execute({ entities: [entityNoContent()] }, { allow_empty_content: true }, tools);
    const entity = res.results[0];
    assert(entity.items[0].qa_pass === true, 'qa_pass is true under the opt-out');
    assert(entity.meta.skipped === true && entity.meta.skip_reason === 'no_content_allowed',
      'meta marks it skipped with reason no_content_allowed (distinct from verified-pass)');
  }

  // --- 5. (b) Unparseable verification -> fail closed (regression guard) ---
  console.log('5. Unparseable LLM response: claims treated as unverified -> qa_pass:false');
  {
    const { tools, state } = makeTools(() => 'I am sorry, I cannot complete this request.');
    const res = await execute({ entities: [entityWithContent()] }, {}, tools);
    const item = res.results[0].items[0];
    assert(state.calls === 1, 'the LLM was called');
    assert(item.qa_pass === false, 'qa_pass is false when the verification response is unparseable');
    assert(item.hallucination_score === 0, 'score is 0 -- unverifiable is not verified');
  }

  console.log(`\n=== Result: ${pass} pass, ${fail} fail ===`);
  process.exit(fail === 0 ? 0 : 1);
})();
