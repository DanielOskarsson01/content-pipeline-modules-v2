/**
 * meta-output — B032-1 hydration contract test
 *
 * Run: node modules/step-8-bundling/meta-output/test-hydration-contract.js
 *
 * (1) manifest.requires_columns must equal exactly the §7b columns execute.js
 *     reads (declared == code reads — the starvation defect was declaring []
 *     while reading both, which on the stripped prod step-8 pool hard-errors
 *     every entity).
 * (2) Run B replication (STEP78 §3.2): over a HYDRATED-shape fixture (columns
 *     present inline) the module resolves the planner-candidate meta at
 *     56/160ch with status ok and a non-empty keywords set.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const execute = require('./execute.js');
const manifest = require('./manifest.json');

// §7b-hydratable columns this repo's step-8 modules may consume.
const HYDRATABLE = ['seo_plan_json', 'analysis_json'];

let passed = 0;
const check = (name, cond) => { assert.ok(cond, name); passed++; console.log(`  ok - ${name}`); };

// ── (1) declared == code reads ──────────────────────────────────────────────
const src = fs.readFileSync(path.join(__dirname, 'execute.js'), 'utf8');
const readsInCode = HYDRATABLE.filter((c) => src.includes(c)).sort();
const declared = [...manifest.requires_columns].sort();

check('manifest declares exactly the hydratable columns the code reads',
  JSON.stringify(declared) === JSON.stringify(readsInCode));
check('declared set is ["analysis_json","seo_plan_json"]',
  JSON.stringify(declared) === JSON.stringify(['analysis_json', 'seo_plan_json']));
check('content_markdown is NOT declared (§7c blob-hydration covers it for all modules)',
  !manifest.requires_columns.includes('content_markdown'));

// ── (2) hydrated-shape fixture: Run B outcome ───────────────────────────────
const TITLE_56 = 'Acme Studios — Premium Slot Game Development Studio 2026';
const DESC_160 = 'Acme Studios designs premium mobile-first slot games for regulated markets, combining certified math models with award-winning art and reliable live operations.';
assert.strictEqual(TITLE_56.length, 56, 'fixture title must be 56ch');
assert.strictEqual(DESC_160.length, 160, 'fixture description must be 160ch');

const input = {
  entities: [{
    name: 'Acme Studios',
    items: [
      { analysis_json: {
          categories: { primary: [{ slug: 'game-studios' }], secondary: [] },
          tags: { existing: [{ slug: 'slots' }], suggested_new: [] },
      } },
      { seo_plan_json: {
          sections: {
            meta: {
              meta_title: { candidate: TITLE_56 },
              meta_description: { candidate: DESC_160 },
            },
            overview: { target_keywords: ['slot game studio', 'casino game developer'] },
          },
          keyword_summary_table: [{ keyword: 'acme studios review' }],
      } },
    ],
  }],
};
const tools = { logger: { info() {}, warn() {}, error() {} }, progress: { update() {} }, _partialItems: [] };

(async () => {
  const out = await execute(input, {}, tools);
  const r = out.results[0];
  check('hydrated fixture: no per-entity error', !r.error && r.items.length === 1);
  const item = r.items[0];
  check('planner-candidate title resolved (56ch)', item.meta_title === TITLE_56 && item.title_length === 56);
  check('planner-candidate description resolved (160ch)', item.meta_description === DESC_160 && item.description_length === 160);
  check('status ok (no length warnings at 56/160)', item.status === 'ok');
  check('keywords assembled from analysis + plan', item.keyword_count > 0);
  const metaObj = JSON.parse(item.meta_json);
  check('meta_json parseable with og tags', metaObj.og && metaObj.og['og:title'] === TITLE_56);

  console.log(`\nmeta-output/test-hydration-contract: ${passed}/9 passed`);
})().catch((err) => { console.error(err); process.exit(1); });
