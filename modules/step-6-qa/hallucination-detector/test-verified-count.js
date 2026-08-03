/**
 * Standalone test harness for the verified_claims_count off-by-one fix (B1).
 *
 * Run: node modules/step-6-qa/hallucination-detector/test-verified-count.js
 * From repo root.
 *
 * The bug: item.verified_claims_count = Math.round(supported + 0.5 * partial)
 * while meta.supported counted only fully-supported claims. Observed live:
 * item says 1, meta says 0 (supported=0, partial=1); item says 2, meta says 1.
 * A QA number that disagrees with itself.
 *
 * The fix: verified_claims_count counts ONLY fully-supported claims (agrees
 * with meta.supported), and a new partial_claims_count exposes the partials
 * explicitly. The half-weighting lives only in hallucination_score, where it
 * is documented. Counts are additive: verified + partial + flagged = total.
 *
 * No network. Mocks logger/progress/ai — ai.complete returns 'partial' for
 * the first claim and 'unsupported' for the rest, reproducing the live
 * supported=0/partial=1 disagreement shape.
 */

const execute = require('./execute.js');

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

function makeTools(verdictForIndex) {
  return {
    logger: { info: () => {}, warn: () => {}, error: () => {} },
    progress: { update: () => {} },
    _partialItems: [],
    ai: {
      complete: async ({ prompt }) => {
        // Claims arrive as numbered lines between CLAIMS and the sources
        // section; the source text below contains no numbered lines.
        const count = (prompt.match(/^\d+\.\s/gm) || []).length;
        const verdicts = [];
        for (let i = 0; i < count; i++) {
          verdicts.push({
            claim: `claim ${i + 1}`,
            verdict: verdictForIndex(i),
            quote: null,
            severity: 'medium',
          });
        }
        return { text: JSON.stringify(verdicts) };
      },
    },
  };
}

const entity = {
  name: 'TestEntity',
  items: [
    {
      content_markdown:
        '# TestEntity\n\nTestEntity was founded in 2015. The company employs 250 people. ' +
        'Revenue grew 30% in 2024. The platform serves 40 markets.',
    },
    {
      text_content:
        'TestEntity is a company. It was founded around the mid-2010s and has offices in Europe.',
    },
  ],
};

(async () => {
  console.log('--- Case 1: supported=0, one partial (the live off-by-one shape) ---');
  {
    const tools = makeTools((i) => (i === 0 ? 'partial' : 'unsupported'));
    const result = await execute({ entities: [entity] }, {}, tools);
    const item = result.results[0].items[0];
    const meta = result.results[0].meta;

    assert(meta.supported === 0, `meta.supported is 0 (got ${meta.supported})`);
    assert(meta.partial === 1, `meta.partial is 1 (got ${meta.partial})`);
    assert(
      item.verified_claims_count === meta.supported,
      `verified_claims_count agrees with meta.supported (item=${item.verified_claims_count}, meta=${meta.supported})`
    );
    assert(
      item.partial_claims_count === meta.partial,
      `partial_claims_count agrees with meta.partial (item=${item.partial_claims_count}, meta=${meta.partial})`
    );
    assert(
      item.verified_claims_count + item.partial_claims_count + item.flagged_claims_count ===
        item.total_claims_count,
      `counts are additive: ${item.verified_claims_count} + ${item.partial_claims_count} + ${item.flagged_claims_count} = ${item.total_claims_count}`
    );
    const expectedScore = parseFloat(((meta.supported + 0.5 * meta.partial) / meta.total_claims).toFixed(3));
    assert(
      item.hallucination_score === expectedScore,
      `hallucination_score keeps half-weighting (got ${item.hallucination_score}, expected ${expectedScore})`
    );
  }

  console.log('--- Case 2: one supported, one partial (item said 2, meta said 1) ---');
  {
    const tools = makeTools((i) => (i === 0 ? 'supported' : i === 1 ? 'partial' : 'unsupported'));
    const result = await execute({ entities: [entity] }, {}, tools);
    const item = result.results[0].items[0];
    const meta = result.results[0].meta;

    assert(meta.supported === 1, `meta.supported is 1 (got ${meta.supported})`);
    assert(
      item.verified_claims_count === meta.supported,
      `verified_claims_count agrees with meta.supported (item=${item.verified_claims_count}, meta=${meta.supported})`
    );
    assert(
      item.verified_claims_count + item.partial_claims_count + item.flagged_claims_count ===
        item.total_claims_count,
      `counts are additive: ${item.verified_claims_count} + ${item.partial_claims_count} + ${item.flagged_claims_count} = ${item.total_claims_count}`
    );
  }

  console.log('--- Case 3: all supported (baseline no-change guard) ---');
  {
    const tools = makeTools(() => 'supported');
    const result = await execute({ entities: [entity] }, {}, tools);
    const item = result.results[0].items[0];
    const meta = result.results[0].meta;

    assert(item.qa_pass === true, 'qa_pass true when all supported');
    assert(item.hallucination_score === 1, `score 1.0 when all supported (got ${item.hallucination_score})`);
    assert(
      item.verified_claims_count === item.total_claims_count,
      `verified equals total when all supported (${item.verified_claims_count}/${item.total_claims_count})`
    );
    assert(item.partial_claims_count === 0, 'partial_claims_count 0 when all supported');
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
})();
