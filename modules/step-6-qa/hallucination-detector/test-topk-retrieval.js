/**
 * Test harness for the top-K anchored supplement + repaired in_window instrument.
 *
 * Run: node modules/step-6-qa/hallucination-detector/test-topk-retrieval.js
 * No network.
 *
 * The defect (FABRICATIONS_AND_FLAGS.md §B1, 27 specimens, run 9821ed56): the
 * anchored supplement pulled only the SINGLE best IDF chunk per claim, so a decoy
 * chunk that shares many generic terms with the claim outranked the short page that
 * actually states the fact -- the true support was never shown (23/27 specimens),
 * the verifier correctly could not verify, and the claim was flagged. Meanwhile
 * classifyClaimEvidence labelled every flag `in_window` because it credited ANY
 * selected chunk sharing ANY single discriminating term -- a decoy satisfied it.
 *
 * The fix: (a) top-K supplement with tiered budget fill + tokenization repairs
 * (possessive stems, digit-led tokens); (b) in_window now means "ALL of the claim's
 * top-K candidate chunks were shown", so a decoy alone can no longer produce it.
 */

const {
  extractClaimTerms,
  chunkSources,
  selectAnchoredWindow,
  classifyClaimEvidence,
  topChunksForClaim,
} = require('./execute.js');

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { console.log(`  PASS: ${msg}`); pass++; }
  else { console.log(`  FAIL: ${msg}`); fail++; }
}

// ── Tokenization: possessive stems (the SoftSwiss's -> softswiss specimen class) ──
console.log('--- extractClaimTerms: possessive stems ---');
{
  const terms = extractClaimTerms("Operators reach the catalogue through SoftSwiss's Game Aggregator");
  assert(terms.get('softswiss') === 2, "possessive SoftSwiss's also yields stem 'softswiss' (weight 2)");
  assert(terms.has("softswiss's"), 'the original possessive token is kept too');
  const t2 = extractClaimTerms("the operators' licence");
  assert(t2.has('operators'), "trailing bare apostrophe (operators') yields stem");
}

// ── Tokenization: digit-led alphanumeric tokens (the 1X2 / 13.8ms specimen class) ──
console.log('--- extractClaimTerms: digit-led tokens ---');
{
  const terms = extractClaimTerms('1X2 Network is integrated into the platform');
  assert(terms.get('1x2') === 2, "digit-led '1X2' is a weight-2 term (was dropped entirely)");
  const t2 = extractClaimTerms('responds to API calls in 13.8ms');
  assert(t2.get('8ms') === 2, "'13.8ms' yields the '8ms' token so the phrase is matchable");
}

// ── topChunksForClaim: deterministic ranking, earliest-wins tie-break ──
console.log('--- topChunksForClaim ---');
{
  const chunks = chunkSources([
    { text_content: `nothing relevant here ${'x'.repeat(200)}` },
    { text_content: 'ZEBRACORP builds widgets with QUANTIFOO systems.' },
    { text_content: 'ZEBRACORP builds widgets with QUANTIFOO systems.' }, // identical -> tie
    { text_content: 'ZEBRACORP mentioned once.' },
  ]);
  const top = topChunksForClaim('ZEBRACORP QUANTIFOO widgets', chunks, undefined, 3);
  assert(top.length === 3, 'returns up to K scored chunks');
  assert(top[0].chunk.order === 1, 'tie between identical chunks broken by earliest order');
  assert(top[0].score >= top[1].score && top[1].score >= top[2].score, 'sorted by score desc');
}

// ── The decoy defect: a term-rich decoy must no longer eclipse the true support ──
// The decoy shares a SUPERSET of the claim's terms (a listing page naming the fact's
// terms among many states) and sits EARLIER in the corpus, so it outranks the true
// page at top-1 — this fixture FAILS under the old single-best supplement (verified
// against the pre-change execute.js) and under a K=1 regression.
console.log('--- selectAnchoredWindow: top-K pulls true support past a decoy ---');
{
  const items = [];
  // head filler (no overlap)
  for (let i = 0; i < 4; i++) items.push({ text_content: `neutral head filler ${i} ${'z'.repeat(430)}` });
  // DECOY: superset-term listing page (does not state the specific fact usably)
  items.push({ text_content: 'ACME licence overview: USA operations. ACME holds a licence in New Jersey, Michigan, Pennsylvania and West Virginia markets. Revenue-share and flat-fee arrangements vary by state. Holds multiple approvals.' });
  // TRUE support: short page stating the fact
  items.push({ text_content: 'ACME holds a revenue-share licence in New Jersey.' });
  const chunks = chunkSources(items);
  const claim = 'ACME holds a revenue-share licence in New Jersey, USA.';
  const top = topChunksForClaim(claim, chunks);
  assert(top[0].chunk.order === 4, 'fixture is discriminating: the DECOY is rank-1 (top-1 would show only it)');
  assert(top.some(t => t.chunk.order === 5), 'the true page ranks within top-K');
  const win = selectAnchoredWindow(chunks, [claim], 2200);
  assert(win.text.includes('ACME holds a revenue-share licence in New Jersey.'), 'the true supporting page is IN the window (top-K, not top-1)');
}

// ── Head-decoy suppression: a best-scoring HEAD chunk must not suppress the supplement ──
// The head decoy shares a superset of the claim's terms, so it is rank-1; the old
// code pulled NO supplement when the best chunk sat in the head (verified failing
// against the pre-change execute.js).
console.log('--- selectAnchoredWindow: head decoy no longer suppresses far support ---');
{
  const items = [];
  // head DECOY: superset of the claim's terms, sits in head
  items.push({ text_content: 'JamBox awards hub: JamBox 2 nominees, Game of the Year shortlists, SiGMA Europe Awards coverage, SiGMA winners by year, awards won across categories.' });
  for (let i = 0; i < 3; i++) items.push({ text_content: `neutral filler ${i} ${'q'.repeat(430)}` });
  // far TRUE support
  items.push({ text_content: 'JamBox 2 won Game of the Year at the SiGMA Europe Awards.' });
  const chunks = chunkSources(items);
  const claim = 'JamBox 2 won Game of the Year at the SiGMA Europe Awards';
  const top = topChunksForClaim(claim, chunks);
  assert(top[0].chunk.order === 0, 'fixture is discriminating: the HEAD decoy is rank-1 (old code pulled no supplement)');
  const win = selectAnchoredWindow(chunks, [claim], 1500);
  assert(win.text.includes('JamBox 2 won Game of the Year'), 'far true support pulled even when a head chunk scores highest');
}

// ── Tiered budget fill: every claim's rank-1 chunk beats any claim's rank-2 ──
console.log('--- selectAnchoredWindow: tiered fill under tight budget ---');
{
  const items = [];
  for (let i = 0; i < 2; i++) items.push({ text_content: `head filler ${i} ${'h'.repeat(430)}` });
  items.push({ text_content: `AARDVARK subsystem details ${'a'.repeat(3000)}` });          // claim A rank-2 (big)
  items.push({ text_content: 'AARDVARK powers the BANTAMWORKS platform integration.' });   // claim A rank-1
  items.push({ text_content: 'CATAPULTCO announced the DELTAFORGE acquisition in 2022.' }); // claim B rank-1
  const chunks = chunkSources(items);
  const claims = ['AARDVARK powers BANTAMWORKS', 'CATAPULTCO acquired DELTAFORGE in 2022'];
  // budget fits head + the two rank-1 chunks, NOT the 3000-char rank-2
  const win = selectAnchoredWindow(chunks, claims, 1100);
  assert(win.text.includes('BANTAMWORKS platform'), "claim A's rank-1 chunk is in");
  assert(win.text.includes('DELTAFORGE acquisition'), "claim B's rank-1 chunk is in");
  assert(!win.text.includes('subsystem details'), 'the oversized rank-2 chunk did not displace a rank-1');
}

// ── The repaired instrument: a decoy alone must NOT produce in_window ──
console.log('--- classifyClaimEvidence: decoy-only window is beyond_window, not in_window ---');
{
  const items = [];
  for (let i = 0; i < 4; i++) items.push({ text_content: `neutral filler ${i} ${'z'.repeat(430)}` });
  items.push({ text_content: `ACME licence overview: markets, revenue, share, operators, licence types ${'d'.repeat(300)}` }); // decoy
  items.push({ text_content: 'ACME holds a revenue-share licence in New Jersey.' }); // true support
  const chunks = chunkSources(items);
  const claim = 'ACME holds a revenue-share licence in New Jersey, USA.';
  // Simulate the OLD top-1 selection: window = head + decoy only (order 4), support (order 5) excluded.
  const oldStyleSelected = new Set([0, 1, 2, 3, 4]);
  assert(
    classifyClaimEvidence(claim, chunks, oldStyleSelected) === 'beyond_window',
    'window holding only the decoy classifies beyond_window (the old code said in_window here)'
  );
  // With ALL the claim's top-K candidates shown -> in_window.
  const allSelected = new Set(chunks.map(c => c.order));
  assert(
    classifyClaimEvidence(claim, chunks, allSelected) === 'in_window',
    'window holding all top-K candidates classifies in_window'
  );
}

// ── absent semantics unchanged (load-bearing for severity_model=evidence_absent) ──
console.log('--- classifyClaimEvidence: absent unchanged ---');
{
  const chunks = chunkSources([
    { text_content: `ACME company overview ${'x'.repeat(400)}` },
    { text_content: `ACME products page ${'y'.repeat(400)}` },
  ]);
  const win = selectAnchoredWindow(chunks, ['QUUXTRON merger with ZILCH'], 2000);
  assert(
    classifyClaimEvidence('QUUXTRON merger with ZILCH', chunks, win.selectedOrders) === 'absent',
    'wholesale-invention claim still classifies absent'
  );
}

// ── Byte-identity: evidence already in head -> window identical to head (no supplement) ──
console.log('--- byte-identity: all evidence in head -> no supplement, window == head ---');
{
  const items = [
    { text_content: 'ACME partnered with BOLTCORP to build widgets in 2021.' },
    { text_content: `background page ${'b'.repeat(430)}` },
  ];
  const chunks = chunkSources(items);
  const win = selectAnchoredWindow(chunks, ['ACME BOLTCORP partnership 2021'], 5000);
  const headText = chunks.map(c => c.text).join('\n\n---SOURCE BOUNDARY---\n\n');
  assert(win.suppText === '', 'no supplement when evidence is in the head');
  assert(win.text === headText, 'window text is byte-identical to the head window');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
