/**
 * Integration drive — content-writer prompt-input guard (BACKLOG #63) through
 * the real execute() assembly path. No network (ai.complete mocked).
 * Run: node modules/step-5-generation/content-writer/test-prompt-input-guard.js
 *
 * Proves:
 *   A. The retained df68a5f0 variant (names format_spec.md + tone_guide.md in
 *      prose, no {doc:} placeholder) WRITES but WARNS naming BOTH docs.
 *   B. A prompt with no {entity_content} FAILS CLOSED before the LLM call.
 *   C. allow_missing_entity_content=true converts B into a warn-and-proceed.
 *   D. The all-present manifest default (both docs injected) logs NOTHING new.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const execute = require('./execute.js');
const MANIFEST = require('./manifest.json');

const DF68A5F0 = fs.readFileSync(
  path.join(__dirname, '..', '..', '_shared', 'fixtures', 'variant-df68a5f0-prompt.txt'), 'utf8');

function makeTools() {
  const logs = [];
  let aiCalls = 0;
  return {
    logs,
    get aiCalls() { return aiCalls; },
    guardLines() { return logs.filter(l => l.message.includes('[prompt-input-guard]')); },
    logger: {
      info: m => logs.push({ level: 'info', message: m }),
      warn: m => logs.push({ level: 'warn', message: m }),
      error: m => logs.push({ level: 'error', message: m }),
    },
    progress: { update: () => {} },
    ai: { complete: async () => { aiCalls++; return { text: '# T\n\n## [Overview] X\n\nProse [#1].', tokens_in: 10, tokens_out: 10, model: 'sonnet', provider: 'anthropic' }; } },
    _partialItems: [],
  };
}

const entity = {
  name: 'Hacksawgaming',
  items: [
    { source_submodule: 'content-analyzer', analysis_json: { summary: 'Slots supplier.', source_citations: [{ index: 1, url: 'https://x/y' }] } },
    { source_submodule: 'page-scraper', text_content: 'Hacksaw makes slots. Prize up to $$25M.', url: 'https://hacksawgaming.com' },
  ],
};
const DOCS = { 'format_spec.md': '# FORMAT\nH2 per section.', 'tone_guide.md': '# TONE\nDirect.' };
const base = { ...MANIFEST.options_defaults, ai_provider: 'anthropic', ai_model: 'sonnet' };

(async () => {
  // A — df68a5f0 through the assembly path: writes, warns on BOTH docs by name.
  {
    const tools = makeTools();
    const r = await execute({ entities: [entity] }, { ...base, prompt: DF68A5F0, reference_docs: DOCS }, tools);
    assert.strictEqual(r.results[0].items[0].status, 'written', 'A: df68a5f0 still writes (has {entity_content})');
    assert.strictEqual(tools.aiCalls, 1, 'A: LLM was called');
    const g = tools.guardLines();
    assert(g.some(l => l.message.includes('format_spec.md') && l.message.includes('Hacksawgaming')), 'A: guard warns naming format_spec.md + entity');
    assert(g.some(l => l.message.includes('tone_guide.md')), 'A: guard warns naming tone_guide.md');
    assert(g.every(l => l.level === 'warn'), 'A: doc conditions are warn-level (non-blocking)');
    console.log(`  PASS: A — df68a5f0 writes + guard fired on both docs (${g.length} guard lines)`);
  }

  // B — no {entity_content} → FAIL CLOSED before the LLM call.
  {
    const tools = makeTools();
    const r = await execute({ entities: [entity] }, { ...base, prompt: 'Write a profile. Follow format_spec.md.', reference_docs: DOCS }, tools);
    assert.strictEqual(r.results[0].items[0].status, 'error', 'B: missing {entity_content} hard-fails');
    assert(/entity_content/.test(r.results[0].items[0].error), 'B: error names {entity_content}');
    assert.strictEqual(tools.aiCalls, 0, 'B: fails BEFORE the LLM call (no tokens spent)');
    assert(tools.logs.some(l => l.level === 'error' && l.message.includes('[prompt-input-guard]')), 'B: refusal logged at error with greppable tag');
    assert.strictEqual(r.summary.total_items, 0, 'B: 0 items written');
    console.log('  PASS: B — missing {entity_content} fails closed, no LLM call');
  }

  // C — opt-out converts B into warn-and-proceed.
  {
    const tools = makeTools();
    const r = await execute({ entities: [entity] }, { ...base, prompt: 'Write a profile from nothing.', allow_missing_entity_content: true, reference_docs: {} }, tools);
    assert.strictEqual(r.results[0].items[0].status, 'written', 'C: opt-out proceeds');
    assert.strictEqual(tools.aiCalls, 1, 'C: LLM called under opt-out');
    assert(tools.logs.some(l => l.level === 'warn' && l.message.includes('allow_missing_entity_content')), 'C: proceeding-anyway warn emitted');
    console.log('  PASS: C — allow_missing_entity_content opts out (warn + proceed)');
  }

  // D — all-present manifest default: writes and logs NOTHING new from the guard.
  {
    const tools = makeTools();
    const r = await execute({ entities: [entity] }, { ...base, prompt: MANIFEST.options_defaults.prompt, reference_docs: DOCS }, tools);
    assert.strictEqual(r.results[0].items[0].status, 'written', 'D: all-present writes');
    assert.strictEqual(tools.guardLines().length, 0, 'D: all-present emits ZERO guard lines (nothing new)');
    console.log('  PASS: D — all-present logs nothing new');
  }

  console.log('\ncontent-writer/test-prompt-input-guard: PASS');
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
