/**
 * BACKLOG #21 — content-analyzer prompt-cache split byte-identity proof.
 * Run: node modules/step-5-generation/content-analyzer/test-cache-split.js
 *
 * The cache split must NEVER change what the model sees: cachePrefix + prompt
 * (the variable tail) must be byte-identical to the pre-#21 buildPrompt() output.
 */
const { buildPrompt, buildCachedPrompt } = require('./execute.js');

let pass = 0, fail = 0;
function eq(a, b, msg) {
  if (a === b) { console.log(`  PASS: ${msg}`); pass++; }
  else { console.log(`  FAIL: ${msg}\n    a=${JSON.stringify(a).slice(0, 120)}\n    b=${JSON.stringify(b).slice(0, 120)}`); fail++; }
}

const DOCS = {
  'master_categories.md': '# CATEGORIES\nslug-casino-platforms\nslug-payment-gateways\n(...~17K tokens...)',
  'master_tags.md': '# TAGS\ntag-emerging-markets\ntag-crypto\n(...~3K tokens...)',
};

// Representative template: instructions + vocabulary docs (STABLE) then entity content (VARIABLE).
const TEMPLATE = [
  'You are an analyst. Use ONLY this controlled vocabulary.',
  'CATEGORIES:\n{doc:master_categories.md}',
  'TAGS:\n{doc:master_tags.md}',
  'Return JSON.',
  'CONTENT TO ANALYZE:\n{entity_content}',
].join('\n\n');
const ENTITY = 'Acme Casino Ltd — a B2B platform provider. Founded 2015. HQ Malta.';

console.log('\n=== byte-identity: cachePrefix + prompt === buildPrompt() ===');
{
  const baseline = buildPrompt(TEMPLATE, ENTITY, DOCS);
  const { prompt, cachePrefix } = buildCachedPrompt(TEMPLATE, ENTITY, DOCS);
  eq(cachePrefix + prompt, baseline, 'split reassembles to the exact single-prompt bytes');
  eq(cachePrefix.includes('master_categories') || cachePrefix.includes('CATEGORIES'), true, 'prefix carries the stable vocabulary block');
  eq(cachePrefix.includes(ENTITY), false, 'prefix does NOT contain the variable entity content');
  eq(prompt.includes(ENTITY), true, 'variable tail carries the entity content');
  eq(prompt.includes('{doc:'), false, 'no unresolved {doc:} placeholders leak into the tail');
}

console.log('\n=== fallback: 0 or >1 {entity_content} → no split, identical bytes ===');
{
  const noEnt = 'Just instructions, no entity placeholder. {doc:master_tags.md}';
  const r1 = buildCachedPrompt(noEnt, ENTITY, DOCS);
  eq(r1.cachePrefix, '', '0 occurrences → empty prefix (no caching)');
  eq(r1.prompt, buildPrompt(noEnt, ENTITY, DOCS), '0 occurrences → prompt == buildPrompt output');

  const twoEnt = 'A {entity_content} B {entity_content} C {doc:master_categories.md}';
  const r2 = buildCachedPrompt(twoEnt, ENTITY, DOCS);
  eq(r2.cachePrefix, '', '>1 occurrences → empty prefix (no caching)');
  eq(r2.prompt, buildPrompt(twoEnt, ENTITY, DOCS), '>1 occurrences → prompt == buildPrompt output');
}

console.log('\n=== edge: entity content that itself contains a {doc:...} literal ===');
{
  // Scraped content could contain a literal "{doc:...}"; old code resolves it AFTER
  // entity insertion, so the split path must produce the same bytes.
  const trickyEntity = 'Reviewed at {doc:master_tags.md} — see notes.';
  const baseline = buildPrompt(TEMPLATE, trickyEntity, DOCS);
  const { prompt, cachePrefix } = buildCachedPrompt(TEMPLATE, trickyEntity, DOCS);
  eq(cachePrefix + prompt, baseline, 'byte-identical even when entity content embeds a {doc:} token');
}

console.log('\n=== edge: empty reference docs ===');
{
  const baseline = buildPrompt(TEMPLATE, ENTITY, {});
  const { prompt, cachePrefix } = buildCachedPrompt(TEMPLATE, ENTITY, {});
  eq(cachePrefix + prompt, baseline, 'byte-identical with empty referenceDocs (placeholders stripped)');
}

console.log('\n=== edge: entity content with $-replacement-pattern sequences (fixed) ===');
{
  // buildPrompt now uses a function-form replacer, so $$, $&, $`, $', $n in the
  // entity content are inserted LITERALLY (no longer interpreted as replacement
  // patterns). Scraped casino/payments text is full of "$$". Post-fix there is
  // no divergence to fall back from: the split ENGAGES and stays byte-identical,
  // so the ~20K-token vocab head actually caches on these entities.
  for (const tricky of ['price $$50', 'bonus $$$ deal', 'x $& y', 'a $` b', "c $' d"]) {
    const baseline = buildPrompt(TEMPLATE, tricky, DOCS);
    const { prompt, cachePrefix } = buildCachedPrompt(TEMPLATE, tricky, DOCS);
    eq(baseline.includes(tricky), true, `content NOT mangled (present verbatim) for ${JSON.stringify(tricky)}`);
    eq(cachePrefix + prompt, baseline, `byte-identical for $-pattern entity ${JSON.stringify(tricky)}`);
    eq(cachePrefix.length > 0, true, `  → cache split ENGAGES (fixed) for ${JSON.stringify(tricky)}`);
  }
  // Sanity: a normal (no-$) entity still DOES cache-split (we didn't break the happy path).
  const ok = buildCachedPrompt(TEMPLATE, 'normal entity, no dollar signs', DOCS);
  eq(ok.cachePrefix.length > 0, true, 'normal entity still cache-splits (happy path intact)');
}

console.log('\n=== edge: template nesting {entity_content} inside a {doc:...} token ===');
{
  const nested = 'Intro\n{doc:master_{entity_content}categories.md}\nEnd';
  const baseline = buildPrompt(nested, ENTITY, DOCS);
  const { prompt, cachePrefix } = buildCachedPrompt(nested, ENTITY, DOCS);
  eq(cachePrefix + prompt, baseline, 'byte-identical when {entity_content} nests in a {doc:} token (self-check fallback)');
}

console.log(`\n=== Result: ${pass} pass, ${fail} fail ===`);
process.exit(fail === 0 ? 0 : 1);
