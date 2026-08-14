/**
 * H18b -- step-6 QA checkers must grade the LATEST draft, not both concatenated.
 *
 * Run: node modules/step-6-qa/citation-coverage-checker/test-latest-draft.js
 * From repo root. No network -- hallucination's ai.complete is mocked.
 *
 * Mechanism (verified in the skeleton trace): content-writer and tone-seo-editor
 * both emit inline content_markdown under data_operation:add with different
 * source_submodule, so BOTH drafts survive the pool. The step-8 output modules
 * publish only the latest -- markdown-output:189 / html-output:182 /
 * json-output:151 all do `.filter(i => i.content_markdown).at(-1)`. The step-6
 * checkers instead `.map().join()` and grade BOTH drafts concatenated, so the
 * verdict is about text that was never published.
 *
 * The fix: every content-consuming checker selects `.at(-1)` -- the exact draft
 * step-8 publishes. This test proves, for citation/hallucination/qa-structural/
 * keyword: (a) a two-draft case where OLD and NEW differ materially, (b) the
 * checker's verdict now equals the NEW-only verdict (== step-8's published
 * draft), and (c) a single-draft entity is unaffected.
 *
 * RED before the fix (checkers grade the concatenation), GREEN after.
 */

const citation = require('./execute.js');
const hallucination = require('../hallucination-detector/execute.js');
const structural = require('../qa-structural/execute.js');
const keyword = require('../keyword-sufficiency-checker/execute.js');

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { console.log(`  PASS: ${msg}`); pass++; }
  else { console.log(`  FAIL: ${msg}`); fail++; }
}
const baseTools = () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {} },
  progress: { update: () => {} },
  _partialItems: [],
});
// The rule the step-8 output modules use (markdown/html/json-output).
const step8Published = (items) => items.filter(i => i.content_markdown).at(-1).content_markdown;

(async () => {
  console.log('\n=== H18b: checkers grade the latest draft, not the concatenation ===\n');

  // ---------------------------------------------------------------------------
  // A. CITATION -- deterministic material flip (the headline demonstration)
  // ---------------------------------------------------------------------------
  console.log('A. citation-coverage: OLD (3 cited claims, PASS) + NEW (uncited claim, zero citations, FAIL)');
  const OLD_CW = '# Acme\n\nAcme was founded in 2005 [#1]. Acme is headquartered in London [#2]. Acme is licensed by the MGA [#3].';
  const NEW_TSE = '# Acme\n\nAcme employs 5,000 people.';
  const analysis = { analysis_json: { source_citations: [
    { index: 1, url: 'https://a.example', title: 'a' },
    { index: 2, url: 'https://b.example', title: 'b' },
    { index: 3, url: 'https://c.example', title: 'c' },
  ] } };
  // Pool order: content-writer draft first, tone-seo-editor draft appended after.
  const twoDraft = { name: 'Acme', items: [
    { content_markdown: OLD_CW, source_submodule: 'content-writer' },
    { content_markdown: NEW_TSE, source_submodule: 'tone-seo-editor' },
    analysis,
  ] };
  const newOnly = { name: 'Acme', items: [{ content_markdown: NEW_TSE, source_submodule: 'tone-seo-editor' }, analysis] };

  {
    const twoRes = (await citation({ entities: [twoDraft] }, {}, baseTools())).results[0].items[0];
    const newRes = (await citation({ entities: [newOnly] }, {}, baseTools())).results[0].items[0];
    console.log(`     two-draft: qa_pass=${twoRes.qa_pass} score=${twoRes.citation_score} | NEW-only: qa_pass=${newRes.qa_pass}`);
    assert(twoRes.qa_pass === false, 'two-draft now FAILS (graded the published NEW draft, which has no citations)');
    assert(twoRes.qa_pass === newRes.qa_pass && twoRes.citation_score === newRes.citation_score,
      'two-draft verdict == NEW-only verdict (checker selected .at(-1), same as step-8)');
    assert(step8Published(twoDraft.items) === NEW_TSE, 'step-8 publishes NEW_TSE (.at(-1)) -- the draft the checker now grades');
  }

  // Single-draft GOOD entity -- unaffected by the fix (no concatenation possible).
  console.log('\n   single-draft (OLD only, all cited) -> PASS, unaffected');
  {
    const singleGood = { name: 'Acme', items: [{ content_markdown: OLD_CW }, analysis] };
    const r = (await citation({ entities: [singleGood] }, {}, baseTools())).results[0].items[0];
    assert(r.qa_pass === true, 'single well-cited draft still passes');
  }

  // ---------------------------------------------------------------------------
  // B. Selection parity for the other content-consuming checkers
  //    (two-draft verdict must equal NEW-only verdict == step-8's draft)
  // ---------------------------------------------------------------------------

  // hallucination: capture the CLAIMS sent to the LLM -- must be NEW's only.
  console.log('\nB1. hallucination-detector: only the NEW draft\'s claims reach the verifier');
  {
    let captured = '';
    const tools = { ...baseTools(), ai: { complete: async ({ prompt }) => { captured = prompt; return { text: '[]' }; } } };
    const hOld = '# Acme\n\nAcme was founded in 2005.';         // OLD claim
    const hNew = '# Acme\n\nAcme raised $50 million in 2021.';  // NEW claim (different, material)
    const ent = { name: 'Acme', items: [
      { content_markdown: hOld, source_submodule: 'content-writer' },
      { content_markdown: hNew, source_submodule: 'tone-seo-editor' },
      { text_content: 'Acme raised $50 million in 2021 from investors.' },
    ] };
    await hallucination({ entities: [ent] }, {}, tools);
    assert(/50 million/.test(captured), 'the NEW draft\'s claim ($50 million) was sent to the verifier');
    assert(!/founded in 2005/.test(captured), 'the OLD draft\'s claim (founded in 2005) was NOT sent (not concatenated)');
  }

  // qa-structural: two-draft verdict == NEW-only verdict.
  console.log('\nB2. qa-structural: two-draft verdict == NEW-only verdict');
  {
    const sOld = '# T\n\n## A\n\n### B\n\n' + 'word '.repeat(400) + '\n\n## FAQ\n\n### Q?\n\nA.';
    const sNew = '# Only a title, nothing else.';
    const two = { name: 'S', items: [
      { content_markdown: sOld, source_submodule: 'content-writer' },
      { content_markdown: sNew, source_submodule: 'tone-seo-editor' },
    ] };
    const only = { name: 'S', items: [{ content_markdown: sNew, source_submodule: 'tone-seo-editor' }] };
    const a = (await structural({ entities: [two] }, {}, baseTools())).results[0].items[0];
    const b = (await structural({ entities: [only] }, {}, baseTools())).results[0].items[0];
    assert(a.qa_pass === b.qa_pass && a.structural_score === b.structural_score,
      `two-draft structural verdict == NEW-only (got ${a.structural_score} vs ${b.structural_score})`);
  }

  // keyword (already fixed in the H19 batch): two-draft verdict == NEW-only verdict.
  console.log('\nB3. keyword-sufficiency: two-draft verdict == NEW-only verdict');
  {
    const seo = { seo_plan_json: { target_keywords: { primary: 'casino platforms' } } };
    const kOld = '# Casino platforms\n\nCasino platforms power online gaming. Casino platforms are widely used.';
    const kNew = '# Acme\n\nAcme is a nice place to play a few games sometimes.';
    const two = { name: 'K', items: [
      { content_markdown: kOld, source_submodule: 'content-writer', ...seo },
      { content_markdown: kNew, source_submodule: 'tone-seo-editor' },
    ] };
    const only = { name: 'K', items: [{ content_markdown: kNew, source_submodule: 'tone-seo-editor', ...seo }] };
    const a = (await keyword({ entities: [two] }, {}, baseTools())).results[0].items[0];
    const b = (await keyword({ entities: [only] }, {}, baseTools())).results[0].items[0];
    assert(a.qa_pass === b.qa_pass && a.keyword_score === b.keyword_score,
      `two-draft keyword verdict == NEW-only (got ${a.keyword_score} vs ${b.keyword_score})`);
  }

  console.log(`\n=== Result: ${pass} pass, ${fail} fail ===`);
  process.exit(fail === 0 ? 0 : 1);
})();
