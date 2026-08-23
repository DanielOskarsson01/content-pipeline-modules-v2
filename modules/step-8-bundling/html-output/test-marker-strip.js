/**
 * UNIT M1 — html-output stripMarkers marker-word leak (same defect class as
 * markdown-output). The whole bracketed marker prefix is removed before
 * markdown→HTML conversion; only the descriptive title remains in the <h2>.
 * Before the fix, "## [Tag: mobile] Mobile-First Slots Design" rendered as
 * "<h2>Mobile Mobile-First Slots Design</h2>".
 *
 * html-output always strips markers (no keep_markers option) and has no Meta
 * section handling, so only the four marker fixtures apply here.
 */
const assert = require('assert');
const execute = require('./execute.js');

let checks = 0;
const noopTools = { logger: { info() {}, warn() {}, error() {} }, progress: { update() {} } };
const OPTS = { include_schema_org: false, css_template: 'none', include_sources_section: false, wrap_in_document: false };

async function htmlFor(content) {
  const entities = [{ name: 'ELK Studios', items: [{ content_markdown: content }] }];
  const out = await execute({ entities }, OPTS, noopTools);
  return out.results[0].items[0].final_html;
}

function check(name, cond) {
  assert.ok(cond, name);
  checks++;
}

(async () => {
  const A = await htmlFor('## [Overview] ELK Studios — Online Slots Provider\n\nBody.');
  check('A: title rendered', A.includes('<h2>ELK Studios — Online Slots Provider</h2>'));
  check('A: marker gone', !A.includes('[Overview]') && !A.includes('Overview ELK'));

  const B = await htmlFor('## [Tag: mobile] Mobile-First Slots Design\n\nBody.');
  check('B: title rendered', B.includes('<h2>Mobile-First Slots Design</h2>'));
  check('B: no marker-word leak', !B.includes('Mobile Mobile') && !B.includes('[Tag:'));

  const C = await htmlFor('## [Primary Category: game-providers] ELK Studios as an Online Slots Provider\n\nBody.');
  check('C: title rendered', C.includes('<h2>ELK Studios as an Online Slots Provider</h2>'));
  check('C: marker gone', !C.includes('Game Providers') && !C.includes('[Primary Category'));

  const D = await htmlFor('## [Quick Facts] Company at a Glance\n\nBody.');
  check('D: title rendered', D.includes('<h2>Company at a Glance</h2>'));
  check('D: marker gone', !D.includes('[Quick Facts]') && !D.includes('Quick Facts Company'));

  console.log(`html-output marker strip: ${checks}/${checks} assertions passed.`);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
