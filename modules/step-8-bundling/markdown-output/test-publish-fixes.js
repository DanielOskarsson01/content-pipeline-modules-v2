/**
 * UNIT M1 — markdown-output publish-layer fixes.
 *
 * TASK 1 (stripMarkers marker-word leak): the whole bracketed marker prefix is
 *   removed; only the descriptive title remains. Before the fix,
 *   "## [Tag: mobile] Mobile-First Slots Design" yielded
 *   "## Mobile Mobile-First Slots Design" (marker word prepended).
 * TASK 2 (removeMetaSection greedy delete): with include_meta_section=false,
 *   ONLY the [Meta] section is removed (heading → next "## " or EOF). A
 *   following [Sources] section is preserved. Before the fix it deleted [Meta]
 *   and everything after it.
 *
 * Fixtures are driven through execute() — the real deployed path — not the
 * private helpers, so this also proves operation order composes correctly.
 */
const assert = require('assert');
const execute = require('./execute.js');

let checks = 0;
const noopTools = { logger: { info() {}, warn() {}, error() {} }, progress: { update() {} } };

// Isolate stripMarkers: no frontmatter, no meta removal, no citation reshaping.
const MARKER_OPTS = {
  include_frontmatter: false,
  include_meta_section: true, // skip removeMetaSection
  citation_format: 'inline',
  heading_style: 'strip_markers',
};

async function markdownFor(content, options) {
  const entities = [{ name: 'ELK Studios', items: [{ content_markdown: content }] }];
  const out = await execute({ entities }, options, noopTools);
  return out.results[0].items[0].final_markdown;
}

function check(name, cond) {
  assert.ok(cond, name);
  checks++;
}

(async () => {
  // ── TASK 1: marker stripping (A–E) ────────────────────────────────────
  const A = await markdownFor('## [Overview] ELK Studios — Online Slots Provider\n\nBody.', MARKER_OPTS);
  check('A: title kept', A.includes('## ELK Studios — Online Slots Provider'));
  check('A: marker gone', !A.includes('[Overview]') && !A.includes('## Overview '));

  const B = await markdownFor('## [Tag: mobile] Mobile-First Slots Design\n\nBody.', MARKER_OPTS);
  check('B: title kept', B.includes('## Mobile-First Slots Design'));
  check('B: no marker-word leak', !B.includes('Mobile Mobile') && !B.includes('[Tag:'));

  const C = await markdownFor('## [Primary Category: game-providers] ELK Studios as an Online Slots Provider\n\nBody.', MARKER_OPTS);
  check('C: title kept', C.includes('## ELK Studios as an Online Slots Provider'));
  check('C: marker gone', !C.includes('Game Providers') && !C.includes('[Primary Category'));

  const D = await markdownFor('## [Quick Facts] Company at a Glance\n\nBody.', MARKER_OPTS);
  check('D: title kept', D.includes('## Company at a Glance'));
  check('D: marker gone', !D.includes('[Quick Facts]') && !D.includes('Quick Facts Company'));

  const E = await markdownFor('## [Tag: mobile] Mobile-First Slots Design\n\nBody.', { ...MARKER_OPTS, heading_style: 'keep_markers' });
  check('E: keep_markers passes heading through unchanged', E.includes('## [Tag: mobile] Mobile-First Slots Design'));

  // ── TASK 2: meta removal (F–H) ────────────────────────────────────────
  // keep_markers so stripMarkers does not touch [Meta]/[Sources] headings.
  const META_OPTS = { include_frontmatter: false, citation_format: 'inline', heading_style: 'keep_markers' };
  const withSources =
    '# ELK Studios\n\nIntro paragraph.\n\n## [Meta]\nmeta_title: ELK Studios Review\nmeta_description: A slots provider.\n\n## [Sources]\n1. https://elk.example';

  const F = await markdownFor(withSources, { ...META_OPTS, include_meta_section: false });
  check('F: [Meta] removed', !F.includes('meta_title') && !F.includes('meta_description'));
  check('F: [Sources] preserved', F.includes('## [Sources]') && F.includes('https://elk.example'));
  check('F: body preserved', F.includes('# ELK Studios') && F.includes('Intro paragraph'));

  const G = await markdownFor(withSources, { ...META_OPTS, include_meta_section: true });
  check('G: [Meta] preserved when kept', G.includes('meta_title') && G.includes('meta_description'));
  check('G: [Sources] preserved', G.includes('## [Sources]'));

  const finalMeta =
    '# ELK Studios\n\nIntro paragraph.\n\n## [Meta]\nmeta_title: ELK Studios Review\nmeta_description: A slots provider.';
  const H = await markdownFor(finalMeta, { ...META_OPTS, include_meta_section: false });
  check('H: final [Meta] removed cleanly', !H.includes('meta_title') && !H.includes('[Meta]'));
  check('H: nothing else touched', H.includes('# ELK Studios') && H.includes('Intro paragraph'));

  console.log(`markdown-output publish fixes: ${checks}/${checks} assertions passed.`);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
