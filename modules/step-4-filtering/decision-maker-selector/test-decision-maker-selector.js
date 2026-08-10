/**
 * Test harness for decision-maker-selector v1.0.0.
 * Run: node modules/step-4-filtering/decision-maker-selector/test-decision-maker-selector.js
 *
 * Covers B3/B6:
 *   - word-boundary regex: CTO must NOT match "director"/"factory"; CEO exact matches
 *   - acronym AND spelled-out forms (CEO/Chief Executive, CTO/Chief Technology, ...)
 *   - Head of X (generic), VP X, Director of X, Founder / Co-Founder
 *   - the three roles the probe's narrow tokens missed: Head of Content / Frontend / Technical Support
 *   - drops: null / empty / emoji-only / slogan / multilingual (no false positive)
 *   - diagnosability: every match reports the pattern that caught it
 *   - configurability: custom role list changes what is selected (nothing hardcoded)
 *   - precision guards: Manager / Specialist / bare "Director at" are NOT decision-makers
 *   - roster proof: full 76-record Vegangster roster -> precision & recall
 *   - execute() pipeline contract: pool items in -> selected items annotated, non-matches dropped
 */

const path = require('path');
const mod = require('./execute.js');
const { matchTitle, buildRolePatterns, selectDecisionMakers, DEFAULT_ROLES } = mod;
const execute = mod;
const roster = require('./fixtures/vegangster-roster.json');

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { console.log(`  PASS: ${msg}`); pass++; }
  else { console.log(`  FAIL: ${msg}`); fail++; }
}

const P = buildRolePatterns(DEFAULT_ROLES);
const m = (title) => matchTitle(title, P);

console.log('\n-- word-boundary acronym safety --');
assert(m('CTO').matched === true, 'CTO matches "CTO"');
assert(m('Director at Vegangsters').matched === false, 'CTO does NOT match "Director at Vegangsters" (dire[cto]r trap)');
assert(m('Factory manager').matched === false, 'CTO does NOT match "Factory manager" (fa[cto]ry trap)');
assert(m('CEO and Co-Founder @Vegangster').matched === true, 'CEO matches "CEO and Co-Founder"');
assert(m('Our new CMO joins us').matched === true, 'CMO matches with surrounding words');

console.log('\n-- spelled-out forms --');
assert(m('Chief Technology Officer').role === 'CTO', 'Chief Technology Officer -> CTO role');
assert(m('Chief Marketing Officer').role === 'CMO', 'Chief Marketing Officer -> CMO role');
assert(m('Chief Product Officer').role === 'CPO', 'Chief Product Officer -> CPO role');
assert(m('Senior Vice President, Growth').role === 'VP', 'Vice President -> VP role');

console.log('\n-- Head of X / VP X / Director of X / Founder --');
assert(m('Head of Content | Copywriting | Management').matched === true, 'Head of Content matches (probe MISS #1)');
assert(m('Head of Frontend Department / Senior Software Engineer').matched === true, 'Head of Frontend matches (probe MISS #2)');
assert(m('Head of Technical Support at Vegangster').matched === true, 'Head of Technical Support matches (probe MISS #3)');
assert(m('VP Marketing').role === 'VP', 'VP Marketing -> VP');
assert(m('Director of Engineering').role === 'Director', 'Director of Engineering -> Director');
assert(m('Co-Founder & CEO').matched === true, 'Co-Founder matches');

console.log('\n-- drops: null / empty / emoji / slogan / multilingual --');
assert(m(null).matched === false, 'null position dropped');
assert(m('').matched === false, 'empty position dropped');
assert(m('   ').matched === false, 'whitespace-only position dropped');
assert(m('🦘').matched === false, 'emoji-only position dropped');
assert(m('Goals are dreams with deadlines').matched === false, 'slogan dropped');
assert(m('Creative director på Oatly').matched === false, 'multilingual "director" not a false CTO positive');
assert(m('Технічний директор').matched === false, 'Cyrillic title -> no false positive (known multilingual miss)');

console.log('\n-- precision guards (not decision-makers) --');
assert(m('Senior Product Manager in Fintech, Crypto & Gambling').matched === false, 'Senior Product Manager NOT selected');
assert(m('Product Manager at Vegangster').matched === false, 'Product Manager NOT selected');
assert(m('SEO Specialist in iGaming').matched === false, 'Specialist NOT selected');
assert(m('Lead Project Manager').matched === false, 'Lead Project Manager NOT selected');

console.log('\n-- diagnosability: report the pattern that caught it --');
const hit = m('Head of Technical Support at Vegangster');
assert(typeof hit.pattern === 'string' && /Head of/i.test(hit.pattern), `match reports the catching pattern (got: ${hit.pattern})`);
const hit2 = m('CTO');
assert(hit2.pattern && /CTO/i.test(hit2.pattern), `CTO match reports pattern (got: ${hit2.pattern})`);

console.log('\n-- configurability: custom role list changes behavior --');
const founderOnly = buildRolePatterns([{ role: 'Founder', patterns: ['Founder'] }]);
assert(matchTitle('Head of Content', founderOnly).matched === false, 'custom {Founder-only} config does NOT match Head of Content');
assert(matchTitle('Co-Founder', founderOnly).matched === true, 'custom {Founder-only} config still matches Founder');

console.log('\n-- ROSTER PROOF: 76-record Vegangster roster --');
const GROUND_TRUTH = new Set([
  'Daria Trubachova',   // Head of Recruitment
  'Mariana Dovhalenko', // Head of Design
  'Yurii Polishchuk',   // Head of Technical Support (probe miss)
  'Mykola Ptushchuk',   // Head of Frontend Department (probe miss)
  'Maxim C.',           // CEO and Co-Founder
  'Aziza Strogonova',   // Head of Marketing and PR
  'Olga Ribkina',       // Head of Content (probe miss)
]);
const selected = selectDecisionMakers(roster, { roles: DEFAULT_ROLES, titleField: 'position' });
const selectedNames = new Set(selected.map((r) => r.name));
const falsePositives = [...selectedNames].filter((n) => !GROUND_TRUTH.has(n));
const misses = [...GROUND_TRUTH].filter((n) => !selectedNames.has(n));
const precision = selected.length ? (selected.length - falsePositives.length) / selected.length : 0;
const recall = GROUND_TRUTH.size ? (GROUND_TRUTH.size - misses.length) / GROUND_TRUTH.size : 0;
console.log(`  selected ${selected.length} of ${roster.length}; FP=${JSON.stringify(falsePositives)}; miss=${JSON.stringify(misses)}`);
console.log(`  precision=${precision.toFixed(3)} recall=${recall.toFixed(3)}`);
selected.forEach((r) => console.log(`    [${r.matched_role}] ${r.name} -- "${r.position}"  (pattern: ${r.matched_pattern})`));
assert(falsePositives.length === 0, 'roster proof: zero false positives');
assert(misses.length === 0, 'roster proof: zero misses (all 7 decision-makers found)');
assert(precision === 1 && recall === 1, 'roster proof: precision & recall = 1.0');

console.log('\n-- recall win vs probe narrow tokens --');
const narrowProbe = buildRolePatterns([
  { role: 'Head', patterns: ['Head of Product', 'Head of Marketing', 'Head of Engineering', 'Head of Content Marketing'] },
  { role: 'CEO', patterns: ['CEO'] }, { role: 'Founder', patterns: ['Founder'] },
]);
const narrowSelected = selectDecisionMakers(roster, { roles: null, titleField: 'position', _patterns: narrowProbe });
const narrowNames = new Set(narrowSelected.map((r) => r.name));
assert(!narrowNames.has('Olga Ribkina'), 'narrow probe tokens MISS Head of Content (as reported)');
assert(!narrowNames.has('Mykola Ptushchuk'), 'narrow probe tokens MISS Head of Frontend (as reported)');
assert(!narrowNames.has('Yurii Polishchuk'), 'narrow probe tokens MISS Head of Technical Support (as reported)');
assert(selectedNames.has('Olga Ribkina') && selectedNames.has('Mykola Ptushchuk') && selectedNames.has('Yurii Polishchuk'),
  'generic "Head of X" selector CATCHES all three the probe missed');

console.log('\n-- execute() pipeline contract --');
(async () => {
  const items = [
    { url: 'u1', title: 'CEO and Co-Founder', data_json: '{}' },
    { url: 'u2', title: 'Backend Developer', data_json: '{}' },
    { url: 'u3', title: null, data_json: '{}' },
    { url: 'u4', title: 'Head of Content', data_json: '{}' },
  ];
  const logger = { info: () => {}, warn: () => {}, error: () => {} };
  const out = await execute({ entities: [{ name: 'Acme', items }] }, { roles: DEFAULT_ROLES }, { logger, progress: { update: () => {} } });
  const kept = out.results[0].items;
  assert(kept.length === 2, `execute keeps only the 2 decision-makers (got ${kept.length})`);
  assert(kept.every((i) => i.matched_role && i.matched_pattern), 'execute annotates kept items with matched_role + matched_pattern');
  assert(kept.some((i) => i.title === 'CEO and Co-Founder') && kept.some((i) => i.title === 'Head of Content'), 'execute kept the right two');

  const empty = await execute({ entities: [{ name: 'Empty', items: [] }] }, { roles: DEFAULT_ROLES }, { logger, progress: { update: () => {} } });
  assert(empty.results[0].items.length === 0, 'execute on empty items -> empty selection');

  console.log(`\n=== assertions: ${pass} passed, ${fail} failed ===`);
  process.exit(fail === 0 ? 0 : 1);
})();
