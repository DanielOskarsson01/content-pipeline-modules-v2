/**
 * Standalone test harness for the B029 content-analyzer items (template-v3 unit).
 *
 * Run: node modules/step-5-generation/content-analyzer/test-b029.js
 * No network — ai.complete is mocked.
 *
 * Covers:
 *   B029-1 — include_page_intent framing option (default off = byte-identical
 *            legacy framing; on = numbered url/title/intent headers).
 *   B029-2 — input-truncation visibility (content_truncated / content_chars_total /
 *            content_chars_kept on item + meta when over cap; absent under cap;
 *            prompt bytes unchanged).
 *   B029-3 — corrective JSON retry + fail-loud (json_retry option, default off =
 *            legacy degraded-success raw-text path; on = one temperature-0
 *            corrective re-ask with cache_prefix stripped, second failure =
 *            loud error item).
 */

const execute = require('./execute.js');
const MANIFEST = require('./manifest.json');
const { buildPrompt } = execute;
const { assembleEntityContent } = execute.__testing;

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { console.log(`  PASS: ${msg}`); pass++; }
  else { console.log(`  FAIL: ${msg}`); fail++; }
}

// Mock tools. `responder(callIndex, opts)` returns the raw text for each ai call.
function makeTools(responder) {
  const logs = [];
  const aiCalls = [];
  return {
    logs,
    aiCalls,
    logger: {
      info: (m) => logs.push({ level: 'info', message: m }),
      warn: (m) => logs.push({ level: 'warn', message: m }),
      error: (m) => logs.push({ level: 'error', message: m }),
    },
    progress: { update: () => {} },
    ai: {
      complete: async (opts) => {
        aiCalls.push(opts);
        return { text: responder(aiCalls.length - 1, opts) };
      },
    },
    _partialItems: [],
  };
}

const GOOD_ANALYSIS = JSON.stringify({
  categories: { primary: [{ slug: 'example-category' }] },
  key_facts: { founded: '2005' },
});

const PAGES = [
  { url: 'https://a.example/one', title: 'Page One', text_content: 'Alpha content.', word_count: 2, page_intent: 'product', intent_confidence: 0.92 },
  { url: 'https://a.example/two', title: 'Page Two', text_content: 'Beta content.', word_count: 2 },
  { url: 'https://a.example/three', text_content: 'Gamma content.', word_count: 2, page_intent: 'about' },
];

const base = { ...MANIFEST.options_defaults };

(async () => {
  // -------------------------------------------------------------------------
  // Manifest sanity
  // -------------------------------------------------------------------------
  console.log('\n=== Manifest sanity (B029) ===');
  assert(MANIFEST.version.localeCompare('1.6.0', undefined, { numeric: true }) >= 0,
    'manifest version at least 1.6.0');
  const optIntent = MANIFEST.options.find(o => o.name === 'include_page_intent');
  const optRetry = MANIFEST.options.find(o => o.name === 'json_retry');
  assert(optIntent && optIntent.default === false, 'include_page_intent option present, default false');
  assert(optRetry && optRetry.default === false, 'json_retry option present, default false');
  assert(MANIFEST.options_defaults.include_page_intent === false, 'options_defaults.include_page_intent false');
  assert(MANIFEST.options_defaults.json_retry === false, 'options_defaults.json_retry false');
  assert(MANIFEST.requires_columns.includes('page_intent') && MANIFEST.requires_columns.includes('intent_confidence'),
    'requires_columns hydrate page_intent + intent_confidence');

  // -------------------------------------------------------------------------
  // B029-1 — framing
  // -------------------------------------------------------------------------
  console.log('\n=== B029-1: default-off framing is byte-identical to legacy ===');
  {
    const off = assembleEntityContent(PAGES, 200000, false);
    const legacy = PAGES
      .map(p => `--- Page: ${p.title || 'Untitled'} (${p.url}) ---\n${p.text_content}`)
      .join('\n\n');
    assert(off.text === legacy, 'default-off assembled text equals legacy framing bytes');
    assert(off.truncated === false && off.totalChars === legacy.length,
      'under-cap: truncated=false, totalChars = assembled length');
  }

  console.log('\n=== B029-1: on-state framing B snapshot ===');
  {
    const on = assembleEntityContent(PAGES, 200000, true);
    const expected =
      '--- PAGE 1 ---\nurl: https://a.example/one\ntitle: Page One\nintent: product (confidence 0.92)\nAlpha content.\n\n' +
      '--- PAGE 2 ---\nurl: https://a.example/two\ntitle: Page Two\nBeta content.\n\n' +
      '--- PAGE 3 ---\nurl: https://a.example/three\ntitle: Untitled\nintent: about\nGamma content.';
    assert(on.text === expected, 'on-state framing matches spec snapshot (numbered header, url/title/intent lines)');
    assert(!on.text.split('\n\n')[1].includes('intent:'), 'page without page_intent omits the intent line');
    assert(on.text.includes('intent: about\n') && !on.text.includes('about (confidence'),
      'intent without confidence omits the confidence parenthetical');
    const off = assembleEntityContent(PAGES, 200000, false);
    const overheadPerPage = (on.text.length - off.text.length) / PAGES.length;
    assert(overheadPerPage <= 120, `framing overhead ~${Math.round(overheadPerPage)} chars/page (≤120 ≈ ≤30 tokens)`);
  }

  console.log('\n=== B029-1: execute() default-off sends legacy prompt bytes ===');
  {
    const tools = makeTools(() => GOOD_ANALYSIS);
    await execute({ entities: [{ name: 'Acme', items: PAGES }] }, base, tools);
    const sent = (tools.aiCalls[0].cache_prefix || '') + tools.aiCalls[0].prompt;
    const legacyContent = PAGES
      .map(p => `--- Page: ${p.title || 'Untitled'} (${p.url}) ---\n${p.text_content}`)
      .join('\n\n');
    const expected = buildPrompt(base.prompt, legacyContent, base.reference_docs);
    assert(sent === expected, 'prompt sent with defaults is byte-identical to legacy assembly');
  }

  console.log('\n=== B029-1: execute() on-state sends framing-B headers ===');
  {
    const tools = makeTools(() => GOOD_ANALYSIS);
    await execute({ entities: [{ name: 'Acme', items: PAGES }] }, { ...base, include_page_intent: true }, tools);
    const sent = (tools.aiCalls[0].cache_prefix || '') + tools.aiCalls[0].prompt;
    assert(sent.includes('--- PAGE 1 ---\nurl: https://a.example/one\ntitle: Page One\nintent: product (confidence 0.92)'),
      'assembled prompt shows the intent header');
  }

  // -------------------------------------------------------------------------
  // B029-2 — truncation visibility
  // -------------------------------------------------------------------------
  console.log('\n=== B029-2: over-cap stamps fields; prompt bytes unchanged ===');
  {
    const cap = 60;
    const tools = makeTools(() => GOOD_ANALYSIS);
    const res = await execute(
      { entities: [{ name: 'Acme', items: PAGES }] },
      { ...base, max_content_chars: cap },
      tools
    );
    const item = res.results[0].items[0];
    const meta = res.results[0].meta;
    const legacyContent = PAGES
      .map(p => `--- Page: ${p.title || 'Untitled'} (${p.url}) ---\n${p.text_content}`)
      .join('\n\n');
    assert(item.content_truncated === true, 'item.content_truncated true when over cap');
    assert(item.content_chars_total === legacyContent.length, `item.content_chars_total = ${legacyContent.length} (pre-truncation length)`);
    assert(item.content_chars_kept === cap, 'item.content_chars_kept = max_content_chars');
    assert(meta.content_truncated === true && meta.content_chars_total === legacyContent.length && meta.content_chars_kept === cap,
      'meta carries the same three fields');
    assert(tools.logs.some(l => l.level === 'warn' && /truncated/.test(l.message)), 'truncation warning logged');
    const sent = (tools.aiCalls[0].cache_prefix || '') + tools.aiCalls[0].prompt;
    const expected = buildPrompt(
      base.prompt,
      legacyContent.substring(0, cap) + '\n\n[Content truncated at ' + cap + ' characters]',
      base.reference_docs
    );
    assert(sent === expected, 'over-cap prompt bytes identical to legacy truncation (marker unchanged)');
  }

  console.log('\n=== B029-2: under-cap leaves the fields absent ===');
  {
    const tools = makeTools(() => GOOD_ANALYSIS);
    const res = await execute({ entities: [{ name: 'Acme', items: PAGES }] }, base, tools);
    const item = res.results[0].items[0];
    const meta = res.results[0].meta;
    assert(!('content_truncated' in item) && !('content_chars_total' in item) && !('content_chars_kept' in item),
      'no truncation fields on the item under cap');
    assert(!('content_truncated' in meta), 'no truncation fields on meta under cap');
  }

  // -------------------------------------------------------------------------
  // B029-3 — corrective JSON retry
  // -------------------------------------------------------------------------
  console.log('\n=== B029-3: default-off keeps the degraded raw-text path ===');
  {
    const tools = makeTools(() => 'Here is my analysis in prose, not JSON.');
    const res = await execute({ entities: [{ name: 'Acme', items: PAGES }] }, base, tools);
    const ent = res.results[0];
    assert(tools.aiCalls.length === 1, 'no retry call when json_retry is off');
    assert(ent.meta.status === 'success', 'degraded success preserved (meta.status success)');
    assert(ent.items[0].analysis_json === null, 'analysis_json null');
    assert(ent.items[0].section_analysis === 'Here is my analysis in prose, not JSON.',
      'raw text carried on section_analysis');
  }

  console.log('\n=== B029-3: on, first response valid → single call, no behavior change ===');
  {
    const tools = makeTools(() => GOOD_ANALYSIS);
    const res = await execute({ entities: [{ name: 'Acme', items: PAGES }] }, { ...base, json_retry: true }, tools);
    assert(tools.aiCalls.length === 1, 'valid first response makes exactly one call');
    assert(res.results[0].meta.status === 'success', 'success path unchanged');
  }

  console.log('\n=== B029-3: on, retry succeeds ===');
  {
    const prose = 'Sorry, here is the analysis as markdown:\n# Acme\nFounded 2005.';
    const tools = makeTools(i => (i === 0 ? prose : GOOD_ANALYSIS));
    const res = await execute({ entities: [{ name: 'Acme', items: PAGES }] }, { ...base, json_retry: true }, tools);
    const ent = res.results[0];
    assert(tools.aiCalls.length === 2, 'exactly one corrective retry call');
    const retry = tools.aiCalls[1];
    assert(retry.temperature === 0, 'retry call is temperature 0');
    assert(retry.cache_prefix === undefined, 'cache_prefix absent on retry call');
    assert(retry.prompt.includes('NOT valid JSON') && retry.prompt.includes(prose),
      'correction embeds the invalid response');
    assert(ent.meta.status === 'success' && ent.items[0].status === 'analyzed',
      'retry success → normal analyzed item');
    assert(ent.items[0].analysis_json && ent.items[0].analysis_json.key_facts.founded === '2005',
      'analysis_json parsed from the retry response');
  }

  console.log('\n=== B029-3: on, double failure → LOUD error item ===');
  {
    const tools = makeTools(() => 'still prose, not JSON');
    const res = await execute({ entities: [{ name: 'Acme', items: PAGES }] }, { ...base, json_retry: true }, tools);
    const ent = res.results[0];
    assert(tools.aiCalls.length === 2, 'stopped after one retry');
    assert(ent.meta.status === 'error', 'meta.status error (fail-loud, not degraded success)');
    assert(ent.items[0].status === 'error', 'item status error');
    assert(ent.items[0].analysis_json === null, 'analysis_json null on the error item');
    assert(/non-JSON after corrective retry/.test(ent.items[0].error || ''), 'error names the retry failure');
  }

  console.log(`\n=== Result: ${pass} pass, ${fail} fail ===`);
  process.exit(fail === 0 ? 0 : 1);
})();
