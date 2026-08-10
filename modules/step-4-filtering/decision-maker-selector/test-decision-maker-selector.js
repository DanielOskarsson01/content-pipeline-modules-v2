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

console.log('\n-- COMPANY ANCHOR: reject titles naming a non-target org --');
const { buildCompanyAliases, passesCompanyAnchor, isCreativeTitle } = mod;
// Alias set derived from a Pragmatic Play roster (name variants + id) — never hardcoded.
const PP_ALIASES = buildCompanyAliases(
  [
    { current_company_name: 'Pragmatic Play', current_company_company_id: 'pragmatic-play' },
    { current_company_name: 'ARRISE powering Pragmatic Play', current_company_company_id: 'arrise' },
  ],
  'current_company_name', 'current_company_company_id',
);
// The six false positives from the live Pragmatic Play roster — all name a NON-target org.
assert(passesCompanyAnchor('Founder of SR Collection', PP_ALIASES) === false, 'anchor rejects "Founder of SR Collection"');
assert(passesCompanyAnchor('Founder of pingwit.pl', PP_ALIASES) === false, 'anchor rejects "Founder of pingwit.pl"');
assert(passesCompanyAnchor('Founder & R&D Consultant at BitElectric Systems', PP_ALIASES) === false, 'anchor rejects "...at BitElectric Systems"');
assert(passesCompanyAnchor('Founder & Lead Artist of Vanciu Artworks', PP_ALIASES) === false, 'anchor rejects "...of Vanciu Artworks"');
assert(passesCompanyAnchor('Vice President, Head of Tax & Customs, The LEGO Group', PP_ALIASES) === false, 'anchor rejects trailing "The LEGO Group"');
assert(passesCompanyAnchor('Head of Sportsbook and Platform QA at RokkerX', PP_ALIASES) === false, 'anchor rejects "...at RokkerX"');
// Genuine employees survive: no org named, the target named, or an ALIAS named.
assert(passesCompanyAnchor('Chief Executive Officer', PP_ALIASES) === true, 'anchor keeps "Chief Executive Officer" (no org named)');
assert(passesCompanyAnchor('Head of Content', PP_ALIASES) === true, 'anchor keeps "Head of Content" ("of X" is a department, not an org)');
assert(passesCompanyAnchor('Director of Engineering', PP_ALIASES) === true, 'anchor keeps "Director of Engineering" (department)');
assert(passesCompanyAnchor('Founder', PP_ALIASES) === true, 'anchor keeps a bare "Founder" (does NOT down-weight Founder)');
assert(passesCompanyAnchor('Co-Founder & CEO of Pragmatic Play', PP_ALIASES) === true, 'anchor keeps "...of Pragmatic Play" (target)');
assert(passesCompanyAnchor('Head of Legal at ARRISE powering Pragmatic Play', PP_ALIASES) === true, 'anchor keeps the "ARRISE powering Pragmatic Play" alias');
// Vegangster's own decision-makers name the target in-title — must survive.
const VG_ALIASES = buildCompanyAliases(
  [{ current_company_name: 'Vegangster', current_company_company_id: 'vegangster-team' },
   { current_company_name: 'Vegangsters', current_company_company_id: null }],
  'current_company_name', 'current_company_company_id',
);
assert(passesCompanyAnchor('Head of Marketing and PR at Vegangster', VG_ALIASES) === true, 'anchor keeps "...at Vegangster" (target)');
assert(passesCompanyAnchor('CEO and Co-Founder @Vegangster', VG_ALIASES) === true, 'anchor keeps "@Vegangster" (target)');

console.log('\n-- CREATIVE-TITLE FILTER (separate failure mode) --');
assert(isCreativeTitle('Director of Photography&Cinematographer') === true, 'creative filter catches "Director of Photography&Cinematographer"');
assert(isCreativeTitle('Cinematographer') === true, 'creative filter catches "Cinematographer"');
assert(isCreativeTitle('Head of Content') === false, 'creative filter does NOT catch "Head of Content"');
assert(isCreativeTitle('Chief Product Officer') === false, 'creative filter does NOT catch "Chief Product Officer"');

console.log('\n-- ANCHOR + CREATIVE end-to-end on a synthetic Pragmatic Play roster --');
const PP_ROSTER = [
  { name: 'Genuine CEO',      position: 'Chief Executive Officer',                    current_company_name: 'Pragmatic Play', current_company_company_id: 'pragmatic-play' },
  { name: 'Alias Head',       position: 'Head of Legal at ARRISE powering Pragmatic Play', current_company_name: 'ARRISE powering Pragmatic Play', current_company_company_id: 'arrise' },
  { name: 'Bare Founder',     position: 'Founder',                                    current_company_name: 'Pragmatic Play', current_company_company_id: 'pragmatic-play' },
  { name: 'Target Founder',   position: 'Co-Founder & CEO of Pragmatic Play',         current_company_name: 'Pragmatic Play', current_company_company_id: 'pragmatic-play' },
  { name: 'FP SR',            position: 'Founder of SR Collection',                   current_company_name: 'Pragmatic Play', current_company_company_id: 'pragmatic-play' },
  { name: 'FP pingwit',       position: 'Founder of pingwit.pl',                      current_company_name: 'Pragmatic Play', current_company_company_id: 'pragmatic-play' },
  { name: 'FP BitElectric',   position: 'Founder & R&D Consultant at BitElectric Systems', current_company_name: 'Pragmatic Play', current_company_company_id: 'pragmatic-play' },
  { name: 'FP Vanciu',        position: 'Founder & Lead Artist of Vanciu Artworks',   current_company_name: 'Pragmatic Play', current_company_company_id: 'pragmatic-play' },
  { name: 'FP LEGO',          position: 'Vice President, Head of Tax & Customs, The LEGO Group', current_company_name: 'Pragmatic Play', current_company_company_id: 'pragmatic-play' },
  { name: 'FP RokkerX',       position: 'Head of Sportsbook and Platform QA at RokkerX', current_company_name: 'Pragmatic Play', current_company_company_id: 'pragmatic-play' },
  { name: 'FP Photography',   position: 'Director of Photography&Cinematographer',     current_company_name: 'Pragmatic Play', current_company_company_id: 'pragmatic-play' },
];
const rejections = [];
const ppSel = selectDecisionMakers(PP_ROSTER, { roles: DEFAULT_ROLES, titleField: 'position', _rejections: rejections });
const ppNames = new Set(ppSel.map((r) => r.name));
assert(ppSel.length === 4, `anchor+creative keep the 4 genuine (got ${ppSel.length}: ${[...ppNames].join(', ')})`);
assert(ppNames.has('Bare Founder') && ppNames.has('Target Founder'), 'genuine Founders survive (no Founder down-weighting)');
assert(!ppNames.has('FP SR') && !ppNames.has('FP RokkerX') && !ppNames.has('FP LEGO'), 'org-naming false positives dropped');
assert(!ppNames.has('FP Photography'), 'creative "Director of Photography" dropped');
assert(rejections.filter((r) => r.rejected_by === 'company_anchor').length === 6, 'exactly 6 rejected by the company anchor');
assert(rejections.filter((r) => r.rejected_by === 'creative_title').length === 1, 'exactly 1 rejected by the creative filter (diagnosable separately)');
// Toggle the anchor off -> the 6 org matches leak back, proving the anchor is
// what fixed them. Creative is independent (stays on), so Photography stays dropped: 4+6=10.
const ppNoAnchor = selectDecisionMakers(PP_ROSTER, { roles: DEFAULT_ROLES, titleField: 'position', companyAnchor: false });
assert(ppNoAnchor.length === 10, `companyAnchor:false leaks the 6 org matches back; creative still drops Photography (got ${ppNoAnchor.length})`);

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

console.log('\n-- execute() emits a single entity-keyed leadership roster item (ADD) --');
(async () => {
  const MANIFEST = require('./manifest.json');
  const logger = { info: () => {}, warn: () => {}, error: () => {} };
  const items = [
    { url: 'u1', name: 'Jane Boss', title: 'CEO and Co-Founder', data_json: '{}' },
    { url: 'u2', name: 'Bob Dev',   title: 'Backend Developer',  data_json: '{}' },
    { url: 'u3', name: 'Nobody',    title: null,                  data_json: '{}' },
    { url: 'u4', name: 'Amy Lead',  title: 'Head of Content',     data_json: '{}' },
  ];
  const out = await execute({ entities: [{ name: 'Acme', items }] }, { roles: DEFAULT_ROLES }, { logger, progress: { update: () => {} } });
  const emitted = out.results[0].items;

  // Roster shape: exactly ONE item (the roster), not the per-person rows.
  assert(emitted.length === 1, `execute emits exactly one roster item, not per-person rows (got ${emitted.length})`);
  const roster = emitted[0];

  // Entity key: the item is keyed on entity_name, and the manifest declares item_key so the
  // pool `add` keys on (entity_name, source_submodule) rather than the default 'url' (absent → dropped).
  assert(roster.entity_name === 'Acme', 'roster item is keyed on entity_name');
  assert(MANIFEST.item_key === 'entity_name', 'manifest item_key is entity_name');

  // Roster prose: a heading the writer reads as leadership info + one "Name — Title" line per
  // decision-maker (the CEO and the Head of Content — not the developer or the null-title row).
  assert(typeof roster.text_content === 'string' && roster.text_content.length > 0, 'roster carries text_content prose');
  assert(/^Leadership team at Acme \(key decision-makers\):/.test(roster.text_content), 'roster text_content opens with the leadership heading');
  assert(roster.text_content.includes('Jane Boss — CEO and Co-Founder'), 'roster lists "Name — Title" for the CEO');
  assert(roster.text_content.includes('Amy Lead — Head of Content'), 'roster lists "Name — Title" for the Head of Content');
  assert(!roster.text_content.includes('Bob Dev') && !roster.text_content.includes('Nobody'), 'roster excludes non-decision-makers');
  assert(roster.text_content.split('\n').length === 3, 'roster = heading + 2 decision-maker lines (3 lines)');

  // Step-5 readability: the roster passes content-writer's scraped-source filter, so it reaches {entity_content}.
  assert(roster.source_submodule !== 'content-analyzer' && roster.source_submodule !== 'seo-planner' && !!roster.text_content,
    'roster passes content-writer assembleSourceContent filter');

  // ADD operation: the manifest default is now a VALID pool op (was the invalid "select").
  const VALID_OPERATIONS = ['add', 'remove', 'transform'];
  assert(MANIFEST.data_operation_default === 'add', 'manifest data_operation_default is "add"');
  assert(VALID_OPERATIONS.includes(MANIFEST.data_operation_default), 'data_operation_default is a valid pool operation');

  // Zero decision-makers: emit NOTHING (an empty/heading-only roster item is worse than none —
  // it would still pass the text_content filter and inject a contentless "leadership" block).
  const none = await execute(
    { entities: [{ name: 'Empty', items: [{ url: 'x', name: 'A', title: 'Designer', data_json: '{}' }] }] },
    { roles: DEFAULT_ROLES }, { logger, progress: { update: () => {} } });
  assert(none.results[0].items.length === 0, 'zero decision-makers -> no roster item emitted');

  console.log(`\n=== assertions: ${pass} passed, ${fail} failed ===`);
  process.exit(fail === 0 ? 0 : 1);
})();
