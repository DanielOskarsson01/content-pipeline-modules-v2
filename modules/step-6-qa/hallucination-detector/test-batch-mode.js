/**
 * Phase 2B batch-mode tests -- deterministic, no network.
 * Run from repo root: CLAUDE_SCRATCH=<dir> node modules/step-6-qa/hallucination-detector/test-batch-mode.js
 *
 * Proves:
 *  (1) SYNC byte-identity vs FROZEN d35dd61 (result object AND tools._partialItems) across
 *      configs incl. the exact run-628d12c9 config -- the staging refactor changed nothing.
 *  (2) ROUND-TRIP EQUIVALENCE: prepareExtractionRequests -> (mock results) ->
 *      prepareVerificationRequests -> (mock results, arrival order REVERSED) -> parseResults
 *      reproduces the sync per-entity results + summary EXACTLY on the same responses.
 *      This is the acceptance that matters: parse reproduces sync verdicts EXACTLY.
 *  (3) prepare emits the right request count; skeleton-assigned custom_ids are unique;
 *      responses map back BY batchIdx (proven by feeding them out of order).
 *  (4) guards (no-content / no-sources fail|flag|pass / zero-claims) short-circuit in
 *      prepare with NO batch requests, and batch result == sync result.
 *  (5) loud-fail: an errored / missing verification request -> meta.status:'error' +
 *      qa_pass:false (the entity fails, never a silent pass); an extraction error ->
 *      regex fallback, batch == sync.
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const mod = require('./execute.js');
const execute = mod;

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { console.log(`  PASS: ${msg}`); pass++; }
  else { console.log(`  FAIL: ${msg}`); fail++; }
}

const REPO = '/Users/danieloskarsson/dev/content-pipeline-modules-v2';
const FROZEN = 'd35dd61'; // origin/main at unit start (== deployed sync path)
const SCRATCH = process.env.CLAUDE_SCRATCH ||
  '/private/tmp/claude-501/-Users-danieloskarsson-dev-content-pipeline-modules-v2/86dc143e-e128-48cc-a031-ae08e1efebe0/scratchpad';
const frozenPath = path.join(SCRATCH, 'hd-frozen-d35dd61-execute.js');
execSync(
  `git -C ${REPO} show ${FROZEN}:modules/step-6-qa/hallucination-detector/execute.js > ${frozenPath}`,
  { stdio: ['ignore', 'ignore', 'inherit'] }
);
const executeFrozen = require(frozenPath);

const NOOP = { info() {}, warn() {}, error() {} };
const FIX = path.join(__dirname, 'fixtures');
const elk = fs.readFileSync(path.join(FIX, 'elk_editor_it1.md'), 'utf8');

// A pure, deterministic ai.complete: response depends ONLY on the args (prompt+cache_prefix),
// never on order or call count -- so sync and batch, which build identical args, get identical
// responses. Extraction returns the draft's content lines as claims; verification marks a claim
// "unsupported/high" iff a MISSING<x> token in it is NOT present in the SOURCE MATERIAL portion.
function makeMock() {
  return async ({ prompt, cache_prefix }) => {
    const full = (cache_prefix || '') + prompt;
    if (/claim-extraction assistant/i.test(full)) {
      const article = full.split('ARTICLE:').slice(1).join('ARTICLE:');
      const claims = article.split('\n').map(s => s.trim()).filter(s => s.length > 20).slice(0, 12);
      return { text: JSON.stringify(claims) };
    }
    const sourcePart = full.split('SOURCE MATERIAL:').slice(1).join('SOURCE MATERIAL:');
    const claimLines = (prompt.match(/^\d+\.\s.*$/gm) || []);
    const verdicts = claimLines.map((line) => {
      const claim = line.replace(/^\d+\.\s/, '');
      const miss = claim.match(/MISSING\w+/);
      const supported = !miss || sourcePart.includes(miss[0]);
      return { claim, verdict: supported ? 'supported' : 'unsupported', quote: null, severity: 'high' };
    });
    return { text: JSON.stringify(verdicts) };
  };
}

// Fat entity: multi-batch + MISSING tokens whose evidence sits on a FAR page, so
// claim_anchored produces base+supplement and exercises the severity floor + evidence tags.
function fatEntity() {
  const items = [{
    content_markdown:
      '# Acme\n\nAcme partnered with ZEBRACORP in 2019.\n' +
      'Acme reported MISSINGONE revenue growth in 2021.\n' +
      'Acme opened an office described as MISSINGTWO last year.\n',
  }];
  for (let i = 0; i < 8; i++) items.push({ text_content: `Filler page ${i}. General note. ${'y'.repeat(900)}` });
  items.push({ text_content: 'In 2019, ZEBRACORP signed a partnership with Acme. Acme reported MISSINGONE revenue growth. Acme office MISSINGTWO confirmed.' });
  return { name: 'Acme', items };
}
function elkEntity() {
  return { name: 'ELK Studios', items: [
    { content_markdown: elk },
    { text_content: 'ELK Studios launched in 2010 with 500 games and a partnership with SkillOnNet.' },
    { text_content: 'More ELK context. ' + 'z'.repeat(1500) },
    { text_content: 'ELK is headquartered in Stockholm and licensed by the MGA. ' + 'q'.repeat(1200) },
  ] };
}

// Run the SYNC path with a recording tools object.
async function runSync(entities, options, mock) {
  const partial = [];
  const calls = [];
  const tools = {
    logger: NOOP, progress: { update() {} }, _partialItems: partial,
    ai: { complete: async (a) => { calls.push(a); return mock(a); } },
  };
  const res = await execute({ entities }, options, tools);
  return { res, partial, calls };
}

// Drive the BATCH path exactly as the skeleton will: prepare extractions -> respond ->
// prepare verifications -> respond (arrival order REVERSED, placed BY batchIdx) -> parse.
async function runBatch(entities, options, mock, { injectVerifyError = null, dropVerify = null, extractionErrorIdx = null } = {}) {
  const tools = { logger: NOOP };
  const { state, extractionRequests } = mod.prepareExtractionRequests(entities, options, tools);
  const extractIds = extractionRequests.map(r => `esr${r.entityIdx}__x0`);
  const extractionByEntityIdx = [];
  for (const req of extractionRequests) {
    if (extractionErrorIdx != null && req.entityIdx === extractionErrorIdx) {
      extractionByEntityIdx[req.entityIdx] = { ok: false, error: 'extraction_overloaded' };
    } else {
      const r = await mock(req.args);
      extractionByEntityIdx[req.entityIdx] = { ok: true, text: r.text };
    }
  }
  const { verificationRequests } = mod.prepareVerificationRequests(entities, options, state, extractionByEntityIdx, tools);
  const verifyIds = verificationRequests.map(r => `esr${r.entityIdx}__v${r.batchIdx}`);
  const verificationByEntityIdx = [];
  // Reverse arrival order to prove reconciliation is by batchIdx, not arrival position.
  for (const req of [...verificationRequests].reverse()) {
    (verificationByEntityIdx[req.entityIdx] ||= []);
    if (injectVerifyError && injectVerifyError.entityIdx === req.entityIdx && injectVerifyError.batchIdx === req.batchIdx) {
      verificationByEntityIdx[req.entityIdx][req.batchIdx] = { ok: false, error: injectVerifyError.error || 'overloaded' };
    } else if (dropVerify && dropVerify.entityIdx === req.entityIdx && dropVerify.batchIdx === req.batchIdx) {
      // leave the slot undefined (simulates a result Anthropic never returned)
    } else {
      const r = await mock(req.args);
      verificationByEntityIdx[req.entityIdx][req.batchIdx] = { ok: true, text: r.text };
    }
  }
  const parsed = mod.parseResults(entities, options, state, verificationByEntityIdx, tools);
  return { ...parsed, extractIds, verifyIds, extractionRequests, verificationRequests };
}

const CONFIGS = [
  { label: '628d12c9 (llm/anchored/cache/floor/25)', opts: {
      claim_extraction: 'llm', claims_per_batch: 25, source_selection: 'claim_anchored',
      cache_base_window: true, severity_floor: true, severity_model: 'current',
      pass_threshold: 0.9, max_source_chars: 100000, ai_model: 'sonnet', ai_provider: 'anthropic' } },
  { label: 'default (regex/head)', opts: {} },
  { label: 'evidence_absent (llm/anchored/floor)', opts: {
      claim_extraction: 'llm', source_selection: 'claim_anchored', severity_floor: true,
      severity_model: 'evidence_absent', ai_model: 'sonnet', ai_provider: 'anthropic' } },
  { label: 'multibatch (regex/anchored/cpb1)', opts: {
      claim_extraction: 'regex', source_selection: 'claim_anchored', claims_per_batch: 1,
      ai_model: 'sonnet', ai_provider: 'anthropic' } },
];

(async () => {
  console.log('\n=== Phase 2B batch-mode ===\n');

  // ── 1. SYNC byte-identity vs FROZEN d35dd61 (result + _partialItems) ──────────────
  console.log('1. sync output === FROZEN d35dd61 (result AND _partialItems), all configs');
  for (const { label, opts } of CONFIGS) {
    const ents = [elkEntity(), fatEntity()];
    const a = await runSync(ents, opts, makeMock());
    const b = { partial: [] };
    // frozen run with its own recording tools
    const fp = [];
    const ftools = { logger: NOOP, progress: { update() {} }, _partialItems: fp,
      ai: { complete: async (x) => makeMock()(x) } };
    const fres = await executeFrozen({ entities: [elkEntity(), fatEntity()] }, opts, ftools);
    assert(JSON.stringify(a.res) === JSON.stringify(fres), `${label}: sync result === frozen`);
    assert(JSON.stringify(a.partial) === JSON.stringify(fp), `${label}: sync _partialItems === frozen`);
  }

  // ── 2. ROUND-TRIP EQUIVALENCE: batch results+summary === sync, same responses ─────
  console.log('\n2. batch (prepare->parse) results+summary === sync, same deterministic responses');
  for (const { label, opts } of CONFIGS) {
    const ents = [elkEntity(), fatEntity()];
    const sync = await runSync(ents, opts, makeMock());
    const batch = await runBatch([elkEntity(), fatEntity()], opts, makeMock());
    assert(JSON.stringify(batch.results) === JSON.stringify(sync.res.results), `${label}: batch results === sync results`);
    assert(JSON.stringify(batch.summary) === JSON.stringify(sync.res.summary), `${label}: batch summary === sync summary`);
  }

  // ── 3. request counts + unique custom_ids + batchIdx reconciliation ───────────────
  console.log('\n3. prepare request counts, unique custom_ids, batchIdx-keyed reconciliation');
  {
    // fatEntity has 3 regex claims; claims_per_batch:1 -> 3 verification batches.
    const opts = { claim_extraction: 'regex', source_selection: 'claim_anchored', claims_per_batch: 1, ai_model: 'sonnet', ai_provider: 'anthropic' };
    const batch = await runBatch([fatEntity()], opts, makeMock());
    // regex extractor keeps the two sentences carrying a year pattern ("in 2019", "in 2021");
    // "MISSINGTWO last year" has no numeric/date pattern, so it is not a claim -> 2 batches.
    assert(batch.extractIds.length === 0, 'regex mode: zero extraction requests');
    assert(batch.verifyIds.length === 2, `2 verification requests (one per regex-extracted claim) (${batch.verifyIds.length})`);
    assert(new Set(batch.verifyIds).size === batch.verifyIds.length, 'verification custom_ids are unique');
    assert(batch.verifyIds.every(id => /^esr\d+__v\d+$/.test(id)), 'custom_ids have no colons (Anthropic charset safe)');
    // llm config: exactly one extraction request per llm entity
    const b2 = await runBatch([elkEntity(), fatEntity()], CONFIGS[0].opts, makeMock());
    assert(b2.extractIds.length === 2, `llm mode: one extraction request per entity (${b2.extractIds.length})`);
    assert(new Set([...b2.extractIds, ...b2.verifyIds]).size === b2.extractIds.length + b2.verifyIds.length, 'all custom_ids across both rounds unique');
    // reconciliation order-independence already exercised (runBatch reverses arrival); confirm
    // section-2 multibatch equivalence covered it, and the flagged text is order-correct here:
    const sync = await runSync([fatEntity()], opts, makeMock());
    assert(JSON.stringify(batch.results[0]) === JSON.stringify(sync.res.results[0]),
      'reversed-arrival verification still reconstructs the exact sync result (batchIdx-keyed)');
  }

  // ── 4. guards short-circuit in prepare (no requests) + batch == sync ──────────────
  console.log('\n4. guards finalize in prepare (no batch requests) and match sync');
  {
    const guardEntities = {
      noContent: { name: 'NoContent', items: [{ text_content: 'a source with no draft ' + 'x'.repeat(300) }] },
      noSourcesFail: { name: 'NoSrcFail', items: [{ content_markdown: 'Acme founded in 2010 with 500 employees.' }] },
      zeroClaimsShort: { name: 'ZeroShort', items: [{ content_markdown: 'A short qualitative note about quality.' }, { text_content: 'src ' + 'y'.repeat(200) }] },
      zeroClaimsLong: { name: 'ZeroLong', items: [{ content_markdown: 'Purely qualitative prose. '.repeat(40) }, { text_content: 'src ' + 'y'.repeat(200) }] },
    };
    const guardOptsList = [
      { label: 'no-content(fail)', opts: {}, ent: guardEntities.noContent },
      { label: 'no-content(allow)', opts: { allow_empty_content: true }, ent: guardEntities.noContent },
      { label: 'no-sources(fail)', opts: {}, ent: guardEntities.noSourcesFail },
      { label: 'no-sources(flag)', opts: { no_sources_behavior: 'flag' }, ent: guardEntities.noSourcesFail },
      { label: 'no-sources(pass)', opts: { no_sources_behavior: 'pass' }, ent: guardEntities.noSourcesFail },
      { label: 'zero-claims(short)', opts: {}, ent: guardEntities.zeroClaimsShort },
      { label: 'zero-claims(long/substantial)', opts: {}, ent: guardEntities.zeroClaimsLong },
    ];
    for (const { label, opts, ent } of guardOptsList) {
      const sync = await runSync([ent], opts, makeMock());
      const batch = await runBatch([ent], opts, makeMock());
      assert(JSON.stringify(batch.results[0]) === JSON.stringify(sync.res.results[0]), `${label}: batch == sync`);
      assert(batch.verifyIds.length === 0 && batch.extractIds.length === 0, `${label}: no batch requests (finalized in prepare)`);
    }
  }

  // ── 5. loud-fail on errored/missing request; extraction-error -> regex fallback ────
  console.log('\n5. loud-fail: errored/missing verification -> meta.status error + qa_pass false');
  {
    const opts = { claim_extraction: 'regex', source_selection: 'claim_anchored', claims_per_batch: 1, ai_model: 'sonnet', ai_provider: 'anthropic' };
    // errored verification request (batch 1 of Acme)
    const errored = await runBatch([fatEntity()], opts, makeMock(), { injectVerifyError: { entityIdx: 0, batchIdx: 1, error: 'overloaded_error' } });
    const e = errored.results[0];
    assert(e.meta.status === 'error', 'errored request -> meta.status === "error" (deriveEntityRunStatus -> failed)');
    assert(e.items[0].qa_pass === false, 'errored request -> qa_pass false (not a silent pass)');
    assert(/errored or expired/.test(e.items[0].summary_text), 'summary names the failed batch (loud)');
    // missing verification result (Anthropic never returned it) -- drop an existing batch (0)
    const missing = await runBatch([fatEntity()], opts, makeMock(), { dropVerify: { entityIdx: 0, batchIdx: 0 } });
    assert(missing.results[0].meta.status === 'error' && missing.results[0].items[0].qa_pass === false, 'missing verification result -> loud entity fail');
    // extraction error -> regex fallback -> batch == sync (where sync extraction ai.complete throws)
    const llmOpts = CONFIGS[0].opts;
    const throwOnExtract = () => {
      let n = 0;
      return async (a) => {
        if (/claim-extraction assistant/i.test((a.cache_prefix || '') + a.prompt)) { n++; if (n === 1) throw new Error('extraction_overloaded'); }
        return makeMock()(a);
      };
    };
    const syncThrow = await runSync([fatEntity()], llmOpts, throwOnExtract());
    const batchErr = await runBatch([fatEntity()], llmOpts, makeMock(), { extractionErrorIdx: 0 });
    assert(JSON.stringify(batchErr.results[0]) === JSON.stringify(syncThrow.res.results[0]),
      'extraction error: batch (errored extraction) === sync (thrown extraction) via regex fallback');
  }

  console.log(`\n=== Result: ${pass} pass, ${fail} fail ===`);
  process.exit(fail === 0 ? 0 : 1);
})();
