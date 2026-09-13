/**
 * UNIT D — surface the SPECIFIC flagged claims into the bundle so a reviewer
 * fixes the named sentences instead of re-reading the profile.
 *
 *  - collectQaVerdict grows a generic `qa.flags` block, present ONLY when a failed
 *    check carries reviewable detail (so clean / detail-less pools stay
 *    byte-identical).
 *  - markdown-output surfaces it as a structured YAML `qa_flags` frontmatter block.
 *  - json-output carries the full detail in the qa block.
 *  - both gate it behind include_qa_flags (default true); OFF drops it.
 *
 * Uses the REAL ELK hallucination-detector output (run 36c75581) as the failing
 * fixture. Run: node modules/_shared/test-qa-flags.js
 */
const assert = require('assert');
const yaml = require('js-yaml');
const { collectQaVerdict } = require('./qa-verdict.js');
const markdownOutput = require('../step-8-bundling/markdown-output/execute.js');
const jsonOutput = require('../step-8-bundling/json-output/execute.js');
const { ELK } = require('./__fixtures__/run-36c75581.js');

let checks = 0;
function check(name, cond) { assert.ok(cond, name); checks++; }
const tools = { logger: { info() {}, warn() {}, error() {} }, progress: { update() {} } };

// Real ELK hallucination-detector output as it sits in the step-8 pool.
const HALLUC_FAIL = {
  entity_name: 'ELK Studios',
  source_submodule: 'hallucination-detector',
  qa_pass: false,
  flagged_claims: ELK.hallucination.flagged_claims, // 3 real claims incl. the high SOFTSWISS one
};
const HALLUC_PASS = { entity_name: 'ELK Studios', source_submodule: 'hallucination-detector', qa_pass: true };
const CONTENT = { entity_name: 'ELK Studios', source_submodule: 'content-writer', content_markdown: '## [Overview] ELK Studios\n\nBody text.' };

(async () => {
  // ── collectQaVerdict: flags present on a detail-bearing failure ──
  {
    const qa = collectQaVerdict([CONTENT, HALLUC_FAIL]);
    check('flags present when a failed check carries detail', Array.isArray(qa.flags) && qa.flags.length === 1);
    check('flag entry names the check', qa.flags[0].check === 'hallucination-detector');
    check('flag entry carries all 3 flagged claims', qa.flags[0].claims.length === 3);
    const high = qa.flags[0].claims.find(c => c.severity === 'high');
    check('the high claim is the SOFTSWISS over-claim', high && /full slot suite/.test(high.claim));
    check('each claim carries verdict=unsupported', qa.flags[0].claims.every(c => c.verdict === 'unsupported'));
    check('each claim carries the evidence reason', qa.flags[0].claims.every(c => c.evidence === 'in_window'));
    check('no cited_source key when the claim has no supporting quote', qa.flags[0].claims.every(c => !('cited_source' in c)));
  }

  // ── UNIT B interplay: a check that PASSES but still carries flagged claims
  //    (the evidence_absent case — over-claims regraded, draft passes) must STILL
  //    surface those claims in the flag payload. ──
  {
    const passWithClaims = { entity_name: 'ELK Studios', source_submodule: 'hallucination-detector', qa_pass: true, flagged_claims: ELK.hallucination.flagged_claims };
    const qa = collectQaVerdict([CONTENT, passWithClaims]);
    check('passing check WITH flagged claims still surfaces flags (UNIT B acceptance)', Array.isArray(qa.flags) && qa.flags[0].claims.length === 3);
    check('...and the verdict for a lone passing check is qa_passed / not flagged', qa.verdict === 'qa_passed' && qa.flagged === false);
  }

  // ── byte-identity: no flags when nothing is flagged, and no flags on a detail-less failure ──
  {
    const clean = collectQaVerdict([CONTENT, HALLUC_PASS]);
    check('clean pass with no flagged detail → no flags key (byte-identical qa object)', clean && !('flags' in clean));
    // a failure with no per-item detail (e.g. a meta checker with only a violations string)
    const detailless = collectQaVerdict([CONTENT, { entity_name: 'ELK Studios', source_submodule: 'meta-compliance-checker', qa_pass: false, violations: 'Description too short' }]);
    check('detail-less failure → no flags key (only checks that carry detail contribute)', detailless && !('flags' in detailless));
  }

  // ── markdown-output: structured qa_flags frontmatter block ──
  {
    const res = await markdownOutput({ entities: [{ name: 'ELK Studios', items: [CONTENT, HALLUC_FAIL] }] }, {}, tools);
    const md = res.results[0].items[0].final_markdown;
    const fm = yaml.load(md.match(/^---\n([\s\S]*?)\n---/)[1]);
    check('md frontmatter has a parseable qa_flags block', Array.isArray(fm.qa_flags) && fm.qa_flags[0].check === 'hallucination-detector');
    check('md qa_flags carries the flagged claims with severity', fm.qa_flags[0].claims.length === 3 && fm.qa_flags[0].claims.some(c => c.severity === 'high'));
    check('md qa_flags is in frontmatter, not the body', md.indexOf('qa_flags') < md.indexOf('---', 4));

    const off = await markdownOutput({ entities: [{ name: 'ELK Studios', items: [CONTENT, HALLUC_FAIL] }] }, { include_qa_flags: false }, tools);
    check('include_qa_flags=false drops qa_flags (verdict still present)', !off.results[0].items[0].final_markdown.includes('qa_flags') && off.results[0].items[0].final_markdown.includes('qa_flagged: true'));

    const clean = await markdownOutput({ entities: [{ name: 'ELK Studios', items: [CONTENT, HALLUC_PASS] }] }, {}, tools);
    check('clean draft → no qa_flags in frontmatter', !clean.results[0].items[0].final_markdown.includes('qa_flags'));
  }

  // ── json-output: full detail in the qa block ──
  {
    const res = await jsonOutput({ entities: [{ name: 'ELK Studios', items: [CONTENT, HALLUC_FAIL] }] }, {}, tools);
    const parsed = JSON.parse(res.results[0].items[0].final_json);
    check('json qa block carries flags', Array.isArray(parsed.qa.flags) && parsed.qa.flags[0].claims.length === 3);

    const off = await jsonOutput({ entities: [{ name: 'ELK Studios', items: [CONTENT, HALLUC_FAIL] }] }, { include_qa_flags: false }, tools);
    const offParsed = JSON.parse(off.results[0].items[0].final_json);
    check('include_qa_flags=false drops qa.flags but keeps qa.verdict', offParsed.qa && !('flags' in offParsed.qa) && !!offParsed.qa.verdict);

    const clean = await jsonOutput({ entities: [{ name: 'ELK Studios', items: [CONTENT, HALLUC_PASS] }] }, {}, tools);
    check('clean draft → qa block has no flags key', !('flags' in JSON.parse(clean.results[0].items[0].final_json).qa));
  }

  console.log(`UNIT D (qa flags): ${checks}/${checks} assertions passed.`);
})().catch((e) => { console.error('FAIL:', e.message, e.stack); process.exit(1); });
