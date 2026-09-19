/**
 * Extraction-truncation guard -- the detector's LLM claim-extraction call inherits
 * ai.complete's 16384 default. On a heavy draw (many claims + sonnet-5's adaptive
 * thinking, which bills against the SAME output cap) the extraction JSON overflows,
 * becomes unparseable, and the OLD code silently fell back to the regex extractor
 * (~4 claims on a v3 draft) -> floor never trips -> qa_pass:true. That is the SEVENTH
 * instance of this project's worst failure family and the FIRST that fails OPEN: a
 * degraded extraction publishing a fabrication instead of blocking it.
 *
 * Run from repo root:
 *   CLAUDE_SCRATCH=<dir> node modules/step-6-qa/hallucination-detector/test-extraction-truncation.js
 * No network -- ai.complete is mocked.
 *
 * Proves:
 *   1. THE MISS TEST (sync): a truncated extraction (stop_reason:max_tokens) PASSES under
 *      the pre-fix code (ddc89e7) via the regex fallback, and FAILS LOUD under the fix
 *      (meta.status:'error', qa_pass:false) -- documents the bug in both directions.
 *   2. THE MISS TEST (batch): the skeleton strips stop_reason, so batch truncation is
 *      caught by the "non-empty response, no parseable claim array" signal -- pre-fix
 *      PASSES, fix FAILS LOUD.
 *   3. BYTE-IDENTITY: an extraction that completes normally produces an IDENTICAL result
 *      to ddc89e7, in BOTH sync and batch (the default-off safety net -- the fix only
 *      changes the degraded path).
 *   4. BATCH PARITY: normal extraction sync == batch under the fix.
 *   5. A genuine unsupported/high fabrication still trips the floor after the fix
 *      (the fix does not disturb verification / scoring / the severity floor).
 *   6. An ERRORED extraction call still falls back to regex (settled behaviour preserved,
 *      byte-identical to HEAD) -- only truncation becomes loud.
 */

const { execSync } = require('child_process');
const path = require('path');

const mod = require('./execute.js');
const execute = mod;

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { console.log(`  PASS: ${msg}`); pass++; }
  else { console.log(`  FAIL: ${msg}`); fail++; }
}

const REPO = '/Users/danieloskarsson/dev/content-pipeline-modules-v2';
const PREFIX = 'ddc89e7'; // origin/main at unit start -- the pre-fix (buggy) sync + batch paths
const SCRATCH = process.env.CLAUDE_SCRATCH ||
  '/private/tmp/claude-501/-Users-danieloskarsson-dev-content-pipeline-modules-v2/6ccc7401-fa4b-48c1-a74e-4100a82913a7/scratchpad';
const prefixPath = path.join(SCRATCH, 'hd-prefix-ddc89e7-execute.js');
execSync(
  `git -C ${REPO} show ${PREFIX}:modules/step-6-qa/hallucination-detector/execute.js > ${prefixPath}`,
  { stdio: ['ignore', 'ignore', 'inherit'] }
);
const executePrefix = require(prefixPath);

const NOOP = { info() {}, warn() {}, error() {} };

// Substantial content whose SENTENCES the regex extractor can mine (year/number/company
// patterns), so the pre-fix regex fallback finds >0 claims and the entity PASSES -- which
// is exactly the false pass the fix eliminates.
const MARKDOWN =
  '# Push Gaming\n\n' +
  'Push Gaming was founded in 2010 in London. ' +
  'The studio holds an MGA licence and a UKGC licence. ' +
  'It reported 40% revenue growth in 2021 and employs 120 people. ' +
  'Push Gaming partnered with LeoVegas in 2019 and with Kindred in 2020. '.repeat(4);
const SOURCE = 'Push Gaming, founded 2010 in London, is MGA- and UKGC-licensed with ~120 staff. '.repeat(20);

function entity(name = 'Push Gaming') {
  return { name, items: [{ content_markdown: MARKDOWN }, { text_content: SOURCE }] };
}

const OPTS = { claim_extraction: 'llm', severity_floor: true, pass_threshold: 0.9,
  ai_model: 'sonnet', ai_provider: 'anthropic' };

// Mock ai.complete. `extraction` selects the extraction-call response:
//   'normal'        -> a valid claim array, stop_reason end_turn (claims optionally injected)
//   'truncated_sync'-> non-empty unparseable body + stop_reason:'max_tokens' (sync signal)
//   'truncated_batch'-> same unparseable body, NO stop_reason (skeleton strips it in batch)
//   'error'         -> the call throws (ok:false path)
// Verification marks any claim containing FABRICATED as unsupported/high, else supported.
function makeMock({ extraction = 'normal', claims = null } = {}) {
  return async ({ prompt, cache_prefix }) => {
    const full = (cache_prefix || '') + prompt;
    if (/claim-extraction assistant/i.test(full)) {
      if (extraction === 'error') throw new Error('extraction_overloaded');
      if (extraction === 'truncated_sync') {
        return { text: '["Push Gaming was founded in 2010.", "It holds an MGA licen', stop_reason: 'max_tokens' };
      }
      if (extraction === 'truncated_batch') {
        return { text: '["Push Gaming was founded in 2010.", "It holds an MGA licen' };
      }
      const arr = claims || [
        'Push Gaming was founded in 2010.', 'It holds an MGA licence.',
        'It reported 40% revenue growth in 2021.', 'It employs 120 people.',
        'It partnered with LeoVegas in 2019.',
      ];
      return { text: JSON.stringify(arr), stop_reason: 'end_turn' };
    }
    const lines = (prompt.match(/^\d+\.\s.*$/gm) || []);
    const verdicts = lines.map((line) => {
      const claim = line.replace(/^\d+\.\s/, '');
      const fab = /FABRICATED/.test(claim);
      return { claim, verdict: fab ? 'unsupported' : 'supported', quote: null, severity: fab ? 'high' : 'medium' };
    });
    return { text: JSON.stringify(verdicts) };
  };
}

async function runSync(exec, entities, options, mock) {
  const partial = [];
  const tools = { logger: NOOP, progress: { update() {} }, _partialItems: partial,
    ai: { complete: async (a) => mock(a) } };
  const res = await exec({ entities }, options, tools);
  return { res, partial };
}

// Drive the batch path exactly as the skeleton does -- crucially, strip stop_reason on the
// extraction response (skeleton stageWorker.js:1213 normalises to {ok,text}).
async function runBatch(exec, entities, options, mock) {
  const tools = { logger: NOOP };
  const { state, extractionRequests } = exec.prepareExtractionRequests(entities, options, tools);
  const extractionByEntityIdx = [];
  for (const req of extractionRequests) {
    try {
      const r = await mock(req.args);
      extractionByEntityIdx[req.entityIdx] = { ok: true, text: r.text }; // stop_reason stripped
    } catch (err) {
      extractionByEntityIdx[req.entityIdx] = { ok: false, error: err.message };
    }
  }
  const { verificationRequests } = exec.prepareVerificationRequests(entities, options, state, extractionByEntityIdx, tools);
  const verificationByEntityIdx = [];
  for (const req of verificationRequests) {
    const r = await mock(req.args);
    (verificationByEntityIdx[req.entityIdx] ||= [])[req.batchIdx] = { ok: true, text: r.text };
  }
  return exec.parseResults(entities, options, state, verificationByEntityIdx, tools);
}

(async () => {
  console.log('\n=== Extraction-truncation guard ===\n');

  // --- 1. THE MISS TEST (sync) ----------------------------------------------------------
  console.log('1. sync truncation: pre-fix PASSES (regex fallback), fix FAILS LOUD');
  {
    const headRes = (await runSync(executePrefix, [entity()], OPTS, makeMock({ extraction: 'truncated_sync' }))).res;
    const headItem = headRes.results[0].items[0];
    assert(headItem.qa_pass === true,
      `pre-fix ddc89e7: truncated extraction -> regex fallback -> qa_pass:true (documents the false pass; score ${headItem.hallucination_score})`);

    const fixRes = (await runSync(execute, [entity()], OPTS, makeMock({ extraction: 'truncated_sync' }))).res;
    const fixItem = fixRes.results[0].items[0];
    const fixMeta = fixRes.results[0].meta;
    assert(fixItem.qa_pass === false, 'fix: truncated extraction -> qa_pass:false');
    assert(fixMeta.status === 'error', 'fix: meta.status === "error" (deriveEntityRunStatus -> failed)');
    assert(fixItem.status === 'error' && fixItem.needs_review === true, 'fix: item.status error + needs_review (partial-salvage safe)');
    assert(/extraction/i.test(fixMeta.error || '') && /truncat/i.test(fixMeta.error + fixItem.summary_text),
      'fix: error/summary names the truncated extraction (loud, not silent)');
  }

  // --- 2. THE MISS TEST (batch, stop_reason stripped) -----------------------------------
  console.log('\n2. batch truncation (stop_reason stripped): pre-fix PASSES, fix FAILS LOUD');
  {
    const headRes = await runBatch(executePrefix, [entity()], OPTS, makeMock({ extraction: 'truncated_batch' }));
    assert(headRes.results[0].items[0].qa_pass === true,
      'pre-fix ddc89e7: batch truncation -> regex fallback -> qa_pass:true (false pass)');

    const fixRes = await runBatch(execute, [entity()], OPTS, makeMock({ extraction: 'truncated_batch' }));
    assert(fixRes.results[0].items[0].qa_pass === false && fixRes.results[0].meta.status === 'error',
      'fix: batch truncation -> qa_pass:false + meta.status error (caught without stop_reason)');
  }

  // --- 3. BYTE-IDENTITY on a normal extraction (sync + batch) ----------------------------
  console.log('\n3. byte-identity vs ddc89e7 on a normal (non-truncated) extraction');
  {
    const headSync = (await runSync(executePrefix, [entity()], OPTS, makeMock())).res;
    const fixSync = (await runSync(execute, [entity()], OPTS, makeMock())).res;
    assert(JSON.stringify(fixSync) === JSON.stringify(headSync),
      'sync: fix output === ddc89e7 output (normal extraction unchanged)');

    const headBatch = await runBatch(executePrefix, [entity()], OPTS, makeMock());
    const fixBatch = await runBatch(execute, [entity()], OPTS, makeMock());
    assert(JSON.stringify(fixBatch) === JSON.stringify(headBatch),
      'batch: fix output === ddc89e7 output (normal extraction unchanged)');

    // 4. BATCH PARITY: normal sync == batch under the fix.
    assert(JSON.stringify(fixSync.results[0]) === JSON.stringify(fixBatch.results[0]),
      'fix: normal extraction sync result === batch result (parity held)');
    assert(fixSync.results[0].items[0].qa_pass === true, 'fix: normal all-supported extraction PASSES (no false trip)');
  }

  // --- 5. Fabrication still blocks after the fix ----------------------------------------
  console.log('\n5. a genuine unsupported/high fabrication still trips the floor (fix does not disturb verification)');
  {
    const fabClaims = [
      'Push Gaming was founded in 2010.', 'It holds an MGA licence.',
      'FABRICATED: Push Gaming acquired Halcyon Interactive for USD 240 million.',
    ];
    const fixRes = (await runSync(execute, [entity()], OPTS, makeMock({ claims: fabClaims }))).res;
    const it = fixRes.results[0].items[0];
    assert(it.qa_pass === false, 'fix: unsupported/high fabrication -> qa_pass:false (floor still trips)');
    assert(it.flagged_claims_count >= 1 && /Halcyon/.test(it.flagged_claims_text), 'fix: the fabrication is flagged');
  }

  // --- 6. Errored extraction still falls back to regex (settled, byte-identical) ---------
  console.log('\n6. errored extraction call still falls back to regex (settled behaviour preserved)');
  {
    const headErr = (await runSync(executePrefix, [entity()], OPTS, makeMock({ extraction: 'error' }))).res;
    const fixErr = (await runSync(execute, [entity()], OPTS, makeMock({ extraction: 'error' }))).res;
    assert(JSON.stringify(fixErr) === JSON.stringify(headErr),
      'errored extraction: fix === ddc89e7 (regex fallback preserved -- only truncation becomes loud)');
  }

  console.log(`\n=== Result: ${pass} pass, ${fail} fail ===`);
  process.exit(fail === 0 ? 0 : 1);
})();
