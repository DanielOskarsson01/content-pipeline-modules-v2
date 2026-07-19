/**
 * Standalone test harness for content-analyzer M2 hollow-analysis content gate
 * (Program A / A4 — the producer-side twin of seo-planner's A1/C2 fix).
 *
 * Run: node modules/step-5-generation/content-analyzer/test-hollow-analysis.js
 * From repo root. No network — ai.complete is mocked.
 *
 * Context — same class as C2/A1, one module UPSTREAM. content-analyzer validated
 * JSON SHAPE (parseJsonResponse) but never CONTENT: a valid-but-EMPTY analysis_json
 * (e.g. {} or { categories: [], key_facts: {} }) emitted meta.status:'success' and
 * a hollow analysis cascaded into content-writer AND seo-planner. Both consumers
 * serialize the ENTIRE analysis_json into their LLM prompt ("=== CONTENT ANALYSIS
 * ===" block), so an empty object yields a hollow profile one step downstream.
 *
 * "Hollow" is defined from the downstream consumer requirement, not arbitrarily:
 * because the consumers serialize the whole object, the analysis is usable iff it
 * carries at least ONE real extracted value anywhere in its structure. The schema
 * is fully dynamic (flattenAnalysis adapts to whatever the prompt produces), so —
 * per Rule 13 — the gate names NO field; it checks for any non-empty content leaf.
 *
 * On hollow it throws into the existing outer catch, which emits meta.status:'error'
 * (skeleton honors it — content-pipeline-v2/server/utils/entityRunStatus.js:23 →
 * entity 'failed'). NOT a salvage. Additive: a populated analysis is unchanged.
 *
 * BOUNDARY (documented + tested both directions):
 *   - keywords/values present anywhere → usable (success), even if some fields empty.
 *   - every leaf empty (null/""/[]/{}) → hollow (error).
 *   - a NON-JSON response (parse fails → analysis===null) is OUT of M2 scope and
 *     UNCHANGED: its raw model text is carried on section_analysis and still flows
 *     to content-writer via its whole-item fallback, so it is not empty output.
 */

const execute = require('./execute.js');
const MANIFEST = require('./manifest.json');

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { console.log(`  PASS: ${msg}`); pass++; }
  else { console.log(`  FAIL: ${msg}`); fail++; }
}

// Mock tools. ai.complete returns whatever `respond()` yields (a raw text string).
function makeTools(respond) {
  const logs = [];
  let aiCalls = 0;
  return {
    logs,
    get aiCalls() { return aiCalls; },
    logger: {
      info: (m) => logs.push({ level: 'info', message: m }),
      warn: (m) => logs.push({ level: 'warn', message: m }),
      error: (m) => logs.push({ level: 'error', message: m }),
    },
    progress: { update: () => {} },
    ai: { complete: async () => { aiCalls++; return { text: respond() }; } },
    _partialItems: [],
  };
}

const entity = { name: 'Acme', items: [{ source_submodule: 'page-scraper', text_content: 'About Acme.', url: 'https://acme.example', word_count: 3 }] };
const base = { ...MANIFEST.options_defaults };

async function runWithText(text) {
  const tools = makeTools(() => text);
  const result = await execute({ entities: [entity] }, base, tools);
  return { entity: result.results[0], tools };
}
const runWithAnalysis = (obj) => runWithText(JSON.stringify(obj));

function assertSuccess(ent, label) {
  assert(ent.meta.status === 'success', `${label}: meta.status === 'success'`);
  assert(ent.items[0].status === 'analyzed', `${label}: item status === 'analyzed'`);
}
function assertHollowError(ent, label) {
  assert(ent.meta.status === 'error', `${label}: meta.status === 'error' (fails LOUD, not green)`);
  assert(ent.items[0].status === 'error', `${label}: item status === 'error'`);
  assert(/empty|hollow|usable|no .*content/i.test(ent.items[0].error || ''),
    `${label}: error names the cause`);
}

(async () => {
  console.log('\n=== A4 content-analyzer hollow-analysis content gate ===');

  // -------------------------------------------------------------------------
  // GOOD PATH — a real, populated analysis must still succeed (regression).
  // -------------------------------------------------------------------------
  console.log('\n=== Good path: populated analysis → success (untouched) ===');
  {
    const { entity: ent } = await runWithAnalysis({
      categories: { primary: [{ slug: 'casino-platforms' }] },
      key_facts: { founded: '2005', headquarters: 'Malta' },
    });
    assertSuccess(ent, 'populated');
  }

  // -------------------------------------------------------------------------
  // HOLLOW — valid JSON, empty content. MUST fail loud (the M2 bug).
  // -------------------------------------------------------------------------
  console.log('\n=== Hollow analyses → meta.status:error (the fix) ===');
  { const { entity: ent } = await runWithAnalysis({}); assertHollowError(ent, 'empty-object'); }
  {
    // The realistic M2 shape: model returned the schema skeleton, no content.
    const { entity: ent } = await runWithAnalysis({ categories: [], tags: [], key_facts: {} });
    assertHollowError(ent, 'all-empty-containers');
  }
  {
    // Nested-all-empty: containers exist but every leaf is empty.
    const { entity: ent } = await runWithAnalysis({ categories: { primary: [], secondary: [] }, key_facts: {}, notes: null });
    assertHollowError(ent, 'nested-all-empty');
  }
  {
    // Whitespace-only string is not a usable value (mirrors trim()).
    const { entity: ent } = await runWithAnalysis({ summary: '   ', tags: [''] });
    assertHollowError(ent, 'whitespace-only');
  }

  // -------------------------------------------------------------------------
  // PARTIAL boundary — SOME content present → usable (success). The gate is
  // "at least one usable leaf", not "every field populated" (mirrors A1's
  // keywords-present-even-if-meta-empty). Documents the boundary.
  // -------------------------------------------------------------------------
  console.log('\n=== Partial: one real value among empties → success ===');
  {
    const { entity: ent } = await runWithAnalysis({ categories: [{ slug: 'casino-platforms' }], tags: [], key_facts: {} });
    assertSuccess(ent, 'one-real-slug-rest-empty');
  }
  {
    // A number is a real extracted fact (0 counts; NaN/Infinity would not).
    const { entity: ent } = await runWithAnalysis({ employee_count: 500, tags: [] });
    assertSuccess(ent, 'number-fact');
  }
  {
    // An explicit boolean is a real fact (e.g. licensed: false).
    const { entity: ent } = await runWithAnalysis({ is_licensed: false });
    assertSuccess(ent, 'boolean-fact');
  }

  // -------------------------------------------------------------------------
  // OUT-OF-SCOPE / UNCHANGED — a NON-JSON response (parse fails) keeps its
  // existing raw-text path (analysis===null, status 'analyzed'). Proves the
  // gate did NOT over-reach into the separately-handled non-JSON case, whose
  // raw text still flows to content-writer via its whole-item fallback.
  // -------------------------------------------------------------------------
  console.log('\n=== Non-JSON response → raw-text path unchanged (out of M2 scope) ===');
  {
    const { entity: ent } = await runWithText('Here is a prose analysis with no JSON at all.');
    assert(ent.meta.status === 'success', 'non-JSON: meta.status still success (raw-text path)');
    assert(ent.items[0].status === 'analyzed', 'non-JSON: item status still analyzed');
    assert(ent.items[0].analysis_json === null, 'non-JSON: analysis_json is null (raw text on section_analysis)');
  }

  // -------------------------------------------------------------------------
  // TRUNCATION recovery still coexists with the gate — a response whose closing
  // fence was cut (hit max_tokens) but whose object is complete-with-content
  // parses fine and succeeds (not falsely flagged hollow).
  // -------------------------------------------------------------------------
  console.log('\n=== Truncated fence + real content → success (not false-hollow) ===');
  {
    const { entity: ent } = await runWithText('```json\n' + JSON.stringify({ key_facts: { founded: '2005' } }));
    assertSuccess(ent, 'truncated-fence-with-content');
  }

  console.log(`\n=== Result: ${pass} pass, ${fail} fail ===`);
  process.exit(fail === 0 ? 0 : 1);
})();
