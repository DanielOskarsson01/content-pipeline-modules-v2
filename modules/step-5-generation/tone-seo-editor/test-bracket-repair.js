/**
 * Standalone test harness for tone-seo-editor's deterministic bracket-leak
 * repair (option `repair_bracket_leaks`, default OFF).
 *
 * Run:  node modules/step-5-generation/tone-seo-editor/test-bracket-repair.js
 * From repo root. No network — ai.complete is mocked to return a fixed draft.
 *
 * Context (content-pipeline-specs @94eb952 template-v3/gate1/run2/CALIBRATION_3):
 * qa-structural Check 8 force-fails a draft when a residual bracket survives the
 * publish strip (e.g. ELK's `[#-]` in run c4012f01, ELK's `[game pages]` in
 * e2aecd11). These are MECHANICAL leaks — citation-shaped source-pointers the
 * reader should never see. Rejecting an otherwise-true draft over a stray
 * bracket is the wrong trade at 1,700 entities, so we REPAIR them deterministically
 * before Step 6 grades the draft (tone-seo-editor is the graded-draft producer:
 * its content_markdown is the .at(-1) qa-structural grades — qa-structural:219-224).
 *
 * Fixtures are BYTE-EXACT production drafts (md5-verified on fetch):
 *   elk-c4012f01-bracket-leak.md  md5 e9235b44… — real graded leak `[#-]` (×1)
 *   elk-e2aecd11-game-pages.md    md5 8bb99661… — body-prose leak `[game pages]` (×2)
 *   prg-c4012f01-clean.md         md5 e872ff7a… — clean draft (residual_leaks=0)
 *
 * Loop-closure is proven against the DEPLOYED checker: we run the actual
 * qa-structural/execute.js (taxonomy_leak_check:true) on the raw draft (expect
 * residual_bracket_leaks=1) and on the repaired draft (expect 0).
 */

const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const assert = require('assert');

const DIR = __dirname;
const REPO = path.resolve(DIR, '../../..');
const FX = path.join(DIR, 'test-fixtures');
const BASELINE_SHA = '08df8b5'; // pre-change baseline the byte-identity claim is anchored to

const execute = require('./execute.js');
const { repairResidualBrackets } = execute.__testing;
const qaStructural = require('../../step-6-qa/qa-structural/execute.js');

const ELK_LEAK = fs.readFileSync(path.join(FX, 'elk-c4012f01-bracket-leak.md'), 'utf8');
const ELK_GAMEPAGES = fs.readFileSync(path.join(FX, 'elk-e2aecd11-game-pages.md'), 'utf8');
const PRG_CLEAN = fs.readFileSync(path.join(FX, 'prg-c4012f01-clean.md'), 'utf8');

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { console.log(`  PASS: ${msg}`); pass++; } else { console.log(`  FAIL: ${msg}`); fail++; } }

// ---- harness: run tone-seo-editor execute() with a mocked LLM returning `draft` ----
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
let MOCK_DRAFT = '';

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

// ---- harness: grade a draft with the DEPLOYED qa-structural Check 8 ----
async function residualLeaks(draft) {
  const input = { entities: [{ name: 'X', items: [{ content_markdown: draft }] }] };
  const tools = { logger: { info: () => {}, warn: () => {} }, progress: { update: () => {} } };
  const out = await qaStructural(input, { taxonomy_leak_check: true }, tools);
  return out.results[0].meta.residual_bracket_leaks;
}

(async () => {
  // === T1: default OFF is byte-identical to the 08df8b5 baseline on real drafts ===
  console.log('\nT1 — default OFF byte-identity vs baseline 08df8b5');
  const headSrc = cp.execSync(
    `git show ${BASELINE_SHA}:modules/step-5-generation/tone-seo-editor/execute.js`, { cwd: REPO }).toString();
  const headPath = path.join(DIR, 'execute.__baseline__.js');
  fs.writeFileSync(headPath, headSrc);
  try {
    const executeHead = require(headPath);
    for (const [name, draft] of [['ELK-leak', ELK_LEAK], ['PRG-clean', PRG_CLEAN], ['ELK-gamepages', ELK_GAMEPAGES]]) {
      const cur = await runEditor(execute, draft, { repair_bracket_leaks: false });
      const base = await runEditor(executeHead, draft, {});
      ok(JSON.stringify(cur) === JSON.stringify(base), `off-mode result === baseline result (${name})`);
    }
  } finally {
    fs.unlinkSync(headPath);
    delete require.cache[require.resolve(headPath)];
  }

  // === T2: ON-mode repairs the real ELK `[#-]` leak; leaves everything else intact ===
  console.log('\nT2 — repairs the real ELK [#-] leak (run c4012f01)');
  const elk = await runEditor(execute, ELK_LEAK, { repair_bracket_leaks: true });
  ok(!elk.items[0].content_markdown.includes('[#-]'), '[#-] removed from body');
  ok(elk.items[0].content_markdown.includes('multiple sequels — evidenced directly'),
     'prose reads clean after deletion (leading space collapsed)');
  ok(elk.meta.bracket_repairs === 1, 'meta.bracket_repairs === 1');
  ok(elk.meta.bracket_repairs_detail[0].bracket === '[#-]', 'meta logs the repaired bracket');
  ok(typeof elk.meta.bracket_repairs_detail[0].line === 'number', 'meta logs the line (where)');
  // valid citations + heading markers must survive
  const cite15 = (elk.items[0].content_markdown.match(/\[#15\]/g) || []).length;
  ok(cite15 === (ELK_LEAK.match(/\[#15\]/g) || []).length && cite15 > 0, 'valid [#15] citations preserved');
  ok(elk.items[0].content_markdown.includes('## [Overview] ELK Studios'), 'first heading marker [Overview] preserved');
  ok(elk.items[0].content_markdown.includes('## [Primary Category: game-providers]'), 'taxonomy heading marker preserved');

  // === T3: ON-mode repairs the body-prose `[game pages]` pseudo-citation (×2) ===
  console.log('\nT3 — repairs the real ELK [game pages] leak (run e2aecd11)');
  const gp = await runEditor(execute, ELK_GAMEPAGES, { repair_bracket_leaks: true });
  ok(!gp.items[0].content_markdown.includes('[game pages]'), '[game pages] removed');
  ok(gp.items[0].content_markdown.includes('celestial theme.'), 'clause reads clean: "celestial theme."');
  ok(gp.items[0].content_markdown.includes('25,000x bet.'), 'clause reads clean: "25,000x bet."');
  ok(gp.meta.bracket_repairs === 2, 'meta.bracket_repairs === 2 (both occurrences)');

  // === T4: ON-mode leaves a clean draft byte-identical ===
  console.log('\nT4 — clean draft untouched (PRG run c4012f01)');
  const prg = await runEditor(execute, PRG_CLEAN, { repair_bracket_leaks: true });
  ok(prg.items[0].content_markdown === PRG_CLEAN, 'clean draft content_markdown byte-identical');
  ok(prg.meta.bracket_repairs === 0, 'meta.bracket_repairs === 0 on clean draft');

  // === T5: exclusions survive — footnote refs, links, code fences, inline code, valid [#n] ===
  console.log('\nT5 — exclusions survive; only the genuine leak is removed');
  const synthetic = [
    '## [Overview] Title',                               // first heading marker → preserved
    'A footnote ref [^1] and a citation [#3] and [12] stay.',
    'A link [ELK site](https://elk-studios.com) stays.',
    'But a [stray marker] in prose goes.',
    '```',
    'code block with [not a leak] survives',
    '```',
    'Inline `[x]` code survives, but this [leak2] does not.',
    '[^1]: footnote definition',
  ].join('\n');
  const r = repairResidualBrackets(synthetic);
  ok(r.text.includes('[^1]'), 'footnote ref [^1] survives');
  ok(r.text.includes('[#3]') && r.text.includes('[12]'), 'valid citations [#3]/[12] survive');
  ok(r.text.includes('[ELK site](https://elk-studios.com)'), 'markdown link survives');
  ok(r.text.includes('[not a leak]'), 'bracket inside fenced code survives');
  ok(r.text.includes('`[x]`'), 'bracket inside inline code survives');
  ok(!r.text.includes('[stray marker]') && !r.text.includes('[leak2]'), 'body-prose leaks removed');
  ok(r.text.includes('## [Overview] Title'), 'first heading marker preserved');
  ok(r.repairs.length === 2, 'exactly 2 repairs logged (the two prose leaks)');

  // === T6: the loop closes — deployed qa-structural Check 8 goes FAIL → PASS ===
  console.log('\nT6 — loop closes through the DEPLOYED qa-structural Check 8');
  const before = await residualLeaks(ELK_LEAK);
  ok(before === 1, `raw ELK draft: qa-structural residual_bracket_leaks === 1 (was ${before})`);
  const repaired = repairResidualBrackets(ELK_LEAK).text;
  const after = await residualLeaks(repaired);
  ok(after === 0, `repaired ELK draft: qa-structural residual_bracket_leaks === 0 (was ${after})`);

  // === T7: documented safe divergence — the repair scans the ## [Meta] section
  //          that Check 8 skips (removeMetaSection). This is a one-directional
  //          SUPERSET: it over-cleans there but can never leave a Check-8 leak. ===
  console.log('\nT7 — Meta-section over-clean is a SAFE superset (never misses a Check-8 leak)');
  const metaCase = [
    '## [Overview] Co',
    'Body [#1] clean.',
    '',
    '## [Meta] SEO Metadata',
    '**Meta Title:** [Top] Co Review',
  ].join('\n');
  ok(await residualLeaks(metaCase) === 0, 'Check 8 ignores the Meta-section bracket (0 leaks raw)');
  const rm = repairResidualBrackets(metaCase);
  ok(rm.repairs.length === 1 && rm.repairs[0].bracket === '[Top]', 'repair over-cleans the Meta-section bracket (logged, intentional)');
  ok(await residualLeaks(rm.text) === 0, 'still 0 Check-8 leaks after over-clean — divergence is one-directional/safe');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
