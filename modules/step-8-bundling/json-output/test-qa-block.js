/**
 * M2 — QA verdict in the bundle (json-output qa block + markdown-output
 * frontmatter). Delivery must remain UNBLOCKED: qa is additive metadata.
 * Run: node modules/step-8-bundling/json-output/test-qa-block.js
 */
const jsonOutput = require('./execute.js');
const markdownOutput = require('../markdown-output/execute.js');
const { collectQaVerdict } = require('../../_shared/qa-verdict.js');

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { console.log(`  PASS: ${msg}`); pass++; }
  else { console.log(`  FAIL: ${msg}`); fail++; }
}

const tools = { logger: { info() {}, warn() {}, error() {} }, progress: { update() {} } };

// Pool mirroring run cb49ef80 step 8: content + QA checker items + router item.
const QA_ITEMS = [
  { entity_name: 'Acme', source_submodule: 'qa-structural', qa_pass: true, violations: '' },
  { entity_name: 'Acme', source_submodule: 'hallucination-detector', qa_pass: true },
  { entity_name: 'Acme', source_submodule: 'meta-compliance-checker', qa_pass: false, violations: 'Description too short' },
  { entity_name: 'Acme', source_submodule: 'citation-coverage-checker', qa_pass: false },
  {
    entity_name: 'Acme', source_submodule: 'loop-router',
    decision: 'flag_manual', failed_checks: 'meta_compliance, citation_coverage',
    qa_scores: { meta: 'fail', citation: 'fail', structural: 'pass', hallucination: 'pass' },
    qa_summary: 'Meta Compliance: FAIL...',
  },
];
const CONTENT_ITEM = { entity_name: 'Acme', source_submodule: 'content-writer', content_markdown: '## [Overview]\nAcme text.' };

console.log('\n=== collectQaVerdict: router + checker shapes ===');
{
  const qa = collectQaVerdict([CONTENT_ITEM, ...QA_ITEMS]);
  ok(qa.verdict === 'flag_manual', `verdict from router decision (got ${qa && qa.verdict})`);
  ok(JSON.stringify(qa.failed_checks) === JSON.stringify(['meta_compliance', 'citation_coverage']), 'failed_checks parsed from router string');
  ok(qa.flagged === true, 'flagged=true when router did not approve');
  ok(qa.checks_passed === 2 && qa.checks_failed === 2, `pass/fail counts from qa_pass items (${qa.checks_passed}/${qa.checks_failed})`);
  ok(qa.scores && qa.scores.meta === 'fail', 'scores carried from router qa_scores');
}

console.log('\n=== collectQaVerdict: approved run — the "none" sentinel is NOT a check name ===');
{
  const approvedRouter = {
    entity_name: 'Acme', source_submodule: 'loop-router',
    decision: 'approve', failed_checks: 'none',
    qa_scores: { meta: 'pass', citation: 'pass', structural: 'pass', hallucination: 'pass' },
  };
  const qa = collectQaVerdict([CONTENT_ITEM, ...QA_ITEMS.slice(0, 2), approvedRouter]);
  ok(qa.verdict === 'approve', 'verdict approve');
  ok(qa.failed_checks.length === 0, `failed_checks is [] for the 'none' sentinel (got ${JSON.stringify(qa.failed_checks)})`);
  ok(qa.flagged === false, 'clean approved run is not flagged');
}

console.log('\n=== collectQaVerdict: checkers only (no router in pool) ===');
{
  const qa = collectQaVerdict([CONTENT_ITEM, ...QA_ITEMS.slice(0, 4)]);
  ok(qa.verdict === 'qa_failed', 'derived verdict when no router item');
  ok(qa.failed_checks.includes('meta-compliance-checker'), 'failed checker named via source_submodule label');
  ok(qa.flagged === true, 'flagged when any checker failed');
  const clean = collectQaVerdict([CONTENT_ITEM, ...QA_ITEMS.slice(0, 2)]);
  ok(clean.verdict === 'qa_passed' && clean.flagged === false, 'clean checkers → qa_passed, not flagged');
}

console.log('\n=== collectQaVerdict: no QA shapes → null (block omitted) ===');
{
  ok(collectQaVerdict([CONTENT_ITEM]) === null, 'content-only pool → null');
  ok(collectQaVerdict([]) === null, 'empty pool → null');
}

(async () => {
  console.log('\n=== json-output: qa block populated, delivery NOT blocked ===');
  {
    const res = await jsonOutput({ entities: [{ name: 'Acme', items: [CONTENT_ITEM, ...QA_ITEMS] }] }, {}, tools);
    const item = res.results[0].items[0];
    ok(!!item.final_json, 'flagged entity still delivers final_json (unblocked)');
    const parsed = JSON.parse(item.final_json);
    ok(parsed.qa && parsed.qa.verdict === 'flag_manual', 'final_json carries qa.verdict');
    ok(parsed.qa.flagged === true, 'final_json carries qa.flagged');
    ok(item.has_qa === true && item.qa_flagged === 'true', 'item row exposes has_qa/qa_flagged');
  }

  console.log('\n=== json-output: include_qa=false and QA-less pool omit the block ===');
  {
    const off = await jsonOutput({ entities: [{ name: 'Acme', items: [CONTENT_ITEM, ...QA_ITEMS] }] }, { include_qa: false }, tools);
    ok(!JSON.parse(off.results[0].items[0].final_json).qa, 'include_qa=false → no qa block');
    const noQa = await jsonOutput({ entities: [{ name: 'Acme', items: [CONTENT_ITEM] }] }, {}, tools);
    const parsed = JSON.parse(noQa.results[0].items[0].final_json);
    ok(!('qa' in parsed), 'QA-less pool → bundle shape unchanged (no qa key)');
  }

  console.log('\n=== markdown-output: frontmatter carries the verdict ===');
  {
    const res = await markdownOutput({ entities: [{ name: 'Acme', items: [CONTENT_ITEM, ...QA_ITEMS] }] }, {}, tools);
    const md = res.results[0].items[0].final_markdown;
    ok(md.includes('qa_verdict: flag_manual'), 'frontmatter has qa_verdict');
    ok(md.includes('qa_flagged: true'), 'frontmatter has qa_flagged');
    ok(md.includes('meta_compliance'), 'frontmatter names the failed checks');
    const noQa = await markdownOutput({ entities: [{ name: 'Acme', items: [CONTENT_ITEM] }] }, {}, tools);
    ok(!noQa.results[0].items[0].final_markdown.includes('qa_'), 'QA-less pool → no qa_ frontmatter keys');
  }

  console.log('\n=== markdown-output: qa_flagged survives include_frontmatter=false ===');
  {
    const res = await markdownOutput({ entities: [{ name: 'Acme', items: [CONTENT_ITEM, ...QA_ITEMS] }] }, { include_frontmatter: false }, tools);
    const item = res.results[0].items[0];
    ok(!item.final_markdown.startsWith('---'), 'no frontmatter emitted');
    ok(item.qa_flagged === 'true', 'item row still carries qa_flagged (flagged content visible without frontmatter)');
    const clean = await markdownOutput({ entities: [{ name: 'Acme', items: [CONTENT_ITEM] }] }, { include_frontmatter: false }, tools);
    ok(clean.results[0].items[0].qa_flagged === '', 'QA-less pool → empty qa_flagged');
  }

  console.log(`\n=== Result: ${pass} pass, ${fail} fail ===`);
  process.exit(fail === 0 ? 0 : 1);
})();
