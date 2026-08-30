/**
 * Test harness for U1 -- claim-anchored retrieval + honest window instrumentation
 * + string-boolean coercion.
 *
 * Run: node modules/step-6-qa/hallucination-detector/test-claim-anchored.js
 * From repo root. No network -- ai.complete is mocked and also CAPTURES the source
 * text each batch was verified against, so we can prove which slices were shown.
 *
 * The defect (DIAGNOSIS Task 2): claims are verified against combineSourceText(),
 * which concatenates pages in pool order and truncates the HEAD at max_source_chars.
 * On a fat entity the supporting page is frequently beyond the window -> flagged
 * "unsupported" as a pure truncation artifact (SNAITECH at char 320,933, etc.).
 *
 * The fix: source_selection:"claim_anchored" builds a per-batch window from the
 * source chunks whose terms overlap the batch's claims, so the far supporting page
 * is SHOWN even though a head-truncation would drop it. Default source_selection:
 * "head" stays byte-identical.
 */

const execute = require('./execute.js');
const {
  asBool,
  extractClaimTerms,
  chunkSources,
  selectAnchoredWindow,
  classifyClaimEvidence,
} = require('./execute.js');

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { console.log(`  PASS: ${msg}`); pass++; }
  else { console.log(`  FAIL: ${msg}`); fail++; }
}

// A tools factory whose ai.complete returns a fixed verdict per claim index AND
// records the SOURCE MATERIAL block of every prompt it saw.
function makeTools(verdictForIndex) {
  const seenSources = [];
  return {
    seenSources,
    logger: { info: () => {}, warn: () => {}, error: () => {} },
    progress: { update: () => {} },
    _partialItems: [],
    ai: {
      complete: async ({ prompt }) => {
        const src = prompt.split('SOURCE MATERIAL:')[1] || '';
        seenSources.push(src);
        const count = (prompt.match(/^\d+\.\s/gm) || []).length;
        const verdicts = [];
        for (let i = 0; i < count; i++) {
          verdicts.push({ claim: `c${i}`, verdict: verdictForIndex(i), quote: null, severity: 'medium' });
        }
        return { text: JSON.stringify(verdicts) };
      },
    },
  };
}

(async () => {
  // ── Unit: asBool (the string-typed-preset bug class, requirement 4) ──
  console.log('--- asBool coercion ---');
  assert(asBool(true) === true, 'asBool(true) is true');
  assert(asBool('true') === true, "asBool('true') is true");
  assert(asBool('false') === false, "asBool('false') is FALSE (not truthy-string bug)");
  assert(asBool(false) === false, 'asBool(false) is false');
  assert(asBool(undefined) === false, 'asBool(undefined) is false');

  // ── Unit: extractClaimTerms ──
  console.log('--- extractClaimTerms ---');
  {
    const terms = extractClaimTerms('SNAITECH partnered with Vermantia in 2019');
    assert(terms.get('snaitech') === 2, 'acronym/proper-noun weighted 2 (snaitech)');
    assert(terms.get('vermantia') === 2, 'proper-noun weighted 2 (vermantia)');
    assert(terms.get('2019') === 2, 'number weighted 2');
    assert(!terms.has('with'), 'stopword dropped');
  }

  // ── Unit: chunkSources ──
  console.log('--- chunkSources ---');
  {
    const items = [{ text_content: 'a'.repeat(100) }, { text_content: 'b'.repeat(9000) }, { text_content: '' }];
    const chunks = chunkSources(items);
    assert(chunks.length >= 3, `oversized page split into >=2 chunks (got ${chunks.length})`);
    assert(chunks[0].text.length === 100, 'small page kept whole');
    assert(chunks.every(c => c.text.length <= 4000), 'no chunk exceeds CHUNK_SIZE');
    assert(chunks.every((c, i) => c.order === i), 'chunk order is stable/sequential');
  }

  // ── Unit: selectAnchoredWindow pulls the relevant FAR chunk into the window ──
  console.log('--- selectAnchoredWindow (far chunk selected over head) ---');
  {
    // 5 filler chunks (~500 chars) then the target far chunk mentioning ZEBRACORP.
    const items = [];
    for (let i = 0; i < 5; i++) items.push({ text_content: `filler page ${i} ${'x'.repeat(490)}` });
    items.push({ text_content: 'ZEBRACORP signed a partnership with TestEntity to deliver widgets.' });
    const chunks = chunkSources(items);
    // Budget only ~1200 chars: a head concat would stop long before the 6th page.
    const win = selectAnchoredWindow(chunks, ['ZEBRACORP partnership with TestEntity'], 1200);
    assert(win.text.includes('ZEBRACORP'), 'far ZEBRACORP chunk is selected into the anchored window');
    assert(win.shownChars <= 1200, `window respects the char budget (${win.shownChars} <= 1200)`);
  }

  // ── Unit: anchored window is a SUPERSET of the head window (ELK no-regress guard) ──
  // If an entity's evidence is already in the head window, claim_anchored must NOT
  // drop head chunks in favour of higher-overlap far chunks -- else a claim whose
  // (paraphrased, low-overlap) evidence sat in the head gets falsely flagged. The
  // anchored window must contain every chunk the head window contains.
  console.log('--- selectAnchoredWindow superset-of-head (regression guard) ---');
  {
    const items = [];
    // 3 head fillers with NO overlap with the claim (they sit in the head window)
    for (let i = 0; i < 3; i++) items.push({ text_content: `neutral filler paragraph ${i} ${'z'.repeat(430)}` });
    // 2 far chunks that DO mention the claim term
    items.push({ text_content: `WIDGETCO reported strong revenue growth ${'q'.repeat(420)}` });
    items.push({ text_content: `analysts note WIDGETCO revenue trends ${'w'.repeat(420)}` });
    const chunks = chunkSources(items);
    const budget = 1600; // head window = the 3 fillers (~1500); far chunks are beyond it
    // head window per combineSourceText semantics = first chunks up to budget
    let headUsed = 0; const headOrders = [];
    for (const c of chunks) { const add = (headOrders.length ? 41 : 0) + c.text.length; if (headUsed + add > budget) break; headOrders.push(c.order); headUsed += add; }
    const win = selectAnchoredWindow(chunks, ['WIDGETCO revenue'], budget);
    const allHeadIncluded = headOrders.every(o => win.selectedOrders.has(o));
    assert(allHeadIncluded, `anchored window includes ALL ${headOrders.length} head chunks (superset)`);
    assert(win.text.includes('WIDGETCO'), 'anchored window also pulls the far WIDGETCO evidence');
  }

  // ── Unit: the ubiquitous entity name must NOT mask far evidence ──
  // A claim mentions the entity name (present in every chunk) + a distinctive term
  // whose evidence is on a FAR page. The head must not be treated as "covering" the
  // claim just because it contains the entity name -- the far page must be pulled in.
  console.log('--- selectAnchoredWindow: entity-name ubiquity does not suppress far evidence ---');
  {
    const items = [];
    for (let i = 0; i < 6; i++) items.push({ text_content: `ACME is a company. General note ${i}. ${'a'.repeat(430)}` });
    items.push({ text_content: 'ACME entered a partnership with ZORPTECH in 2021 to deliver systems.' });
    const chunks = chunkSources(items);
    const win = selectAnchoredWindow(chunks, ['ACME partnered with ZORPTECH'], 1500);
    assert(win.text.includes('ZORPTECH'), 'far ZORPTECH evidence pulled in despite ACME appearing in every head chunk');
    assert(
      classifyClaimEvidence('ACME ZORPTECH partnership', chunks, win.selectedOrders) === 'in_window',
      'ZORPTECH claim classified in_window after supplement'
    );
  }

  // ── Unit: classifyClaimEvidence ──
  console.log('--- classifyClaimEvidence (in/beyond/absent) ---');
  {
    const items = [];
    for (let i = 0; i < 5; i++) items.push({ text_content: `filler ${i} ${'x'.repeat(490)}` });
    items.push({ text_content: 'ZEBRACORP partnership with TestEntity confirmed.' });
    const chunks = chunkSources(items);
    const win = selectAnchoredWindow(chunks, ['ZEBRACORP partnership'], 1200);
    assert(
      classifyClaimEvidence('ZEBRACORP partnership', chunks, win.selectedOrders) === 'in_window',
      'anchored: ZEBRACORP claim classified in_window'
    );
    // A tiny head window that stops before the ZEBRACORP page => beyond_window.
    const headWin = selectAnchoredWindow(chunks.slice(0, 2), ['ZEBRACORP partnership'], 1200);
    assert(
      classifyClaimEvidence('ZEBRACORP partnership', chunks, headWin.selectedOrders) === 'beyond_window',
      'head window that drops the page => beyond_window (truncation artifact, not fabrication)'
    );
    assert(
      classifyClaimEvidence('NEVERMENTIONED Corp acquired Fictional', chunks, win.selectedOrders) === 'absent',
      'a fact absent from all source => absent (candidate fabrication)'
    );
  }

  // ── Unit: small-corpus IDF collapse must NOT emit false "absent" ──
  // With few chunks, every term can appear in ALL chunks -> idf 0 for all -> the
  // classifier would score 0 and wrongly call in-window evidence "absent" (a
  // confidently-wrong "candidate fabrication"). Evidence that is literally in the
  // shown window must classify in_window, not absent.
  console.log('--- classifyClaimEvidence small-corpus (no false absent) ---');
  {
    const oneChunk = chunkSources([{ text_content: 'ACME partnered with BOLTCORP to build widgets in 2021.' }]);
    const win = selectAnchoredWindow(oneChunk, ['ACME BOLTCORP partnership'], 5000);
    assert(win.text.includes('BOLTCORP'), 'single-chunk window contains the evidence');
    assert(
      classifyClaimEvidence('ACME BOLTCORP partnership', oneChunk, win.selectedOrders) === 'in_window',
      'evidence in the single shown chunk classifies in_window (not false absent)'
    );
    // A claim whose terms appear NOWHERE is still absent.
    assert(
      classifyClaimEvidence('QUUXTRON merger with ZILCH', oneChunk, win.selectedOrders) === 'absent',
      'a genuinely absent claim still classifies absent'
    );
  }

  // ── End-to-end: fat corpus, claim about a FAR page ──
  // Draft asserts a claim whose evidence is only on a late page. In head mode the
  // batch source omits it (truncated); in claim_anchored it is shown.
  const items = [
    { content_markdown: '# TestEntity\n\nTestEntity partnered with ZEBRACORP in 2019.' },
  ];
  for (let i = 0; i < 8; i++) items.push({ text_content: `Filler article ${i}. ${'y'.repeat(490)}` });
  items.push({ text_content: 'In 2019, ZEBRACORP signed a partnership with TestEntity for gaming content.' });
  const entity = { name: 'TestEntity', items };
  const smallBudget = { max_source_chars: 1500, claims_per_batch: 10 };

  console.log('--- end-to-end: head mode omits the far page (byte-identical contract) ---');
  {
    const tools = makeTools(() => 'unsupported'); // verdict irrelevant; we inspect source shown
    await execute({ entities: [entity] }, { ...smallBudget, source_selection: 'head' }, tools);
    const src = tools.seenSources.join('\n');
    assert(!src.includes('ZEBRACORP'), 'HEAD mode: far ZEBRACORP page is NOT in the verified window');
  }

  console.log('--- end-to-end: claim_anchored shows the far page + emits honesty meta ---');
  {
    const tools = makeTools(() => 'supported');
    const result = await execute({ entities: [entity] }, { ...smallBudget, source_selection: 'claim_anchored' }, tools);
    const src = tools.seenSources.join('\n');
    const meta = result.results[0].meta;
    assert(src.includes('ZEBRACORP'), 'CLAIM_ANCHORED: far ZEBRACORP page IS in the verified window');
    assert(typeof meta.source_corpus_chars === 'number' && meta.source_corpus_chars > 0, 'meta.source_corpus_chars reported');
    assert(typeof meta.source_chars_shown === 'number', 'meta.source_chars_shown reported');
    assert(meta.source_selection === 'claim_anchored', 'meta.source_selection tagged');
  }

  console.log('--- honesty meta ABSENT in head mode (byte-identity of default output) ---');
  {
    const tools = makeTools(() => 'supported');
    const result = await execute({ entities: [entity] }, { ...smallBudget, source_selection: 'head' }, tools);
    const meta = result.results[0].meta;
    assert(!('source_corpus_chars' in meta), 'head meta has NO source_corpus_chars');
    assert(!('source_selection' in meta), 'head meta has NO source_selection');
  }

  // ── Bug fix: allow_empty_content string coercion ──
  console.log('--- allow_empty_content:"false" fails closed (string-preset bug) ---');
  {
    const noContent = { name: 'Empty', items: [{ text_content: 'some source' }] };
    const tools = makeTools(() => 'supported');
    const result = await execute({ entities: [noContent] }, { allow_empty_content: 'false' }, tools);
    assert(result.results[0].items[0].qa_pass === false, '"false" string does NOT enable skip -- fails closed');
  }
  console.log('--- allow_empty_content:"true" skips with pass ---');
  {
    const noContent = { name: 'Empty', items: [{ text_content: 'some source' }] };
    const tools = makeTools(() => 'supported');
    const result = await execute({ entities: [noContent] }, { allow_empty_content: 'true' }, tools);
    assert(result.results[0].items[0].qa_pass === true, '"true" string enables skip with pass');
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
})();
