/**
 * Standalone test harness for B029-4 — shape-agnostic keyword harvest as an
 * ADDITIVE union with the legacy fixed buckets.
 *
 * Run: node modules/step-6-qa/keyword-sufficiency-checker/test-keyword-harvest.js
 * No network — pure text analysis.
 *
 * Legacy shapes (keywords_used, top-level target_keywords, keyword_distribution
 * overview/categories, flat head_terms/negatives) must produce IDENTICAL buckets
 * to the pre-B029-4 extractor. §9.C-shaped plans (per-section target_keywords
 * under category_sections/tag_sections, keyword_distribution.tags/credentials/faq
 * `keywords`, keyword_summary_table) must now yield targets instead of zero.
 */

const execute = require('./execute.js');
const MANIFEST = require('./manifest.json');
const { extractKeywords, collectPlanKeywords } = execute.__testing;

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { console.log(`  PASS: ${msg}`); pass++; }
  else { console.log(`  FAIL: ${msg}`); fail++; }
}
const sameSet = (arr, expected) =>
  arr.length === expected.length && expected.every(e => arr.includes(e));

(async () => {
  console.log('\n=== Manifest sanity (B029-4) ===');
  assert(MANIFEST.version.localeCompare('1.1.0', undefined, { numeric: true }) >= 0,
    'manifest version at least 1.1.0');

  // -------------------------------------------------------------------------
  // Legacy-shape identity: buckets exactly as the pre-B029-4 extractor.
  // -------------------------------------------------------------------------
  console.log('\n=== Legacy Shape 1 (keywords_used) — identical buckets ===');
  {
    const kw = extractKeywords({
      keywords_used: {
        head_terms: ['Casino Platform'],
        mid_tail: ['white label casino'],
        entities: ['Malta'],
        negatives: ['scam'],
      },
    });
    assert(sameSet(kw.headTerms, ['casino platform']), 'head_terms → headTerms');
    assert(sameSet(kw.midTail, ['white label casino']), 'mid_tail → midTail (no extras)');
    assert(sameSet(kw.entities, ['malta']), 'entities preserved');
    assert(sameSet(kw.negatives, ['scam']), 'negatives preserved');
  }

  console.log('\n=== Legacy Shape 2 (top-level target_keywords + keyword_distribution) — identical buckets ===');
  {
    const plan = {
      target_keywords: {
        primary: 'igaming platform',
        secondary: ['casino software', 'sportsbook provider'],
        long_tail: ['best igaming platform 2026'],
      },
      keyword_distribution: {
        overview: { headline_keywords: ['igaming platform'], body_keywords: ['payment integrations'] },
        categories: [{ heading_keywords: ['casino games'], body_keywords: ['slot providers'] }],
      },
    };
    const kw = extractKeywords(plan);
    assert(sameSet(kw.headTerms, ['igaming platform']), 'primary + headline_keywords → headTerms, deduped');
    assert(sameSet(kw.midTail, [
      'casino software', 'sportsbook provider', 'best igaming platform 2026',
      'payment integrations', 'casino games', 'slot providers',
    ]), 'secondary/long_tail/body/heading keywords → midTail exactly (harvester adds nothing new)');
    assert(kw.entities.length === 0 && kw.negatives.length === 0, 'no phantom entities/negatives');
  }

  // -------------------------------------------------------------------------
  // §9.C container shapes — previously ZERO targets, now harvested.
  // -------------------------------------------------------------------------
  console.log('\n=== §9.C shape: category_sections / tag_sections per-section target_keywords ===');
  {
    const plan = {
      category_sections: [
        { section: 'Platform', target_keywords: ['turnkey casino platform', 'igaming crm'] },
        { section: 'Games', target_keywords: ['game aggregation'] },
      ],
      tag_sections: [
        { tag: 'licensing', target_keywords: ['mga licence holder'] },
      ],
    };
    const kw = extractKeywords(plan);
    const total = kw.headTerms.length + kw.midTail.length + kw.entities.length + kw.negatives.length;
    assert(total > 0, 'totalKeywordTargets > 0 on a §9.C-shaped plan (was 0 pre-B029-4)');
    assert(sameSet(kw.midTail, ['turnkey casino platform', 'igaming crm', 'game aggregation', 'mga licence holder']),
      'per-section target_keywords land in midTail (conservative weight)');
    assert(kw.headTerms.length === 0, 'no fabricated head terms');
  }

  console.log('\n=== §9.C shape: keyword_distribution.tags/credentials/faq `keywords` ===');
  {
    const plan = {
      keyword_distribution: {
        tags: [{ tag: 'payments', keywords: ['psp integrations'] }],
        credentials: { keywords: ['curacao licence'] },
        faq: { keywords: ['is x legit'] },
      },
    };
    const kw = extractKeywords(plan);
    assert(sameSet(kw.midTail, ['psp integrations', 'curacao licence', 'is x legit']),
      'nested `keywords` fields harvested into midTail');
  }

  console.log('\n=== §9.C shape: keyword_summary_table ===');
  {
    const plan = {
      keyword_summary_table: [
        { keyword: 'igaming white label', section: 'Platform' },
        { keyword: '', section: 'empty-skipped' },
      ],
    };
    const kw = extractKeywords(plan);
    assert(sameSet(kw.midTail, ['igaming white label']), 'keyword_summary_table[].keyword harvested');
  }

  // -------------------------------------------------------------------------
  // Additive union: legacy buckets keep their weight class; no duplication.
  // -------------------------------------------------------------------------
  console.log('\n=== Union: legacy + §9.C in one plan ===');
  {
    const plan = {
      target_keywords: { primary: 'igaming platform', secondary: ['casino software'] },
      category_sections: [{ section: 'Platform', target_keywords: ['igaming platform', 'turnkey solution'] }],
    };
    const kw = extractKeywords(plan);
    assert(sameSet(kw.headTerms, ['igaming platform']), 'primary stays a HEAD term');
    assert(!kw.midTail.includes('igaming platform'), 'a term already in a legacy bucket is NOT duplicated into midTail');
    assert(kw.midTail.includes('turnkey solution'), 'harvester-only term added to midTail');
  }

  console.log('\n=== Harvester ignores non-keyword fields ===');
  {
    const plan = {
      keyword_sources: { research: ['should not appear'] },
      notes: 'prose notes',
      meta: { title: 'Meta Title' },
      category_sections: [{ target_keywords: ['real keyword'] }],
    };
    const collected = collectPlanKeywords(plan);
    assert(collected.length === 1 && collected[0] === 'real keyword',
      'keyword_sources/notes/meta never mistaken for keywords');
  }

  // -------------------------------------------------------------------------
  // End-to-end: a §9.C plan no longer trips the W1.1 empty-plan loud-fail.
  // -------------------------------------------------------------------------
  console.log('\n=== execute(): §9.C plan is no longer an "empty keyword plan" ===');
  {
    const logs = [];
    const tools = {
      logger: { info: m => logs.push(m), warn: m => logs.push(m), error: m => logs.push(m) },
      progress: { update: () => {} },
      _partialItems: [],
    };
    const entity = {
      name: 'Acme',
      items: [
        {
          content_markdown: '# Turnkey casino platform overview\n\nAcme ships a turnkey casino platform with game aggregation.\n\n## Licensing\n\nAcme holds an MGA licence and offers igaming crm tooling.',
        },
        {
          seo_plan_json: {
            category_sections: [
              { section: 'Platform', target_keywords: ['turnkey casino platform', 'igaming crm'] },
              { section: 'Games', target_keywords: ['game aggregation'] },
            ],
          },
        },
      ],
    };
    const res = await execute({ entities: [entity] }, { ...MANIFEST.options_defaults }, tools);
    const ent = res.results[0];
    assert(ent.meta.error !== 'empty_keyword_plan', 'no empty_keyword_plan loud-fail on a §9.C plan');
    assert(!ent.meta.skipped, 'keyword check actually ran (not skipped)');
    assert(typeof ent.items[0].keyword_score === 'number' && ent.items[0].keyword_score > 0,
      `plausible keyword_score computed (${ent.items[0].keyword_score})`);
  }

  console.log(`\n=== Result: ${pass} pass, ${fail} fail ===`);
  process.exit(fail === 0 ? 0 : 1);
})();
