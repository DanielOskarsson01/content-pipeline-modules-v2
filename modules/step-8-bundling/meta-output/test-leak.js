/**
 * UNIT LEAK — meta-output SEO keywords are built from EXISTING tags only
 * (SEVERITY_FLOOR.md Defect 1 — the worst leak: unapproved multi-word labels
 * "bonus buy"/"betting strategies" were becoming published target keywords).
 * Proven on the REAL ELK/PRG/Verm analysis_json (run 36c75581). Plus byte-identity
 * vs prod HEAD on a clean draft.
 * Run: node modules/step-8-bundling/meta-output/test-leak.js
 */
const assert = require('assert');
const execute = require('./execute.js');
const { ALL } = require('../../_shared/__fixtures__/run-36c75581.js');
const { loadHeadExecute, cleanupHead } = require('../../_shared/__fixtures__/head-ab.js');

let checks = 0;
function check(name, cond) { assert.ok(cond, name); checks++; }
const tools = { logger: { info() {}, warn() {}, error() {} }, progress: { update() {} } };

// meta-output requires seo_plan_json; a minimal plan with its own keywords lets us
// also confirm the leak fix does not disturb legitimate SEO-plan keywords.
const seoItem = { seo_plan_json: { head_terms: ['online slots provider'] } };

(async () => {
  for (const fx of ALL) {
    const entity = { name: fx.name, items: [{ analysis_json: fx.analysis }, seoItem] };
    const kw = JSON.parse((await execute({ entities: [entity] }, {}, tools)).results[0].items[0].meta_json).keywords;
    const existingSlugs = fx.analysis.tags.existing.map(t => t.slug);
    const suggestedLabels = fx.analysis.tags.suggested_new.map(t => t.label);
    check(`${fx.name}: existing tag slugs are keywords`, existingSlugs.every(s => kw.includes(s)));
    check(`${fx.name}: no suggested_new label leaks into keywords`, suggestedLabels.every(l => !kw.includes(l)));
    check(`${fx.name}: legitimate SEO-plan keyword still present`, kw.includes('online slots provider'));
  }

  // byte-identity vs prod HEAD on a clean draft (existing tags only)
  {
    const head = loadHeadExecute('modules/step-8-bundling/meta-output/execute.js');
    const clean = () => ({ name: 'CleanCo', items: [
      { analysis_json: { categories: { primary: [{ slug: 'game-providers' }] }, tags: { existing: [{ slug: 'slots' }] } } },
      { seo_plan_json: { head_terms: ['casino provider'] } },
    ] });
    const cur = await execute({ entities: [clean()] }, {}, tools);
    const old = await head({ entities: [clean()] }, {}, tools);
    assert.deepStrictEqual(cur, old, 'clean-draft meta output must byte-match prod HEAD');
    check('byte-identity: clean draft matches prod HEAD', true);
    cleanupHead();
  }

  console.log(`meta-output leak fix: ${checks}/${checks} assertions passed.`);
})().catch((e) => { console.error('FAIL:', e.message, e.stack); process.exit(1); });
