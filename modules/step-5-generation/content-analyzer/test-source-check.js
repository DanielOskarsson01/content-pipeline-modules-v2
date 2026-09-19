/**
 * Standalone test harness for content-analyzer S1 — the deterministic
 * source-check gate (v1.7.0, `source_check` option, default OFF).
 *
 * Run: node modules/step-5-generation/content-analyzer/test-source-check.js
 * From repo root. No network — ai.complete is mocked.
 *
 * The gate is CURRENCY cite-or-null ONLY (see execute.js S1 block / manifest
 * usage_notes for why the date and subject/relation classes were built, tested
 * against the real run-9821ed56 analyses, and left out). Covers:
 *   - MONEY cite-or-null: an amount whose claimed currency is not adjacent to it
 *     on the cited page removes the whole element; "£50m" flagged when the page
 *     says "€50m"; "compound" does NOT count as GBP; €/$ facts pass.
 *   - Recursive, path-agnostic walk; source_citations (url, not source) untouched.
 *   - Date-only / subject facts pass through untouched (out of scope by design).
 *   - Uncheckable when the cited page is absent from the window / amount absent.
 *   - execute(): default OFF is BYTE-IDENTICAL; ON records meta.source_check with
 *     counts + violations and keeps the offending fact out of analysis_json.
 */

const execute = require('./execute.js');
const MANIFEST = require('./manifest.json');
const T = execute.__testing;

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { console.log(`  PASS: ${msg}`); pass++; }
  else { console.log(`  FAIL: ${msg}`); fail++; }
}

function makeTools(analysisObj) {
  const logs = [];
  let aiCalls = 0;
  return {
    logs,
    get aiCalls() { return aiCalls; },
    logger: { info: m => logs.push(m), warn: m => logs.push(m), error: m => logs.push(m) },
    progress: { update: () => {} },
    ai: { complete: async () => { aiCalls++; return { text: JSON.stringify(analysisObj) }; } },
    _partialItems: [],
  };
}

// ---------------------------------------------------------------------------
console.log('\n=== Manifest sanity ===');
assert(/^\d+\.\d+\.\d+$/.test(MANIFEST.version), `manifest version is semver (${MANIFEST.version})`);
assert(MANIFEST.options.some(o => o.name === 'source_check'), 'source_check option present');
assert(MANIFEST.options_defaults.source_check === false, 'source_check default is false');

// ---------------------------------------------------------------------------
console.log('\n=== currency parse + proximity ===');
const money = T.parseMoneyExpressions('Launch of £50m cost-efficiency program and reduction of 300+ employees (15% of workforce)');
assert(money.length === 1 && money[0].currency === 'GBP', 'parsed one GBP money expression from "£50m ..."');
const euroPage = 'restructuring is part of a larger €50m cost reduction programme aiming for a revenue compound annual growth rate';
{ const r = T.currencyNearAmount(euroPage, 'GBP', money[0].amountRe); assert(r.sawAmount && !r.found, '£ claim: amount 50m present but GBP not adjacent (compound ≠ pound) → violation'); }
{ const r = T.currencyNearAmount(euroPage, 'EUR', T.parseMoneyExpressions('€50m')[0].amountRe); assert(r.sawAmount && r.found, '€ claim on €50m page → satisfied (no violation)'); }
{ const r = T.currencyNearAmount('company hired 50 million users worldwide', 'GBP', T.parseMoneyExpressions('£50 million')[0].amountRe); assert(r.sawAmount && !r.found, '"50 million users" (no currency) → £ not found'); }
{ const r = T.currencyNearAmount('turnover of $58 million (USD 58m) last year', 'USD', T.parseMoneyExpressions('$58m')[0].amountRe); assert(r.sawAmount && r.found, '$ claim on $58m page → satisfied'); }
assert(T.parseMoneyExpressions('reduction of 300+ employees (15% of workforce)').length === 0, 'no currency marker → no money expression (300+/15% ignored)');
assert(T.parseMoneyExpressions('£5 minimum deposit and $10 bonus').length === 0, 'bare-number currency amounts (£5/$10) skipped — magnitude required (no FP on "5 free spins")');
assert(T.parseMoneyExpressions('£50m and €2bn and $500k').length === 3, 'magnitude-bearing amounts (m/bn/k) parsed');

// ---------------------------------------------------------------------------
console.log('\n=== runSourceCheck: currency catch + out-of-scope pass-through (path-agnostic) ===');
const PX = 'https://igb.example/pariurix-deal';         // undated page (no year)
const NEXT = 'https://next.io/bc-q3-2024';              // €50m page
const DINO = 'https://push.example/rolls-out-romania';  // has Dinopolis, not the category

const analysis = {
  milestones: [
    { date: '2016', event: 'Acquisition of Romanian affiliate platform PariuriX', source: PX },   // date class OUT of scope → untouched
    { date: '2024-10', event: 'Launch of £50m cost-efficiency program', source: NEXT },           // £ substitution → remove
    { date: '2019-05', event: 'Launched Live Casino for €30m budget', source: NEXT },             // € fact, € on page → kept
  ],
  key_facts: {
    awards: [
      { detail: 'Best High Volatility Game (Dinopolis), Casino Beats Game Developer Awards, 2021', source: DINO }, // subject weld OUT of scope → untouched
    ],
  },
  source_citations: [{ index: 1, url: PX, title: 'x' }], // url not source → untouched
};
const items = [
  { url: PX, text_content: 'Better Collective has expanded into Romania with the acquisition of PariuriX. No date given anywhere.' },
  { url: NEXT, text_content: euroPage },
  { url: DINO, text_content: 'Push Gaming rolls out in Romania. Dinopolis is one of our top titles in 2021.' },
];

const sc = T.runSourceCheck(analysis, items);
const ms = sc.cleaned.milestones;
assert(!ms.some(m => /£50m/.test(m.event)), '£50m milestone REMOVED (currency substitution)');
assert(ms.some(m => /PariuriX/.test(m.event) && m.date === '2016'), 'PariuriX untouched (date class out of scope)');
assert(ms.some(m => /Live Casino/.test(m.event)), '€30m milestone kept (€ present, no substitution)');
assert(sc.cleaned.key_facts.awards.length === 1, 'Dinopolis award untouched (subject weld out of scope)');
assert(sc.cleaned.source_citations.length === 1, 'source_citations untouched (url, not source)');
assert(sc.stats.removed === 1, 'stats: exactly 1 element removed');
assert(sc.violations.length === 1 && sc.violations[0].kind === 'currency', 'exactly 1 currency violation recorded');
assert(sc.violations[0].source === NEXT && /GBP/.test(sc.violations[0].reason), 'violation carries source + GBP reason');
assert(analysis.milestones.length === 3, 'input analysis NOT mutated (returns new structure)');

console.log('\n=== uncheckable: cited page not in window / amount absent ===');
{
  const a = { milestones: [{ event: '£99m deal', source: 'https://missing.example/p' }] };
  const r = T.runSourceCheck(a, []); // empty window
  assert(r.stats.uncheckable === 1 && r.stats.removed === 0, 'page absent from window → uncheckable, never flagged');
}
{
  const a = { milestones: [{ event: 'raised £5m', source: 'https://p.example' }] };
  const r = T.runSourceCheck(a, [{ url: 'https://p.example', text_content: 'A press release with no monetary figures at all.' }]);
  assert(r.stats.removed === 0, 'amount not on cited page → uncheckable, not removed');
}

// ---------------------------------------------------------------------------
console.log('\n=== execute(): byte-identity OFF, meta ON ===');
const base = { ...MANIFEST.options_defaults };
const entity = { name: 'BC', items };

(async () => {
  const rOffDefault = await execute({ entities: [entity] }, { ...base }, makeTools(analysis));
  const rOffExplicit = await execute({ entities: [entity] }, { ...base, source_check: false }, makeTools(analysis));
  assert(JSON.stringify(rOffDefault.results[0]) === JSON.stringify(rOffExplicit.results[0]), 'source_check:false ≡ absent (byte-identical)');
  assert(!('source_check' in rOffDefault.results[0].meta), 'OFF: no source_check key on meta');
  assert(rOffDefault.results[0].items[0].analysis_json.milestones.length === 3, 'OFF: all milestones pass through untouched');

  const rOn = await execute({ entities: [entity] }, { ...base, source_check: true }, makeTools(analysis));
  const meta = rOn.results[0].meta;
  const aj = rOn.results[0].items[0].analysis_json;
  assert(meta.source_check && meta.source_check.checked === 4, 'ON: meta.source_check.checked = 4 cited facts');
  assert(meta.source_check.removed === 1, 'ON: meta counts 1 removal');
  assert(meta.source_check.violations.length === 1, 'ON: 1 violation on meta');
  assert(!aj.milestones.some(m => /£50m/.test(m.event)), 'ON: £50m milestone absent from analysis_json (never reaches writer)');
  assert(aj.milestones.some(m => m.date === '2016'), 'ON: out-of-scope date fact preserved in analysis_json');

  console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'}: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
