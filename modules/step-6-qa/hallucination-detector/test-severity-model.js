/**
 * UNIT B — evidence-absent severity model.
 *
 * severity_model:"evidence_absent" regrades a HIGH unsupported claim to MEDIUM
 * when its SUBJECT is present in the corpus (evidence in_window|beyond_window) —
 * a grounded fact with an over-claimed qualifier is a review-flag, not a
 * publish-blocking fabrication — while a claim absent everywhere STAYS high and
 * still trips the floor. Only severity is regraded; the verdict and score never
 * change.
 *
 * Acceptance is measured on the REAL run-36c75581 verdicts (ELK/PRG/Verm) with
 * SEVERITY_FLOOR.md's classification as ground truth. Run:
 *   node modules/step-6-qa/hallucination-detector/test-severity-model.js
 */
const assert = require('assert');
const execute = require('./execute.js');
const { decideHallucinationPass } = require('./execute.js');
const { ELK, PRG, VERM } = require('../../_shared/__fixtures__/run-36c75581.js');
const { loadHeadExecute, cleanupHead } = require('../../_shared/__fixtures__/head-ab.js');

let checks = 0;
function check(name, cond) { assert.ok(cond, name); checks++; }

// Turn a fixture's real flagged_claims into the verdict + evidence inputs the
// decision helper consumes (all flagged claims are, by definition, unsupported).
function inputsFor(fx) {
  const unsupportedClaims = fx.hallucination.flagged_claims.map(c => ({ claim: c.claim, severity: c.severity, verdict: 'unsupported' }));
  const claimEvidence = {};
  for (const c of fx.hallucination.flagged_claims) claimEvidence[c.claim] = c.evidence;
  return { unsupportedClaims, claimEvidence, hallucinationScore: fx.hallucination.hallucination_score };
}

const FLOOR = { severityFloor: true, passThreshold: 0.9 };

(async () => {
  // ── ACCEPTANCE TABLE (floor ON, threshold 0.9), real data ──

  // ELK 0.914 — sole floor-tripper E2 (high, in_window)
  {
    const inp = inputsFor(ELK);
    const cur = decideHallucinationPass({ ...inp, ...FLOOR, severityModel: 'current' });
    const ev = decideHallucinationPass({ ...inp, ...FLOOR, severityModel: 'evidence_absent' });
    check('ELK current: floor trips → FAIL (matches stored qa_pass:false)', cur.floorTripped && cur.qaPass === false);
    check('ELK evidence_absent: E2 regraded → floor does NOT trip → PASS @0.914', !ev.floorTripped && ev.qaPass === true);
    check('ELK evidence_absent: the SOFTSWISS high claim is now medium', ev.regraded.find(v => /full slot suite/.test(v.claim)).severity === 'medium');
    check('ELK verdict parity: every regraded verdict still unsupported', ev.regraded.every(v => v.verdict === 'unsupported'));
    check('ELK claim set/order unchanged by regrade', ev.regraded.map(v => v.claim).join('|') === inp.unsupportedClaims.map(v => v.claim).join('|'));
  }

  // Vermantia 0.928 — sole floor-tripper V2 (high, in_window)
  {
    const inp = inputsFor(VERM);
    const cur = decideHallucinationPass({ ...inp, ...FLOOR, severityModel: 'current' });
    const ev = decideHallucinationPass({ ...inp, ...FLOOR, severityModel: 'evidence_absent' });
    check('Verm current: floor trips → FAIL', cur.floorTripped && cur.qaPass === false);
    check('Verm evidence_absent: V2 regraded → PASS @0.928', !ev.floorTripped && ev.qaPass === true);
    check('Verm evidence_absent: the "12+ virtual games…retail POS" high claim is now medium', ev.regraded.find(v => /more than a dozen virtual games/.test(v.claim)).severity === 'medium');
    check('Verm verdict parity', ev.regraded.every(v => v.verdict === 'unsupported'));
  }

  // Pocket Rockets 0.867 — fails on RATIO, no high claim; the change must not touch that
  {
    const inp = inputsFor(PRG);
    const cur = decideHallucinationPass({ ...inp, ...FLOOR, severityModel: 'current' });
    const ev = decideHallucinationPass({ ...inp, ...FLOOR, severityModel: 'evidence_absent' });
    check('PRG has no high claim (floor N/A in either model)', !cur.floorTripped && !ev.floorTripped);
    check('PRG current: sub-threshold ratio → FAIL', cur.qaPass === false);
    check('PRG evidence_absent: still FAILs on ratio 0.867 < 0.9 (unchanged)', ev.qaPass === false);
    check('PRG regrade is a no-op (no high to regrade)', JSON.stringify(ev.regraded) === JSON.stringify(cur.regraded));
  }

  // Evidence-absent CONTROL — a genuine no-source high claim MUST still fail
  {
    const absentHigh = {
      unsupportedClaims: [{ claim: 'Vermantia has surpassed 5 million virtual game installations globally.', severity: 'high', verdict: 'unsupported' }],
      claimEvidence: { 'Vermantia has surpassed 5 million virtual game installations globally.': 'absent' },
      hallucinationScore: 0.95, // high ratio: only the floor can fail it
    };
    const ev = decideHallucinationPass({ ...absentHigh, ...FLOOR, severityModel: 'evidence_absent' });
    check('control: evidence:absent high claim STAYS high → floor trips → FAIL', ev.floorTripped && ev.qaPass === false);
    check('control: severity NOT downgraded (absent everywhere)', ev.regraded[0].severity === 'high');
    // beyond_window (evidence exists, just truncated) counts as present → regraded
    const beyond = decideHallucinationPass({ ...absentHigh, claimEvidence: { [absentHigh.unsupportedClaims[0].claim]: 'beyond_window' }, ...FLOOR, severityModel: 'evidence_absent' });
    check('beyond_window high (subject present, truncated) → regraded to medium → PASS', !beyond.floorTripped && beyond.qaPass === true);
  }

  // 'current' is a pure passthrough (byte-identical): same objects, no severity change
  {
    const inp = inputsFor(ELK);
    const cur = decideHallucinationPass({ ...inp, ...FLOOR, severityModel: 'current' });
    check('current: regraded references are the SAME verdict objects (byte-identical)', cur.regraded.every((v, i) => v === inp.unsupportedClaims[i]));
  }

  // ── E2E: execute() actually flips qa_pass when the floor was the only failure ──
  function makeMock(verdictFor) {
    return {
      logger: { info() {}, warn() {}, error() {} }, progress: { update() {} }, _partialItems: [],
      ai: { complete: async ({ prompt }) => {
        const block = (prompt.split('CLAIMS:')[1] || prompt).split('SOURCE MATERIAL:')[0];
        const claims = block.split('\n').map(l => l.trim()).filter(l => /^\d+\.\s/.test(l)).map(l => l.replace(/^\d+\.\s*/, ''));
        return { text: JSON.stringify(claims.map(verdictFor)) };
      } },
    };
  }
  const verdictFor = (claim) => /ZEBRACORP/.test(claim)
    ? { claim, verdict: 'unsupported', quote: null, severity: 'high' }
    : { claim, verdict: 'supported', quote: 'grounded', severity: 'low' };
  const entity = {
    name: 'TestCo',
    items: [
      { content_markdown: '# TestCo\n\nTestCo was founded in 2013. TestCo employs 500 people worldwide. TestCo announced a partnership with ZEBRACORP in 2021.' },
      { text_content: 'TestCo was founded in 2013 and employs 500 people at its Malta studio.' },
      { text_content: 'ZEBRACORP is a payments company founded in 2005 serving the gaming sector.' },
    ],
  };
  const e2eOpts = { source_selection: 'claim_anchored', severity_floor: true, pass_threshold: 0.5, claims_per_batch: 10 };
  {
    const cur = (await execute({ entities: [entity] }, { ...e2eOpts, severity_model: 'current' }, makeMock(verdictFor))).results[0].items[0];
    check('e2e current: high in_window claim → floor trips → qa_pass false', cur.qa_pass === false);
    check('e2e current: the ZEBRACORP claim is reported HIGH', cur.flagged_claims.find(c => /ZEBRACORP/.test(c.claim)).severity === 'high');

    const ev = (await execute({ entities: [entity] }, { ...e2eOpts, severity_model: 'evidence_absent' }, makeMock(verdictFor)));
    const evItem = ev.results[0].items[0];
    check('e2e evidence_absent: qa_pass FLIPS to true (floor no longer trips)', evItem.qa_pass === true);
    check('e2e evidence_absent: the ZEBRACORP claim now reports MEDIUM', evItem.flagged_claims.find(c => /ZEBRACORP/.test(c.claim)).severity === 'medium');
    check('e2e evidence_absent: meta self-documents the model', ev.results[0].meta.severity_model === 'evidence_absent');
  }

  // ── byte-identity: default options → HEAD execute === working-tree execute ──
  {
    const head = loadHeadExecute('modules/step-6-qa/hallucination-detector/execute.js');
    const mkEntity = () => ({ name: 'ByteCo', items: [
      { content_markdown: '# ByteCo\n\nByteCo was founded in 2013. ByteCo employs 500 people. ByteCo has over 100 games.' },
      { text_content: 'ByteCo was founded in 2013 and employs 500 people. It offers over 100 games.' },
    ] });
    const mixed = (claim) => /over 100 games/.test(claim)
      ? { claim, verdict: 'unsupported', quote: null, severity: 'high' }
      : { claim, verdict: 'supported', quote: 'src', severity: 'low' };
    const curOut = await execute({ entities: [mkEntity()] }, {}, makeMock(mixed));
    const headOut = await head({ entities: [mkEntity()] }, {}, makeMock(mixed));
    assert.deepStrictEqual(curOut, headOut, 'default-config output must byte-match prod HEAD');
    check('byte-identity: default options match prod HEAD exactly', true);
  }
  cleanupHead();

  console.log(`UNIT B (severity model): ${checks}/${checks} assertions passed.`);
})().catch((e) => { console.error('FAIL:', e.message, e.stack); process.exit(1); });
