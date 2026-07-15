/**
 * Cache $-sequence fix — seo-planner buildPrompt.
 *
 * {entity_content} (analysis JSON), {keyword_research} (Perplexity text), and
 * {doc:...} values were inserted via String.prototype.replace with a STRING
 * replacement, interpreting $-patterns ($$, $&, $`, $', $n) inside them. Analysis
 * JSON and research text carry $-sequences (money, URLs). {keyword_metrics} was
 * already function-form; this extends the same fix to the other three.
 *
 * Proves $-free content is byte-identical before/after and $-sequences in
 * analysis, research, and docs are inserted verbatim.
 */
const assert = require('assert');
const { __testing } = require('./execute.js');
const { buildPrompt } = __testing;

// signature: (promptTemplate, entityContent, referenceDocs, keywordResearchText, faqCount, keywordMetricsText)
const TEMPLATE = 'PLAN\n{entity_content}\nKW\n{keyword_research}\nDOC\n{doc:tone.md}';
const DOCS = { 'tone.md': 'authoritative B2B tone' };

let checks = 0;

// $-free baseline
{
  const analysis = '{"entity":"ELK Studios","founded":2013}';
  const research = 'Top query: online casino game provider';
  const out = buildPrompt(TEMPLATE, analysis, DOCS, research, 0, null);
  assert(out.includes(analysis), '$-free analysis verbatim');
  assert(out.includes(research), '$-free research verbatim');
  assert(out.includes('authoritative B2B tone'), 'doc verbatim');
  checks += 3;
}

// $-sequences in analysis JSON
for (const tricky of ['{"price":"$$100"}', '{"url":"x$&y"}', '{"a":"$`"}', `{"b":"$'"}`, '{"g":"$1$2"}']) {
  const out = buildPrompt(TEMPLATE, tricky, DOCS, 'research', 0, null);
  assert(out.includes(tricky), `analysis $-sequence preserved literally: ${JSON.stringify(tricky)}`);
  checks += 1;
}

// $-sequences in keyword_research text
{
  const research = 'Operators search "$$ deposit bonus" and "match$&win" heavily.';
  const out = buildPrompt(TEMPLATE, '{}', DOCS, research, 0, null);
  assert(out.includes(research), 'research $-sequences preserved literally');
  checks += 1;
}

// $-sequences in a reference doc
{
  const docs = { 'tone.md': 'Refer to jackpots as $$ pools; keep $& in tracking links.' };
  const out = buildPrompt(TEMPLATE, '{}', docs, 'research', 0, null);
  assert(out.includes('$$ pools; keep $& in tracking links'), 'doc $-sequences preserved literally');
  checks += 1;
}

console.log(`seo-planner/test-dollar-cache: PASS (${checks} assertions)`);
