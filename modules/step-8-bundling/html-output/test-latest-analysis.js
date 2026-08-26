/**
 * Standalone test harness for B029-5 — html-output must grade the LATEST
 * analysis_json item (.at(-1)), matching the other Step-8 consumers (H18b).
 *
 * Run: node modules/step-8-bundling/html-output/test-latest-analysis.js
 * No network.
 *
 * Fixture: pool carries TWO analysis items (stale + fresh, as after a loop
 * re-run under add-upsert with multiple source submodules). Source citations
 * and schema.org must come from the fresh one.
 */

const execute = require('./execute.js');
const MANIFEST = require('./manifest.json');

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

const entity = {
  name: 'Acme',
  items: [
    { content_markdown: '# Acme\n\nAcme is a platform provider [#1].' },
    {
      analysis_json: {
        key_facts: { founded: '1999' },
        source_citations: [{ index: 1, url: 'https://stale.example/old', title: 'Stale Source' }],
      },
    },
    {
      analysis_json: {
        key_facts: { founded: '2005' },
        source_citations: [{ index: 1, url: 'https://fresh.example/new', title: 'Fresh Source' }],
      },
    },
  ],
};

(async () => {
  console.log('\n=== Manifest sanity (B029-5) ===');
  assert(MANIFEST.version.localeCompare('1.1.1', undefined, { numeric: true }) >= 0,
    'manifest version at least 1.1.1');

  console.log('\n=== Two-analysis fixture: latest analysis wins ===');
  const res = await execute(
    { entities: [entity] },
    { include_schema_org: true, css_template: 'none', include_sources_section: true, wrap_in_document: false },
    tools
  );
  const html = res.results[0].items[0].final_html;
  assert(html.includes('https://fresh.example/new'), 'sources section links the LATEST analysis citation');
  assert(!html.includes('https://stale.example/old'), 'stale citation absent');
  assert(html.includes('"foundingDate": "2005"'), 'schema.org built from the LATEST analysis');
  assert(!html.includes('"foundingDate": "1999"'), 'stale schema facts absent');

  console.log('\n=== Single-analysis regression: unchanged ===');
  const single = {
    name: 'Solo',
    items: [
      { content_markdown: '# Solo\n\nSolo ships games [#1].' },
      {
        analysis_json: {
          key_facts: { founded: '2010' },
          source_citations: [{ index: 1, url: 'https://only.example/src', title: 'Only Source' }],
        },
      },
    ],
  };
  const res2 = await execute(
    { entities: [single] },
    { include_schema_org: true, css_template: 'none', include_sources_section: true, wrap_in_document: false },
    tools
  );
  const html2 = res2.results[0].items[0].final_html;
  assert(html2.includes('https://only.example/src'), 'single analysis still used');
  assert(html2.includes('"foundingDate": "2010"'), 'single-analysis schema unchanged');

  console.log(`\n=== Result: ${pass} pass, ${fail} fail ===`);
  process.exit(fail === 0 ? 0 : 1);
})();
