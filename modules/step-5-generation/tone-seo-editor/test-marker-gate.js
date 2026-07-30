/**
 * Standalone test harness for tone-seo-editor W1.5 (marker-preservation gate).
 *
 * Run: node modules/step-5-generation/tone-seo-editor/test-marker-gate.js
 * From repo root.
 *
 * Covers:
 *   - Shared parser (modules/_shared/marker-parser.js): extractHeadingMarkers.
 *   - validateMarkerPreservation: multiset diff of markers original→revised.
 *   - Gate behavior in execute(): markers preserved → edited; markers dropped →
 *     hard error naming them; no markers → passes trivially (agnostic).
 *
 * No network — ai.complete is mocked to return a chosen "revised" markdown.
 */

const execute = require('./execute.js');
const MANIFEST = require('./manifest.json');
const { validateMarkerPreservation } = execute.__testing;
const { extractHeadingMarkers } = require('../../_shared/marker-parser.js');

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { console.log(`  PASS: ${msg}`); pass++; }
  else { console.log(`  FAIL: ${msg}`); fail++; }
}

function makeTools(revisedText) {
  const logs = [];
  return {
    logs,
    logger: {
      info: (m) => logs.push({ level: 'info', message: m }),
      warn: (m) => logs.push({ level: 'warn', message: m }),
      error: (m) => logs.push({ level: 'error', message: m }),
    },
    progress: { update: () => {} },
    ai: { complete: async () => ({ text: revisedText }) },
    _partialItems: [],
  };
}

const ORIGINAL = '# Acme\n\n## [Primary Category: casino-platforms]\n\nAcme builds platforms [#1].\n\n## [Tag: api]\n\nAcme has an API.';
const REVISED_PRESERVED = '# Acme\n\n## [Primary Category: casino-platforms]\n\nAcme builds robust platforms [#1].\n\n## [Tag: api]\n\nAcme exposes an API.';
const REVISED_DROPPED = '# Acme\n\n## Casino Platforms\n\nAcme builds robust platforms [#1].\n\n## API\n\nAcme exposes an API.';
const ORIGINAL_NO_MARKERS = '# Acme\n\n## Overview\n\nGeneric prose with no bracket markers.';

function entity(markdown) {
  return { name: 'Acme', items: [{ source_submodule: 'content-writer', content_markdown: markdown }] };
}

const base = {
  ai_model: 'haiku', ai_provider: 'anthropic', prompt: 'Edit: {content_markdown}',
  temperature: 0.3, max_tokens: 8192, tone_style: 'b2b_authoritative',
  max_content_chars: 50000, reference_docs: {},
};

(async () => {
  // ----------------------------------------------------------------------
  // Shared parser + helper unit checks
  // ----------------------------------------------------------------------
  console.log('\n=== Shared parser / validateMarkerPreservation ===');
  assert(JSON.stringify(extractHeadingMarkers(ORIGINAL)) === JSON.stringify(['Primary Category: casino-platforms', 'Tag: api']), 'extractHeadingMarkers: finds both markers in order');
  assert(extractHeadingMarkers(ORIGINAL_NO_MARKERS).length === 0, 'extractHeadingMarkers: no markers → []');
  assert(validateMarkerPreservation(ORIGINAL, REVISED_PRESERVED).length === 0, 'validate: preserved → no dropped');
  const dropped = validateMarkerPreservation(ORIGINAL, REVISED_DROPPED);
  assert(dropped.length === 2 && dropped.includes('Primary Category: casino-platforms') && dropped.includes('Tag: api'), 'validate: dropped → lists both missing markers');
  assert(validateMarkerPreservation(ORIGINAL_NO_MARKERS, 'anything at all').length === 0, 'validate: no markers in original → passes trivially');

  // ----------------------------------------------------------------------
  // Manifest sanity
  // ----------------------------------------------------------------------
  console.log('\n=== Manifest sanity ===');
  // Version-agnostic: pinning the exact version made this test fail on every
  // unrelated bump (it was failing at base against 1.2.3). Assert semver shape.
  assert(/^\d+\.\d+\.\d+$/.test(MANIFEST.version), `manifest version is semver (got ${MANIFEST.version})`);

  // ----------------------------------------------------------------------
  // Gate PASS: markers preserved
  // ----------------------------------------------------------------------
  console.log('\n=== Gate: markers preserved → edited ===');
  {
    const tools = makeTools(REVISED_PRESERVED);
    const result = await execute({ entities: [entity(ORIGINAL)] }, base, tools);
    assert(result.results[0].items[0].status === 'edited', 'preserved: status edited');
    assert(!result.results[0].items[0].error, 'preserved: no error');
    assert(result.results[0].items[0].content_markdown.includes('[Primary Category: casino-platforms]'), 'preserved: markers carried through to output');
  }

  // ----------------------------------------------------------------------
  // Gate FAIL: markers dropped
  // ----------------------------------------------------------------------
  console.log('\n=== Gate: markers dropped → error ===');
  {
    const tools = makeTools(REVISED_DROPPED);
    const result = await execute({ entities: [entity(ORIGINAL)] }, base, tools);
    assert(result.results[0].items[0].status === 'error', 'dropped: status error');
    assert(/Primary Category: casino-platforms/.test(result.results[0].items[0].error || ''), 'dropped: error names the dropped category marker');
    assert(/Tag: api/.test(result.results[0].items[0].error || ''), 'dropped: error names the dropped tag marker');
    assert(tools.logs.some(l => l.level === 'error'), 'dropped: logged at error level');
    assert(result.summary.total_items === 0, 'dropped: not counted as a successful edit');
  }

  // ----------------------------------------------------------------------
  // Agnostic: no markers in original → gate passes trivially
  // ----------------------------------------------------------------------
  console.log('\n=== Gate: no markers → passes trivially ===');
  {
    const tools = makeTools('# Acme\n\n## Summary\n\nReworded generic prose.');
    const result = await execute({ entities: [entity(ORIGINAL_NO_MARKERS)] }, base, tools);
    assert(result.results[0].items[0].status === 'edited', 'no markers: status edited (gate inert)');
  }

  console.log(`\n=== Result: ${pass} pass, ${fail} fail ===`);
  process.exit(fail === 0 ? 0 : 1);
})();
