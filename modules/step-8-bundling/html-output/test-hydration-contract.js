/**
 * html-output — B032-1 hydration contract test
 *
 * Run: node modules/step-8-bundling/html-output/test-hydration-contract.js
 *
 * (1) manifest.requires_columns must equal exactly the §7b columns execute.js
 *     reads: analysis_json ONLY — this module never reads seo_plan_json, and
 *     content_markdown (its required input) rides §7c blob-hydration for all
 *     modules, so it is never declared.
 * (2) Run B replication: over a HYDRATED-shape fixture the module renders
 *     HTML with citations linked to the analysis source, a Sources section,
 *     and schema.org JSON-LD built from the analysis.
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
check('declared set is ["analysis_json"] only (no seo_plan_json read anywhere)',
  JSON.stringify(declared) === JSON.stringify(['analysis_json']) && !src.includes('seo_plan_json'));
check('content_markdown is NOT declared (§7c blob-hydration covers it for all modules)',
  !manifest.requires_columns.includes('content_markdown'));

// ── (2) hydrated-shape fixture: renders with citations + schema.org ─────────
const input = {
  entities: [{
    name: 'Acme Studios',
    items: [
      { content_markdown: '## [Overview] Acme Studios\n\nAcme builds slot games for regulated markets. [#1]' },
      { analysis_json: {
          source_citations: [{ index: 1, title: 'Acme About', url: 'https://acme.example/about' }],
          key_facts: { founded: 2015, headquarters: 'Stockholm' },
          categories: { primary: [{ slug: 'game-studios' }], secondary: [] },
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

  check('markdown rendered to HTML (marker stripped, heading present)',
    item.final_html.includes('<h2') && item.final_html.includes('Acme Studios')
    && !item.final_html.includes('[Overview]'));
  check('citation converted to superscript anchor', item.final_html.includes('id="ref-1"'));
  check('Sources section links the hydrated analysis citation',
    item.final_html.includes('https://acme.example/about'));
  const ldMatch = item.final_html.match(/<script type="application\/ld\+json">\n([\s\S]*?)\n<\/script>/);
  check('schema.org JSON-LD emitted from hydrated analysis', !!ldMatch);
  const ld = JSON.parse(ldMatch[1]);
  check('JSON-LD parseable with analysis facts',
    ld['@type'] === 'Organization' && ld.foundingDate === '2015'
    && ld.address && ld.address.addressLocality === 'Stockholm');
  check('has_schema_org true', item.has_schema_org === true);

  console.log(`\nhtml-output/test-hydration-contract: ${passed}/10 passed`);
})().catch((err) => { console.error(err); process.exit(1); });
