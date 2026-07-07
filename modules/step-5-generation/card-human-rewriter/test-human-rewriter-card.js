/**
 * Standalone test harness for the human-rewriter CARD (config-only card on
 * tone-seo-editor). Brief: docs/submodule-briefs-rev-2026-07-03/step5-human-rewriter.md
 *
 * Run: node modules/step-5-generation/card-human-rewriter/test-human-rewriter-card.js
 * From repo root.
 *
 * The human-rewriter is NOT a module — it is a set of tone-seo-editor preset
 * configs (prompt + temperature + model). These tests prove:
 *   - the card is CONFIG-ONLY: every preset key is an existing tone-seo-editor
 *     option; the card needs zero new module code (no new manifest option).
 *   - each preset's values are valid for tone-seo-editor (temperature in range,
 *     model in the allowed set, prompt carries {content_markdown} + the PRESERVE
 *     contract for [Type] markers / [#n] citations / section count / keywords).
 *   - run END-TO-END THROUGH the real tone-seo-editor execute (ai mocked): the
 *     card's prompt drives the pass, a compliant rewrite is accepted with markers
 *     preserved, a rewrite that drops a [Type] marker is caught by the gate, and
 *     marker-free content (cover-letter voice) passes the gate trivially.
 *
 * No network — tone-seo-editor's ai.complete is mocked.
 */

const PRESET = require('./preset.json');
const tse = require('../tone-seo-editor/execute.js');
const TSE_MANIFEST = require('../tone-seo-editor/manifest.json');

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { console.log(`  PASS: ${msg}`); pass++; }
  else { console.log(`  FAIL: ${msg}`); fail++; }
}

const TSE_OPTION_NAMES = new Set(TSE_MANIFEST.options.map((o) => o.name));
const TEMP_MIN = TSE_MANIFEST.options.find((o) => o.name === 'temperature').min;
const TEMP_MAX = TSE_MANIFEST.options.find((o) => o.name === 'temperature').max;
const MODEL_VALUES = new Set(TSE_MANIFEST.options.find((o) => o.name === 'ai_model').values);
const ARTICLE_PRESETS = ['light', 'moderate', 'aggressive'];

// Mocked tools for driving the REAL tone-seo-editor execute; captures the prompt.
function makeTools(revisedText) {
  const captured = {};
  const logs = [];
  return {
    captured,
    logs,
    logger: {
      info: (m) => logs.push({ level: 'info', message: m }),
      warn: (m) => logs.push({ level: 'warn', message: m }),
      error: (m) => logs.push({ level: 'error', message: m }),
    },
    progress: { update: () => {} },
    ai: { complete: async (opts) => { captured.prompt = opts.prompt; captured.model = opts.model; captured.temperature = opts.temperature; return { text: revisedText }; } },
    _partialItems: [],
  };
}

function entityWith(markdown, withSeo = true) {
  const items = [{ source_submodule: 'content-writer', content_markdown: markdown }];
  if (withSeo) items.push({ source_submodule: 'seo-planner', seo_plan_json: { target_keywords: { primary: ['casino platform'], secondary: ['api'] } } });
  return { name: 'Acme', items };
}

// Marked + cited article (company-profile shape).
const ORIGINAL = [
  '# Acme Casino Platform',
  '',
  '## [Primary Category: casino-platforms]',
  '',
  'Acme offers a comprehensive suite of casino solutions [#1]. Furthermore, it provides wide-ranging support.',
  '',
  '## [Tag: api]',
  '',
  'Additionally, Acme has an API [#2].',
].join('\n');

const REVISED_PRESERVED = [
  '# Acme Casino Platform',
  '',
  '## [Primary Category: casino-platforms]',
  '',
  'Acme runs a casino platform used by 40 operators [#1]. Its support team answers in minutes.',
  '',
  '## [Tag: api]',
  '',
  'Acme ships a REST API [#2].',
].join('\n');

const REVISED_DROPPED_MARKER = [
  '# Acme Casino Platform',
  '',
  '## Casino Platforms',              // [Primary Category: …] marker stripped
  '',
  'Acme runs a casino platform [#1].',
  '',
  '## [Tag: api]',
  '',
  'Acme ships a REST API [#2].',
].join('\n');

const COVER_LETTER = [
  '# Cover Letter',
  '',
  'I led product at MrGreen as part of the founding team.',
  '',
  'I want to bring that to your team.',
].join('\n');

const COVER_LETTER_REVISED = [
  '# Cover Letter',
  '',
  'At MrGreen I helped build the product from the founding team onward.',
  '',
  'I would bring the same to your team.',
].join('\n');

function optionsFor(presetKey) {
  return { ...TSE_MANIFEST.options_defaults, ...PRESET.presets[presetKey], reference_docs: {} };
}

async function main() {
  // ── 1. Card shape ──
  console.log('\n[1] card shape');
  assert(PRESET.configures === 'tone-seo-editor', 'card declares it configures tone-seo-editor');
  assert(PRESET.presets && typeof PRESET.presets === 'object', 'presets object present');
  for (const k of [...ARTICLE_PRESETS, 'cover_letter_voice']) {
    assert(PRESET.presets[k] && typeof PRESET.presets[k].prompt === 'string' && PRESET.presets[k].prompt.length > 0, `preset "${k}" has a non-empty prompt`);
  }

  // ── 2. CONFIG-ONLY: every preset key is an existing tone-seo-editor option ──
  console.log('\n[2] config-only (no new module code needed)');
  for (const [k, preset] of Object.entries(PRESET.presets)) {
    const unknown = Object.keys(preset).filter((key) => !TSE_OPTION_NAMES.has(key));
    assert(unknown.length === 0, `preset "${k}" uses only existing tone-seo-editor options (unknown: ${JSON.stringify(unknown)})`);
    assert(typeof preset.temperature === 'number' && preset.temperature >= TEMP_MIN && preset.temperature <= TEMP_MAX, `preset "${k}" temperature ${preset.temperature} within tone-seo-editor range [${TEMP_MIN}, ${TEMP_MAX}]`);
    assert(!preset.ai_model || MODEL_VALUES.has(preset.ai_model), `preset "${k}" ai_model "${preset.ai_model}" is an allowed tone-seo-editor value`);
  }

  // ── 3. Prompt contract (article presets) ──
  console.log('\n[3] article-preset prompt contract');
  for (const k of ARTICLE_PRESETS) {
    const p = PRESET.presets[k].prompt;
    assert(/\{content_markdown\}/.test(p), `preset "${k}" prompt injects {content_markdown}`);
    assert(/\[#n\]|citation/i.test(p), `preset "${k}" prompt instructs preserving [#n] citations`);
    assert(/\[type\]|marker|heading/i.test(p), `preset "${k}" prompt instructs preserving heading/[Type] markers`);
    assert(/keyword/i.test(p), `preset "${k}" prompt instructs preserving placed keywords`);
    assert(/section count|section/i.test(p), `preset "${k}" prompt references section preservation`);
  }
  assert(/light|10.?20/i.test(PRESET.presets.light.prompt), 'light preset states light intensity');
  assert(/moderate|40.?60/i.test(PRESET.presets.moderate.prompt), 'moderate preset states moderate intensity');
  assert(/aggressive|deep rewrite/i.test(PRESET.presets.aggressive.prompt), 'aggressive preset states aggressive intensity');
  assert(PRESET.presets.light.prompt !== PRESET.presets.aggressive.prompt, 'intensity presets are not identical');

  // ── 4. End-to-end through the REAL tone-seo-editor: compliant rewrite accepted ──
  console.log('\n[4] runs through tone-seo-editor — markers preserved → edited');
  {
    const tools = makeTools(REVISED_PRESERVED);
    const res = await tse({ entities: [entityWith(ORIGINAL)] }, optionsFor('moderate'), tools);
    const item = res.results[0].items[0];
    assert(item.status === 'edited', 'compliant rewrite accepted (status edited)');
    assert(!item.error, 'no error');
    assert(item.content_markdown.includes('[Primary Category: casino-platforms]') && item.content_markdown.includes('[Tag: api]'), 'markers carried through to output');
    // The card's prompt actually drove the pass:
    assert(/rhythm|human|natural|line editor/i.test(tools.captured.prompt), 'the humanization prompt was sent to the model');
    assert(tools.captured.prompt.includes('comprehensive suite of casino solutions'), '{content_markdown} interpolated with the real article');
    assert(tools.captured.temperature === PRESET.presets.moderate.temperature, 'preset temperature passed through to the model call');
  }

  // ── 5. Dropped [Type] marker → gate catches it ──
  console.log('\n[5] dropped [Type] marker → gate error');
  {
    const tools = makeTools(REVISED_DROPPED_MARKER);
    const res = await tse({ entities: [entityWith(ORIGINAL)] }, optionsFor('aggressive'), tools);
    const item = res.results[0].items[0];
    assert(item.status === 'error', 'marker-dropping rewrite rejected (status error)');
    assert(/Primary Category: casino-platforms/.test(item.error || ''), 'error names the dropped marker');
    assert(res.summary.total_items === 0, 'not counted as a successful edit');
  }

  // ── 6. Marker-free content (cover-letter voice) → gate passes trivially ──
  console.log('\n[6] marker-free content → gate inert (cover-letter voice)');
  {
    const tools = makeTools(COVER_LETTER_REVISED);
    const res = await tse({ entities: [entityWith(COVER_LETTER, false)] }, optionsFor('cover_letter_voice'), tools);
    const item = res.results[0].items[0];
    assert(item.status === 'edited', 'marker-free rewrite accepted (gate trivially passes)');
    assert(/first person|voice|cliché|cliche|passionate|excited/i.test(tools.captured.prompt), 'cover-letter voice prompt sent (banned-cliché framing)');
  }

  // ── 7. Cover-letter voice is a distinct, marker-free preset ──
  console.log('\n[7] cover-letter voice preset');
  {
    const p = PRESET.presets.cover_letter_voice.prompt;
    assert(/\{content_markdown\}/.test(p), 'cover-letter prompt injects {content_markdown}');
    assert(!/\[Type\]/.test(p) || /no .*marker|marker-free|if present/i.test(p), 'cover-letter prompt does not hard-require [Type] markers');
  }

  console.log(`\n${'='.repeat(50)}\nTOTAL: ${pass} passed, ${fail} failed\n`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error('HARNESS ERROR:', e); process.exit(1); });
