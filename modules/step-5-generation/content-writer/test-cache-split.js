/**
 * BACKLOG #21 — content-writer prompt-cache split byte-identity proof.
 * Run: node modules/step-5-generation/content-writer/test-cache-split.js
 *
 * The cache split must NEVER change what the model sees: cachePrefix + prompt
 * (the variable tail) must be byte-identical to the plain buildPrompt() output.
 */
const { buildPrompt, buildCachedPrompt } = require('./execute.js').__testing;

let pass = 0, fail = 0;
function eq(a, b, msg) {
  if (a === b) { console.log(`  PASS: ${msg}`); pass++; }
  else { console.log(`  FAIL: ${msg}\n    a=${JSON.stringify(a).slice(0, 120)}\n    b=${JSON.stringify(b).slice(0, 120)}`); fail++; }
}

const DOCS = {
  'format_spec.md': '# FORMAT\nH2 per section. Price like $$99. (...stable spec...)',
  'tone_guide.md': '# TONE\nDirect, factual.',
};

// Docs-in-head template (the shape caching is FOR — stable bulk before the entity content).
const TEMPLATE = [
  'You are a writer. Follow the spec exactly.',
  'SPEC:\n{doc:format_spec.md}',
  'TONE:\n{doc:tone_guide.md}',
  'SOURCE MATERIAL:\n{entity_content}',
  'Write the article now.',
].join('\n\n');
const ENTITY = 'ANALYSIS: Acme Casino Ltd. SOURCES: page text with price $$50 and url?a=$&b';

console.log('\n=== byte-identity: cachePrefix + prompt === buildPrompt() ===');
{
  const baseline = buildPrompt(TEMPLATE, ENTITY, DOCS);
  const { prompt, cachePrefix } = buildCachedPrompt(TEMPLATE, ENTITY, DOCS);
  eq(cachePrefix + prompt, baseline, 'split reassembles to the exact single-prompt bytes');
  eq(cachePrefix.includes('FORMAT'), true, 'prefix carries the stable spec docs');
  eq(cachePrefix.includes('$$99'), true, '$-sequences in docs are inserted verbatim into the prefix');
  eq(cachePrefix.includes(ENTITY), false, 'prefix does NOT contain the variable entity content');
  eq(prompt.includes('$$50'), true, '$-sequences in entity content survive verbatim in the tail');
  eq(prompt.includes('{doc:'), false, 'no unresolved {doc:} placeholders leak into the tail');
}

console.log('\n=== fallback: 0 or >1 {entity_content} → no split, identical bytes ===');
{
  const noEnt = 'Just instructions. {doc:tone_guide.md}';
  const r1 = buildCachedPrompt(noEnt, ENTITY, DOCS);
  eq(r1.cachePrefix, '', '0 occurrences → empty prefix (no caching)');
  eq(r1.prompt, buildPrompt(noEnt, ENTITY, DOCS), '0 occurrences → prompt == buildPrompt output');

  const twoEnt = 'A {entity_content} B {entity_content} C';
  const r2 = buildCachedPrompt(twoEnt, ENTITY, DOCS);
  eq(r2.cachePrefix, '', '>1 occurrences → empty prefix (no caching)');
  eq(r2.prompt, buildPrompt(twoEnt, ENTITY, DOCS), '>1 occurrences → prompt == buildPrompt output');
}

console.log('\n=== prod-template shape: {entity_content} early, no {doc:} refs ===');
{
  // The live company-profile template has a ~730-char head and NO {doc:} refs;
  // the split still reassembles byte-identically — it just yields a prefix far
  // below the cacheable minimum (execute() logs that).
  const prodish = 'Short instructions head.\n\n{entity_content}\n\nLong tail of writing rules...';
  const baseline = buildPrompt(prodish, ENTITY, DOCS);
  const { prompt, cachePrefix } = buildCachedPrompt(prodish, ENTITY, DOCS);
  eq(cachePrefix + prompt, baseline, 'byte-identical on the head-light prod template shape');
  eq(cachePrefix, 'Short instructions head.\n\n', 'prefix is just the short head (below cache minimum — logged, not cached)');
}

console.log('\n=== edge: entity content that itself contains a {doc:...} literal ===');
{
  const tricky = 'Reviewed at {doc:tone_guide.md} — see notes.';
  const baseline = buildPrompt(TEMPLATE, tricky, DOCS);
  const { prompt, cachePrefix } = buildCachedPrompt(TEMPLATE, tricky, DOCS);
  eq(cachePrefix + prompt, baseline, 'byte-identical even when entity content embeds a {doc:} token');
}

console.log(`\n=== Result: ${pass} pass, ${fail} fail ===`);
process.exit(fail === 0 ? 0 : 1);
