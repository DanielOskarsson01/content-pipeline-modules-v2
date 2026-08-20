/**
 * Hermetic test — prompt-input guard (BACKLOG #63).
 * Run: node modules/_shared/test-prompt-input-guard.js  (from repo root)
 *
 * Covers each of the four silent-drop conditions in isolation, the all-present
 * no-op case, and the real retained df68a5f0 variant prompt (md5 df68a5f0…, the
 * "senior B2B content writer for OnlyiGaming" prompt that names format_spec.md
 * and tone_guide.md as binding in prose but carries no {doc:} placeholder) —
 * proving the guard fires on BOTH missing docs by name.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { analyzePromptInputs, warnPromptInputs } = require('./prompt-input-guard.js');

// Capture logger.warn output so we can assert the greppable, entity-named lines.
function capture() {
  const lines = [];
  return { logger: { warn: m => lines.push(m), info: () => {}, error: () => {} }, lines };
}

let checks = 0;
function ok(cond, msg) { assert(cond, msg); console.log(`  PASS: ${msg}`); checks++; }

// 1. Missing primary — {entity_content} absent → assembled content discarded.
{
  const f = analyzePromptInputs('Write about the company. Rules: {doc:format_spec.md}', { 'format_spec.md': 'X' });
  ok(f.missingPrimary === true, 'case 1: missing {entity_content} detected');
  ok(f.unmatchedDocPlaceholders.length === 0 && f.namedNotInjected.length === 0, 'case 1: no false doc findings');
}

// 2. Unmatched {doc:x} — placeholder present, doc not provided → stripped to empty.
{
  const f = analyzePromptInputs('{entity_content}\n{doc:tone_guide.md}', { 'format_spec.md': 'X' });
  ok(f.unmatchedDocPlaceholders.length === 1 && f.unmatchedDocPlaceholders[0] === 'tone_guide.md',
    'case 2: unmatched {doc:tone_guide.md} detected');
  ok(f.missingPrimary === false, 'case 2: primary present');
  const c = capture(); warnPromptInputs(c.logger, 'Acme', f);
  ok(c.lines.some(l => l.includes('[prompt-input-guard]') && l.includes('Acme') && l.includes('tone_guide.md')),
    'case 2: warn is greppable + names entity + names doc');
}

// 3. Selected-but-unreferenced — doc attached, no placeholder to inject it.
{
  const f = analyzePromptInputs('{entity_content}\n{doc:format_spec.md}', { 'format_spec.md': 'X', 'tone_guide.md': 'Y' });
  ok(f.selectedNotReferenced.length === 1 && f.selectedNotReferenced[0] === 'tone_guide.md',
    'case 3: attached-but-uninjected tone_guide.md detected');
  ok(f.unmatchedDocPlaceholders.length === 0, 'case 3: format_spec.md is matched (not flagged)');
}

// 4. Named-but-not-injected — filename in prose, no {doc:} placeholder anywhere.
{
  const f = analyzePromptInputs('{entity_content}\nFollow format_spec.md exactly.', {});
  ok(f.namedNotInjected.length === 1 && f.namedNotInjected[0] === 'format_spec.md',
    'case 4: prose-named format_spec.md with no placeholder detected');
}

// 5. All present — nothing dropped → zero findings, zero warns.
{
  const tpl = '{entity_content}\nSPEC:\n{doc:format_spec.md}\nTONE:\n{doc:tone_guide.md}';
  const f = analyzePromptInputs(tpl, { 'format_spec.md': 'X', 'tone_guide.md': 'Y' });
  ok(!f.missingPrimary && f.unmatchedDocPlaceholders.length === 0
     && f.selectedNotReferenced.length === 0 && f.namedNotInjected.length === 0,
    'case 5: all-present → zero findings');
  const c = capture(); const n = warnPromptInputs(c.logger, 'Acme', f);
  ok(n === 0 && c.lines.length === 0, 'case 5: all-present logs NOTHING new');
}

// 6. Real retained df68a5f0 variant → fires on BOTH docs by name, primary intact.
{
  const df68a5f0 = fs.readFileSync(path.join(__dirname, 'fixtures', 'variant-df68a5f0-prompt.txt'), 'utf8');
  const f = analyzePromptInputs(df68a5f0, { 'format_spec.md': 'X', 'tone_guide.md': 'Y' });
  ok(f.missingPrimary === false, 'case 6: df68a5f0 has {entity_content} (would NOT fail-closed)');
  ok(f.namedNotInjected.includes('format_spec.md') && f.namedNotInjected.includes('tone_guide.md'),
    'case 6: df68a5f0 guard fires on BOTH missing docs by name');
  ok(f.namedNotInjected.length === 2, 'case 6: exactly those two docs, no false positives');
  // Attaching the docs (selected) without placeholders also surfaces both by name.
  ok(f.selectedNotReferenced.includes('format_spec.md') && f.selectedNotReferenced.includes('tone_guide.md'),
    'case 6: both attached docs are never injected (selected-not-referenced)');
}

// 7. content-writer manifest DEFAULT prompt with docs provided → zero findings
//    (regression: the baseline that injects both docs logs nothing new).
{
  const MANIFEST = require('../step-5-generation/content-writer/manifest.json');
  const f = analyzePromptInputs(MANIFEST.options_defaults.prompt, { 'format_spec.md': 'X', 'tone_guide.md': 'Y' });
  ok(!f.missingPrimary && f.unmatchedDocPlaceholders.length === 0
     && f.selectedNotReferenced.length === 0 && f.namedNotInjected.length === 0,
    'case 7: manifest default + both docs → zero findings');
}

console.log(`\nprompt-input-guard: PASS (${checks} assertions)`);
