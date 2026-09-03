/**
 * COST_OPTIMISATION Units A + B (MODEL_SCREEN Screen 5) -- deterministic, no network.
 *
 * Run: node modules/step-6-qa/hallucination-detector/test-cost-optim.js
 * From repo root. ai.complete is mocked and CAPTURES {prompt, cache_prefix, model,
 * provider} per call, and distinguishes extraction from verification calls.
 *
 * Unit A -- extraction_model / extraction_provider: the claim-EXTRACTION call can run
 * on a cheaper model; default null inherits ai_model/ai_provider (byte-identical);
 * VERIFICATION always stays on ai_model/ai_provider (the referee is untouched).
 *
 * Unit B -- cache_base_window: reuse the stable base (head) window across an entity's
 * verification batches via a cache_prefix. Default false = byte-identical single
 * prompt. When on (anthropic only): cache_prefix is identical across batches, the
 * assembled cache_prefix+prompt shows the SAME instructions + SAME source chunks +
 * SAME claims as the single-prompt path (only reordered), selectedOrders is unchanged,
 * and the deterministic verdicts are identical (reorder-invariant).
 *
 * The load-bearing safety proof is #1: default-off output is byte-identical to the
 * FROZEN prod commit 5be7de5 (git show, so it stays meaningful after this commit).
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const execute = require('./execute.js');
const { asBool, selectAnchoredWindow, chunkSources, PROMPT_HEADER } = require('./execute.js');
const SOURCE_SEP = '\n\n---SOURCE BOUNDARY---\n\n'; // mirror of the module const

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { console.log(`  PASS: ${msg}`); pass++; }
  else { console.log(`  FAIL: ${msg}`); fail++; }
}

const REPO = '/Users/danieloskarsson/dev/content-pipeline-modules-v2';
const FROZEN = '5be7de5'; // prod HEAD at unit start (== deployed, per MODEL_SCREEN shasum)
const SCRATCH = process.env.CLAUDE_SCRATCH ||
  '/private/tmp/claude-501/-Users-danieloskarsson-dev-content-pipeline-modules-v2/390ee1ed-655f-47d4-805d-2bdc5f6599f2/scratchpad';
const frozenPath = path.join(SCRATCH, 'hd-frozen-5be7de5-execute.js');
execSync(
  `git -C ${REPO} show ${FROZEN}:modules/step-6-qa/hallucination-detector/execute.js > ${frozenPath}`,
  { stdio: ['ignore', 'ignore', 'inherit'] }
);
const executeFrozen = require(frozenPath);

const FIX = path.join(__dirname, 'fixtures');
const elk = fs.readFileSync(path.join(FIX, 'elk_editor_it1.md'), 'utf8');

// A tools factory whose ai.complete records every call and returns a deterministic,
// REORDER-INVARIANT verdict: it reconstructs the full text the model would see
// (cache_prefix + prompt), then marks a claim "unsupported" iff a "MISSINGxx" token
// in the claim does NOT appear in the SOURCE MATERIAL portion. So the verdict depends
// only on WHICH claims + WHICH source chunks are present, never on their order.
function makeTools({ ai_model_expected } = {}) {
  const calls = [];
  return {
    calls,
    logger: { info: () => {}, warn: () => {}, error: () => {} },
    progress: { update: () => {} },
    _partialItems: [],
    ai: {
      complete: async ({ prompt, cache_prefix, model, provider }) => {
        const full = (cache_prefix || '') + prompt;
        const isExtraction = /claim-extraction assistant/i.test(full);
        calls.push({ prompt, cache_prefix: cache_prefix ?? null, model, provider, isExtraction });
        if (isExtraction) {
          return { text: JSON.stringify([]) }; // force regex fallback path when used
        }
        // verification: claims are the numbered lines; source is the SOURCE MATERIAL part
        const sourcePart = full.split('SOURCE MATERIAL:').slice(1).join('SOURCE MATERIAL:');
        const claimLines = (prompt.match(/^\d+\.\s.*$/gm) || []);
        const verdicts = claimLines.map((line) => {
          const claim = line.replace(/^\d+\.\s/, '');
          const miss = claim.match(/MISSING\w+/);
          const supported = !miss || sourcePart.includes(miss[0]);
          return { claim, verdict: supported ? 'supported' : 'unsupported', quote: null, severity: 'high' };
        });
        return { text: JSON.stringify(verdicts) };
      },
    },
  };
}

// Build an entity with a fat corpus: N filler pages + one FAR page carrying the
// evidence token, so claim_anchored produces base + a supplement, i.e. multi-block.
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

// Trim each chunk so surrounding section whitespace (leading "\n" after the
// "SOURCE MATERIAL:" label, trailing "\n\n" before "CLAIMS:") does not spuriously
// distinguish otherwise-identical page chunks.
function chunkMultiset(text) {
  return text.split(SOURCE_SEP).map(s => s.trim()).filter(Boolean).sort();
}

(async () => {
  console.log('\n=== COST_OPTIMISATION Units A + B ===\n');

  // ── 1. DEFAULT-OFF byte-identity vs FROZEN 5be7de5 (the safety proof) ──────────
  console.log('1. default-off output === FROZEN 5be7de5 (regex+llm x head+anchored)');
  {
    const md = elk;
    const mkEntity = () => ({ name: 'ELK', items: [
      { content_markdown: md },
      { text_content: 'ELK Studios source. It launched in 2010 with 500 games and a partnership with SkillOnNet.' },
      { text_content: 'More ELK context. ' + 'z'.repeat(1200) },
    ] });
    const configs = [
      { label: 'regex/head', opts: {} },
      { label: 'regex/anchored', opts: { source_selection: 'claim_anchored' } },
      { label: 'llm/head', opts: { claim_extraction: 'llm' } },
      { label: 'llm/anchored', opts: { claim_extraction: 'llm', source_selection: 'claim_anchored' } },
    ];
    for (const { label, opts } of configs) {
      const a = makeTools(); const b = makeTools();
      const resFrozen = await executeFrozen({ entities: [mkEntity()] }, opts, a);
      const resNew = await execute({ entities: [mkEntity()] }, opts, b);
      assert(JSON.stringify(resNew) === JSON.stringify(resFrozen), `${label}: new output === frozen 5be7de5`);
      assert(b.calls.every(c => c.cache_prefix === null), `${label}: NO cache_prefix sent in default mode`);
    }
  }

  // ── 2. Unit A: extraction routing (inherit vs override), verification untouched ──
  console.log('\n2. Unit A: extraction_model/provider routes extraction, verification stays ai_model');
  {
    // 2a. inherit: no extraction_* set -> extraction call uses ai_model/ai_provider
    {
      const t = makeTools();
      await execute({ entities: [fatEntity()] },
        { claim_extraction: 'llm', ai_model: 'sonnet', ai_provider: 'anthropic' }, t);
      const ext = t.calls.filter(c => c.isExtraction);
      const ver = t.calls.filter(c => !c.isExtraction);
      assert(ext.length === 1, 'exactly one extraction call');
      assert(ext[0].model === 'sonnet' && ext[0].provider === 'anthropic', 'extraction inherits ai_model/provider when unset');
      assert(ver.length >= 1 && ver.every(c => c.model === 'sonnet' && c.provider === 'anthropic'), 'verification on ai_model/provider');
    }
    // 2b. override: extraction routed to gpt-oss/openrouter; verification STILL sonnet/anthropic
    {
      const t = makeTools();
      await execute({ entities: [fatEntity()] },
        { claim_extraction: 'llm', ai_model: 'sonnet', ai_provider: 'anthropic',
          extraction_model: 'gpt-oss-120b', extraction_provider: 'openrouter' }, t);
      const ext = t.calls.filter(c => c.isExtraction);
      const ver = t.calls.filter(c => !c.isExtraction);
      assert(ext[0].model === 'gpt-oss-120b' && ext[0].provider === 'openrouter', 'extraction routed to gpt-oss-120b/openrouter');
      assert(ver.every(c => c.model === 'sonnet' && c.provider === 'anthropic'), 'VERIFICATION untouched (referee stays sonnet/anthropic)');
    }
    // 2c. regex mode: extraction_* is inert (no extraction LLM call at all)
    {
      const t = makeTools();
      await execute({ entities: [fatEntity()] },
        { ai_model: 'sonnet', extraction_model: 'gpt-oss-120b', extraction_provider: 'openrouter' }, t);
      assert(t.calls.filter(c => c.isExtraction).length === 0, 'regex mode makes no extraction LLM call (extraction_* inert)');
    }
  }

  // ── 3. Unit B: selectAnchoredWindow now emits base/supp; selectedOrders UNCHANGED ─
  console.log('\n3. Unit B: selectAnchoredWindow base/supp split, selectedOrders unchanged, same chunk multiset');
  {
    const chunks = chunkSources(fatEntity().items.filter(it => it.text_content));
    const claims = ['Acme partnership with ZEBRACORP', 'Acme MISSINGONE revenue'];
    const win = selectAnchoredWindow(chunks, claims, 1500);
    // base is the head chunks; supp is the far chunk(s)
    assert(typeof win.baseText === 'string' && win.baseText.length > 0, 'baseText emitted');
    assert(typeof win.suppText === 'string', 'suppText emitted');
    // cache-assembled source (base + sep + supp) has the SAME chunk multiset as win.text
    const cacheSource = win.suppText ? win.baseText + SOURCE_SEP + win.suppText : win.baseText;
    assert(JSON.stringify(chunkMultiset(cacheSource)) === JSON.stringify(chunkMultiset(win.text)),
      'base+supp chunk multiset === interleaved win.text multiset (no content lost/added)');
    // the ZEBRACORP far page is pulled in as a supplement
    assert(win.suppText.includes('ZEBRACORP') || win.baseText.includes('ZEBRACORP'), 'far evidence present in the window');
  }

  // ── 4. Unit B ON (anchored): cache_prefix identical across batches, content-equiv ─
  console.log('\n4. Unit B ON (anchored): cache_prefix stable across batches + content-equivalent to single prompt');
  {
    // Force multiple batches: claims_per_batch=1 with a 3-claim draft -> 3 batches.
    const opts = { claim_extraction: 'regex', source_selection: 'claim_anchored', claims_per_batch: 1,
      ai_model: 'sonnet', ai_provider: 'anthropic' };
    const on = makeTools();
    await execute({ entities: [fatEntity()] }, { ...opts, cache_base_window: true }, on);
    const verOn = on.calls.filter(c => !c.isExtraction);
    assert(verOn.length >= 2, `multiple verification batches produced (${verOn.length})`);
    assert(verOn.every(c => typeof c.cache_prefix === 'string' && c.cache_prefix.length > 0), 'every batch sends a cache_prefix');
    const prefixes = new Set(verOn.map(c => c.cache_prefix));
    assert(prefixes.size === 1, 'cache_prefix is IDENTICAL across all batches (stable base -> cache hit on batch>=2)');
    assert([...prefixes][0].startsWith(PROMPT_HEADER), 'cache_prefix begins with the code-locked instruction header');
    assert([...prefixes][0].includes('SOURCE MATERIAL:'), 'cache_prefix carries the base source window');
    // content-equivalence: build the same batch's single-prompt (cache off) and compare content
    const off = makeTools();
    await execute({ entities: [fatEntity()] }, opts, off);
    const verOff = off.calls.filter(c => !c.isExtraction);
    assert(verOn.length === verOff.length, 'same batch count on and off');
    for (let k = 0; k < verOn.length; k++) {
      const fullOn = verOn[k].cache_prefix + verOn[k].prompt;
      const fullOff = verOff[k].prompt;
      // same instruction header + same claims
      assert(fullOn.startsWith(PROMPT_HEADER) && fullOff.startsWith(PROMPT_HEADER), `batch ${k}: both carry the header`);
      const claimsOn = (fullOn.split('CLAIMS:')[1] || '').match(/^\d+\.\s.*$/gm) || [];
      const claimsOff = (fullOff.split('CLAIMS:')[1] || '').match(/^\d+\.\s.*$/gm) || [];
      assert(JSON.stringify(claimsOn) === JSON.stringify(claimsOff), `batch ${k}: identical claims text`);
      // same source chunk multiset
      const srcOn = fullOn.split('SOURCE MATERIAL:').slice(1).join('SOURCE MATERIAL:').split('CLAIMS:')[0];
      const srcOff = fullOff.split('SOURCE MATERIAL:').slice(1).join('SOURCE MATERIAL:');
      assert(JSON.stringify(chunkMultiset(srcOn)) === JSON.stringify(chunkMultiset(srcOff)), `batch ${k}: identical source chunk multiset`);
    }
  }

  // ── 4b. Unit B ON (anchored + a real supplement): base|supp boundary preserved ────
  // A small budget forces selectAnchoredWindow to leave the far evidence page as a
  // SUPPLEMENT (not in the base). The cache tail must join it with a SOURCE_SEP so the
  // page boundary survives -- if the seam is glued, two pages merge into one chunk and
  // the source multiset diverges from the single-prompt path. (Regression test for the
  // "SOURCE_SEP on the wrong side" class.)
  console.log('\n4b. Unit B ON (anchored + supplement): base|supp boundary preserved, multiset equivalent');
  {
    const opts = { claim_extraction: 'regex', source_selection: 'claim_anchored', claims_per_batch: 1,
      max_source_chars: 1500, ai_model: 'sonnet', ai_provider: 'anthropic' };
    const on = makeTools(); const off = makeTools();
    await execute({ entities: [fatEntity()] }, { ...opts, cache_base_window: true }, on);
    await execute({ entities: [fatEntity()] }, opts, off);
    const vOn = on.calls.filter(c => !c.isExtraction), vOff = off.calls.filter(c => !c.isExtraction);
    let sawSupplement = false;
    for (let k = 0; k < vOn.length; k++) {
      const fullOn = vOn[k].cache_prefix + vOn[k].prompt;
      const srcOn = fullOn.split('SOURCE MATERIAL:').slice(1).join('SOURCE MATERIAL:').split('CLAIMS:')[0];
      const srcOff = vOff[k].prompt.split('SOURCE MATERIAL:').slice(1).join('SOURCE MATERIAL:');
      assert(JSON.stringify(chunkMultiset(srcOn)) === JSON.stringify(chunkMultiset(srcOff)),
        `batch ${k}: supplement-path source multiset matches single-prompt (boundary not glued)`);
      if (chunkMultiset(srcOn).length > 1) sawSupplement = true;
    }
    assert(sawSupplement, 'at least one batch exercised a multi-chunk (base+supplement) window');
  }

  // ── 5. Unit B ON (head): whole window is the cached base, identical across batches ─
  console.log('\n5. Unit B ON (head): full sourceText is the cache_prefix base, claims in the tail');
  {
    const opts = { claim_extraction: 'regex', source_selection: 'head', claims_per_batch: 1,
      ai_model: 'sonnet', ai_provider: 'anthropic', cache_base_window: true };
    const t = makeTools();
    await execute({ entities: [fatEntity()] }, opts, t);
    const ver = t.calls.filter(c => !c.isExtraction);
    assert(ver.length >= 2, `multiple batches (${ver.length})`);
    const prefixes = new Set(ver.map(c => c.cache_prefix));
    assert(prefixes.size === 1, 'head-mode cache_prefix identical across batches');
    assert(ver.every(c => !/^\s*\d+\.\s/m.test(c.cache_prefix)), 'claims are NOT in the cached prefix (they vary per batch)');
    assert(ver.every(c => /CLAIMS:/.test(c.prompt)), 'claims travel in the per-batch tail');
  }

  // ── 6. Unit B non-anthropic guard: cache off-path, base window NOT dropped ────────
  console.log('\n6. Unit B + non-anthropic provider: falls back to single prompt (base window preserved)');
  {
    const opts = { claim_extraction: 'regex', source_selection: 'claim_anchored', claims_per_batch: 1,
      ai_model: 'gemini-flash', ai_provider: 'gemini', cache_base_window: true };
    const t = makeTools();
    await execute({ entities: [fatEntity()] }, opts, t);
    const ver = t.calls.filter(c => !c.isExtraction);
    assert(ver.every(c => c.cache_prefix === null), 'non-anthropic: NO cache_prefix sent (would be dropped by the provider)');
    assert(ver.every(c => /SOURCE MATERIAL:/.test(c.prompt) && /CLAIMS:/.test(c.prompt)),
      'non-anthropic: single prompt still carries BOTH the base window and the claims');

    // The dangerous edge: an EXPLICIT null provider. ai.complete does NOT default a
    // null to anthropic (only undefined), so it would drop cache_prefix. The guard
    // must therefore fall back to the single prompt (never strip the base window).
    const tNull = makeTools();
    await execute({ entities: [fatEntity()] }, { ...opts, ai_provider: null }, tNull);
    const verNull = tNull.calls.filter(c => !c.isExtraction);
    assert(verNull.every(c => c.cache_prefix === null), 'ai_provider=null: NO cache_prefix (guard does not treat null as anthropic)');
    assert(verNull.every(c => /SOURCE MATERIAL:/.test(c.prompt)), 'ai_provider=null: base window stays in the single prompt (not stripped)');
  }

  // ── 7. Verdict parity: cache ON output === cache OFF output (deterministic) ───────
  console.log('\n7. Verdict parity: reorder does not change the result (deterministic verifier)');
  {
    const base = { claim_extraction: 'llm', source_selection: 'claim_anchored', claims_per_batch: 1,
      ai_model: 'sonnet', ai_provider: 'anthropic' };
    // llm extraction returns [] in the mock -> regex fallback; make the draft carry
    // regex-visible claims incl. a MISSING token whose evidence is only on the far page.
    const e = fatEntity();
    const off = makeTools(); const on = makeTools();
    const rOff = await execute({ entities: [e] }, base, off);
    const rOn = await execute({ entities: [e] }, { ...base, cache_base_window: true }, on);
    const itemOff = rOff.results[0].items[0];
    const itemOn = rOn.results[0].items[0];
    assert(itemOff.qa_pass === itemOn.qa_pass, `qa_pass parity (${itemOff.qa_pass})`);
    assert(itemOff.hallucination_score === itemOn.hallucination_score, `score parity (${itemOff.hallucination_score})`);
    assert(itemOff.flagged_claims_count === itemOn.flagged_claims_count, `flagged count parity (${itemOff.flagged_claims_count})`);
    assert(JSON.stringify(itemOff.flagged_claims) === JSON.stringify(itemOn.flagged_claims), 'identical flagged claims');
  }

  // ── 8. String-typed preset: cache_base_window "true"/"false" ─────────────────────
  console.log('\n8. string-typed preset coercion for cache_base_window');
  {
    assert(asBool('true') === true && asBool('false') === false, 'asBool coerces "true"/"false"');
    const optsBase = { source_selection: 'claim_anchored', claims_per_batch: 1, ai_model: 'sonnet', ai_provider: 'anthropic' };
    const tTrue = makeTools();
    await execute({ entities: [fatEntity()] }, { ...optsBase, cache_base_window: 'true' }, tTrue);
    assert(tTrue.calls.filter(c => !c.isExtraction).every(c => c.cache_prefix !== null), '"true" (string) enables the cache split');
    const tFalse = makeTools();
    await execute({ entities: [fatEntity()] }, { ...optsBase, cache_base_window: 'false' }, tFalse);
    assert(tFalse.calls.filter(c => !c.isExtraction).every(c => c.cache_prefix === null), '"false" (string) does NOT enable it (no truthy-string bug)');
  }

  console.log(`\n=== Result: ${pass} pass, ${fail} fail ===`);
  process.exit(fail === 0 ? 0 : 1);
})();
