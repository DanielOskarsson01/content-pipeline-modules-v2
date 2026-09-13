/**
 * UNIT LEAK — json-output publishes EXISTING tags only (SEVERITY_FLOOR.md
 * Defect 1). `suggested_new` labels are proposed/unapproved and must not ship as
 * published tags. Proven on the REAL ELK/PRG/Verm analysis_json (run 36c75581).
 * Plus byte-identity vs prod HEAD on a clean draft (no suggested_new).
 * Run: node modules/step-8-bundling/json-output/test-leak.js
 */
const assert = require('assert');
const execute = require('./execute.js');
const { ALL } = require('../../_shared/__fixtures__/run-36c75581.js');
const { loadHeadExecute, cleanupHead } = require('../../_shared/__fixtures__/head-ab.js');

let checks = 0;
function check(name, cond) { assert.ok(cond, name); checks++; }
const tools = { logger: { info() {}, warn() {}, error() {} }, progress: { update() {} } };

(async () => {
  for (const fx of ALL) {
    const entity = { name: fx.name, items: [{ content_markdown: `# ${fx.name}\n\nBody.`, analysis_json: fx.analysis }] };
    const obj = JSON.parse((await execute({ entities: [entity] }, {}, tools)).results[0].items[0].final_json);
    const existingSlugs = fx.analysis.tags.existing.map(t => t.slug);
    const suggestedLabels = fx.analysis.tags.suggested_new.map(t => t.label);
    check(`${fx.name}: existing tags published`, existingSlugs.every(s => obj.tags.includes(s)));
    check(`${fx.name}: no suggested_new label leaks`, suggestedLabels.every(l => !obj.tags.includes(l)));
    check(`${fx.name}: tags are exactly the existing slugs`, JSON.stringify(obj.tags) === JSON.stringify(existingSlugs));
  }

  // byte-identity vs prod HEAD on a clean draft (existing tags only, no QA)
  {
    const head = loadHeadExecute('modules/step-8-bundling/json-output/execute.js');
    const clean = () => ({ name: 'CleanCo', items: [
      { content_markdown: '# CleanCo\n\nText.', analysis_json: { categories: { primary: [{ slug: 'game-providers' }] }, tags: { existing: [{ slug: 'slots' }] } } },
    ] });
    const cur = await execute({ entities: [clean()] }, {}, tools);
    const old = await head({ entities: [clean()] }, {}, tools);
    assert.deepStrictEqual(cur, old, 'clean-draft json output must byte-match prod HEAD');
    check('byte-identity: clean draft matches prod HEAD', true);
    cleanupHead();
  }

  console.log(`json-output leak fix: ${checks}/${checks} assertions passed.`);
})().catch((e) => { console.error('FAIL:', e.message, e.stack); process.exit(1); });
