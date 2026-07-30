/**
 * M3 — taxonomy-leakage detection in qa-structural (Checks 6 + 7).
 * Run: node modules/step-6-qa/qa-structural/test-taxonomy-leakage.js
 */
const execute = require('./execute.js');

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { console.log(`  PASS: ${msg}`); pass++; }
  else { console.log(`  FAIL: ${msg}`); fail++; }
}

const tools = { logger: { info() {}, warn() {}, error() {} }, progress: { update() {} } };
// Loose thresholds so ONLY the leakage checks decide pass/fail in these tests.
const LOOSE = { min_sections: 0, require_faq: false, min_words_per_section: 0, min_total_words: 0, required_heading_levels: 'h1', pass_threshold: 1.0 };

function article(headings, body = 'Body text with enough words for the section to count fine here.') {
  return headings.map(h => `${h}\n${body}`).join('\n\n');
}

async function run(md, opts = {}) {
  const res = await execute(
    { entities: [{ name: 'T', items: [{ entity_name: 'T', content_markdown: md }] }] },
    { ...LOOSE, ...opts },
    tools
  );
  return res.results[0].items[0];
}

(async () => {
  console.log('\n=== Check 6 fires: literal [Suggested tag] / second bracketed marker ===');
  {
    const it = await run(article([
      '# Acme',
      '## [Tag: scratchcards] [Suggested tag] Scratchcard Games Provider Heritage',
      '## [Tag: slots] Slot Games Portfolio',
    ]));
    ok(it.qa_pass === false, 'leaky article fails (flag, not entity failure — item still produced)');
    ok(/Suggested tag|taxonomy markers/.test(it.violations), `violations name the marker leak (got: ${String(it.violations).slice(0, 90)})`);

    const lit = await run(article(['# Acme', '## Some heading with [Suggested tag] inline']));
    ok(/taxonomy markers/.test(lit.violations), 'literal [Suggested tag] mid-heading also fires');

    const dbl = await run(article(['# Acme', '## [Overview] [Draft] Company Overview']));
    ok(/taxonomy markers/.test(dbl.violations), 'ANY second bracketed marker fires (not just Suggested tag)');
  }

  console.log('\n=== Check 7 fires: duplicated-token artifacts ===');
  {
    const it = await run(article(['# Acme', '## Api API Integration']));
    ok(it.qa_pass === false, 'dup-token heading fails');
    ok(/duplicated-token/.test(it.violations), 'violations name the dup-token artifact');

    const cased = await run(article(['# Acme', '## Payment payment Gateway Overview']));
    ok(/duplicated-token/.test(cased.violations), 'case-insensitive consecutive dup fires');
  }

  console.log('\n=== No false positives on clean shapes ===');
  {
    const it = await run(article([
      '# Acme',
      '## [Overview] Acme — a Provider',
      '## [Tag: api] API Integration Options',
      '## [Primary Category: game-providers] Slot Games Provider and Scratchcard Provider',
      '## [FAQ] Frequently Asked Questions',
    ]));
    ok(it.qa_pass === true, 'single-marker headings + marker-then-same-word do NOT fire');
    ok(it.violations === 'All structural checks passed.', `clean article has no violations (got: ${String(it.violations).slice(0, 80)})`);
  }

  console.log('\n=== qa_pass convention: flag only, delivery-shaped output intact ===');
  {
    const it = await run(article(['# Acme', '## [Tag: a] [Suggested tag] Leaky']));
    ok(typeof it.structural_score === 'number' && it.section_report.length > 0, 'item keeps score + report (transform, no throw)');
  }

  console.log(`\n=== Result: ${pass} pass, ${fail} fail ===`);
  process.exit(fail === 0 ? 0 : 1);
})();
