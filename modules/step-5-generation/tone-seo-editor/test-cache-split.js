/**
 * BACKLOG #21 — tone-seo-editor prompt-cache split byte-identity proof, plus
 * the $-sequence insertion fix (same class as c5b0ef6, previously missing here).
 * Run: node modules/step-5-generation/tone-seo-editor/test-cache-split.js
 */
const { __testing } = require('./execute.js');
const { buildPrompt, buildCachedPrompt } = __testing;

let pass = 0, fail = 0;
function eq(a, b, msg) {
  if (a === b) { console.log(`  PASS: ${msg}`); pass++; }
  else { console.log(`  FAIL: ${msg}\n    a=${JSON.stringify(a).slice(0, 120)}\n    b=${JSON.stringify(b).slice(0, 120)}`); fail++; }
}

const DOCS = { 'tone_guide.md': '# TONE\nNo hype. Price like $$99.' };
const ARTICLE = '## [Type: provider] Acme\nBonus of $$50 at url?a=$&b\nMore text.';
const KEYWORDS = 'primary: acme casino ($1 anchor)';
const TONE = 'Direct, factual.';

console.log('\n=== $-sequence fix: article content inserted verbatim ===');
{
  for (const tricky of ['price $$50', 'x $& y', 'a $` b', "c $' d", 'kw $1 kw']) {
    const out = buildPrompt('EDIT THIS:\n{content_markdown}\nKW: {keyword_targets}', tricky, tricky, TONE, DOCS);
    eq(out.includes(`EDIT THIS:\n${tricky}`), true, `article NOT mangled for ${JSON.stringify(tricky)}`);
    eq(out.includes(`KW: ${tricky}`), true, `keyword targets NOT mangled for ${JSON.stringify(tricky)}`);
  }
  const docOut = buildPrompt('G: {doc:tone_guide.md}\n{content_markdown}', 'x', 'k', TONE, DOCS);
  eq(docOut.includes('$$99'), true, 'doc content NOT mangled ($$ verbatim)');
}

console.log('\n=== byte-identity: cachePrefix + prompt === buildPrompt() ===');
{
  const t = 'You edit articles.\nTONE: {tone_instructions}\nGUIDE:\n{doc:tone_guide.md}\n\nARTICLE:\n{content_markdown}\n\nTARGETS: {keyword_targets}';
  const baseline = buildPrompt(t, ARTICLE, KEYWORDS, TONE, DOCS);
  const { prompt, cachePrefix } = buildCachedPrompt(t, ARTICLE, KEYWORDS, TONE, DOCS);
  eq(cachePrefix + prompt, baseline, 'split reassembles to the exact single-prompt bytes');
  eq(cachePrefix.includes(TONE), true, 'stable {tone_instructions} resolves inside the prefix');
  eq(cachePrefix.includes('TONE\nNo hype'), true, 'prefix carries the stable doc');
  eq(cachePrefix.includes('Acme'), false, 'prefix does NOT contain the article');
  eq(prompt.includes('$$50'), true, '$-sequences in the article survive verbatim in the tail');
}

console.log('\n=== prod-template shape: {content_markdown}@~173 → short prefix, bytes intact ===');
{
  const t = 'Short head instructions.\nARTICLE:\n{content_markdown}\nTARGETS: {keyword_targets}\nTONE: {tone_instructions}';
  const baseline = buildPrompt(t, ARTICLE, KEYWORDS, TONE, DOCS);
  const { prompt, cachePrefix } = buildCachedPrompt(t, ARTICLE, KEYWORDS, TONE, DOCS);
  eq(cachePrefix + prompt, baseline, 'byte-identical on the head-light prod template shape');
  eq(cachePrefix, 'Short head instructions.\nARTICLE:\n', 'prefix is just the short head (below cache minimum — logged, not cached)');
}

console.log('\n=== fallbacks: no varying placeholder / placeholder at position 0 ===');
{
  const none = 'Static text only. TONE: {tone_instructions}';
  const r1 = buildCachedPrompt(none, ARTICLE, KEYWORDS, TONE, DOCS);
  eq(r1.cachePrefix, '', 'no varying placeholder → empty prefix (no caching)');
  eq(r1.prompt, buildPrompt(none, ARTICLE, KEYWORDS, TONE, DOCS), 'prompt == buildPrompt output');

  const atZero = '{content_markdown} then rules.';
  const r2 = buildCachedPrompt(atZero, ARTICLE, KEYWORDS, TONE, DOCS);
  eq(r2.cachePrefix, '', 'varying placeholder at position 0 → empty prefix');
  eq(r2.prompt, buildPrompt(atZero, ARTICLE, KEYWORDS, TONE, DOCS), 'prompt == buildPrompt output');
}

console.log(`\n=== Result: ${pass} pass, ${fail} fail ===`);
process.exit(fail === 0 ? 0 : 1);
