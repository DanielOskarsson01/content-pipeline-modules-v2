/**
 * markdown-output — frontmatter_entity_fields (B032-2) test
 *
 * Run: node modules/step-8-bundling/markdown-output/test-frontmatter-entity-fields.js
 *
 * GOLDEN below was captured from v1.2.0 (git 4a35a1c) running this exact
 * fixture with default options — the default-[] path must stay byte-identical
 * to it forever. The live A/B against `git show HEAD:...execute.js` was run at
 * build time (2026-08-27) and matched byte-for-byte.
 */

const assert = require('assert');
const execute = require('./execute.js');

const GOLDEN = "---\ntitle: Acme Studios\ncategories:\n  - game-studios\ntags:\n  - slots\n---\n\n## Acme Studios\n\nAcme builds slot games. [^1]\n\n## Slot Portfolio\n\nMany games.\n\n---\n\n[^1]: Acme About — https://acme.example/about";

function fixture(entityOverrides = {}) {
  return {
    entities: [{
      name: 'Acme Studios',
      company_id: 'cmp-123',
      ...entityOverrides,
      items: [
        { content_markdown: '## [Overview] Acme Studios\n\nAcme builds slot games. [#1]\n\n## [Tag: slots] Slot Portfolio\n\nMany games.' },
        { analysis_json: {
            source_citations: [{ index: 1, title: 'Acme About', url: 'https://acme.example/about' }],
            categories: { primary: [{ slug: 'game-studios' }], secondary: [] },
            tags: { existing: [{ slug: 'slots' }], suggested_new: [] },
        } },
      ],
    }],
  };
}

const tools = () => ({ logger: { info() {}, warn() {}, error() {} }, progress: { update() {} }, _partialItems: [] });

const md = (result) => result.results[0].items[0].final_markdown;

(async () => {
  let passed = 0;
  const check = (name, cond) => { assert.ok(cond, name); passed++; console.log(`  ok - ${name}`); };

  // 1-2. Default and explicit [] are byte-identical to the v1.2.0 golden
  check('default options: byte-identical to v1.2.0 golden',
    md(await execute(fixture(), {}, tools())) === GOLDEN);
  check('explicit []: byte-identical to v1.2.0 golden',
    md(await execute(fixture(), { frontmatter_entity_fields: [] }, tools())) === GOLDEN);

  // 3. On-mode: company_id stamped directly after title, rest unchanged
  const onMode = md(await execute(fixture(), { frontmatter_entity_fields: ['company_id'] }, tools()));
  check('on-mode: output is golden + company_id line after title',
    onMode === GOLDEN.replace('title: Acme Studios\n', 'title: Acme Studios\ncompany_id: cmp-123\n'));

  // 4. On-mode with the field absent on the entity: silent omit, no error
  const absent = await execute(fixture({ company_id: undefined }), { frontmatter_entity_fields: ['company_id'] }, tools());
  check('absent field: no error', !absent.results[0].error);
  check('absent field: byte-identical to golden (silent omit)', md(absent) === GOLDEN);

  // 5. Null field value: silent omit
  check('null field value: silent omit',
    md(await execute(fixture({ company_id: null }), { frontmatter_entity_fields: ['company_id'] }, tools())) === GOLDEN);

  // 6. Option arriving as a JSON string (UI stores json options as strings)
  check('JSON-string option: parses and stamps',
    md(await execute(fixture(), { frontmatter_entity_fields: '["company_id"]' }, tools())) === onMode);

  // 7. Garbage string option: falls back to [] (byte-identical) AND warns loudly
  const warns = [];
  const warnTools = tools();
  warnTools.logger.warn = (msg) => warns.push(msg);
  check('malformed string option: falls back to default behavior',
    md(await execute(fixture(), { frontmatter_entity_fields: 'not json' }, warnTools)) === GOLDEN);
  check('malformed string option: logs a warning (no silent degrade)',
    warns.some(w => w.includes('frontmatter_entity_fields')));

  console.log(`\ntest-frontmatter-entity-fields: ${passed}/9 passed`);
})().catch((err) => { console.error(err); process.exit(1); });
