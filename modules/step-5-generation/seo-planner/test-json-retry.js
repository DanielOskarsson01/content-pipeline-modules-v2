/**
 * Standalone test harness for seo-planner JSON-retry robustness.
 *
 * Run: node modules/step-5-generation/seo-planner/test-json-retry.js
 * From repo root.
 *
 * Covers the corrective-retry safety net: when the model returns markdown/prose
 * instead of JSON (observed 2026-06-13 on Wazdan + Pronet — the live template
 * prompt had lost its OUTPUT-FORMAT/JSON contract), seo-planner retries ONCE
 * with a strict JSON-only correction that includes the prior response for
 * reformatting. If the retry also fails, it throws (loud), preserving rawText.
 *
 * Pipeline-agnostic: the retry names no content-type-specific keys.
 *
 * No network — ai.complete is mocked.
 */

const execute = require('./execute.js');

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { console.log(`  PASS: ${msg}`); pass++; }
  else { console.log(`  FAIL: ${msg}`); fail++; }
}

function makeAi(responses) {
  const calls = [];
  let i = 0;
  return {
    calls,
    complete: async (opts) => { calls.push(opts); const t = responses[Math.min(i, responses.length - 1)]; i++; return { text: t }; },
  };
}
const logger = { info() {}, warn() {}, error() {} };
const baseOpts = { prompt: 'Make a plan.', model: 'sonnet', provider: 'anthropic', temperature: 0.4, max_tokens: 4096 };

const MARKDOWN = '# SEO Keyword Distribution Plan — Wazdan\n\n**Meta Title:** `Wazdan ...`\n\n## Target Keywords\n- online slot';
const VALID_JSON = '{"target_keywords":{"primary":"online slot","secondary":[],"long_tail":[]},"meta":{"title":"T","description":"D"},"faqs":[]}';

(async () => {
  const { completeWithJsonRetry } = execute.__testing;

  console.log('\n=== exported ===');
  assert(typeof completeWithJsonRetry === 'function', 'completeWithJsonRetry is exported from __testing');

  // 1. Markdown first → retry → valid JSON recovered
  console.log('\n=== markdown then JSON → recovered via retry ===');
  {
    const ai = makeAi([MARKDOWN, VALID_JSON]);
    const plan = await completeWithJsonRetry(ai, baseOpts, logger, 'Wazdan');
    assert(plan && plan.target_keywords && plan.target_keywords.primary === 'online slot', 'recovered the JSON plan on retry');
    assert(ai.calls.length === 2, 'retried exactly once (2 LLM calls)');
    assert(ai.calls[1].temperature === 0, 'retry forces temperature 0 for determinism');
    assert(/ONLY/i.test(ai.calls[1].prompt) && /JSON/i.test(ai.calls[1].prompt), 'retry prompt demands JSON-only');
    assert(ai.calls[1].prompt.includes('# SEO Keyword Distribution Plan'), 'retry includes the prior (invalid) response for reformatting');
  }

  // 2. Valid JSON first → no retry
  console.log('\n=== valid JSON first → no retry ===');
  {
    const ai = makeAi([VALID_JSON]);
    const plan = await completeWithJsonRetry(ai, baseOpts, logger, 'Pronet');
    assert(plan.target_keywords.primary === 'online slot', 'parsed first-attempt JSON');
    assert(ai.calls.length === 1, 'no retry when first attempt is valid (1 LLM call)');
  }

  // 3. Markdown both times → throws loudly, preserves rawText
  console.log('\n=== markdown twice → throws (loud) ===');
  {
    const ai = makeAi([MARKDOWN, '# still markdown, not JSON']);
    let threw = false;
    try {
      await completeWithJsonRetry(ai, baseOpts, logger, 'Wazdan');
    } catch (err) {
      threw = true;
      assert(ai.calls.length === 2, 'attempted twice before giving up');
      assert(typeof err.rawText === 'string' && err.rawText.length > 0, 'thrown error preserves rawText for forensics');
    }
    assert(threw, 'throws when both attempts fail (does not silently return null)');
  }

  console.log(`\n=== Result: ${pass} pass, ${fail} fail ===`);
  process.exit(fail === 0 ? 0 : 1);
})();
