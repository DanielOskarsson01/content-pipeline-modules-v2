/**
 * Cache $-sequence fix (BACKLOG #21 follow-up).
 *
 * Root cause: buildPrompt used String.prototype.replace with a STRING
 * replacement, which interprets $-patterns ($$, $&, $`, $', $n) inside the
 * replacement. Scraped content routinely contains them ("$$" for money, "$&"
 * in URLs). Two failures resulted:
 *   1. Content mangling — the model saw corrupted input ($$ -> $, $& -> the
 *      matched token spliced mid-text).
 *   2. Cache never engaged — buildCachedPrompt's plain concatenation stayed
 *      literal while buildPrompt mangled, so the byte-identity guard failed
 *      and the split fell back to no-caching (cache_write=0/cache_read=0 in the
 *      2026-07-14 prove-out, on the very Push Gaming pages that carry $$ and $&).
 *
 * Fix: function-form replacement inserts values literally. This test proves:
 *   (a) $-FREE content is byte-identical before/after (no regression);
 *   (b) $-content is no longer mangled (buildPrompt output contains it verbatim);
 *   (c) the cache split ENGAGES + stays byte-identical on $-content.
 */
const assert = require('assert');
const m = require('./execute.js');

const TEMPLATE = 'INSTRUCTIONS {doc:vocab.md} SECTION\n{entity_content}\nOUTPUT: json';
const DOCS = { 'vocab.md': 'category-a\ncategory-b\n'.repeat(1000) }; // large stable head (> haiku 4096 cache min)

// Real scraped-content shapes (Push Gaming pages carried $$ and $&).
const DOLLAR_CASES = {
  dollar_dollar: 'Jackpot up to $$100,000 across the network.',
  dollar_amp: 'Search results at ?q=slots$&page=2 returned 40 games.',
  dollar_backtick: "Price shown as $` placeholder in the CMS.",
  dollar_quote: "Revenue split $' between studio and operator.",
  dollar_n: 'Group $1 and $2 appear in the regex-heavy affiliate copy.',
};

let checks = 0;

// (a) $-free content: cache split engages AND byte-identical (baseline no-regression)
{
  const content = 'ELK Studios is a Swedish game provider founded in 2013.';
  const full = m.buildPrompt(TEMPLATE, content, DOCS);
  const { prompt, cachePrefix } = m.buildCachedPrompt(TEMPLATE, content, DOCS);
  assert(full.includes(content), '$-free: content present verbatim');
  assert(cachePrefix.length > 0, '$-free: cache split engages');
  assert.strictEqual(cachePrefix + prompt, full, '$-free: byte-identical');
  checks += 3;
}

// (b)+(c) each $-sequence: not mangled, cache engages, byte-identical
for (const [name, content] of Object.entries(DOLLAR_CASES)) {
  const full = m.buildPrompt(TEMPLATE, content, DOCS);
  const { prompt, cachePrefix } = m.buildCachedPrompt(TEMPLATE, content, DOCS);
  assert(full.includes(content), `${name}: content NOT mangled (present verbatim in buildPrompt)`);
  assert(cachePrefix.length > 0, `${name}: cache split ENGAGES (was falling back before the fix)`);
  assert.strictEqual(cachePrefix + prompt, full, `${name}: byte-identical (cachePrefix + prompt === buildPrompt)`);
  assert(prompt.includes(content), `${name}: content lands in the variable tail verbatim`);
  checks += 4;
}

// $-sequences in a reference DOC are also inserted literally
{
  const docs = { 'vocab.md': 'price-marker $$ and $& kept literal ' + 'x'.repeat(20000) };
  const content = 'plain entity text';
  const full = m.buildPrompt(TEMPLATE, content, docs);
  assert(full.includes('$$ and $&'), 'doc $-sequences preserved literally');
  const { prompt, cachePrefix } = m.buildCachedPrompt(TEMPLATE, content, docs);
  assert.strictEqual(cachePrefix + prompt, full, 'doc $-content: byte-identical');
  checks += 2;
}

// Regression: 0 or >1 {entity_content} → fallback (no split), still byte-identical
{
  const noSlot = m.buildCachedPrompt('no slot here {doc:vocab.md}', 'x', DOCS);
  assert.strictEqual(noSlot.cachePrefix, '', '0 slots: no cache split');
  const twoSlots = m.buildCachedPrompt('{entity_content} and {entity_content}', 'x', DOCS);
  assert.strictEqual(twoSlots.cachePrefix, '', '2 slots: no cache split');
  assert.strictEqual(twoSlots.prompt, m.buildPrompt('{entity_content} and {entity_content}', 'x', DOCS), '2 slots: full prompt in fallback');
  checks += 3;
}

console.log(`content-analyzer/test-dollar-cache: PASS (${checks} assertions)`);
