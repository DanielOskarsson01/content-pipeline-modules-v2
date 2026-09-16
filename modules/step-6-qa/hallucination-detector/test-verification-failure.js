/**
 * v1.7.0 -- an unverified claim is NOT an unsupported claim (never report an
 * infrastructure failure as a content verdict). Deterministic, no network.
 *
 * Run from the module dir or repo root:
 *   node modules/step-6-qa/hallucination-detector/test-verification-failure.js
 *
 * Proves:
 *  (1) FAILURE INJECTION, draw-2 shape (offering-slot live incident): 98 claims,
 *      4 batches of 25, batches 3-4 refused before network (SESSION_BUDGET_EXHAUSTED).
 *      FROZEN 793fdca emits the never-verified claims as verdict:'unsupported'
 *      (score 0.495, 49 unsupported, floor tripped, NO meta.status) -- the defect.
 *      The fix emits meta.status:'error' / error:'verification_incomplete' with the
 *      failed batches named, NO claim verdicts, and stops calling after the first
 *      failure (batch 4 never attempted).
 *  (2) BYTE-IDENTITY: a fully-verified run (all batches succeed) is byte-identical
 *      to FROZEN 793fdca -- results, summary AND tools._partialItems -- across
 *      configs incl. the exact 628d12c9 config, on the real 628d12c9 fixtures.
 *  (3) REAL FABRICATIONS STILL TRIP: the Halcyon / Quasar-Turnip planted controls
 *      (judge work) in a SUCCESSFUL batch still come back 'unsupported' and still
 *      trip severity_floor -- the fix does not soften genuine detection.
 *  (4) MIXED CASE: batch 2 of 4 fails, 1/3/4 succeed. Batch mode: failed_batches
 *      is exactly batch 2, claims_unverified is exactly batch 2's claim count.
 *      Sync mode: early-bail after batch 2 (batches 3-4 not attempted, no calls).
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const mod = require('./execute.js');
const execute = mod;

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { console.log(`  PASS: ${msg}`); pass++; }
  else { console.log(`  FAIL: ${msg}`); fail++; }
}

const REPO = path.resolve(__dirname, '..', '..', '..');
const FROZEN = '793fdca'; // origin/main at unit start (== deployed sync path with the defect)
const SCRATCH = process.env.CLAUDE_SCRATCH || os.tmpdir();
const frozenPath = path.join(SCRATCH, 'hd-frozen-793fdca-execute.js');
execSync(
  `git -C ${REPO} show ${FROZEN}:modules/step-6-qa/hallucination-detector/execute.js > ${frozenPath}`,
  { stdio: ['ignore', 'ignore', 'inherit'] }
);
const executeFrozen = require(frozenPath);

const NOOP = { info() {}, warn() {}, error() {} };
const FIX = path.join(__dirname, 'fixtures');
const pushGaming = fs.readFileSync(path.join(FIX, 'push-gaming.md'), 'utf8');
const elk = fs.readFileSync(path.join(FIX, 'elk_editor_it1.md'), 'utf8');
const nolimit = fs.readFileSync(path.join(FIX, 'nolimit_editor_it1.md'), 'utf8');

// The exact 628d12c9 run config (the offering-slot experiment's detector config).
const CFG_628 = {
  claim_extraction: 'llm', claims_per_batch: 25, source_selection: 'claim_anchored',
  cache_base_window: true, severity_floor: true, severity_model: 'current',
  pass_threshold: 0.9, max_source_chars: 100000, ai_model: 'sonnet', ai_provider: 'anthropic',
};

function sources(name) {
  return [
    { text_content: `${name} is a game studio. It develops the slot title Jammin' Jars and the Razor Shark series. ` + 'ctx '.repeat(300) },
    { text_content: `${name} holds licences in several markets and released titles since 2010. ` + 'more '.repeat(300) },
  ];
}

async function runSync(exec, entities, options, mock) {
  const partial = [];
  const calls = [];
  const tools = {
    logger: NOOP, progress: { update() {} }, _partialItems: partial,
    ai: { complete: async (a) => { calls.push(a); return mock(a); } },
  };
  const res = await exec({ entities }, options, tools);
  return { res, partial, calls };
}

// Drive the batch path (prepare -> respond -> parse), optionally erroring one batchIdx.
async function runBatch(entities, options, mock, { errorBatchIdx = null } = {}) {
  const tools = { logger: NOOP };
  const { state, extractionRequests } = mod.prepareExtractionRequests(entities, options, tools);
  const extractionByEntityIdx = [];
  for (const req of extractionRequests) {
    const r = await mock(req.args);
    extractionByEntityIdx[req.entityIdx] = { ok: true, text: r.text };
  }
  const { verificationRequests } = mod.prepareVerificationRequests(entities, options, state, extractionByEntityIdx, tools);
  const verificationByEntityIdx = [];
  for (const req of verificationRequests) {
    (verificationByEntityIdx[req.entityIdx] ||= []);
    if (errorBatchIdx !== null && req.batchIdx === errorBatchIdx) {
      verificationByEntityIdx[req.entityIdx][req.batchIdx] = { ok: false, error: 'SESSION_BUDGET_EXHAUSTED' };
    } else {
      const r = await mock(req.args);
      verificationByEntityIdx[req.entityIdx][req.batchIdx] = { ok: true, text: r.text };
    }
  }
  return mod.parseResults(entities, options, state, verificationByEntityIdx, tools);
}

// ── Mock builders ──────────────────────────────────────────────────────────────
// Deterministic on args only (never on call order/count), so frozen and new runs
// given identical args produce identical responses.

// Extraction returns nClaims indexed claims; verification reads each numbered line's
// "Claim NNN" token and applies verdictFor(globalIdx); throws refuseError if any
// claim index is in refuseIdxs (simulates the harness budget guard refusing the call).
function makeIndexedMock({ nClaims, verdictFor, refuseWhen = () => false }) {
  return async ({ prompt, cache_prefix }) => {
    const full = (cache_prefix || '') + prompt;
    if (/claim-extraction assistant/i.test(full)) {
      const claims = [];
      for (let i = 1; i <= nClaims; i++) {
        claims.push(`Claim ${i}: Push Gaming operates in market segment ${i} since 2010.`);
      }
      return { text: JSON.stringify(claims) };
    }
    const claimLines = prompt.match(/^\d+\.\s.*$/gm) || [];
    const idxs = claimLines.map(l => parseInt((l.match(/Claim (\d+):/) || [, '0'])[1], 10));
    if (idxs.some(refuseWhen)) throw new Error('SESSION_BUDGET_EXHAUSTED');
    const verdicts = claimLines.map((line, k) => {
      const claim = line.replace(/^\d+\.\s/, '');
      return { claim, ...verdictFor(idxs[k]) };
    });
    return { text: JSON.stringify(verdicts) };
  };
}

// Draw-2 verdict shape for the verified half: claim 25 partial, claim 50 unsupported
// HIGH (the one genuinely-judged fabrication that tripped the floor live), rest supported.
const draw2VerdictFor = (i) =>
  i === 25 ? { verdict: 'partial', quote: 'partial evidence', severity: 'low' }
  : i === 50 ? { verdict: 'unsupported', quote: null, severity: 'high' }
  : { verdict: 'supported', quote: 'supporting quote', severity: 'low' };

function draw2Entity() {
  return { name: 'Push Gaming', items: [{ content_markdown: pushGaming }, ...sources('Push Gaming')] };
}

(async () => {
  console.log('\n=== v1.7.0 verification-failure discipline ===\n');

  // ── 1. FAILURE INJECTION -- the draw-2 shape, before and after ──────────────────
  console.log('1. draw-2 shape: 98 claims / 4 batches, batches 3-4 refused before network');
  {
    const mockArgs = { nClaims: 98, verdictFor: draw2VerdictFor, refuseWhen: (i) => i > 50 };

    // BEFORE (frozen 793fdca): the defect -- never-verified claims become 'unsupported'.
    const frozen = await runSync(executeFrozen, [draw2Entity()], CFG_628, makeIndexedMock(mockArgs));
    const fItem = frozen.res.results[0].items[0];
    const fMeta = frozen.res.results[0].meta;
    assert(fItem.hallucination_score === 0.495, `FROZEN reproduces the live 0.495 score (got ${fItem.hallucination_score})`);
    assert(fMeta.unsupported === 49, `FROZEN reports 49 unsupported (1 real + 48 never verified) (got ${fMeta.unsupported})`);
    assert(fItem.qa_pass === false, 'FROZEN qa_pass false (the spurious QA FAIL)');
    assert(fMeta.severity_floor_tripped === true, 'FROZEN severity_floor tripped (the live incident shape)');
    assert(fMeta.status === undefined, 'FROZEN meta has NO status -- the infra failure is invisible to deriveEntityRunStatus');
    const fVerifyCalls = frozen.calls.filter(a => !/claim-extraction assistant/i.test((a.cache_prefix || '') + a.prompt));
    assert(fVerifyCalls.length === 4, `FROZEN attempted all 4 verification calls (got ${fVerifyCalls.length})`);

    // AFTER (the fix): INFRA failure, loud, no claim verdicts, early-bail.
    const fixed = await runSync(execute, [draw2Entity()], CFG_628, makeIndexedMock(mockArgs));
    const item = fixed.res.results[0].items[0];
    const meta = fixed.res.results[0].meta;
    assert(meta.status === 'error', `FIX: meta.status 'error' (got ${meta.status})`);
    assert(meta.error === 'verification_incomplete', `FIX: meta.error 'verification_incomplete' (got ${meta.error})`);
    assert(JSON.stringify(meta.failed_batches) === JSON.stringify([{ batch: 3, of: 4, error: 'SESSION_BUDGET_EXHAUSTED' }]),
      `FIX: failed batch named with its reason (got ${JSON.stringify(meta.failed_batches)})`);
    assert(JSON.stringify(meta.batches_not_attempted) === JSON.stringify([4]),
      `FIX: batch 4 reported not attempted (got ${JSON.stringify(meta.batches_not_attempted)})`);
    assert(meta.claims_unverified === 48, `FIX: 48 claims unverified (batches 3+4) (got ${meta.claims_unverified})`);
    assert(item.qa_pass === false, 'FIX: qa_pass false (an incomplete fact-check is not a pass)');
    assert(item.flagged_claims.length === 0 && item.flagged_claims_count === 0,
      'FIX: NO claim carries a verdict -- zero flagged claims');
    assert(meta.unsupported === undefined, 'FIX: no unsupported count -- nothing was judged unsupported');
    assert(meta.severity_floor_tripped === undefined, 'FIX: severity_floor NOT tripped -- no claim was examined and failed');
    assert(/INFRASTRUCTURE failure/.test(item.summary_text) && /retry the run/.test(item.summary_text),
      'FIX: summary says infra failure / retry, readable at a glance');
    assert(!/unsupported claim/.test(item.flagged_claims_text) && item.flagged_claims_text === '',
      'FIX: flagged_claims_text carries no claims');
    const verifyCalls = fixed.calls.filter(a => !/claim-extraction assistant/i.test((a.cache_prefix || '') + a.prompt));
    assert(verifyCalls.length === 3, `FIX: stopped calling after the first failure (3 calls, batch 4 skipped) (got ${verifyCalls.length})`);
    assert(fixed.partial.length === 1 && fixed.partial[0].qa_pass === false,
      'FIX: error item still pushed to _partialItems (Rule 10)');
  }

  // ── 2. BYTE-IDENTITY -- fully-verified run identical to FROZEN 793fdca ──────────
  console.log('\n2. fully-verified byte-identity vs FROZEN 793fdca (real 628d12c9 fixtures)');
  {
    // Mixed verdicts (supported/partial/unsupported-low+medium) to exercise the flagged
    // paths, all batches succeeding. Deterministic by claim index.
    const mixedVerdictFor = (i) =>
      i % 7 === 3 ? { verdict: 'partial', quote: 'part', severity: 'low' }
      : i % 13 === 5 ? { verdict: 'unsupported', quote: null, severity: i % 2 ? 'medium' : 'low' }
      : { verdict: 'supported', quote: 'quote', severity: 'low' };
    const CONFIGS = [
      { label: '628d12c9 (llm/anchored/cache/floor/25)', opts: CFG_628 },
      { label: 'default (regex/head)', opts: {} },
      { label: 'floor+evidence_absent (llm/anchored)', opts: {
          claim_extraction: 'llm', source_selection: 'claim_anchored', severity_floor: true,
          severity_model: 'evidence_absent', ai_model: 'sonnet', ai_provider: 'anthropic' } },
    ];
    const drafts = { 'Push Gaming': pushGaming, 'ELK Studios': elk, 'Nolimit City': nolimit };
    const makeEntities = () => Object.entries(drafts).map(([name, md]) => (
      { name, items: [{ content_markdown: md }, ...sources(name)] }
    ));
    for (const { label, opts } of CONFIGS) {
      const mock = makeIndexedMock({ nClaims: 60, verdictFor: mixedVerdictFor });
      const a = await runSync(execute, makeEntities(), opts, mock);
      const b = await runSync(executeFrozen, makeEntities(), opts, mock);
      assert(JSON.stringify(a.res.results) === JSON.stringify(b.res.results), `${label}: results byte-identical to frozen`);
      assert(JSON.stringify(a.res.summary) === JSON.stringify(b.res.summary), `${label}: summary byte-identical to frozen`);
      assert(JSON.stringify(a.partial) === JSON.stringify(b.partial), `${label}: _partialItems byte-identical to frozen`);
      assert(a.calls.length === b.calls.length, `${label}: identical call count (${a.calls.length})`);
    }
  }

  // ── 3. REAL FABRICATIONS in a SUCCESSFUL batch still trip the floor ─────────────
  console.log('\n3. Halcyon / Quasar-Turnip planted controls still detected (no softening)');
  {
    const CONTROLS = [
      "Push Gaming develops the slot title Quasar Turnip 9000.",
      "Push Gaming acquired Halcyon Interactive for USD 240 million.",
    ];
    const controlMock = async ({ prompt, cache_prefix }) => {
      const full = (cache_prefix || '') + prompt;
      if (/claim-extraction assistant/i.test(full)) {
        return { text: JSON.stringify([
          "Push Gaming develops the slot title Jammin' Jars.",
          ...CONTROLS,
        ]) };
      }
      const claimLines = prompt.match(/^\d+\.\s.*$/gm) || [];
      const verdicts = claimLines.map((line) => {
        const claim = line.replace(/^\d+\.\s/, '');
        const fabricated = /Quasar Turnip|Halcyon/.test(claim);
        return fabricated
          ? { claim, verdict: 'unsupported', quote: null, severity: 'high' }
          : { claim, verdict: 'supported', quote: "develops the slot title Jammin' Jars", severity: 'low' };
      });
      return { text: JSON.stringify(verdicts) };
    };
    const opts = { ...CFG_628 };
    const a = await runSync(execute, [draw2Entity()], opts, controlMock);
    const item = a.res.results[0].items[0];
    const meta = a.res.results[0].meta;
    assert(item.qa_pass === false, 'controls: qa_pass false (genuine fabrications fail)');
    assert(meta.severity_floor_tripped === true, 'controls: severity_floor tripped on verified HIGH fabrications');
    assert(meta.unsupported === 2, `controls: exactly the 2 planted fabrications unsupported (got ${meta.unsupported})`);
    assert(meta.status === undefined, 'controls: NOT an error result -- this is a genuine content verdict');
    assert(/Quasar Turnip 9000/.test(item.flagged_claims_text) && /Halcyon Interactive/.test(item.flagged_claims_text),
      'controls: both planted fabrications named in flagged_claims_text');
    const b = await runSync(executeFrozen, [draw2Entity()], opts, controlMock);
    assert(JSON.stringify(a.res) === JSON.stringify(b.res), 'controls: byte-identical to frozen (success path unchanged)');
  }

  // ── 4. MIXED CASE -- batch 2 fails, 1/3/4 succeed ───────────────────────────────
  console.log('\n4. mixed case: batch 2 of 4 fails');
  {
    const nClaims = 100; // 4 batches of 25
    // BATCH MODE: all responses arrive; only batchIdx 1 errored. The unverified set is
    // exactly batch 2's claims.
    const batchRes = await runBatch([draw2Entity()], CFG_628,
      makeIndexedMock({ nClaims, verdictFor: () => ({ verdict: 'supported', quote: 'q', severity: 'low' }) }),
      { errorBatchIdx: 1 });
    const bMeta = batchRes.results[0].meta;
    assert(bMeta.status === 'error', 'batch mode: meta.status error');
    assert(JSON.stringify(bMeta.failed_batches) === JSON.stringify([{ batch: 2, of: 4, error: 'SESSION_BUDGET_EXHAUSTED' }]),
      `batch mode: failed_batches is exactly batch 2 (got ${JSON.stringify(bMeta.failed_batches)})`);
    assert(bMeta.batches_not_attempted === undefined, 'batch mode: no not-attempted batches (all responses arrived)');
    assert(bMeta.claims_unverified === 25, `batch mode: unverified set is exactly batch 2's 25 claims (got ${bMeta.claims_unverified})`);
    assert(batchRes.results[0].items[0].flagged_claims.length === 0, 'batch mode: no claim carries unsupported');

    // SYNC MODE: batch 2 throws -> early-bail; batches 3-4 never attempted.
    const syncRes = await runSync(execute, [draw2Entity()], CFG_628,
      makeIndexedMock({ nClaims, verdictFor: () => ({ verdict: 'supported', quote: 'q', severity: 'low' }),
        refuseWhen: (i) => i > 25 && i <= 50 }));
    const sMeta = syncRes.res.results[0].meta;
    assert(sMeta.status === 'error', 'sync mode: meta.status error');
    assert(JSON.stringify(sMeta.failed_batches) === JSON.stringify([{ batch: 2, of: 4, error: 'SESSION_BUDGET_EXHAUSTED' }]),
      `sync mode: failed_batches is exactly batch 2 (got ${JSON.stringify(sMeta.failed_batches)})`);
    assert(JSON.stringify(sMeta.batches_not_attempted) === JSON.stringify([3, 4]),
      `sync mode: batches 3-4 not attempted (got ${JSON.stringify(sMeta.batches_not_attempted)})`);
    assert(sMeta.claims_unverified === 75, `sync mode: 75 claims unverified (batch 2 failed + 3-4 skipped) (got ${sMeta.claims_unverified})`);
    const vCalls = syncRes.calls.filter(a => !/claim-extraction assistant/i.test((a.cache_prefix || '') + a.prompt));
    assert(vCalls.length === 2, `sync mode: exactly 2 verification calls made (got ${vCalls.length})`);
  }

  // ── 5. MULTI-ENTITY ISOLATION -- one entity's infra failure never touches siblings ──
  console.log('\n5. multi-entity: entity 1 infra-fails, entity 2 verifies clean');
  {
    const entities = [
      { name: 'Failing Co', items: [{ content_markdown: pushGaming }, ...sources('Failing Co')] },
      { name: 'Clean Co', items: [{ content_markdown: elk }, ...sources('Clean Co')] },
    ];
    // Refuse only Failing Co's claims (extraction tags claims with the entity's segment
    // index; instead key on draft: Failing Co uses pushGaming, whose extraction we refuse
    // at verification time via a per-prompt sentinel -- simplest: refuse claim idx > 90
    // only for the FIRST 98-claim entity by giving the entities different claim counts).
    let extractionCall = 0;
    const mock = async ({ prompt, cache_prefix }) => {
      const full = (cache_prefix || '') + prompt;
      if (/claim-extraction assistant/i.test(full)) {
        extractionCall++;
        const tag = full.includes('Push Gaming') || extractionCall === 1 ? 'FAILCO' : 'CLEANCO';
        const claims = [];
        for (let i = 1; i <= 30; i++) claims.push(`Claim ${i}: ${tag} operates in market ${i} since 2010.`);
        return { text: JSON.stringify(claims) };
      }
      if (/FAILCO/.test(prompt)) throw new Error('rate_limited');
      const claimLines = prompt.match(/^\d+\.\s.*$/gm) || [];
      return { text: JSON.stringify(claimLines.map(l => (
        { claim: l.replace(/^\d+\.\s/, ''), verdict: 'supported', quote: 'q', severity: 'low' }
      ))) };
    };
    const r = await runSync(execute, entities, CFG_628, mock);
    const failed = r.res.results[0], clean = r.res.results[1];
    assert(failed.meta.status === 'error' && failed.meta.error === 'verification_incomplete',
      'entity 1: infra error result');
    assert(failed.items[0].status === 'error',
      'entity 1: item carries status error (honest _partialItems salvage)');
    assert(clean.meta.status === undefined && clean.items[0].qa_pass === true && clean.items[0].hallucination_score === 1,
      'entity 2: clean pass, untouched by sibling failure');
    assert(r.res.summary.passed === 1 && r.res.summary.failed === 1 && r.res.summary.total_entities === 2,
      `summary counts 1 passed / 1 failed of 2 (got ${JSON.stringify(r.res.summary)})`);
    assert(r.partial.length === 2, '_partialItems carries both entities (Rule 10)');
  }

  console.log(`\n=== Result: ${pass} pass, ${fail} fail ===`);
  process.exit(fail === 0 ? 0 : 1);
})();
