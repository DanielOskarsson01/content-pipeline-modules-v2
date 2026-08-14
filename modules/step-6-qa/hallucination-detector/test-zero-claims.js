/**
 * H21 (sound partial) -- zero extracted claims must not be a clean green.
 *
 * Run: node modules/step-6-qa/hallucination-detector/test-zero-claims.js
 * From repo root. No network -- ai.complete mocked (must NOT be called; nothing
 * was extracted to verify).
 *
 * The defect: extraction keeps only sentences matching enumerated numeric/date/
 * company regex patterns (FACTUAL_CLAIM_PATTERNS). Purely qualitative content
 * ("offers an excellent user experience", "is widely regarded as a leader")
 * matches nothing -> zero claims -> automatic qa_pass:true, hallucination_score:1.
 * A long article of unverifiable qualitative claims is certified perfect.
 *
 * This session implements the SOUND part: substantial content that yields zero
 * extractable claims is the padding-blind signature -- it stops being a clean
 * pass. Below the threshold (genuinely little to check) it is a low-confidence
 * pass (needs_review). The full remedy -- replacing regex extraction with an LLM
 * faithfulness pass and de-duplicating the regex shared with citation-coverage
 * (UNIT_50 #51, architectural, gated after W2.3) -- is recorded, NOT attempted
 * here (a regex broadening would manufacture false confidence -- UNIT_50 OQ7).
 *
 * RED before the fix (case 1 passes green with score 1), GREEN after.
 */

const execute = require('./execute.js');

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { console.log(`  PASS: ${msg}`); pass++; }
  else { console.log(`  FAIL: ${msg}`); fail++; }
}
function makeTools() {
  const state = { calls: 0 };
  return {
    state,
    tools: {
      logger: { info: () => {}, warn: () => {}, error: () => {} },
      progress: { update: () => {} },
      ai: { complete: async () => { state.calls++; return { text: '[]' }; } },
      _partialItems: [],
    },
  };
}

// A LONG, purely-qualitative article: no numbers, dates, %, $, or company-fact
// patterns -> extractClaims() returns []. This is the H21 blind spot at scale.
const QUALITATIVE = '# Acme Casino Review\n\n' + (
  'Acme offers an excellent user experience and a beautifully designed interface. ' +
  'Players consistently praise its smooth navigation and its welcoming, friendly feel. ' +
  'The support team is helpful and responsive, and the overall atmosphere is inviting. ' +
  'It is widely regarded as a trustworthy and reputable destination for casual players. ' +
  'The games feel fair, the promotions feel generous, and the whole platform feels polished. '
).repeat(4);
// Sources present, so the no-sources guard is NOT what fires here.
const qualEntity = { name: 'Acme', items: [
  { content_markdown: QUALITATIVE },
  { text_content: 'Acme is an online casino. It has games and support.' },
] };

// A genuinely tiny snippet with no claims -> still a (low-confidence) pass.
const tinyEntity = { name: 'Tiny', items: [
  { content_markdown: '# Hi\n\nWelcome.' },
  { text_content: 'Some source.' },
] };

(async () => {
  console.log('\n=== H21: zero extracted claims is not a clean green ===\n');

  // --- 1. THE DEFECT: long qualitative content, zero claims -> must NOT clean-pass ---
  console.log('1. Long qualitative content, zero extractable claims -> not a clean pass');
  {
    const { tools, state } = makeTools();
    const res = await execute({ entities: [qualEntity] }, {}, tools);
    const item = res.results[0].items[0];
    console.log(`     -> qa_pass=${item.qa_pass}, score=${item.hallucination_score}, needs_review=${item.needs_review}, len=${QUALITATIVE.length}`);
    assert(state.calls === 0, 'no LLM call -- zero claims were extracted (the coverage gap)');
    assert(!(item.qa_pass === true && item.hallucination_score === 1 && !item.needs_review),
      'is NOT a clean perfect green (the old score:1 auto-pass is gone)');
    assert(item.qa_pass === false, 'substantial content with zero verifiable claims fails closed');
    assert(item.needs_review === true, 'flagged needs_review');
    assert(/qualitative|zero|no .*claim|could not|unverif/i.test(item.summary_text), 'summary explains the coverage gap');
  }

  // --- 2. Tiny content with no claims -> low-confidence pass (not everything must fail) ---
  console.log('\n2. Tiny content, no claims -> low-confidence pass (needs_review), not a hard fail');
  {
    const { tools } = makeTools();
    const res = await execute({ entities: [tinyEntity] }, {}, tools);
    const item = res.results[0].items[0];
    assert(item.qa_pass === true, 'tiny no-claim content still passes (nothing to check)');
    assert(item.needs_review === true, 'but marked needs_review (no longer a confident clean pass)');
  }

  console.log(`\n=== Result: ${pass} pass, ${fail} fail ===`);
  process.exit(fail === 0 ? 0 : 1);
})();
