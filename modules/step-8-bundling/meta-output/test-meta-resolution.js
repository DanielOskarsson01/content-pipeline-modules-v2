/**
 * BACKLOG #52 — meta-output ships the entity name, not the planned meta.
 *
 * Before this fix, meta-output read only legacy top-level seo_plan_json.meta
 * and fell back to entity.name, and assembleKeywords read only top-level
 * target_keywords. After FIX D the QA gate (meta-compliance-checker) PASSES on
 * the planner's meta candidate while the deliverable still shipped
 * title="ELK Studios" / empty description.
 *
 * This test proves:
 *   (a) planned meta ships when the plan has candidates (and the writer's
 *       emitted meta_title/meta_description fields rank above it),
 *   (b) honest entity-name fallback when nothing planned exists,
 *   (c) THE INVARIANT: on the same fixture, meta-output ships exactly the
 *       meta the checker validated — same source, same priority order.
 */
const assert = require('assert');
const execute = require('./execute.js');
const checkerExecute = require('../../step-6-qa/meta-compliance-checker/execute.js');

let checks = 0;
const noopTools = { logger: { info() {}, warn() {}, error() {} }, progress: { update() {} } };

const CANDIDATE_TITLE = 'ELK Studios — Online Casino Game Provider'; // 41 chars
const CANDIDATE_DESC = 'ELK Studios is an online casino game provider delivering premium HTML5 slot games to licensed operators across regulated markets worldwide since 2013.'; // 150 chars

// The FIX D calibration fixture — planner candidates, writer item WITHOUT meta
// fields. Pre-fix, meta-output shipped "ELK Studios" / '' on exactly this input.
function fixDFixture() {
  return [{
    name: 'ELK Studios',
    items: [
      { source_submodule: 'content-writer', content_markdown: '# ELK Studios\n\nBody.' },
      {
        source_submodule: 'seo-planner',
        seo_plan_json: {
          sections: {
            overview: { target_keywords: { primary: 'online casino game provider', secondary: ['slot games'] } },
            meta: {
              meta_title: { candidate: CANDIDATE_TITLE },
              meta_description: { candidate: CANDIDATE_DESC },
            },
          },
          keyword_summary_table: [{ keyword: 'game provider' }],
        },
      },
    ],
  }];
}

async function metaOutputItem(entities) {
  const out = await execute({ entities }, {}, noopTools);
  return out.results[0].items[0];
}

async function checkerItem(entities) {
  const out = await checkerExecute({ entities }, {}, noopTools);
  return out.results[0].items[0];
}

// Run the same fixture through BOTH modules and assert the deliverable equals
// what the checker validated.
async function assertInvariant(entities, label) {
  const shipped = await metaOutputItem(entities);
  const checked = await checkerItem(entities);
  assert.strictEqual(shipped.meta_title, checked.meta_title, `${label}: shipped title === checked title`);
  assert.strictEqual(shipped.meta_description, checked.meta_description_text, `${label}: shipped description === checked description`);
  checks += 2;
  return { shipped, checked };
}

async function main() {
  // ---- (a) planned meta ships when the plan has candidates ----
  {
    const res = await metaOutputItem(fixDFixture());
    assert.strictEqual(res.meta_title, CANDIDATE_TITLE, 'meta_title resolved from sections.meta.candidate (not entity name)');
    assert.strictEqual(res.meta_description, CANDIDATE_DESC, 'meta_description resolved from sections.meta.candidate (not empty)');
    assert.strictEqual(res.status, 'ok', 'candidate meta passes length validation');
    checks += 3;
  }

  // (a) writer-emitted pool fields rank ABOVE the plan candidate (priority 1)
  {
    const entities = fixDFixture();
    entities[0].items[0].meta_title = 'Writer Title Wins';
    entities[0].items[0].meta_description = 'Writer description wins.';
    const res = await metaOutputItem(entities);
    assert.strictEqual(res.meta_title, 'Writer Title Wins', 'writer meta_title field beats plan candidate');
    assert.strictEqual(res.meta_description, 'Writer description wins.', 'writer meta_description field beats plan candidate');
    checks += 2;
  }

  // (a) legacy top-level seo_plan_json.meta still wins over the candidate
  // (same order the checker uses: plan.meta before sections.meta.candidate)
  {
    const entities = fixDFixture();
    entities[0].items[1].seo_plan_json.meta = { title: 'Legacy Title', description: 'Legacy description.' };
    const res = await metaOutputItem(entities);
    assert.strictEqual(res.meta_title, 'Legacy Title', 'legacy plan.meta.title ranks above candidate');
    assert.strictEqual(res.meta_description, 'Legacy description.', 'legacy plan.meta.description ranks above candidate');
    checks += 2;
  }

  // ---- (b) honest fallback when the plan has no meta and nothing else exists ----
  {
    const entities = [{
      name: 'ELK Studios',
      items: [{ source_submodule: 'seo-planner', seo_plan_json: { sections: { overview: { target_keywords: { primary: 'kw' } } } } }],
    }];
    const res = await metaOutputItem(entities);
    assert.strictEqual(res.meta_title, 'ELK Studios', 'no planned/written meta -> entity name fallback');
    assert.strictEqual(res.meta_description, '', 'no planned/written meta -> empty description');
    assert.strictEqual(res.status, 'warning', 'fallback meta is flagged, not silently ok');
    checks += 3;
  }

  // ---- (c) invariant: checker-pass implies deliverable-correct, same fixture ----
  {
    const { shipped, checked } = await assertInvariant(fixDFixture(), 'FIX D fixture');
    assert.strictEqual(checked.qa_pass, true, `checker passes the FIX D fixture (violations: ${checked.violations})`);
    assert.strictEqual(shipped.meta_title, CANDIDATE_TITLE, 'and what ships is the planned candidate');
    checks += 2;
  }

  // (c) writer-fields fixture: both read priority-1 fields
  {
    const entities = [{
      name: 'ELK Studios',
      items: [
        { source_submodule: 'content-writer', meta_title: CANDIDATE_TITLE, meta_description: CANDIDATE_DESC, content_markdown: '# ELK\n\nBody.' },
        { source_submodule: 'seo-planner', seo_plan_json: { sections: { overview: { target_keywords: { primary: 'online casino game provider' } } } } },
      ],
    }];
    await assertInvariant(entities, 'writer-fields fixture');
  }

  // (c) frontmatter fixture: both read YAML frontmatter before the plan
  {
    const entities = [{
      name: 'ELK Studios',
      items: [
        { source_submodule: 'content-writer', content_markdown: '---\ntitle: "Frontmatter Title"\ndescription: "Frontmatter description."\n---\n# H1 Heading\n\nBody paragraph.' },
        { source_submodule: 'seo-planner', seo_plan_json: { sections: { meta: { meta_title: { candidate: 'Candidate Title' } } } } },
      ],
    }];
    const { shipped } = await assertInvariant(entities, 'frontmatter fixture');
    assert.strictEqual(shipped.meta_title, 'Frontmatter Title', 'frontmatter ranks above plan candidate (checker priority order)');
    checks += 1;
  }

  // (c) heuristic fixture: no fields, no frontmatter, no plan meta -> both fall
  // back to H1 title + first-paragraph description (before entity name)
  {
    const entities = [{
      name: 'ELK Studios',
      items: [
        { source_submodule: 'content-writer', content_markdown: '# ELK Studios Review\n\nFirst paragraph text used as description.' },
        { source_submodule: 'seo-planner', seo_plan_json: { sections: { overview: { target_keywords: { primary: 'kw' } } } } },
      ],
    }];
    const { shipped } = await assertInvariant(entities, 'heuristic fixture');
    assert.strictEqual(shipped.meta_title, 'ELK Studios Review', 'H1 heuristic ranks above entity-name fallback');
    assert.strictEqual(shipped.meta_description, 'First paragraph text used as description.', 'first-paragraph heuristic used for description');
    checks += 2;
  }

  // ---- keywords: per-section target_keywords + keyword_summary_table aggregated ----
  {
    const res = await metaOutputItem(fixDFixture());
    const keywordsJson = JSON.parse(res.meta_json).keywords;
    assert(keywordsJson.includes('online casino game provider'), 'per-section primary keyword aggregated');
    assert(keywordsJson.includes('slot games'), 'per-section secondary keyword aggregated');
    assert(keywordsJson.includes('game provider'), 'keyword_summary_table keyword aggregated');
    checks += 3;
  }

  // keywords: legacy top-level target_keywords still work + analysis slugs kept
  {
    const entities = [{
      name: 'ELK Studios',
      items: [
        { source_submodule: 'content-analyzer', analysis_json: { categories: { primary: [{ slug: 'game-provider' }] }, tags: { existing: [{ slug: 'slots' }] } } },
        { source_submodule: 'seo-planner', seo_plan_json: { target_keywords: { primary: 'Top Keyword', secondary: ['second'], long_tail: ['long tail phrase'] } } },
      ],
    }];
    const res = await metaOutputItem(entities);
    const keywordsJson = JSON.parse(res.meta_json).keywords;
    assert(keywordsJson.includes('game-provider'), 'analysis category slug kept');
    assert(keywordsJson.includes('slots'), 'analysis tag slug kept');
    assert(keywordsJson.includes('top keyword'), 'legacy top-level primary keyword aggregated');
    assert(keywordsJson.includes('second'), 'legacy secondary keyword aggregated');
    assert(keywordsJson.includes('long tail phrase'), 'legacy long_tail keyword aggregated');
    checks += 5;
  }

  // keywords: the REAL prod shape (run f4d501bd) — top-level section containers,
  // target_keywords as flat string[], per-tag `keywords`. The old fixed-shape
  // extractor returned [] here and would have shipped a keyword-stripped deliverable.
  {
    const entities = [{
      name: 'Hacksawgaming',
      items: [
        { source_submodule: 'seo-planner', seo_plan_json: {
          overview: { target_keywords: ['rng game supplier for online casinos'], keyword_sources: ['Q1'], notes: 'lead paragraph' },
          category_sections: { primary_category_game_providers: { target_keywords: ['slot games supplier'], keyword_sources: ['Q1'] } },
          tag_sections: { slots: { keywords: ['slot game providers'], keyword_sources: ['Q2'] } },
          credentials: { target_keywords: ['certified'], keyword_sources: ['Q1'] },
          meta: { meta_title: 'Hacksaw Gaming — RNG Game Supplier', keyword_sources: ['Q1'] },
        } },
      ],
    }];
    const res = await metaOutputItem(entities);
    const keywordsJson = JSON.parse(res.meta_json).keywords;
    assert(keywordsJson.includes('rng game supplier for online casinos'), 'overview flat-array keyword aggregated');
    assert(keywordsJson.includes('slot games supplier'), 'category_sections flat-array keyword aggregated');
    assert(keywordsJson.includes('slot game providers'), 'tag_sections per-tag keyword aggregated');
    assert(keywordsJson.includes('certified'), 'credentials keyword aggregated');
    assert(!keywordsJson.includes('q1') && !keywordsJson.includes('q2'), 'keyword_sources provenance NOT shipped as a keyword');
    assert(!keywordsJson.some(k => /lead paragraph/.test(k)), 'notes prose NOT shipped as a keyword');
    checks += 6;
  }

  console.log(`meta-output/test-meta-resolution: PASS (${checks} assertions)`);
}

main().catch(err => { console.error(err); process.exit(1); });
