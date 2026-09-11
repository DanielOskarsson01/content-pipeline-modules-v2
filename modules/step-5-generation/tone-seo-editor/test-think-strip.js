/**
 * Standalone test harness for tone-seo-editor's deterministic <think>-block strip
 * (option `strip_think_blocks`, default ON, no-op byte-identical on clean drafts).
 *
 * Run:  node modules/step-5-generation/tone-seo-editor/test-think-strip.js
 * From repo root. No network — ai.complete is mocked to return a fixed draft.
 *
 * Context (content-pipeline-specs Unit 4c §3b, STEP5_ANALYZER_BAR.md):
 * a reasoning model runs here with thinking API-DISABLED (execute.js
 * thinking:{type:'disabled'}), so it writes its chain-of-thought as ordinary
 * completion text. response.text flows straight to published content_markdown
 * with no strip. Both observed 4b leaks were ONE closed <think>...</think> block
 * at position 0 (9,038 and 994 words). Exposure is real but not yet realised —
 * seal it before any batch.
 *
 * The two real leaks were never captured to disk, so the position-0 shapes are
 * RECONSTRUCTED to their recorded word counts (makeThink) and prepended to a
 * BYTE-EXACT production clean draft (prg-c4012f01-clean.md). Stripping must
 * return that clean draft verbatim.
 */

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const DIR = __dirname;
const REPO = path.resolve(DIR, '../../..');
const FX = path.join(DIR, 'test-fixtures');
const BASELINE_SHA = '046ae7c'; // prod HEAD the byte-identity claim is anchored to (pre-<think>-strip)

const execute = require('./execute.js');
const { stripThinkBlocks } = execute.__testing;

const PRG_CLEAN = fs.readFileSync(path.join(FX, 'prg-c4012f01-clean.md'), 'utf8');
const ELK_LEAK = fs.readFileSync(path.join(FX, 'elk-c4012f01-bracket-leak.md'), 'utf8');

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { console.log(`  PASS: ${msg}`); pass++; } else { console.log(`  FAIL: ${msg}`); fail++; } }

// ---- harness: run tone-seo-editor execute() with a mocked LLM returning `draft` ----
let MOCK_DRAFT = '';
function makeTools() {
  const logs = [];
  return {
    logs,
    _partialItems: [],
    logger: { info: m => logs.push(m), warn: m => logs.push(m), error: m => logs.push(m) },
    progress: { update: () => {} },
    ai: { complete: async () => ({ text: MOCK_DRAFT }) },
  };
}
const BASE_OPTS = {
  ai_model: 'haiku', ai_provider: 'anthropic',
  prompt: 'Edit: {content_markdown}\n{keyword_targets}\n{tone_instructions}',
  temperature: 0.4, max_tokens: 32768, tone_style: 'b2b_authoritative',
  max_content_chars: 50000, reference_docs: [],
};
async function runEditor(execFn, draft, opts) {
  MOCK_DRAFT = draft;
  const input = { entities: [{ name: 'ELK Studios', items: [{ content_markdown: draft }] }] };
  const out = await execFn(input, { ...BASE_OPTS, ...opts }, makeTools());
  return out.results[0];
}

// Reconstruct a leaked reasoning dump of ~`words` words as one closed block at pos 0.
function makeThink(words) {
  const s = 'Let me weigh the tone and the keyword placement for this passage carefully. ';
  const per = s.trim().split(/\s+/).length;
  return '<think>\n' + s.repeat(Math.ceil(words / per)).trim() + '\n</think>';
}
const wc = t => t.split(/\s+/).filter(Boolean).length;

(async () => {
  // === T1: default-ON is byte-identical to the baseline on clean fixtures ===
  console.log(`\nT1 — default-ON byte-identity vs baseline ${BASELINE_SHA} (no <think> = no change)`);
  const headSrc = cp.execSync(
    `git show ${BASELINE_SHA}:modules/step-5-generation/tone-seo-editor/execute.js`, { cwd: REPO }).toString();
  const headPath = path.join(DIR, 'execute.__thinkbaseline__.js');
  fs.writeFileSync(headPath, headSrc);
  try {
    const executeHead = require(headPath);
    for (const [name, draft] of [['PRG-clean', PRG_CLEAN], ['ELK-leak', ELK_LEAK]]) {
      const cur = await runEditor(execute, draft, {});          // default ON
      const base = await runEditor(executeHead, draft, {});
      ok(cur.items[0].content_markdown === base.items[0].content_markdown,
         `content_markdown byte-identical to baseline (${name})`);
      ok(JSON.stringify(cur) === JSON.stringify(base),
         `FULL result byte-identical — no think meta added on a clean draft (${name})`);
    }
  } finally {
    fs.unlinkSync(headPath);
    delete require.cache[require.resolve(headPath)];
  }

  // === T2: strips the small real shape (~994 words) at position 0 ===
  console.log('\nT2 — strips the ~994-word position-0 closed block (observed shape A)');
  const think994 = makeThink(994);
  ok(Math.abs(wc(think994) - 994) < 15, `reconstructed block is ~994 words (${wc(think994)})`);
  const r994 = await runEditor(execute, think994 + '\n\n' + PRG_CLEAN, {});
  ok(r994.items[0].content_markdown === PRG_CLEAN, 'stripped → content === clean draft (verbatim)');
  ok(!r994.items[0].content_markdown.includes('<think>'), 'no <think> in published content');
  ok(r994.meta.think_blocks_stripped === 1, 'meta.think_blocks_stripped === 1');
  ok(r994.meta.think_chars_stripped === think994.length, 'meta.think_chars_stripped === block length');
  ok(r994.meta.status === 'success', 'still success (real content survives the strip)');

  // === T3: strips the large real shape (~9038 words) at position 0 ===
  console.log('\nT3 — strips the ~9038-word position-0 closed block (observed shape B)');
  const think9038 = makeThink(9038);
  ok(Math.abs(wc(think9038) - 9038) < 15, `reconstructed block is ~9038 words (${wc(think9038)})`);
  const r9038 = await runEditor(execute, think9038 + '\n\n' + PRG_CLEAN, {});
  ok(r9038.items[0].content_markdown === PRG_CLEAN, 'large block stripped → content === clean draft');
  ok(r9038.meta.think_blocks_stripped === 1, 'meta.think_blocks_stripped === 1');
  ok(r9038.meta.think_chars_stripped === think9038.length, 'meta.think_chars_stripped === block length');

  // === T4: leading whitespace before the block is handled ===
  console.log('\nT4 — block with leading whitespace still stripped, output starts clean');
  const r4 = await runEditor(execute, '\n\n  ' + makeThink(20) + '\n\n' + PRG_CLEAN, {});
  ok(r4.items[0].content_markdown === PRG_CLEAN, 'leading-whitespace block stripped → content === clean draft');
  ok(r4.meta.think_blocks_stripped === 1, 'meta present for leading-whitespace case');

  // === T5: LOUD-FAIL on an UNCLOSED <think> — never publish a half-strip ===
  console.log('\nT5 — loud-fail on unclosed <think> (truncated reasoning dump)');
  const rUnclosed = await runEditor(execute, '<think>\nreasoning that never closes and dumps forever', {});
  ok(rUnclosed.items[0].status === 'error', 'unclosed → status error (flagged, not emitted)');
  ok(rUnclosed.items[0].content_markdown === '', 'unclosed → nothing published (no half-stripped draft)');
  ok(/unclosed/i.test(rUnclosed.items[0].error), 'error names the unclosed cause');
  ok(rUnclosed.meta.status === 'error', 'meta.status === error');

  // === T6: LOUD-FAIL when the draft was ALL thinking (empty after strip) ===
  console.log('\nT6 — loud-fail on all-thinking (empty body after strip = generation failure)');
  const rAllThink = await runEditor(execute, '<think>\nthe whole draft is reasoning, no content\n</think>\n   \n', {});
  ok(rAllThink.items[0].status === 'error', 'all-thinking → status error');
  ok(rAllThink.items[0].content_markdown === '', 'all-thinking → nothing published');
  ok(/empty|thinking/i.test(rAllThink.items[0].error), 'error names the empty/all-thinking cause');

  // === T7: matching precision — inline mentions and near-miss tags are NOT stripped ===
  console.log('\nT7 — precision: no false-positive on inline mentions / near-miss tags');
  const midProse = 'ELK Studios ships games. Some tools emit <think>...</think> markers mid-stream. More prose.';
  const m = stripThinkBlocks(midProse);
  ok(m.blocks === 0 && m.text === midProse, 'mid-prose <think> mention untouched (anchored to position 0)');
  ok(stripThinkBlocks('<thinking>not the tag</thinking>\nbody').blocks === 0, '<thinking> not matched (exact tag only)');
  ok(stripThinkBlocks('<think id="x">attrs</think>\nbody').blocks === 0, '<think ...> with attributes not matched');
  ok(stripThinkBlocks(PRG_CLEAN).blocks === 0 && stripThinkBlocks(PRG_CLEAN).text === PRG_CLEAN,
     'a clean draft is returned verbatim, blocks=0');

  // === T8: downstream still works — bracket-repair, marker-gate, citations after the strip ===
  console.log('\nT8 — bracket-repair + marker-gate + citations survive after the think strip');
  const r8 = await runEditor(execute, makeThink(994) + '\n\n' + ELK_LEAK, { repair_bracket_leaks: true });
  ok(!r8.items[0].content_markdown.includes('<think>'), 'think block stripped');
  ok(!r8.items[0].content_markdown.includes('[#-]'), 'bracket leak still repaired after strip');
  ok(r8.items[0].content_markdown.includes('## [Overview] ELK Studios'), 'heading marker preserved through both passes');
  ok((r8.items[0].content_markdown.match(/\[#15\]/g) || []).length > 0, 'valid [#15] citations preserved');
  ok(r8.meta.think_blocks_stripped === 1, 'think meta present');
  ok(r8.meta.bracket_repairs === 1, 'bracket_repairs meta present (both passes ran)');
  ok(r8.meta.status === 'success', 'draft still succeeds through the full chain');

  // === T9: option coercion — string "true" enables; explicit false disables (leak stays) ===
  console.log('\nT9 — string-typed preset coercion');
  const rStrTrue = await runEditor(execute, makeThink(50) + '\n\n' + PRG_CLEAN, { strip_think_blocks: 'true' });
  ok(rStrTrue.items[0].content_markdown === PRG_CLEAN, 'string "true" enables the strip');
  ok(rStrTrue.meta.think_blocks_stripped === 1, 'string "true" → meta present');
  const rFalse = await runEditor(execute, makeThink(50) + '\n\n' + PRG_CLEAN, { strip_think_blocks: false });
  ok(rFalse.items[0].content_markdown.includes('<think>'), 'explicit false disables strip — block remains (pre-feature behavior)');
  ok(rFalse.meta.think_blocks_stripped === undefined, 'disabled → no think meta (byte-identical off path)');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
