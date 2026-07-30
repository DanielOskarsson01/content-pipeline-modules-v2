/**
 * BACKLOG #21 — seo-planner prompt-cache split byte-identity proof.
 * Run: node modules/step-5-generation/seo-planner/test-cache-split.js
 *
 * seo-planner has THREE per-entity placeholders ({entity_content},
 * {keyword_research}, {keyword_metrics}); the split cuts before the FIRST one
 * present, and the head may resolve stable placeholders ({faq_count}, {doc:}).
 * cachePrefix + prompt must be byte-identical to the plain buildPrompt() output.
 */
const { __testing } = require('./execute.js');
const { buildPrompt, buildCachedPrompt } = __testing;

let pass = 0, fail = 0;
function eq(a, b, msg) {
  if (a === b) { console.log(`  PASS: ${msg}`); pass++; }
  else { console.log(`  FAIL: ${msg}\n    a=${JSON.stringify(a).slice(0, 120)}\n    b=${JSON.stringify(b).slice(0, 120)}`); fail++; }
}

const DOCS = { 'format_spec.md': '# SPEC\nMeta ≤ 60 chars. Price like $$99.' };
const ENTITY = '{"name":"Acme","facts":["price $$50","url?a=$&b"]}';
const RESEARCH = 'kw research with $-noise: $` and $1';
const METRICS = 'kw | vol\nacme | 100';

console.log('\n=== docs-in-head template: split engages, byte-identical ===');
{
  const t = 'Rules first.\n{doc:format_spec.md}\nFAQs: {faq_count}\n\nANALYSIS:\n{entity_content}\nRESEARCH:\n{keyword_research}';
  const baseline = buildPrompt(t, ENTITY, DOCS, RESEARCH, 5, METRICS);
  const { prompt, cachePrefix } = buildCachedPrompt(t, ENTITY, DOCS, RESEARCH, 5, METRICS);
  eq(cachePrefix + prompt, baseline, 'split reassembles to the exact single-prompt bytes');
  eq(cachePrefix.includes('SPEC'), true, 'prefix carries the stable doc');
  eq(cachePrefix.includes('FAQs: 5'), true, 'stable {faq_count} resolves inside the prefix');
  eq(cachePrefix.includes('Acme'), false, 'prefix does NOT contain entity content');
  eq(prompt.includes('$$50'), true, '$-sequences in entity content survive verbatim in the tail');
  eq(prompt.includes(RESEARCH), true, 'tail carries the keyword research verbatim');
}

console.log('\n=== prod-template shape: {entity_content} first, docs AFTER it ===');
{
  // The live template puts {entity_content}@621 before {doc:format_spec.md}@1495 —
  // the docs land in the uncached tail and the prefix is just the short head
  // (below cache minimum — execute() logs that). Bytes must still match.
  const t = 'Head instr.\n{entity_content}\nkw: {keyword_research}\nSPEC:\n{doc:format_spec.md}';
  const baseline = buildPrompt(t, ENTITY, DOCS, RESEARCH, 3, METRICS);
  const { prompt, cachePrefix } = buildCachedPrompt(t, ENTITY, DOCS, RESEARCH, 3, METRICS);
  eq(cachePrefix + prompt, baseline, 'byte-identical on the docs-after-content prod shape');
  eq(cachePrefix, 'Head instr.\n', 'prefix is only the short head (docs are in the varying tail)');
}

console.log('\n=== first varying placeholder wins the cut ===');
{
  const t = 'Intro.\nRESEARCH: {keyword_research}\nANALYSIS: {entity_content}';
  const baseline = buildPrompt(t, ENTITY, DOCS, RESEARCH, 0, METRICS);
  const { prompt, cachePrefix } = buildCachedPrompt(t, ENTITY, DOCS, RESEARCH, 0, METRICS);
  eq(cachePrefix + prompt, baseline, 'byte-identical when {keyword_research} precedes {entity_content}');
  eq(cachePrefix, 'Intro.\nRESEARCH: ', 'cut lands before the FIRST varying placeholder');
}

console.log('\n=== fallbacks: no varying placeholder / placeholder at position 0 ===');
{
  const none = 'Static only. {doc:format_spec.md} FAQs: {faq_count}';
  const r1 = buildCachedPrompt(none, ENTITY, DOCS, RESEARCH, 2, METRICS);
  eq(r1.cachePrefix, '', 'no varying placeholder → empty prefix (no caching)');
  eq(r1.prompt, buildPrompt(none, ENTITY, DOCS, RESEARCH, 2, METRICS), 'prompt == buildPrompt output');

  const atZero = '{entity_content} then rules.';
  const r2 = buildCachedPrompt(atZero, ENTITY, DOCS, RESEARCH, 2, METRICS);
  eq(r2.cachePrefix, '', 'varying placeholder at position 0 → empty prefix');
  eq(r2.prompt, buildPrompt(atZero, ENTITY, DOCS, RESEARCH, 2, METRICS), 'prompt == buildPrompt output');
}

console.log('\n=== keyword_research fallback doc resolves identically in the split ===');
{
  const docs = { 'keyword-summary.md': 'fallback keywords $$' };
  const t = 'Head.\n{doc:keyword-summary.md}\nDATA: {keyword_research}\nA: {entity_content}';
  const baseline = buildPrompt(t, ENTITY, docs, '', 1, '');
  const { prompt, cachePrefix } = buildCachedPrompt(t, ENTITY, docs, '', 1, '');
  eq(cachePrefix + prompt, baseline, 'byte-identical when {keyword_research} falls back to keyword-summary.md');
}

console.log(`\n=== Result: ${pass} pass, ${fail} fail ===`);
process.exit(fail === 0 ? 0 : 1);
