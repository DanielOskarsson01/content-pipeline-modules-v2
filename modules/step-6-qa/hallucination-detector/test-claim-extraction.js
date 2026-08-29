/**
 * B033 -- LLM claim extraction (claim_extraction option) + severity floor.
 *
 * Run: node modules/step-6-qa/hallucination-detector/test-claim-extraction.js
 * From repo root. No network -- ai.complete is mocked. The REAL Anthropic
 * extraction measurement on push-gaming.md is a separate probe script (not a
 * committed test), reported in the session log.
 *
 * WHY (R0 proof): on the real v3 draft push-gaming.md the regex extractor found
 * only 4 claims (3 full + 1 partial, 0 unsupported) -> score 0.875 -> FAIL at
 * 0.9. v3 moves facts into Quick-Facts tables + lists the prose-only regex can't
 * see, so one partial costs 12.5%. This suite proves:
 *   1. default (regex, no severity floor) is BYTE-IDENTICAL to git HEAD
 *      (A/B on push-gaming.md + 2 real drafts) -- the migration changes nothing off.
 *   2. claim_extraction:"llm" routes extraction through an LLM call that can read
 *      tables/lists -> substantially more claims than the regex path.
 *   3. severity_floor force-fails a hard high-severity fabrication even when the
 *      numeric ratio would PASS (B031/M3 force-fail pattern; still hallucination:fail).
 *   4. zero-claims path still behaves (llm extraction empty -> regex fallback -> H21).
 *   5. both flags accept true AND "true" (string-typed-preset bug class).
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const execute = require('./execute.js');

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { console.log(`  PASS: ${msg}`); pass++; }
  else { console.log(`  FAIL: ${msg}`); fail++; }
}

const FIX = path.join(__dirname, 'fixtures');
const pushGaming = fs.readFileSync(path.join(FIX, 'push-gaming.md'), 'utf8');
const elk = fs.readFileSync(path.join(FIX, 'elk_editor_it1.md'), 'utf8');
const nolimit = fs.readFileSync(path.join(FIX, 'nolimit_editor_it1.md'), 'utf8');

// --- Extract the git-HEAD execute.js so we can A/B against it for byte-identity ---
const SCRATCH = process.env.CLAUDE_SCRATCH ||
  '/private/tmp/claude-501/-Users-danieloskarsson-dev-content-pipeline-modules-v2/9b8a2a13-f373-4387-a5d1-51dc6e0a8d28/scratchpad';
const headPath = path.join(SCRATCH, 'hd-head-execute.js');
const REPO = '/Users/danieloskarsson/dev/content-pipeline-modules-v2';
execSync(
  `git -C ${REPO} show HEAD:modules/step-6-qa/hallucination-detector/execute.js > ${headPath}`,
  { stdio: ['ignore', 'ignore', 'inherit'] }
);
const executeHead = require(headPath);

// Deterministic verification mock: verdict decided by claim index.
// Distinguishes an EXTRACTION call (prompt names the claim-extraction assistant)
// from a VERIFICATION call (prompt names the fact-checking assistant).
function makeTools({ extractClaims = null, verdictForIndex = () => 'supported' } = {}) {
  const state = { extractionCalls: 0, verificationCalls: 0 };
  return {
    state,
    tools: {
      logger: { info: () => {}, warn: () => {}, error: () => {} },
      progress: { update: () => {} },
      _partialItems: [],
      ai: {
        complete: async ({ prompt }) => {
          if (/claim-extraction assistant/i.test(prompt)) {
            state.extractionCalls++;
            return { text: JSON.stringify(extractClaims || []) };
          }
          // verification: claims arrive as numbered lines "N. <claim>"
          state.verificationCalls++;
          const count = (prompt.match(/^\d+\.\s/gm) || []).length;
          const verdicts = [];
          for (let i = 0; i < count; i++) {
            const v = verdictForIndex(i);
            verdicts.push(typeof v === 'string'
              ? { claim: `c${i}`, verdict: v, quote: null, severity: 'medium' }
              : { claim: `c${i}`, quote: null, severity: 'medium', ...v });
          }
          return { text: JSON.stringify(verdicts) };
        },
      },
    },
  };
}

function entity(name, md) {
  return { name, items: [
    { content_markdown: md },
    { text_content: 'Source material about the entity for grounding claims.' },
  ] };
}

(async () => {
  console.log('\n=== B033: LLM claim extraction + severity floor ===\n');

  // --- 1. DEFAULT (regex, no severity floor) BYTE-IDENTICAL to git HEAD -----------
  console.log('1. default-off byte-identity vs git HEAD (push-gaming + elk + nolimit)');
  for (const [nm, md] of [['push-gaming', pushGaming], ['elk', elk], ['nolimit', nolimit]]) {
    // Same deterministic verdicts for both versions: mixed to exercise all counters.
    const verdict = (i) => (i % 4 === 0 ? 'partial' : 'supported');
    const a = makeTools({ verdictForIndex: verdict });
    const b = makeTools({ verdictForIndex: verdict });
    const resHead = await executeHead({ entities: [entity(nm, md)] }, {}, a.tools);
    const resNew = await execute({ entities: [entity(nm, md)] }, {}, b.tools);
    assert(JSON.stringify(resNew) === JSON.stringify(resHead),
      `${nm}: new output === HEAD output (default regex, no severity floor)`);
    assert(a.state.extractionCalls === 0 && b.state.extractionCalls === 0,
      `${nm}: no extraction LLM call in default mode`);
  }

  // --- 2. llm mode yields substantially more claims than the regex path -----------
  console.log('\n2. claim_extraction:"llm" -> LLM extraction call + more claims');
  {
    // Regex on push-gaming finds a handful; the LLM extractor (mocked here to
    // return 24 claims read from tables/lists) yields many more. All supported.
    const many = Array.from({ length: 24 }, (_, i) => `Extracted factual claim number ${i + 1}.`);
    const { tools, state } = makeTools({ extractClaims: many, verdictForIndex: () => 'supported' });
    const res = await execute({ entities: [entity('push-gaming', pushGaming)] },
      { claim_extraction: 'llm' }, tools);
    const item = res.results[0].items[0];
    assert(state.extractionCalls === 1, 'exactly one extraction LLM call was made');
    assert(item.total_claims_count === 24, `all 24 extracted claims verified (got ${item.total_claims_count})`);
    assert(item.qa_pass === true && item.hallucination_score === 1,
      'all-supported -> score 1.0 -> PASS at 0.9 (granularity restored)');
  }

  // --- 3. severity_floor force-fails a hard high-sev fabrication that would PASS ---
  console.log('\n3. severity_floor: 1 high-severity unsupported force-fails a 0.9 ratio');
  {
    // 10 claims: 9 supported + 1 unsupported/high -> ratio 9/10 = 0.9 = PASS at 0.9.
    const ten = Array.from({ length: 10 }, (_, i) => `Claim ${i + 1}.`);
    const verdict = (i) => (i === 9 ? { verdict: 'unsupported', severity: 'high' } : 'supported');

    // 3a. floor OFF (default) -> ratio passes.
    {
      const { tools } = makeTools({ extractClaims: ten, verdictForIndex: verdict });
      const res = await execute({ entities: [entity('x', pushGaming)] }, { claim_extraction: 'llm' }, tools);
      const item = res.results[0].items[0];
      assert(item.hallucination_score === 0.9 && item.qa_pass === true,
        `floor OFF: score 0.9 PASSES (score=${item.hallucination_score}, pass=${item.qa_pass})`);
    }
    // 3b. floor ON -> force-fail, score unchanged (M3 pattern), still hallucination:fail.
    {
      const { tools } = makeTools({ extractClaims: ten, verdictForIndex: verdict });
      const res = await execute({ entities: [entity('x', pushGaming)] },
        { claim_extraction: 'llm', severity_floor: true }, tools);
      const item = res.results[0].items[0]; const meta = res.results[0].meta;
      assert(item.qa_pass === false, 'floor ON: qa_pass forced false');
      assert(item.hallucination_score === 0.9, `score still reports the honest ratio 0.9 (got ${item.hallucination_score})`);
      assert(meta.severity_floor_tripped === true, 'meta.severity_floor_tripped=true');
      assert(/severity floor/i.test(item.summary_text), 'summary explains the force-fail');
    }
    // 3c. floor ON but NO high-sev unsupported -> does NOT trip (score passes).
    {
      const { tools } = makeTools({ extractClaims: ten, verdictForIndex: () => 'supported' });
      const res = await execute({ entities: [entity('x', pushGaming)] },
        { claim_extraction: 'llm', severity_floor: true }, tools);
      const item = res.results[0].items[0];
      assert(item.qa_pass === true, 'floor ON with 0 high-sev unsupported: still passes (no false trip)');
    }
  }

  // --- 4. zero-claims path in llm mode: empty extraction -> regex fallback -> H21 --
  console.log('\n4. llm extraction empty -> regex fallback -> H21 (substantial qualitative fails closed)');
  {
    const QUAL = '# Review\n\n' + (
      'It offers an excellent experience and a beautifully designed interface. ' +
      'Players praise the smooth navigation and the welcoming feel throughout. '
    ).repeat(6);
    const { tools, state } = makeTools({ extractClaims: [] }); // LLM finds nothing
    const res = await execute({ entities: [entity('Qual', QUAL)] }, { claim_extraction: 'llm' }, tools);
    const item = res.results[0].items[0];
    assert(state.extractionCalls === 1, 'extraction was attempted');
    assert(state.verificationCalls === 0, 'no verification (regex fallback also found nothing)');
    assert(item.qa_pass === false && item.needs_review === true,
      'substantial zero-claim content still fails closed (H21 preserved)');
  }

  // --- 5. string-typed flags: "llm" and "true" both work ------------------------
  console.log('\n5. string-typed presets: claim_extraction:"llm" + severity_floor:"true"');
  {
    const ten = Array.from({ length: 10 }, (_, i) => `Claim ${i + 1}.`);
    const verdict = (i) => (i === 9 ? { verdict: 'unsupported', severity: 'high' } : 'supported');
    const { tools, state } = makeTools({ extractClaims: ten, verdictForIndex: verdict });
    const res = await execute({ entities: [entity('x', pushGaming)] },
      { claim_extraction: 'llm', severity_floor: 'true' }, tools);
    const item = res.results[0].items[0];
    assert(state.extractionCalls === 1, 'claim_extraction:"llm" (string) enabled the LLM extractor');
    assert(item.qa_pass === false, 'severity_floor:"true" (string) force-failed the high-sev fabrication');
  }

  console.log(`\n=== Result: ${pass} pass, ${fail} fail ===`);
  process.exit(fail === 0 ? 0 : 1);
})();
