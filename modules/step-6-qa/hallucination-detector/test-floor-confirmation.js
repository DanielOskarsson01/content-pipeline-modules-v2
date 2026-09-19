/**
 * v1.9.0 — severity-floor confirmation pass (option `floor_confirmation`).
 *
 * A tripped floor no longer blocks immediately when the option is on: the
 * floor-tripping HIGH claims are re-verified in a small focused batch
 * (uncontended retrieval) and the floor stands only on a HIGH that survives.
 * Fail-closed: an errored call / unparseable response / missing verdict keeps
 * its claims blocking. Default off = byte-identical (proven here against the
 * committed HEAD execute.js on identical mocked responses).
 *
 * Run: node modules/step-6-qa/hallucination-detector/test-floor-confirmation.js
 */
const assert = require('assert');
const path = require('path');
const execute = require('./execute.js');
const { loadHeadExecute } = require('../../_shared/__fixtures__/head-ab.js');

let checks = 0;
function check(name, cond) { assert.ok(cond, name); checks++; }

// ── Fixture ──────────────────────────────────────────────────────────────────
// Draft sentences chosen to extract deterministically via the regex patterns
// ("founded in <year>", "$<n> million in <year>", "employs <n>"). "Zenith" marks
// the claim the mock grades unsupported/HIGH on the main pass.
function makeEntity(extraHighs = 0) {
  let draft =
    'Acme Corp was founded in 1999. ' +
    'Acme Corp employs 500 people. ' +
    'Acme Corp acquired Zenith Ltd for $10 million in 2020.';
  for (let i = 0; i < extraHighs; i++) {
    draft += ` Acme Corp acquired Zenith Unit ${i + 1} for $${i + 2} million in 201${i % 10}.`;
  }
  return {
    name: 'Acme Corp',
    items: [
      { url: 'https://acme.example/about', text_content: 'Acme Corp was founded in 1999 by Jane Doe. The company employs 500 people across Europe and makes widgets.' },
      { url: 'https://acme.example/news', text_content: 'Acme Corp announced a new widget line and opened an office in Berlin.' },
    ].concat([{ entity_name: 'Acme Corp', content_markdown: draft }]),
  };
}

const BASE_OPTIONS = {
  pass_threshold: 0.6,
  severity_floor: true,
  source_selection: 'claim_anchored',
  claims_per_batch: 25,
};

// Mock ai: grades every claim supported except those containing a marker.
// A call whose EVERY claim was already verified once is a confirmation
// re-verification (claims are re-sent verbatim); it uses confirmRule.
function makeTools({ mainRule, confirmRule, confirmThrows = false, confirmGarbage = false }) {
  const seen = new Set();
  const calls = [];
  const warns = [];
  const tools = {
    logger: { info() {}, warn(m) { warns.push(m); }, error() {} },
    progress: { update() {} },
    ai: {
      async complete({ prompt }) {
        const claimsSection = prompt.split('\nCLAIMS:\n').pop();
        const claims = [...claimsSection.matchAll(/^\d+\.\s(.+)$/gm)].map(m => m[1]);
        const isConfirmation = claims.length > 0 && claims.every(c => seen.has(c));
        calls.push({ claims, isConfirmation });
        if (isConfirmation) {
          if (confirmThrows) throw new Error('simulated confirmation outage');
          if (confirmGarbage) return { text: 'I cannot answer in the requested format.' };
          return { text: JSON.stringify(claims.map(c => confirmRule(c))) };
        }
        for (const c of claims) seen.add(c);
        return { text: JSON.stringify(claims.map(c => mainRule(c))) };
      },
    },
  };
  return { tools, calls, warns };
}

const SUPPORTED = () => ({ verdict: 'supported', severity: 'low', quote: 'q' });
const HIGH_IF_ZENITH = c => /Zenith/.test(c)
  ? { verdict: 'unsupported', severity: 'high', quote: null }
  : { verdict: 'supported', severity: 'low', quote: 'q' };

(async () => {
  // ── 1. Option OFF is byte-identical to committed HEAD on a floor-tripping run ──
  {
    const headExecute = loadHeadExecute('modules/step-6-qa/hallucination-detector/execute.js');
    const runs = [];
    for (const mod of [headExecute, execute]) {
      const { tools, calls } = makeTools({ mainRule: HIGH_IF_ZENITH, confirmRule: SUPPORTED });
      const res = await mod({ entities: [makeEntity()] }, { ...BASE_OPTIONS }, tools);
      runs.push({ res, prompts: calls.map(c => c.claims.join('|')), n: calls.length });
    }
    check('off: HEAD and working tree produce deep-equal results', JSON.stringify(runs[0].res) === JSON.stringify(runs[1].res));
    check('off: identical claim batches issued', JSON.stringify(runs[0].prompts) === JSON.stringify(runs[1].prompts));
    check('off: no extra LLM call', runs[0].n === runs[1].n);
    check('off: floor tripped and blocks', runs[1].res.results[0].meta.severity_floor_tripped === true && runs[1].res.results[0].meta.qa_pass === false);
    check('off: no confirmation meta keys', !('floor_confirmation' in runs[1].res.results[0].meta) && !('floor_confirmation_pending' in runs[1].res.results[0].meta) && !('qa_pass_at_threshold' in runs[1].res.results[0].meta));
  }

  // ── 2. Option ON, confirmation re-grades HIGH → floor stands ──
  {
    const { tools, calls } = makeTools({ mainRule: HIGH_IF_ZENITH, confirmRule: c => ({ verdict: 'unsupported', severity: 'high', quote: null }) });
    const res = await execute({ entities: [makeEntity()] }, { ...BASE_OPTIONS, floor_confirmation: true }, tools);
    const m = res.results[0].meta;
    const item = res.results[0].items[0];
    check('confirm: one extra call, and it is a confirmation', calls.length === 2 && calls[1].isConfirmation);
    check('confirm: confirmation batch contains exactly the HIGH claim', calls[1].claims.length === 1 && /Zenith/.test(calls[1].claims[0]));
    check('confirm: qa_pass stays false', m.qa_pass === false && item.qa_pass === false);
    check('confirm: counts', m.floor_confirmation.highs_initial === 1 && m.floor_confirmation.highs_confirmed === 1 && m.floor_confirmation.highs_cleared === 0);
    check('confirm: flag annotated floor_confirmed:true', item.flagged_claims.find(f => /Zenith/.test(f.claim)).floor_confirmed === true);
    check('confirm: handshake keys removed', !('floor_confirmation_pending' in m) && !('qa_pass_at_threshold' in m));
    check('confirm: summary says the floor stands', /FLOOR CONFIRMATION: 1 of 1/.test(item.summary_text));
  }

  // ── 3. Option ON, confirmation clears the HIGH → floor released, score decides ──
  {
    const { tools, calls } = makeTools({ mainRule: HIGH_IF_ZENITH, confirmRule: SUPPORTED });
    const res = await execute({ entities: [makeEntity()] }, { ...BASE_OPTIONS, floor_confirmation: true }, tools);
    const m = res.results[0].meta;
    const item = res.results[0].items[0];
    check('clear: qa_pass true at threshold (2/3 = 0.667 >= 0.6)', m.qa_pass === true && item.qa_pass === true);
    check('clear: floor trip stays on record', m.severity_floor_tripped === true);
    check('clear: counts', m.floor_confirmation.highs_confirmed === 0 && m.floor_confirmation.highs_cleared === 1);
    check('clear: flags RETAINED for review', item.flagged_claims_count === 1 && item.flagged_claims.find(f => /Zenith/.test(f.claim)).floor_confirmed === false);
    check('clear: score untouched', item.hallucination_score === 0.667);
    check('clear: summary says released', /floor is released/.test(item.summary_text));
    check('clear: 2 calls total', calls.length === 2);
  }

  // ── 4. Released floor still FAILs below threshold (exact, unrounded decision) ──
  {
    const { tools } = makeTools({ mainRule: HIGH_IF_ZENITH, confirmRule: SUPPORTED });
    const res = await execute({ entities: [makeEntity()] }, { ...BASE_OPTIONS, pass_threshold: 0.7, floor_confirmation: true }, tools);
    const m = res.results[0].meta;
    check('below-threshold: floor released but qa_pass false (0.667 < 0.7)', m.floor_confirmation.highs_confirmed === 0 && m.qa_pass === false);
  }

  // ── 5. Fail-closed: confirmation call throws → claims stay confirmed ──
  {
    const { tools, warns } = makeTools({ mainRule: HIGH_IF_ZENITH, confirmRule: SUPPORTED, confirmThrows: true });
    const res = await execute({ entities: [makeEntity()] }, { ...BASE_OPTIONS, floor_confirmation: true }, tools);
    const m = res.results[0].meta;
    check('throw: qa_pass false', m.qa_pass === false);
    check('throw: HIGH confirmed by fail-closed', m.floor_confirmation.highs_confirmed === 1);
    check('throw: warned', warns.some(w => /fail-closed/.test(w)));
    check('throw: entity is NOT an infra error (main verification completed)', !m.status);
  }

  // ── 5b. Fail-closed mid-run: 2 confirmation batches, first clears, second throws ──
  // (batch-1's affirmative clears are honored; the thrown batch's claim fail-closes)
  {
    let confirmCalls = 0;
    const seen = new Set();
    const calls = [];
    const tools = {
      logger: { info() {}, warn() {}, error() {} },
      progress: { update() {} },
      ai: {
        async complete({ prompt }) {
          const claims = [...prompt.split('\nCLAIMS:\n').pop().matchAll(/^\d+\.\s(.+)$/gm)].map(m => m[1]);
          const isConfirmation = claims.length > 0 && claims.every(c => seen.has(c));
          calls.push({ claims, isConfirmation });
          if (isConfirmation) {
            confirmCalls++;
            if (confirmCalls === 2) throw new Error('outage on second confirmation batch');
            return { text: JSON.stringify(claims.map(SUPPORTED)) };
          }
          for (const c of claims) seen.add(c);
          return { text: JSON.stringify(claims.map(HIGH_IF_ZENITH)) };
        },
      },
    };
    const res = await execute({ entities: [makeEntity(8)] }, { ...BASE_OPTIONS, floor_confirmation: true }, tools);
    const m = res.results[0].meta;
    check('mid-throw: batch-1 clears honored, thrown batch confirmed', m.floor_confirmation.highs_cleared === 8 && m.floor_confirmation.highs_confirmed === 1);
    check('mid-throw: floor stands', m.qa_pass === false);
    check('mid-throw: fail-closed claim audited as unverified/high', m.floor_confirmation.claims.filter(c => c.confirmed).every(c => c.verdict === 'unverified' && c.severity === 'high'));
  }

  // ── 6. Fail-closed: unparseable confirmation response → confirmed ──
  {
    const { tools } = makeTools({ mainRule: HIGH_IF_ZENITH, confirmRule: SUPPORTED, confirmGarbage: true });
    const res = await execute({ entities: [makeEntity()] }, { ...BASE_OPTIONS, floor_confirmation: true }, tools);
    check('garbage: qa_pass false, HIGH confirmed', res.results[0].meta.qa_pass === false && res.results[0].meta.floor_confirmation.highs_confirmed === 1);
  }

  // ── 7. No floor trip → zero confirmation calls, no confirmation meta ──
  {
    const { tools, calls } = makeTools({ mainRule: SUPPORTED, confirmRule: SUPPORTED });
    const res = await execute({ entities: [makeEntity()] }, { ...BASE_OPTIONS, floor_confirmation: true }, tools);
    check('no-trip: single call', calls.length === 1);
    check('no-trip: pass, no confirmation meta', res.results[0].meta.qa_pass === true && !('floor_confirmation' in res.results[0].meta));
  }

  // ── 8. Mixed HIGHs: one confirms, one clears → floor stands, counts honest ──
  {
    const confirmRule = c => /Unit 1/.test(c)
      ? { verdict: 'unsupported', severity: 'high', quote: null }
      : { verdict: 'unsupported', severity: 'medium', quote: null }; // downgraded → cleared
    const { tools } = makeTools({ mainRule: HIGH_IF_ZENITH, confirmRule });
    const res = await execute({ entities: [makeEntity(1)] }, { ...BASE_OPTIONS, floor_confirmation: true }, tools);
    const m = res.results[0].meta;
    check('mixed: floor stands', m.qa_pass === false);
    check('mixed: 2 highs, 1 confirmed, 1 cleared', m.floor_confirmation.highs_initial === 2 && m.floor_confirmation.highs_confirmed === 1 && m.floor_confirmation.highs_cleared === 1);
    check('mixed: audit trail carries confirmation verdict+severity', m.floor_confirmation.claims.every(c => c.verdict === 'unsupported' && ['high', 'medium'].includes(c.severity)));
  }

  // ── 8b. Severity gates the release, not the verdict: partial/HIGH stays confirmed ──
  // (the measured BC £50m/€50m currency-error shape: substance true, currency false —
  // re-verifies partial with severity HIGH; a verdict-based release would let it escape)
  {
    const { tools } = makeTools({ mainRule: HIGH_IF_ZENITH, confirmRule: () => ({ verdict: 'partial', severity: 'high', quote: 'the program exists' }) });
    const res = await execute({ entities: [makeEntity()] }, { ...BASE_OPTIONS, floor_confirmation: true }, tools);
    const m = res.results[0].meta;
    check('partial/high: floor STANDS (severity-gated release)', m.qa_pass === false && m.floor_confirmation.highs_confirmed === 1);
    check('partial/high: audit shows the partial verdict', m.floor_confirmation.claims[0].verdict === 'partial' && m.floor_confirmation.claims[0].severity === 'high');
  }

  // ── 8c. Supported at low severity clears; supported with missing severity → medium → clears ──
  {
    const { tools } = makeTools({ mainRule: HIGH_IF_ZENITH, confirmRule: () => ({ verdict: 'supported', quote: 'q' }) });
    const res = await execute({ entities: [makeEntity()] }, { ...BASE_OPTIONS, floor_confirmation: true }, tools);
    check('supported/no-severity: defaults medium → cleared', res.results[0].meta.qa_pass === true && res.results[0].meta.floor_confirmation.highs_cleared === 1);
  }

  // ── 9. Confirmation batching: >8 HIGHs split into batches of 8 ──
  {
    const { tools, calls } = makeTools({ mainRule: HIGH_IF_ZENITH, confirmRule: SUPPORTED });
    const res = await execute({ entities: [makeEntity(8)] }, { ...BASE_OPTIONS, floor_confirmation: true }, tools);
    const confCalls = calls.filter(c => c.isConfirmation);
    check('batching: 9 HIGHs → 2 confirmation batches (8+1)', confCalls.length === 2 && confCalls[0].claims.length === 8 && confCalls[1].claims.length === 1);
    check('batching: all cleared → released', res.results[0].meta.floor_confirmation.highs_cleared === 9);
  }

  // ── 10. Batch mode (Message Batches) forces the option off with a warning ──
  {
    const warns = [];
    const tools = { logger: { info() {}, warn(m) { warns.push(m); }, error() {} } };
    const entities = [makeEntity()];
    const { state } = execute.prepareExtractionRequests(entities, { ...BASE_OPTIONS, floor_confirmation: true }, tools);
    check('batch-mode: cfg forced off', state.cfg.floorConfirmation === false);
    check('batch-mode: warned sync-only', warns.some(w => /sync-only/.test(w)));
    const { verificationRequests } = execute.prepareVerificationRequests(entities, { ...BASE_OPTIONS, floor_confirmation: true }, state, undefined, tools);
    const byBatch = verificationRequests.map(req => {
      const claims = [...req.args.prompt.split('\nCLAIMS:\n').pop().matchAll(/^\d+\.\s(.+)$/gm)].map(x => x[1]);
      return { ok: true, text: JSON.stringify(claims.map(HIGH_IF_ZENITH)) };
    });
    const { results } = execute.parseResults(entities, { ...BASE_OPTIONS, floor_confirmation: true }, state, { 0: byBatch }, tools);
    check('batch-mode: floor blocks all-or-nothing, no pending handshake', results[0].meta.qa_pass === false && !('floor_confirmation_pending' in results[0].meta) && !('qa_pass_at_threshold' in results[0].meta));
  }

  console.log(`test-floor-confirmation: ${checks} checks passed`);
})().catch(err => { console.error(err); process.exit(1); });
