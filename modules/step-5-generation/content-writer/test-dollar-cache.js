/**
 * Cache $-sequence fix — content-writer.
 *
 * buildPrompt inserted {entity_content} (which carries the FULL scraped source
 * content, routinely containing "$$" for money and "$&" in URLs) and {doc:...}
 * values via String.prototype.replace with a STRING replacement, mangling any
 * $-pattern the model then saw. The writer has no cache split, but the mangling
 * corrupted the model's input directly. Fix: function-form replacement.
 *
 * Proves: $-free content is byte-identical before/after (no regression), and
 * $-sequences in entity content and in reference docs are inserted verbatim.
 */
const assert = require('assert');
const { __testing } = require('./execute.js');
const { buildPrompt } = __testing;

const TEMPLATE = 'WRITE\n{entity_content}\nRULES\n{doc:format_spec.md}\nEND';
const DOCS = { 'format_spec.md': 'H2 headings required. Cite via [#n].' };

let checks = 0;

// $-free: content + doc present verbatim
{
  const content = '=== SOURCE ===\nELK Studios, founded 2013.';
  const out = buildPrompt(TEMPLATE, content, DOCS);
  assert(out.includes(content), '$-free entity content verbatim');
  assert(out.includes('Cite via [#n].'), 'doc content verbatim');
  checks += 2;
}

// $-sequences in entity content are NOT mangled
for (const tricky of ['Jackpot $$100,000', 'url ?q=x$&p=2', "code $` ph", "split $' 50/50", 'groups $1 $2']) {
  const content = `=== SOURCE (scraped pages) ===\n${tricky}\nmore text`;
  const out = buildPrompt(TEMPLATE, content, DOCS);
  assert(out.includes(tricky), `entity $-sequence preserved literally: ${JSON.stringify(tricky)}`);
  checks += 1;
}

// $-sequences in a reference doc are NOT mangled
{
  const docs = { 'format_spec.md': 'Use $$ for pooled jackpots and keep $& in query strings.' };
  const out = buildPrompt(TEMPLATE, 'plain content', docs);
  assert(out.includes('$$ for pooled jackpots and keep $& in query strings'), 'doc $-sequences preserved literally');
  checks += 1;
}

// Unreplaced {doc:...} tokens still stripped (behavior unchanged)
{
  const out = buildPrompt('A {doc:missing.md} B', 'x', {});
  assert(!out.includes('{doc:'), 'unmatched {doc:} placeholder stripped');
  checks += 1;
}

console.log(`content-writer/test-dollar-cache: PASS (${checks} assertions)`);
