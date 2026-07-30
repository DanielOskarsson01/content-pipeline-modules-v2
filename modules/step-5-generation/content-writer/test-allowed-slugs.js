/**
 * Standalone test harness for content-writer v1.5.0+ features.
 *
 * Run: node modules/step-5-generation/content-writer/test-allowed-slugs.js
 * From repo root.
 *
 * Covers:
 *   - walkSlugPath: dot-notation with `[]` array iteration into arbitrary shapes
 *   - parseAllowedSlugConfig: textarea config → [{ label, path }] entries
 *   - renderAllowedSlugsBlock: per-entity block emission (null when no config / no slugs)
 *   - assembleEntityContent: full assembly with slug block prepended (or not)
 *   - (v1.6.0) Manifest sanity: agnostic default + byte-identical prompt copies
 *   - (v1.6.0) Refusal matrix: requires_prompt_override × prompt-vs-default × 4 scenarios
 *
 * The point is to prove that the submodule is pipeline-agnostic:
 *   - Empty config (cover letters, news, anything) → behavior identical to v1.4.0
 *   - Company-profile config → categories + tags surfaced as a closed vocabulary
 *   - News config → topics surfaced as a closed vocabulary (different shape)
 *   - Manifest default contains zero pipeline-specific vocabulary
 *   - Per-template refusal flag fails loud when an override is missing
 */

const execute = require('./execute.js');
const MANIFEST = require('./manifest.json');
const { walkSlugPath, parseAllowedSlugConfig, renderAllowedSlugsBlock, assembleEntityContent, MANIFEST_DEFAULT_PROMPT } = execute.__testing;

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { console.log(`  PASS: ${msg}`); pass++; }
  else { console.log(`  FAIL: ${msg}`); fail++; }
}

// -------------------------------------------------------------------------
// walkSlugPath
// -------------------------------------------------------------------------
console.log('\n=== walkSlugPath ===');
const cp = {
  categories: {
    primary: [{ slug: 'casino-platforms' }, { slug: 'sportsbook-platform' }],
    secondary: [{ slug: 'retail-systems' }, { slug: 'payment-services' }],
  },
  tags: {
    existing: [{ slug: 'api' }, { slug: 'white-label' }],
    suggested_new: [{ label: 'omnichannel' }, { label: 'fastbet' }],
  },
};
assert(
  JSON.stringify(walkSlugPath(cp, 'categories.primary[].slug')) === JSON.stringify(['casino-platforms', 'sportsbook-platform']),
  'company-profile primary path'
);
assert(
  JSON.stringify(walkSlugPath(cp, 'categories.secondary[].slug')) === JSON.stringify(['retail-systems', 'payment-services']),
  'company-profile secondary path'
);
assert(
  JSON.stringify(walkSlugPath(cp, 'tags.existing[].slug')) === JSON.stringify(['api', 'white-label']),
  'tags.existing path with .slug leaf'
);
assert(
  JSON.stringify(walkSlugPath(cp, 'tags.suggested_new[].label')) === JSON.stringify(['omnichannel', 'fastbet']),
  'tags.suggested_new path with .label leaf'
);

// Other shapes (news pipeline, podcast pipeline, etc.)
const news = {
  topics: [{ slug: 'regulation' }, { slug: 'crypto' }],
  entities: { mentioned: [{ slug: 'mga' }, { slug: 'curacao' }] },
};
assert(
  JSON.stringify(walkSlugPath(news, 'topics[].slug')) === JSON.stringify(['regulation', 'crypto']),
  'news pipeline topics path'
);
assert(
  JSON.stringify(walkSlugPath(news, 'entities.mentioned[].slug')) === JSON.stringify(['mga', 'curacao']),
  'news pipeline nested entities path'
);

// Flat string arrays
const podcast = { topics: ['onboarding', 'lifecycle'], guests: [{ name: 'Jane' }, { name: 'Bob' }] };
assert(
  JSON.stringify(walkSlugPath(podcast, 'topics[]')) === JSON.stringify(['onboarding', 'lifecycle']),
  'flat string array via [] terminator'
);
assert(
  JSON.stringify(walkSlugPath(podcast, 'guests[].name')) === JSON.stringify(['Jane', 'Bob']),
  'podcast guests path'
);

// Defensive failure modes
assert(JSON.stringify(walkSlugPath(null, 'a.b[]')) === '[]', 'null obj → []');
assert(JSON.stringify(walkSlugPath({}, 'a.b[]')) === '[]', 'missing path → []');
assert(JSON.stringify(walkSlugPath(cp, 'categories.primary[].nonexistent')) === '[]', 'missing leaf field → []');
assert(JSON.stringify(walkSlugPath(cp, 'tags.existing.slug')) === '[]', 'array accessed without [] → []');
assert(JSON.stringify(walkSlugPath({ x: 'hello' }, 'x')) === JSON.stringify(['hello']), 'string leaf → wrapped');

// -------------------------------------------------------------------------
// parseAllowedSlugConfig
// -------------------------------------------------------------------------
console.log('\n=== parseAllowedSlugConfig ===');

assert(parseAllowedSlugConfig('').length === 0, 'empty string → []');
assert(parseAllowedSlugConfig(null).length === 0, 'null → []');
assert(parseAllowedSlugConfig(undefined).length === 0, 'undefined → []');

const cfg1 = parseAllowedSlugConfig(`
Primary Category=categories.primary[].slug
Secondary Category=categories.secondary[].slug
Tag=tags.existing[].slug
Tag=tags.suggested_new[].label
`);
assert(cfg1.length === 4, `company-profile config → 4 entries (got ${cfg1.length})`);
assert(cfg1[0].label === 'Primary Category' && cfg1[0].path === 'categories.primary[].slug', 'first entry parsed correctly');
assert(cfg1[2].label === 'Tag' && cfg1[3].label === 'Tag', 'repeated labels preserved');

const cfg2 = parseAllowedSlugConfig(`
# Comment line should be skipped
Topic=topics[].slug
# another comment

Entity=entities.mentioned[].slug
`);
assert(cfg2.length === 2, `news config with comments → 2 entries (got ${cfg2.length})`);

const cfg3 = parseAllowedSlugConfig('= empty label\nLabel=\n=path');
assert(cfg3.length === 0, 'malformed entries → []');

// -------------------------------------------------------------------------
// renderAllowedSlugsBlock
// -------------------------------------------------------------------------
console.log('\n=== renderAllowedSlugsBlock ===');

assert(renderAllowedSlugsBlock({}, []) === null, 'empty config → null');
assert(renderAllowedSlugsBlock({}, cfg1) === null, 'no analysis_json → null');
assert(renderAllowedSlugsBlock({ analysis_json: null }, cfg1) === null, 'null analysis_json → null');

const aj = { analysis_json: cp };
const block = renderAllowedSlugsBlock(aj, cfg1);
assert(block !== null, 'company-profile shape + cfg → block emitted');
assert(block.includes('ALLOWED SLUGS FOR THIS ARTICLE'), 'block has the header');
assert(block.includes('`casino-platforms`'), 'block contains primary slug');
assert(block.includes('`api`'), 'block contains tag slug');
assert(block.includes('`omnichannel`'), 'block contains suggested_new label');
assert(block.includes('[Primary Category: <slug>]'), 'block names the label correctly');
assert(block.includes('[Tag: <slug>]'), 'block names the tag label');

// Tag label appears once, even though config has two Tag entries
const tagOccurrences = (block.match(/\*\*\[Tag: <slug>\]\*\*/g) || []).length;
assert(tagOccurrences === 1, `repeated Tag label collapsed to single block line (got ${tagOccurrences})`);
// Both api and omnichannel should be in the SAME tag list
const tagListMatch = block.match(/\*\*\[Tag: <slug>\]\*\* — allowed values: ([^\n]+)/);
assert(tagListMatch && tagListMatch[1].includes('`api`') && tagListMatch[1].includes('`omnichannel`'),
  'both Tag paths concatenated into one allowed-values list');

// Different content type — news pipeline
const newsCfg = parseAllowedSlugConfig(`
Topic=topics[].slug
Mentioned Entity=entities.mentioned[].slug
`);
const newsBlock = renderAllowedSlugsBlock({ analysis_json: news }, newsCfg);
assert(newsBlock !== null && newsBlock.includes('[Topic: <slug>]'), 'news pipeline renders with its own labels');
assert(newsBlock.includes('`regulation`') && newsBlock.includes('`mga`'), 'news pipeline pulls correct slugs');
assert(!newsBlock.includes('Primary Category'), 'news block has no company-profile labels');

// All-empty case (config valid but analysis_json has no matching fields)
const irrelevantAJ = { analysis_json: { unrelated: 'field' } };
assert(renderAllowedSlugsBlock(irrelevantAJ, cfg1) === null, 'config valid but no slugs found → null');

// -------------------------------------------------------------------------
// assembleEntityContent (full pipeline)
// -------------------------------------------------------------------------
console.log('\n=== assembleEntityContent ===');

// Without allowed_slug_paths → unchanged v1.4.0 behavior
const v140 = assembleEntityContent({ analysis_json: cp }, null, 'SOURCE');
assert(!v140.includes('ALLOWED SLUGS'), 'empty config → no ALLOWED SLUGS block');
assert(v140.includes('=== CONTENT ANALYSIS ==='), 'CONTENT ANALYSIS section still present');
assert(v140.includes('=== SOURCE CONTENT'), 'SOURCE CONTENT section still present');

// With company-profile config → block prepended ABOVE CONTENT ANALYSIS
const cpAllowedConfig = `
Primary Category=categories.primary[].slug
Secondary Category=categories.secondary[].slug
Tag=tags.existing[].slug
Tag=tags.suggested_new[].label
`;
const v150 = assembleEntityContent({ analysis_json: cp }, null, 'SOURCE', cpAllowedConfig);
const allowedIdx = v150.indexOf('ALLOWED SLUGS');
const analysisIdx = v150.indexOf('=== CONTENT ANALYSIS');
assert(allowedIdx !== -1, 'ALLOWED SLUGS block present in output');
assert(allowedIdx < analysisIdx, 'ALLOWED SLUGS block appears BEFORE CONTENT ANALYSIS');
assert(v150.includes('`casino-platforms`'), 'output contains primary slug');
assert(v150.includes('NARRATIVE MATERIAL ONLY'), 'output contains the narrative-disclaimer sentence');

// Cover letter / news pipeline analyzer with NO categories/tags — empty block, but block omitted
const coverLetterAJ = { analysis_json: { headline: 'CMO at FinTech', sender: 'Daniel' } };
const v150cl = assembleEntityContent(coverLetterAJ, null, 'JOB AD TEXT', cpAllowedConfig);
assert(!v150cl.includes('ALLOWED SLUGS'), 'cover-letter analyzer shape + config that does not match → no block emitted');

// Cover letter with no allowed_slug_paths at all → no block
const v150clNoConfig = assembleEntityContent(coverLetterAJ, null, 'JOB AD TEXT', '');
assert(!v150clNoConfig.includes('ALLOWED SLUGS'), 'cover-letter + no config → no block (v1.4.0 behavior preserved)');

// Cover letter that DOES use slugs (e.g., role variants)
const cvAJ = { analysis_json: { variants: { available: [{ slug: 'cmo' }, { slug: 'ceo' }, { slug: 'cpo' }] } } };
const cvConfig = `Variant=variants.available[].slug`;
const v150cv = assembleEntityContent(cvAJ, null, 'JOB AD TEXT', cvConfig);
assert(v150cv.includes('[Variant: <slug>]'), 'cover-letter pipeline could use the same agnostic mechanism with its own labels');
assert(v150cv.includes('`cmo`') && v150cv.includes('`ceo`'), 'cover-letter slugs extracted correctly');

// -------------------------------------------------------------------------
// Manifest sanity (v1.6.0)
// -------------------------------------------------------------------------
console.log('\n=== Manifest sanity (v1.6.0) ===');
assert(/^\d+\.\d+\.\d+$/.test(MANIFEST.version), `manifest version is semver (got ${MANIFEST.version})`); // version-agnostic (M4 class)
assert(typeof MANIFEST_DEFAULT_PROMPT === 'string' && MANIFEST_DEFAULT_PROMPT.length > 500, 'MANIFEST_DEFAULT_PROMPT loaded (>500 chars)');
const promptOpt = MANIFEST.options.find(o => o.name === 'prompt');
assert(promptOpt.default === MANIFEST_DEFAULT_PROMPT, 'options[prompt].default === options_defaults.prompt (byte-identical — load-bearing for refusal)');
assert(MANIFEST.options.some(o => o.name === 'requires_prompt_override'), 'requires_prompt_override option present');
assert(MANIFEST.options_defaults.requires_prompt_override === false, 'requires_prompt_override default is false');

// Verify the manifest default contains NO company-profile vocabulary
const FORBIDDEN = ['OnlyiGaming', 'iGaming', 'B2B', 'casino-platforms', 'sportsbook-platform', 'company profile', 'Primary Category:', 'casino', 'sportsbook'];
for (const word of FORBIDDEN) {
  assert(!MANIFEST_DEFAULT_PROMPT.includes(word), `manifest default does NOT contain "${word}" (agnosticism check)`);
}

// -------------------------------------------------------------------------
// Refusal matrix (v1.6.0) — 4 scenarios mirroring seo-planner v2.2.0
// -------------------------------------------------------------------------
console.log('\n=== Refusal matrix (4 scenarios) ===');

function makeTools(aiResponseText = '# [Overview] Title\n\nContent here.') {
  const logs = [];
  return {
    logs,
    logger: {
      info: (m) => logs.push({ level: 'info', message: m }),
      warn: (m) => logs.push({ level: 'warn', message: m }),
      error: (m) => logs.push({ level: 'error', message: m }),
    },
    progress: { update: () => {} },
    ai: { complete: async () => ({ text: aiResponseText, tokens_in: 100, tokens_out: 50, model: 'haiku', provider: 'anthropic' }) },
    _partialItems: [],
  };
}

const mockEntity = {
  name: 'TestEntity',
  items: [
    { source_submodule: 'content-analyzer', analysis_json: { categories: { primary: [] } } },
    { source_submodule: 'page-scraper', text_content: 'page content', url: 'https://test.example/page' },
  ],
};

const baseOptions = {
  ...MANIFEST.options_defaults,
};

(async () => {
  // Scenario A: flag=true + default prompt → MUST REFUSE
  {
    const tools = makeTools();
    const opts = { ...baseOptions, requires_prompt_override: true, prompt: MANIFEST_DEFAULT_PROMPT };
    const result = await execute({ entities: [mockEntity] }, opts, tools);
    assert(result.summary.total_items === 0, 'A: refused — 0 items');
    assert(result.summary.errors.length === 1, 'A: refused — 1 error per entity');
    assert(result.results[0].items[0].error.includes('requires a content-writer prompt override'), 'A: error message names the actual cause');
    assert(tools.logs.some(l => l.level === 'error' && l.message.includes('refused run')), 'A: refusal logged as error');
    assert(!tools.logs.some(l => l.message.includes('writing content')), 'A: refusal fires BEFORE any LLM call');
  }

  // Scenario B: flag=true + custom override → PROCEED
  {
    const tools = makeTools();
    const opts = { ...baseOptions, requires_prompt_override: true, prompt: 'Custom override prompt: {entity_content}' };
    const result = await execute({ entities: [mockEntity] }, opts, tools);
    assert(result.summary.errors.length === 0, 'B: no refusal — override present');
  }

  // Scenario C: flag=false + manifest default → PROCEED (agnostic default is legitimate)
  {
    const tools = makeTools();
    const opts = { ...baseOptions, requires_prompt_override: false, prompt: MANIFEST_DEFAULT_PROMPT };
    const result = await execute({ entities: [mockEntity] }, opts, tools);
    assert(result.summary.errors.length === 0, 'C: no refusal — flag false, agnostic default is legitimate run path');
  }

  // Scenario D: flag missing (undefined) + manifest default → PROCEED
  {
    const tools = makeTools();
    const opts = { ...baseOptions, prompt: MANIFEST_DEFAULT_PROMPT };
    delete opts.requires_prompt_override;
    const result = await execute({ entities: [mockEntity] }, opts, tools);
    assert(result.summary.errors.length === 0, 'D: no refusal — flag missing treated as false');
  }

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log(`\n=== Result: ${pass} pass, ${fail} fail ===`);
  process.exit(fail === 0 ? 0 : 1);
})();
