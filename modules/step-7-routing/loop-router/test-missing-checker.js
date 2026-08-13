/**
 * H23 -- loop-router must NOT approve when an EXPECTED checker is missing.
 *
 * Run: node modules/step-7-routing/loop-router/test-missing-checker.js
 * From repo root. No network, no deps.
 *
 * The defect: aggregateQaResults seeds every check to 'missing' and the failure
 * set is built ONLY from 'fail', never 'missing'. The only guard for absent
 * checkers is the all-missing case (checksRun === 0). A PARTIAL set -- some
 * checkers ran and passed, one produced nothing -- has failures=[] and
 * checksRun>0, so it falls through to "All QA checks passed." -> approve.
 * A green verdict on a QA set that was never fully run.
 *
 * This test encodes the CORRECT behavior. It is RED before the fix (the
 * missing-checker entity gets 'approve') and GREEN after (it gets 'flag_manual'
 * naming the missing checker). The full-set entity must keep approving.
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
};

// 8 source pages so we are never routed by dead_site / min_source_pages.
function sourcePages() {
  return Array.from({ length: 8 }, (_, i) => ({ url: `https://src${i}.example`, word_count: 500 }));
}

// The five canonical step-6 QA verdict items, all passing.
function qaItem(kind) {
  const base = { entity_name: 'Acme', qa_pass: true };
  switch (kind) {
    case 'keyword':       return { ...base, keyword_score: 0.9 };
    case 'meta':          return { ...base, meta_title_ok: true, checks_passed: 4, checks_total: 4 };
    case 'citation':      return { ...base, citation_score: 0.9 };
    case 'hallucination': return { ...base, hallucination_score: 0.95 };
    case 'structural':    return { ...base, structural_score: 0.9 };
  }
}

function entity(name, checkerKinds) {
  return { name, items: [...checkerKinds.map(qaItem), ...sourcePages()], loop_count: 0 };
}

(async () => {
  console.log('\n=== H23: loop-router missing-checker is not a pass ===\n');

  const ALL5 = ['keyword', 'meta', 'citation', 'hallucination', 'structural'];

  // --- 1. Good input: all five checkers ran and passed -> approve ---
  console.log('1. Full QA set, all pass -> approve (must stay working)');
  {
    const res = await execute({ entities: [entity('FullPass', ALL5)] }, {}, tools);
    const d = res.results[0].items[0];
    assert(d.decision === 'approve', `full set approves (got '${d.decision}')`);
    assert(/All QA checks passed/.test(d.route_reason), 'reason is "All QA checks passed"');
  }

  // --- 2. The defect: hallucination checker produced NOTHING (removed) ---
  console.log('\n2. hallucination checker missing (removed), other 4 pass -> must NOT approve');
  {
    const missing = ALL5.filter(k => k !== 'hallucination'); // hallucination output removed
    const res = await execute({ entities: [entity('MissingHalluc', missing)] }, {}, tools);
    const d = res.results[0].items[0];
    console.log(`     -> decision='${d.decision}', reason='${d.route_reason}'`);
    assert(d.decision !== 'approve', `does NOT silently approve on a partial QA set (got '${d.decision}')`);
    assert(/hallucination/i.test(d.route_reason), 'the routing reason names the missing checker (hallucination)');
  }

  // --- 3. A template that legitimately runs a subset can opt out ---
  console.log('\n3. expected_checks opt-out: template runs only keyword+meta+structural -> approve');
  {
    const subset = ['keyword', 'meta', 'structural'];
    const res = await execute(
      { entities: [entity('SubsetOptOut', subset)] },
      { expected_checks: subset },
      tools
    );
    const d = res.results[0].items[0];
    assert(d.decision === 'approve', `subset with matching expected_checks approves (got '${d.decision}')`);
  }

  console.log(`\n=== Result: ${pass} pass, ${fail} fail ===`);
  process.exit(fail === 0 ? 0 : 1);
})();
