/**
 * Standalone test harness for keyword-sufficiency-checker W1.1.
 *
 * Run: node modules/step-6-qa/keyword-sufficiency-checker/test-empty-plan.js
 * From repo root.
 *
 * Covers the W1.1 contract-hardening change (Plan 2 / Rule 13 rollout):
 *   - LOUD-fail when an seo_plan_json is PRESENT but yields zero keyword
 *     targets (upstream seo-planner produced empty output). This was a silent
 *     PASS (keyword_score: 1, skipped: true) before W1.1.
 *   - allow_empty_keyword_plan: true restores the legacy pass-with-warning.
 *   - NO seo_plan_json at all stays a legitimate skip-with-warning (the
 *     documented "works without seo-planner data" contract — unchanged).
 *   - A real keyword plan still proceeds to scoring (baseline no-change guard).
 *
 * No network. Pure text analysis — mocks only logger/progress/_partialItems.
 */

const execute = require('./execute.js');
const MANIFEST = require('./manifest.json');

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

function makeTools() {
  const logs = [];
  return {
    logs,
    logger: {
      info: (m) => logs.push({ level: 'info', message: m }),
      warn: (m) => logs.push({ level: 'warn', message: m }),
      error: (m) => logs.push({ level: 'error', message: m }),
    },
    progress: { update: () => {} },
    _partialItems: [],
  };
}

const baseOptions = { ...MANIFEST.options_defaults };

// Entity whose seo_plan_json is PRESENT but yields zero keyword targets.
const emptyPlanEntity = {
  name: 'EmptyPlanEntity',
  items: [
    {
      content_markdown: '# Some Heading\n\nSome body content here with several words in it.',
      seo_plan_json: {}, // present, but no keywords of any kind
    },
  ],
};

// Entity with NO seo_plan_json at all (legitimate "no SEO plan" path).
const noPlanEntity = {
  name: 'NoPlanEntity',
  items: [
    {
      content_markdown: '# Some Heading\n\nSome body content here with several words in it.',
      // no seo_plan_json
    },
  ],
};

// Entity with a real keyword plan + content (should proceed to scoring).
const goodPlanEntity = {
  name: 'GoodPlanEntity',
  items: [
    {
      content_markdown:
        '# Casino Platforms\n\nCasino platforms power online gaming for operators worldwide.',
      seo_plan_json: {
        target_keywords: {
          primary: 'casino platforms',
          secondary: ['online gaming'],
          long_tail: [],
        },
      },
    },
  ],
};

(async () => {
  // -----------------------------------------------------------------------
  // Manifest sanity (config part of W1.1)
  // -----------------------------------------------------------------------
  console.log('\n=== Manifest sanity ===');
  assert(
    MANIFEST.version.localeCompare('1.0.2', undefined, { numeric: true }) >= 0,
    'manifest version at least 1.0.2 (W1.1 bump)'
  );
  assert(
    MANIFEST.options.some(o => o.name === 'allow_empty_keyword_plan'),
    'allow_empty_keyword_plan option present'
  );
  assert(
    MANIFEST.options_defaults.allow_empty_keyword_plan === false,
    'allow_empty_keyword_plan default is false'
  );

  // -----------------------------------------------------------------------
  // 1. LOUD-fail: seo_plan present but empty, flag default (false)
  // -----------------------------------------------------------------------
  console.log('\n=== Empty seo_plan → LOUD fail (default) ===');
  {
    const tools = makeTools();
    const result = await execute({ entities: [emptyPlanEntity] }, baseOptions, tools);
    const item = result.results[0].items[0];
    assert(item.qa_pass === false, 'empty plan: qa_pass is false (was silently true)');
    assert(item.keyword_score === 0, 'empty plan: keyword_score is 0 (was 1)');
    assert(result.results[0].meta.skipped !== true, 'empty plan: NOT treated as a skip');
    assert(
      /keyword target/i.test(item.placement_report),
      'empty plan: report names the cause (no keyword targets)'
    );
    assert(
      tools.logs.some(l => l.level === 'error'),
      'empty plan: failure logged at error level (loud)'
    );
    assert(result.summary.failed === 1, 'empty plan: counted as failed in summary');
  }

  // -----------------------------------------------------------------------
  // 2. Carve-out: allow_empty_keyword_plan: true → pass-with-warning
  // -----------------------------------------------------------------------
  console.log('\n=== Empty seo_plan + allow_empty_keyword_plan → skip-with-warning ===');
  {
    const tools = makeTools();
    const opts = { ...baseOptions, allow_empty_keyword_plan: true };
    const result = await execute({ entities: [emptyPlanEntity] }, opts, tools);
    const item = result.results[0].items[0];
    assert(item.qa_pass === true, 'carve-out: qa_pass true (legacy behavior restored)');
    assert(result.results[0].meta.skipped === true, 'carve-out: marked as skipped');
  }

  // -----------------------------------------------------------------------
  // 3. No seo_plan at all → legitimate skip-with-warning (unchanged)
  // -----------------------------------------------------------------------
  console.log('\n=== No seo_plan present → skip-with-warning (unchanged) ===');
  {
    const tools = makeTools();
    const result = await execute({ entities: [noPlanEntity] }, baseOptions, tools);
    const item = result.results[0].items[0];
    assert(item.qa_pass === true, 'no plan: qa_pass true (documented contract preserved)');
    assert(result.results[0].meta.skipped === true, 'no plan: marked as skipped');
    assert(result.results[0].meta.skip_reason === 'no_seo_plan', 'no plan: skip_reason is no_seo_plan');
  }

  // -----------------------------------------------------------------------
  // 4. Real keyword plan → proceeds to scoring (baseline no-change guard)
  // -----------------------------------------------------------------------
  console.log('\n=== Real seo_plan → proceeds to scoring ===');
  {
    const tools = makeTools();
    const result = await execute({ entities: [goodPlanEntity] }, baseOptions, tools);
    const meta = result.results[0].meta;
    assert(meta.skipped !== true, 'good plan: not skipped');
    assert(meta.error === undefined, 'good plan: no error');
    assert(meta.head_terms_checked === 1, 'good plan: head term was scored (scoring path ran)');
  }

  // -----------------------------------------------------------------------
  // Summary
  // -----------------------------------------------------------------------
  console.log(`\n=== Result: ${pass} pass, ${fail} fail ===`);
  process.exit(fail === 0 ? 0 : 1);
})();
