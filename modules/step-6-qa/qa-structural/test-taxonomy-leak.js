/**
 * Check 8 (B031-1) — post-strip residual-bracket taxonomy-leak detection.
 * Run: node modules/step-6-qa/qa-structural/test-taxonomy-leak.js
 *
 * Check 8 simulates the step-8 publish transform (markdown-output 1.2.0
 * removeMetaSection + shared marker-parser stripMarkers), then flags any
 * bracket still visible in the would-be-published text that is not a citation
 * ([#n]/[n]), a footnote ref ([^n]), or a markdown link ([text](url)); fenced
 * and inline code are skipped. A residual leak force-fails qa_pass OUTSIDE the
 * score (M3 pattern) and reports via the existing structural item.
 *
 * Option-gated: taxonomy_leak_check default false ⇒ byte-identical to pre-B031.
 */
const fs = require('fs');
const path = require('path');
const execute = require('./execute.js');

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { console.log(`  PASS: ${msg}`); pass++; }
  else { console.log(`  FAIL: ${msg}`); fail++; }
}

const tools = { logger: { info() {}, warn() {}, error() {} }, progress: { update() {} } };

// Loose scored thresholds that PASS for these shapes, so ONLY Check 8 decides
// qa_pass. required_heading_levels:'h2' — v3 drafts (and fixtures) carry H2, no H1.
const ISO = { min_sections: 1, require_faq: false, min_words_per_section: 0, min_total_words: 0, required_heading_levels: 'h2', pass_threshold: 0.5 };

async function run(md, opts = {}) {
  const res = await execute(
    { entities: [{ name: 'T', items: [{ entity_name: 'T', content_markdown: md }] }] },
    { ...ISO, ...opts },
    tools
  );
  return res.results[0].items[0];
}
function metaOf(md, opts = {}) {
  return execute(
    { entities: [{ name: 'T', items: [{ entity_name: 'T', content_markdown: md }] }] },
    { ...ISO, ...opts },
    tools
  ).then(r => r.results[0].meta);
}

// A draft with all 3 planted leak classes. (b) also trips existing Check 6, but
// Check 8's own count/verdict must independently see all three.
const LEAKED = [
  '## [Overview] Acme Studios', '',
  'Acme is a provider [#1]. It also supports [Tag: mobile] play across devices.', '',      // (a) BODY bracket — Check-8-only
  '## [Tag: multi-jurisdiction] [Suggested tag] Malta Licensing', '',                       // (b) SECOND heading bracket
  'Acme holds licences in three markets [#2].', '',
  '## [FAQ] Frequently Asked Questions [internal note]', '',                                 // (c) TRAILING heading bracket — Check-8-only
  '**Q: What is Acme?** A provider [#1].', '',
  '## [Meta] SEO Metadata', '**Meta Title:** Acme',
].join('\n');

// Fully valid draft with exactly ONE Check-8-only leak (body). Passes every
// scored check AND both M3 heading checks — so ONLY Check 8 can fail it.
const BODY_ = 'Acme builds slot games for licensed operators across regulated markets worldwide. ';
const FORCEFAIL = [
  '## [Overview] Acme Overview', BODY_.repeat(4),
  'The catalogue targets [Tag: mobile] audiences on touch devices.', '',                     // single body leak
  '## [Category] Slot Games', BODY_.repeat(4), '',
  '## [Tag: rng] RNG Compliance', BODY_.repeat(4), '',
  '## [FAQ] Frequently Asked Questions', '**Q:** What is Acme? ' + BODY_.repeat(2),
].join('\n');

// Clean draft exercising every exclusion: [#n] citation, [^n] footnote ref,
// [text](url) link, inline code with a bracket, fenced code with a bracket.
const EXCLUSIONS = [
  '## [Overview] Acme',
  'Acme is a provider [#1] with a [website](https://acme.example), code `arr[0]`, and `[Tag: x]` inline.',
  'See footnote[^3] for detail.',
  '```',
  'const t = tags["[Tag: fenced]"];',
  '```',
  '## [FAQ] Questions',
  '**Q:** See [#2].',
].join('\n');

(async () => {
  console.log('\n=== on-mode: catches all 3 planted leak classes (meta count = 3) ===');
  {
    const m = await metaOf(LEAKED, { taxonomy_leak_check: true });
    ok(m.residual_bracket_leaks === 3, `residual_bracket_leaks === 3 (got ${m.residual_bracket_leaks})`);
    const it = await run(LEAKED, { taxonomy_leak_check: true });
    ok(it.qa_pass === false, 'leaky draft force-failed when check on');
    ok(/\[Tag: mobile\]/.test(it.violations), 'body [Tag: mobile] named in violations');
    ok(/\[Suggested tag\]/.test(it.violations), 'heading [Suggested tag] named in violations');
    ok(/\[internal note\]/.test(it.violations), 'trailing heading [internal note] named in violations');
  }

  console.log('\n=== heading vs body reported per hit ===');
  {
    const it = await run(LEAKED, { taxonomy_leak_check: true });
    ok(/body [^\n]*\[Tag: mobile\]/.test(it.violations), 'body leak labelled "body"');
    ok(/heading [^\n]*\[internal note\]/.test(it.violations), 'trailing-heading leak labelled "heading"');
  }

  console.log('\n=== force-fail OUTSIDE the score, via the existing structural item (no new key) ===');
  {
    const it = await run(FORCEFAIL, { taxonomy_leak_check: true });
    ok(it.structural_score >= 0.5, `scored + M3 checks all pass (score ${it.structural_score})`);
    ok(it.qa_pass === false, 'qa_pass force-failed by the single body leak despite passing score');
    ok(typeof it.structural_score === 'number', 'item still carries structural_score (routing derives structural:fail from it)');
    ok(!('residual_leak_score' in it), 'no new score/fail field added to the item');
  }

  console.log('\n=== default OFF: leaky draft untouched (byte-identity behaviour) ===');
  {
    const it = await run(FORCEFAIL); // taxonomy_leak_check unset → default false
    ok(it.qa_pass === true, 'off-mode: draft passes (Check 8 does not run)');
    ok(it.violations === 'All structural checks passed.', 'off-mode: no residual-leak violation added');
    const m = await metaOf(FORCEFAIL);
    ok(!('residual_bracket_leaks' in m), 'off-mode: no residual_bracket_leaks meta field added');
    ok(m.residual_bracket_leaks === undefined, 'off-mode: residual_bracket_leaks undefined');
  }

  console.log('\n=== string-typed option coercion (STEP5 disable_thinking:"false" bug class) ===');
  {
    const on = await run(FORCEFAIL, { taxonomy_leak_check: 'true' });
    ok(on.qa_pass === false, 'string "true" coerces to on (force-fails)');
    const off = await run(FORCEFAIL, { taxonomy_leak_check: 'false' });
    ok(off.qa_pass === true, 'string "false" coerces to off (passes)');
  }

  console.log('\n=== exclusions: citations / footnote refs / links / code pass clean ===');
  {
    const m = await metaOf(EXCLUSIONS, { taxonomy_leak_check: true });
    ok(m.residual_bracket_leaks === 0, `no residual leaks in exclusions draft (got ${m.residual_bracket_leaks})`);
    const it = await run(EXCLUSIONS, { taxonomy_leak_check: true });
    ok(it.qa_pass === true, 'exclusions draft passes with check on');
  }

  console.log('\n=== 0 false positives across all 6 real b717a531 editor drafts ===');
  {
    const dir = path.join(__dirname, 'fixtures', 'real-drafts-b717a531');
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort();
    ok(files.length === 6, `6 real fixtures present (got ${files.length})`);
    for (const f of files) {
      const md = fs.readFileSync(path.join(dir, f), 'utf8');
      const m = await metaOf(md, { taxonomy_leak_check: true });
      ok(m.residual_bracket_leaks === 0, `${f}: 0 residual leaks`);
    }
  }

  console.log(`\n=== Result: ${pass} pass, ${fail} fail ===`);
  process.exit(fail === 0 ? 0 : 1);
})();
