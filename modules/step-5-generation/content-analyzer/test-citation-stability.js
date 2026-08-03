/**
 * Standalone test harness for citation-map stability across loop re-runs (B2).
 *
 * Run: node modules/step-5-generation/content-analyzer/test-citation-stability.js
 * From repo root.
 *
 * The bug (run cb49ef80, Hacksawgaming): a loop pass re-runs content-analyzer,
 * which regenerates analysis_json from the same sources. The model re-mints
 * source_citations nondeterministically (observed live: 52 entries on loop 0,
 * 19 on loop 1 — same input ±68 tokens, stop_reason end_turn both times), and
 * the add-upsert replaces the old map. The round-2 rewrite preserves inline
 * [#n] refs minted against the destroyed 52-entry numbering, so the
 * citation-coverage-checker finds 27 broken refs (score 0.413 vs threshold
 * 0.7). Loop 0 scored 1.0 — the collapse is specific to re-runs.
 *
 * The fix: when the analyzer's input pool carries its own previous
 * analysis_json (loop re-run), the previous source_citations are preserved
 * verbatim — same index, same url — and only genuinely new URLs are appended
 * after the previous max index. The map becomes append-only across loop
 * iterations, so refs minted against any earlier version stay resolvable.
 *
 * No network. Mocks logger/progress/ai.
 */

const execute = require('./execute.js');
const MANIFEST = require('./manifest.json');

let pass = 0;
let fail = 0;

function assert(cond, msg) {
  if (cond) {
    console.log(`  PASS: ${msg}`);
    pass++;
  } else {
    console.log(`  FAIL: ${msg}`);
    fail++;
  }
}

function makeTools(aiResponse) {
  return {
    logger: { info: () => {}, warn: () => {}, error: () => {} },
    progress: { update: () => {} },
    _partialItems: [],
    ai: { complete: async () => ({ text: JSON.stringify(aiResponse) }) },
  };
}

const baseOptions = { ...MANIFEST.options_defaults };

const sourceItems = [
  { url: 'https://example.com/a', title: 'Page A', text_content: 'Alpha Corp was founded in 2015.', word_count: 6 },
  { url: 'https://example.com/b', title: 'Page B', text_content: 'Alpha Corp employs 250 people.', word_count: 5 },
];

// The map a previous loop-0 analyzer run left in the pool.
const prevCitations = [
  { index: 1, url: 'https://example.com/a', title: 'Page A' },
  { index: 2, url: 'https://example.com/b', title: 'Page B' },
  { index: 3, url: 'https://example.com/c', title: 'Page C' },
];

const prevAnalysisItem = {
  entity_name: 'Alpha',
  status: 'analyzed',
  analysis_json: {
    key_facts: { founded: '2015' },
    source_citations: prevCitations,
  },
};

// What the model re-mints on the loop pass: smaller, renumbered, one new URL.
const remintedAnalysis = {
  key_facts: { founded: '2015', headquarters: 'Malta' },
  source_citations: [
    { index: 1, url: 'https://example.com/b', title: 'Page B' }, // was #2
    { index: 2, url: 'https://example.com/new', title: 'New Page' },
  ],
};

function citationAt(map, index) {
  return (map || []).find(c => Number(c.index) === index);
}

(async () => {
  console.log('--- Case 1: loop re-run preserves the previous map, appends new URLs ---');
  {
    const tools = makeTools(remintedAnalysis);
    const entity = { name: 'Alpha', items: [...sourceItems, prevAnalysisItem] };
    const result = await execute({ entities: [entity] }, baseOptions, tools);
    const out = result.results[0].items[0].analysis_json;
    const map = out && out.source_citations;

    assert(Array.isArray(map), 'output has a source_citations array');
    for (const prev of prevCitations) {
      const got = citationAt(map, prev.index);
      assert(
        got && got.url === prev.url,
        `previous [#${prev.index}] -> ${prev.url} preserved (got ${got ? got.url : 'nothing'})`
      );
    }
    const appended = citationAt(map, 4);
    assert(
      appended && appended.url === 'https://example.com/new',
      `new URL appended at index 4 (got ${appended ? appended.url : 'nothing'})`
    );
    assert(map.length === 4, `no duplicates: 3 preserved + 1 new = 4 (got ${map.length})`);
  }

  console.log('--- Case 2: fresh run (no previous analysis) is untouched ---');
  {
    const tools = makeTools(remintedAnalysis);
    const entity = { name: 'Alpha', items: [...sourceItems] };
    const result = await execute({ entities: [entity] }, baseOptions, tools);
    const map = result.results[0].items[0].analysis_json.source_citations;

    assert(map.length === 2, `model's own map kept as-is (got ${map.length} entries)`);
    assert(citationAt(map, 1).url === 'https://example.com/b', 'index 1 is the model\'s own assignment');
  }

  console.log('--- Case 3: model emits no citations on re-run -- previous map preserved ---');
  {
    const noCites = { key_facts: { founded: '2015' } };
    const tools = makeTools(noCites);
    const entity = { name: 'Alpha', items: [...sourceItems, prevAnalysisItem] };
    const result = await execute({ entities: [entity] }, baseOptions, tools);
    const map = result.results[0].items[0].analysis_json.source_citations;

    assert(Array.isArray(map) && map.length === 3, `previous 3 entries preserved (got ${map && map.length})`);
    assert(citationAt(map, 3).url === 'https://example.com/c', 'index 3 still resolves');
  }

  console.log('--- Case 5: stale broadcast copy vs newer map -- highest max index wins ---');
  {
    // §7b broadcast shape: an entity-keyed item carries a STALE small map,
    // while the analyzer's own item carries the newer merged (larger) map.
    // Stale copy comes FIRST in the items array.
    const staleItem = {
      entity_name: 'Alpha',
      analysis_json: { key_facts: { founded: '2015' }, source_citations: prevCitations.slice(0, 2) },
    };
    const newerItem = {
      entity_name: 'Alpha',
      analysis_json: { key_facts: { founded: '2015' }, source_citations: prevCitations },
    };
    const tools = makeTools(remintedAnalysis);
    const entity = { name: 'Alpha', items: [staleItem, ...sourceItems, newerItem] };
    const result = await execute({ entities: [entity] }, baseOptions, tools);
    const map = result.results[0].items[0].analysis_json.source_citations;

    assert(
      citationAt(map, 3) && citationAt(map, 3).url === 'https://example.com/c',
      'newer (larger) map won over the stale broadcast copy'
    );
    assert(map.length === 4, `merged from the newer map: 3 + 1 new = 4 (got ${map.length})`);
  }

  console.log('--- Case 6: legacy-shaped previous maps are ignored, not corrupted ---');
  {
    // v1.0.0 plain-string and v1.2.0 {claim, sources} shapes (both still
    // accepted by citation-coverage-checker) must not be merged — the fix
    // disengages and the model's own map is kept as-is.
    const legacyItem = {
      entity_name: 'Alpha',
      analysis_json: {
        key_facts: { founded: '2015' },
        source_citations: ['https://example.com/old1', 'https://example.com/old2', 'https://example.com/old3', 'https://example.com/old4'],
      },
    };
    const tools = makeTools(remintedAnalysis);
    const entity = { name: 'Alpha', items: [...sourceItems, legacyItem] };
    const result = await execute({ entities: [entity] }, baseOptions, tools);
    const map = result.results[0].items[0].analysis_json.source_citations;

    assert(map.length === 2, `legacy map ignored — model's own 2 entries kept (got ${map.length})`);
    assert(
      map.every(c => c && typeof c === 'object' && c.url),
      'output map contains no corrupted (char-index / string) entries'
    );
  }

  console.log('--- Case 4: merged citations must NOT rescue a hollow analysis ---');
  {
    const tools = makeTools({}); // hollow: valid JSON, nothing usable
    const entity = { name: 'Alpha', items: [...sourceItems, prevAnalysisItem] };
    const result = await execute({ entities: [entity] }, baseOptions, tools);
    const meta = result.results[0].meta;

    assert(meta.status === 'error', `hollow analysis still fails loud (meta.status=${meta.status})`);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
})();
