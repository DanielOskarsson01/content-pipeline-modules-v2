/**
 * FIX D — content-writer resolves meta from the seo-planner output and emits it
 * onto the pool item, so meta-compliance-checker + Step 8 meta-output read the
 * PLANNED meta (validated candidate) instead of the entity name / raw
 * og:description. Before this, metaTitle fell back to entity.name ("ELK Studios",
 * 11 chars) which the checker then read priority-1 and failed as too short.
 */
const assert = require('assert');
const { __testing } = require('./execute.js');
const { resolveMetaFromPlanner } = __testing;

let checks = 0;

// sections.meta.candidate (seo-planner's real shape) is used
{
  const planner = { seo_plan_json: { sections: { meta: {
    meta_title: { candidate: 'ELK Studios — Online Casino Game Provider' },
    meta_description: { candidate: 'A 150-char validated description from the planner.' },
  } } } };
  const { metaTitle, metaDescription } = resolveMetaFromPlanner(planner, 'ELK Studios');
  assert.strictEqual(metaTitle, 'ELK Studios — Online Casino Game Provider', 'title from sections.meta.candidate');
  assert.strictEqual(metaDescription, 'A 150-char validated description from the planner.', 'description from sections.meta.candidate');
  checks += 2;
}

// top-level plan.meta wins over sections.meta.candidate (legacy priority-1)
{
  const planner = { seo_plan_json: {
    meta: { title: 'Top Level Title', description: 'Top Level Desc' },
    sections: { meta: { meta_title: { candidate: 'Nested Title' } } },
  } };
  const { metaTitle, metaDescription } = resolveMetaFromPlanner(planner, 'X');
  assert.strictEqual(metaTitle, 'Top Level Title', 'top-level plan.meta.title takes precedence');
  assert.strictEqual(metaDescription, 'Top Level Desc', 'top-level plan.meta.description takes precedence');
  checks += 2;
}

// flat plannerItem.meta_title (legacy) used when no seo_plan_json meta
{
  const planner = { meta_title: 'Flat Title', meta_description: 'Flat Desc' };
  const { metaTitle, metaDescription } = resolveMetaFromPlanner(planner, 'X');
  assert.strictEqual(metaTitle, 'Flat Title', 'flat meta_title used');
  assert.strictEqual(metaDescription, 'Flat Desc', 'flat meta_description used');
  checks += 2;
}

// no planner at all -> entity name for title, EMPTY description (never invented)
{
  const r = resolveMetaFromPlanner(null, 'ELK Studios');
  assert.strictEqual(r.metaTitle, 'ELK Studios', 'title falls back to entity name');
  assert.strictEqual(r.metaDescription, '', 'description stays empty (not invented)');
  checks += 2;
}

// planner present but no meta anywhere -> same fallback
{
  const r = resolveMetaFromPlanner({ seo_plan_json: { sections: { overview: {} } } }, 'ELK Studios');
  assert.strictEqual(r.metaTitle, 'ELK Studios', 'title falls back to entity name when plan has no meta');
  assert.strictEqual(r.metaDescription, '', 'description empty when plan has no meta');
  checks += 2;
}

console.log(`content-writer/test-meta-resolution: PASS (${checks} assertions)`);
