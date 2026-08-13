/**
 * H19 -- keyword-sufficiency-checker must READ its subject before it passes.
 *
 * Run: node modules/step-6-qa/keyword-sufficiency-checker/test-reads-content.js
 * From repo root. No network, no deps.
 *
 * The defect: the "no seo_plan_json present" branch returns qa_pass:true,
 * keyword_score:1 BEFORE any content_markdown check. So an entity with NO
 * content and NO plan is certified green -- a pass emitted over content the
 * checker never read (indeed, content that does not exist). The downstream
 * no-content guard is unreachable on this branch.
 *
 * The fix reads content_markdown first and fails closed when it is absent,
 * regardless of plan state. The documented "works without seo-planner data"
 * soft-gate contract (no plan + content present -> pass-with-warning) is
 * preserved, but now carries needs_review:true so it is not a clean silent green.
 *
 * RED before the fix (case 1 passes green), GREEN after (case 1 fails closed).
 */

const execute = require('./execute.js');

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { console.log(`  PASS: ${msg}`); pass++; }
  else { console.log(`  FAIL: ${msg}`); fail++; }
}
const tools = {
  logger: { info: () => {}, warn: () => {}, error: () => {} },
  progress: { update: () => {} },
  _partialItems: [],
};

// The dangerous shape: pool item exists (an entity is present) but generation
// produced NO content_markdown, and there is no seo_plan_json either.
const noContentNoPlan = { name: 'Ghost', items: [{ some_other_field: 'x' }] };
// No plan, but content IS present -> documented soft-gate contract.
const noPlanWithContent = {
  name: 'HasContent',
  items: [{ content_markdown: '# Acme\n\nAcme builds casino platforms for operators.' }],
};
// Good input: real plan + content that contains the keywords.
const goodInput = {
  name: 'Good',
  items: [{
    content_markdown: '# Casino platforms\n\nCasino platforms power online gaming worldwide.',
    seo_plan_json: { target_keywords: { primary: 'casino platforms', secondary: ['online gaming'] } },
  }],
};

(async () => {
  console.log('\n=== H19: keyword checker reads content before passing ===\n');

  // --- 1. THE DEFECT: no content + no plan -> must NOT pass ---
  console.log('1. No content_markdown and no seo_plan -> must fail closed (not a silent pass)');
  {
    const res = await execute({ entities: [noContentNoPlan] }, {}, tools);
    const item = res.results[0].items[0];
    console.log(`     -> qa_pass=${item.qa_pass}, keyword_score=${item.keyword_score}`);
    assert(item.qa_pass === false, `does NOT certify absent content (qa_pass=${item.qa_pass})`);
    assert(res.results[0].meta.error === 'no_content_markdown', 'meta.error is no_content_markdown');
    assert(res.summary.failed === 1, 'summary counts it as failed, not passed');
  }

  // --- 2. Contract preserved: no plan but content present -> pass with warning ---
  console.log('\n2. No seo_plan but content present -> soft-gate pass, but flagged needs_review');
  {
    const res = await execute({ entities: [noPlanWithContent] }, {}, tools);
    const item = res.results[0].items[0];
    assert(item.qa_pass === true, 'documented soft-gate contract preserved (qa_pass true)');
    assert(res.results[0].meta.skip_reason === 'no_seo_plan', 'skip_reason is no_seo_plan (unchanged)');
    assert(item.needs_review === true, 'no longer a clean green -- needs_review:true');
  }

  // --- 3. Good input still passes ---
  console.log('\n3. Real plan + content with keywords -> passes (scoring path ran)');
  {
    const res = await execute({ entities: [goodInput] }, {}, tools);
    const meta = res.results[0].meta;
    assert(meta.error === undefined && meta.skipped !== true, 'good input reaches scoring (no error/skip)');
    assert(res.results[0].items[0].qa_pass === true, 'good input passes');
  }

  console.log(`\n=== Result: ${pass} pass, ${fail} fail ===`);
  process.exit(fail === 0 ? 0 : 1);
})();
