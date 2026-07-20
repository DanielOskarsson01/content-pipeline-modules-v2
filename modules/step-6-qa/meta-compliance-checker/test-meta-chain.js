/**
 * FIX D — meta:fail was a batch-wide CONSTANT, not a signal.
 *
 * Root cause (2026-07-14 calibration): every entity failed the same 3/7 checks
 * in both rounds because
 *   (1) seo-planner emits keywords PER SECTION
 *       (seo_plan_json.sections.<name>.target_keywords) + a keyword_summary_table,
 *       NOT at top level — extractHeadTerms found zero -> the two keyword checks
 *       auto-failed ("No head_terms found in SEO plan");
 *   (2) the planner's length-valid meta candidates
 *       (sections.meta.meta_{title,description}.candidate) were never read, so
 *       the checker fell back to the writer's entity-name title (11 chars, too
 *       short) and the raw og:description (210+ chars, too long).
 *
 * This test proves the checker now (a) aggregates per-section + summary-table
 * keywords, (b) reads the planner's meta candidates, so a well-formed plan
 * PASSES; and (c) still FAILS when the plan is genuinely absent.
 */
const assert = require('assert');
const execute = require('./execute.js');
const { extractHeadTerms, addTargetKeywords } = execute.__testing;

let checks = 0;
const noopTools = { logger: { info() {}, warn() {}, error() {} }, progress: { update() {} } };

async function main() {
// ---- extractHeadTerms: the real nested calibration shape ----
{
  const plan = {
    sections: {
      overview: { target_keywords: { primary: 'online casino game provider', secondary: ['casino slot games', 'mobile slot developer'] } },
      meta: { meta_title: { candidate: 'x' } }, // no target_keywords here — must not break iteration
    },
    keyword_summary_table: [
      { keyword: 'game provider', type: 'Tag' },
      { keyword: 'slot games', type: 'Tag' },
    ],
  };
  const terms = extractHeadTerms(plan);
  assert(terms.includes('online casino game provider'), 'per-section primary aggregated');
  assert(terms.includes('casino slot games'), 'per-section secondary aggregated');
  assert(terms.includes('game provider'), 'keyword_summary_table keyword aggregated');
  assert(terms.includes('slot games'), 'keyword_summary_table second keyword aggregated');
  checks += 4;
}

// extractHeadTerms: still handles the legacy top-level + flat shapes
{
  assert(extractHeadTerms({ target_keywords: { primary: 'a', secondary: ['b'] } }).sort().join(',') === 'a,b', 'legacy top-level target_keywords');
  assert(extractHeadTerms({ head_terms: ['x'] })[0] === 'x', 'legacy head_terms');
  assert(extractHeadTerms({ keywords: ['y'] })[0] === 'y', 'legacy flat keywords');
  assert(extractHeadTerms(null).length === 0, 'null plan -> []');
  assert(extractHeadTerms({}).length === 0, 'empty plan -> []');
  checks += 5;
}

// extractHeadTerms: the REAL prod shape (run f4d501bd, Hacksawgaming) — top-level
// section containers, target_keywords as flat string[], per-tag `keywords`. The
// old fixed-shape extractor found ZERO here (=> "No head_terms found" every pass).
{
  const plan = {
    overview: { target_keywords: ['rng game supplier for online casinos', 'igaming content provider'], keyword_sources: ['Q1', 'Q1'], notes: 'lead with the primary phrase' },
    category_sections: {
      primary_category_game_providers: { target_keywords: ['slot games supplier', 'scratch cards provider'], keyword_sources: ['Q1'] },
      secondary_social: { target_keywords: [], keyword_sources: [], notes: 'analysis facts only' },
    },
    tag_sections: { slots: { keywords: ['slot game providers'], keyword_sources: ['Q2'] } },
    credentials: { target_keywords: ['certified', 'multi-jurisdiction'], keyword_sources: ['Q1'] },
    meta: { meta_title: 'Hacksaw Gaming — RNG Game Supplier', keyword_sources: ['Q1'] },
  };
  const terms = extractHeadTerms(plan);
  assert(terms.includes('rng game supplier for online casinos'), 'overview flat-array target_keywords harvested');
  assert(terms.includes('slot games supplier'), 'category_sections flat-array target_keywords harvested');
  assert(terms.includes('slot game providers'), 'tag_sections per-tag keywords harvested');
  assert(terms.includes('certified'), 'credentials target_keywords harvested');
  assert(!terms.includes('q1') && !terms.includes('q2'), 'keyword_sources provenance NOT counted as a keyword');
  assert(!terms.some(t => /lead with the primary/.test(t)), 'notes prose NOT counted as a keyword');
  checks += 6;
}

// addTargetKeywords: array-form primary + long_tail
{
  const t = new Set();
  addTargetKeywords({ primary: ['p1', 'p2'], long_tail: ['lt one'] }, t);
  assert(t.has('p1') && t.has('p2') && t.has('lt one'), 'array primary + long_tail');
  checks += 1;
}

// ---- Full execute: well-formed plan (per-section kw + meta candidates) PASSES ----
{
  const candidateTitle = 'ELK Studios — Online Casino Game Provider';           // 41 chars, has kw
  const candidateDesc = 'ELK Studios is an online casino game provider delivering premium HTML5 slot games to licensed operators across regulated markets worldwide since 2013.'; // 150 chars, has kw
  const seoPlan = {
    sections: {
      overview: { target_keywords: { primary: 'online casino game provider', secondary: ['slot games'] } },
      meta: {
        meta_title: { candidate: candidateTitle },
        meta_description: { candidate: candidateDesc },
      },
    },
    keyword_summary_table: [{ keyword: 'game provider' }],
  };
  // Content item WITHOUT meta fields — forces the checker to resolve meta from
  // the plan's candidates (priority-4). This is the pre-FIX-D failure path.
  const entities = [{
    name: 'ELK Studios',
    items: [
      { source_submodule: 'content-writer', content_markdown: '# ELK Studios\n\nBody.' },
      { source_submodule: 'seo-planner', seo_plan_json: seoPlan },
    ],
  }];
  const out = await execute({ entities }, {}, noopTools);
  const res = out.results[0].items[0];
  assert(!/No head_terms/.test(res.violations), 'per-section keywords found (no "No head_terms" violation)');
  assert.strictEqual(res.meta_title, candidateTitle, 'meta_title resolved from sections.meta.candidate (not entity name)');
  assert.strictEqual(res.meta_description_text, candidateDesc, 'meta_description resolved from sections.meta.candidate');
  assert(!/Title too short/.test(res.violations), 'candidate title is not too short (was 11-char entity name before)');
  assert(!/Description too long/.test(res.violations), 'candidate description within range (was 210+ og:description before)');
  assert.strictEqual(res.qa_pass, true, `well-formed plan PASSES all checks (violations: ${res.violations})`);
  checks += 6;
}

// ---- Full execute: writer-populated meta fields (priority-1) also PASS ----
{
  const seoPlan = { sections: { overview: { target_keywords: { primary: 'online casino game provider' } } } };
  const entities = [{
    name: 'ELK Studios',
    items: [
      { source_submodule: 'content-writer',
        meta_title: 'ELK Studios — Online Casino Game Provider',
        meta_description: 'ELK Studios is an online casino game provider delivering premium HTML5 slot games to licensed operators across regulated markets worldwide since 2013.',
        content_markdown: '# ELK\n\nBody.' },
      { source_submodule: 'seo-planner', seo_plan_json: seoPlan },
    ],
  }];
  const out = await execute({ entities }, {}, noopTools);
  const res = out.results[0].items[0];
  assert.strictEqual(res.qa_pass, true, `writer-emitted meta_title/meta_description pass (violations: ${res.violations})`);
  checks += 1;
}

// ---- Full execute: plan genuinely ABSENT still FAILS (check stays meaningful) ----
{
  const entities = [{
    name: 'ELK Studios',
    // Only a content item, no seo item, no meta fields -> H1 title "ELK Studios"
    // (11 chars, too short) + no head terms. Must NOT pass.
    items: [{ source_submodule: 'content-writer', content_markdown: '# ELK Studios\n\nA short body paragraph about the studio.' }],
  }];
  const out = await execute({ entities }, {}, noopTools);
  const res = out.results[0].items[0];
  assert.strictEqual(res.qa_pass, false, 'absent plan -> still FAILS (meta check remains a real gate)');
  assert(/No head_terms|too short/.test(res.violations), 'absent plan surfaces the real reason');
  checks += 2;
}

console.log(`meta-compliance-checker/test-meta-chain: PASS (${checks} assertions)`);
}

main().catch(err => { console.error(err); process.exit(1); });
