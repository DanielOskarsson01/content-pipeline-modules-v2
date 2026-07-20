/**
 * Standalone test harness for seo-planner C2 hollow-plan content gate (Program A / A1).
 *
 * Run: node modules/step-5-generation/seo-planner/test-hollow-plan.js   (from repo root)
 *
 * Context — prod run d9c21199 (2026-07-19, sonnet-5): the model returned a
 * VALID-but-EMPTY JSON object. completeWithJsonRetry (fail-loud on a *throw*) did
 * not fire because the parse SUCCEEDED — the plan was just empty. seo-planner
 * validated JSON SHAPE but never CONTENT, flattened the empties to "Not specified",
 * and emitted meta.status:'success'. An untargeted profile (0 keywords, 0 FAQs,
 * "" meta_title) shipped green, and meta-compliance-checker failed every pass with
 * "No head_terms found in SEO plan". This adds a SECOND gate — a CONTENT assertion —
 * that fails LOUD (meta.status:'error') on the valid-but-empty case the throw-path
 * can't catch. It does NOT weaken completeWithJsonRetry.
 *
 * "Hollow" is defined from the load-bearing downstream requirement, not arbitrarily:
 * a plan is hollow iff it yields ZERO usable keyword/head terms — the exact condition
 * under which meta-compliance-checker (step-6 QA) emits "No head_terms found in SEO
 * plan". Keywords are the one requirement with NO downstream fallback (meta title
 * falls back to entity name in content-writer + meta-output; FAQs are optional). So
 * the boundary is: keywords absent => hollow (error), even if meta/faqs are present;
 * keywords present => usable (success), even if meta is empty.
 *
 * No network, no Perplexity, no Anthropic calls. Mocks tools.ai.complete.
 */

const execute = require('./execute.js');
const MANIFEST = require('./manifest.json');
const { MANIFEST_DEFAULT_PROMPT } = execute.__testing;

let pass = 0;
let fail = 0;

function assert(cond, msg) {
  if (cond) { console.log(`  PASS: ${msg}`); pass++; }
  else { console.log(`  FAIL: ${msg}`); fail++; }
}

function makeTools(aiResponse) {
  const logs = [];
  return {
    logs,
    logger: {
      info: (m) => logs.push({ level: 'info', message: m }),
      warn: (m) => logs.push({ level: 'warn', message: m }),
      error: (m) => logs.push({ level: 'error', message: m }),
    },
    progress: { update: () => {} },
    ai: { complete: async () => aiResponse },
    _partialItems: [],
  };
}

const mockEntity = {
  name: 'TestEntity',
  items: [
    {
      source_submodule: 'content-analyzer',
      analysis_json: { primary_category: 'test-category', description: 'Test description' },
    },
  ],
};

const baseOptions = {
  ...MANIFEST.options_defaults,
  keyword_research: false,       // skip Perplexity in tests
  requires_prompt_override: false,
  prompt: MANIFEST_DEFAULT_PROMPT,
};

async function runWithResponse(aiResponse) {
  const tools = makeTools(aiResponse);
  const result = await execute({ entities: [mockEntity] }, baseOptions, tools);
  return { result, entity: result.results[0], tools };
}
const runWithPlan = (plan) => runWithResponse({ text: JSON.stringify(plan), citations: [] });

function assertSuccess(entity, label) {
  assert(entity.meta.status === 'success', `${label}: meta.status === 'success'`);
  assert(entity.items[0].status === 'planned', `${label}: item status === 'planned'`);
}
function assertHollowError(entity, label) {
  assert(entity.meta.status === 'error', `${label}: meta.status === 'error' (fails LOUD, not green)`);
  assert(entity.items[0].status === 'error', `${label}: item status === 'error'`);
  assert(/keyword|head_term/i.test(entity.items[0].error || ''),
    `${label}: error names the cause (keywords/head_terms)`);
}

(async () => {
  // ---------------------------------------------------------------------------
  // GOOD PATH — a real, populated plan must still succeed (regression guard).
  // ---------------------------------------------------------------------------
  console.log('\n=== Good path: populated plan → success (untouched) ===');
  {
    const { entity } = await runWithPlan({
      target_keywords: { primary: 'casino software', secondary: ['igaming platform'], long_tail: [] },
      meta: { title: 'Casino Software Provider', description: 'x'.repeat(155) },
      faqs: [{ question: 'What is X?', answer_brief: 'A' }],
    });
    assertSuccess(entity, 'populated');
  }

  // ---------------------------------------------------------------------------
  // HOLLOW — valid JSON, empty content. MUST fail loud (the C2 bug).
  // ---------------------------------------------------------------------------
  console.log('\n=== Hollow plans → meta.status:error (the fix) ===');
  {
    const { entity } = await runWithPlan({});                                   // empty object
    assertHollowError(entity, 'empty-object');
  }
  {
    // Reconstruction of d9c21199's salvaged shape: shape-valid, content-empty.
    const { entity } = await runWithPlan({ target_keywords: {}, meta: {}, faqs: [] });
    assertHollowError(entity, 'd9c21199-salvaged-shape');
  }
  {
    // Whitespace-only keyword is not a usable term (mirrors checker's trim()).
    const { entity } = await runWithPlan({ target_keywords: { primary: '   ' } });
    assertHollowError(entity, 'whitespace-only-keyword');
  }

  // ---------------------------------------------------------------------------
  // PARTIAL boundary — meta + faqs present but ZERO keywords => still hollow.
  // Documents the boundary: keywords are load-bearing (no downstream fallback);
  // meta/faqs presence does NOT rescue a keyword-empty plan, because the QA gate
  // fails on missing head_terms regardless of meta.
  // ---------------------------------------------------------------------------
  console.log('\n=== Partial: meta+faqs present, keywords empty → still error ===');
  {
    const { entity } = await runWithPlan({
      target_keywords: {},
      meta: { title: 'A Perfectly Real Meta Title', description: 'y'.repeat(155) },
      faqs: [{ question: 'What is X?', answer_brief: 'A' }],
    });
    assertHollowError(entity, 'meta+faqs-but-no-keywords');
  }

  // ---------------------------------------------------------------------------
  // INVERSE boundary — keywords present, meta empty => usable (success).
  // meta title has a downstream fallback (entity name); a keyword-bearing plan is
  // not hollow. Prevents false-failing real plans that emit meta elsewhere.
  // ---------------------------------------------------------------------------
  console.log('\n=== Inverse: keywords present, meta empty → success ===');
  {
    const { entity } = await runWithPlan({ target_keywords: { primary: 'casino software' }, meta: {}, faqs: [] });
    assertSuccess(entity, 'keywords-no-meta');
  }

  // ---------------------------------------------------------------------------
  // SHAPE COVERAGE — every keyword shape meta-compliance-checker reads counts as
  // usable, so we don't false-fail seo-planner's real per-section output. The
  // flatten "primary || 'Not specified'" tell is a SYMPTOM, not the definition:
  // these plans display "Not specified" yet are NOT hollow (checker finds terms).
  // ---------------------------------------------------------------------------
  console.log('\n=== Shape coverage: every checker-readable keyword shape → success ===');
  {
    const { entity } = await runWithPlan({ sections: { overview: { target_keywords: { primary: 'casino software' } } }, meta: {} });
    assertSuccess(entity, 'per-section-target_keywords');
  }
  {
    // primary may be an ARRAY (not just a string) — the checker handles both.
    const { entity } = await runWithPlan({ target_keywords: { primary: ['casino software'] }, meta: {} });
    assertSuccess(entity, 'array-primary-keyword');
  }
  {
    const { entity } = await runWithPlan({ head_terms: ['casino software', 'igaming'], meta: {} });
    assertSuccess(entity, 'head_terms-array');
  }
  {
    const { entity } = await runWithPlan({ keyword_summary_table: [{ keyword: 'casino software' }], meta: {} });
    assertSuccess(entity, 'keyword_summary_table');
  }
  {
    const { entity } = await runWithPlan({ keywords: ['casino software'], meta: {} });
    assertSuccess(entity, 'flat-keywords-array');
  }

  // ---------------------------------------------------------------------------
  // REAL PROD SHAPE — run f4d501bd (Hacksawgaming, sonnet-5): the company-profile
  // prompt nests keywords under TOP-LEVEL section containers (overview /
  // category_sections / tag_sections / credentials), with target_keywords as flat
  // string[] and per-tag `keywords`. The old fixed-shape gate found ZERO here and
  // threw "non-conforming (empty) output" on a keyword-RICH plan. Must succeed.
  // ---------------------------------------------------------------------------
  console.log('\n=== Real prod shape: section-nested keyword arrays → success ===');
  {
    const { entity } = await runWithPlan({
      research_status: 'Usable keyword research returned.',
      overview: {
        target_keywords: ['RNG game supplier for online casinos', 'iGaming content provider'],
        keyword_sources: ['Q1', 'Q1'],
        notes: 'Lead with the primary phrase in the first paragraph.',
      },
      category_sections: {
        primary_category_game_providers: { target_keywords: ['slot games supplier', 'scratch cards provider'], keyword_sources: ['Q1', 'Q1'] },
        secondary_category_social_gaming_solutions: { target_keywords: [], keyword_sources: [], notes: 'No research keyword — analysis facts only.' },
      },
      tag_sections: {
        slots: { keywords: ['slot games supplier', 'slot game providers'], keyword_sources: ['Q1', 'Q2'] },
        jackpot: { keywords: [], keyword_sources: [], notes: 'Rely on analysis facts only.' },
      },
      credentials: { target_keywords: ['certified', 'multi-jurisdiction', 'award-winning'], keyword_sources: ['Q1', 'Q1', 'Q1'] },
      meta: { meta_title: 'Hacksaw Gaming — RNG Game Supplier | OnlyiGaming', meta_description: 'x'.repeat(155), keyword_sources: ['Q1'] },
      tone_notes_for_content_writer: ["Third person only; no 'we/our.'"],
    });
    assertSuccess(entity, 'real-company-profile-shape');
  }

  // Hollow variant of the SAME shape: every keyword array empty, but notes and
  // keyword_sources (["Q1"]) populated. Provenance/prose must NOT be counted as
  // keywords — this must still fail LOUD (the gate stays meaningful).
  console.log('\n=== Hollow section-nested shape (only sources/notes) → error ===');
  {
    const { entity } = await runWithPlan({
      overview: { target_keywords: [], keyword_sources: ['Q1', 'Q2'], notes: 'prose only' },
      category_sections: { primary_category_x: { target_keywords: [], keyword_sources: ['Q1'] } },
      tag_sections: { slots: { keywords: [], keyword_sources: ['Q3'] } },
      credentials: { target_keywords: [], keyword_sources: [] },
      meta: { meta_title: 'A Real-Looking Title', keyword_sources: ['Q1'] },
    });
    assertHollowError(entity, 'section-nested-but-empty');
  }

  // ---------------------------------------------------------------------------
  // THROW CASE — completeWithJsonRetry's existing loud-fail path is untouched.
  // Model returns markdown/prose both times → parse throws → caught → error.
  // ---------------------------------------------------------------------------
  console.log('\n=== Throw case (existing fail-loud path) → error, unchanged ===');
  {
    const { entity, tools } = await runWithResponse({ text: '# KEYWORD PLAN\n\nHere is the plan, in prose, no JSON at all.' });
    assert(entity.meta.status === 'error', 'markdown-both-times: meta.status === \'error\'');
    assert(entity.items[0].status === 'error', 'markdown-both-times: item status === \'error\'');
    assert(tools.logs.some(l => l.level === 'warn' && /not valid JSON/i.test(l.message)),
      'markdown-both-times: corrective retry still fired (completeWithJsonRetry unchanged)');
  }

  console.log(`\n=== Result: ${pass} pass, ${fail} fail ===`);
  process.exit(fail === 0 ? 0 : 1);
})();
