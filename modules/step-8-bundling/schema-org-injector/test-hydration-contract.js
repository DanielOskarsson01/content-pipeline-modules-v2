/**
 * schema-org-injector — B032-1 hydration contract test
 *
 * Run: node modules/step-8-bundling/schema-org-injector/test-hydration-contract.js
 *
 * (1) manifest.requires_columns must equal exactly the §7b columns execute.js
 *     reads (declared == code reads). final_json (json-output shape) is the
 *     same stripped-field class but deliberately NOT declared — no current
 *     template schedules json-output upstream; the manifest usage_notes carry
 *     the cross-flag.
 * (2) Run B replication (STEP78 §3.3): over a HYDRATED-shape fixture the
 *     module emits a parseable JSON-LD @graph (Organization + Product +
 *     FAQPage) with zero validation errors.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const execute = require('./execute.js');
const manifest = require('./manifest.json');

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
check('final_json read in code but NOT declared (cross-flag in usage_notes)',
  src.includes('final_json') && !manifest.requires_columns.includes('final_json')
  && manifest.usage_notes.includes('final_json'));

// ── (2) hydrated-shape fixture: Run B outcome ───────────────────────────────
const input = {
  entities: [{
    name: 'Acme Studios',
    website: 'acme.example',
    items: [
      { analysis_json: {
          key_facts: { founded: 2015, headquarters: 'Stockholm', employees: 120 },
          categories: { primary: [{ slug: 'game-studios', why: 'Builds and licenses slot games' }], secondary: [] },
          tags: { existing: [], suggested_new: [] },
      } },
      { seo_plan_json: {
          faqs: [
            { question: 'What does Acme Studios do?', answer: 'Acme Studios builds slot games for regulated markets.' },
            { question: 'Where is Acme Studios based?', answer: 'Stockholm, Sweden.' },
          ],
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

  const jsonMatch = item.schema_jsonld.match(/<script type="application\/ld\+json">\n([\s\S]*)\n<\/script>/);
  check('script block wraps the JSON-LD', !!jsonMatch);
  const ld = JSON.parse(jsonMatch[1]); // throws (test fails) if not parseable
  check('parseable @graph emitted', Array.isArray(ld['@graph']) && ld['@context'] === 'https://schema.org');

  const types = ld['@graph'].map((s) => s['@type']);
  check('Organization present', types.includes('Organization'));
  check('Product present (from analysis primary categories)', types.includes('Product'));
  check('FAQPage present (from seo_plan_json.faqs)', types.includes('FAQPage'));

  const org = ld['@graph'].find((s) => s['@type'] === 'Organization');
  check('Organization carries url + foundingDate + address from hydrated analysis',
    org.url === 'https://acme.example' && org.foundingDate === '2015'
    && org.address && org.address.addressLocality === 'Stockholm');
  check('zero validation errors (Run B parity)',
    item.validation_error_count === 0 && item.has_validation_errors === 'false');

  console.log(`\nschema-org-injector/test-hydration-contract: ${passed}/11 passed`);
})().catch((err) => { console.error(err); process.exit(1); });
