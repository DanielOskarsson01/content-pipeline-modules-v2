/**
 * Standalone test harness for ai-discovery-scout v1.0.0.
 *
 * Run: node modules/step-1-discovery/ai-discovery-scout/test-ai-discovery-scout.js
 * From repo root.
 *
 * Covers the v1 contract (brief: docs/submodule-briefs-rev-2026-07-03/step1-ai-discovery-scout.md):
 *   - LLM proposes leads -> strict-JSON parse -> live verification gate (HEAD, GET fallback)
 *   - valid JSON array; markdown-fenced JSON; prose -> corrective JSON retry (seo-planner precedent)
 *   - hallucinated (dead) URLs dropped by default; kept + flagged when keep_unverified=true
 *   - min_confidence prunes BEFORE verification (saves HTTP); max_urls_per_entity cap
 *   - HEAD 405 -> GET fallback + <title> extraction; 3xx counts as verified
 *   - prompt placeholder interpolation ({entity_name}/{entity_website}/{entity_context}/{max})
 *   - emit_suggested_queries -> meta.suggested_queries (newline-joined string)
 *   - JSON parse fails after retry -> that entity fails loudly, others proceed (no total throw)
 *   - _partialItems pushed per entity; blank prompt -> loud no-op; manifest contract + Rule 13
 *
 * All LLM + HTTP mocked. No credentials, no network.
 */

const execute = require('./execute.js');
const MANIFEST = require('./manifest.json');

let pass = 0;
let fail = 0;

function assert(cond, msg) {
  if (cond) { console.log(`  PASS: ${msg}`); pass++; }
  else { console.log(`  FAIL: ${msg}`); fail++; }
}

function makeTools(handlers = {}) {
  const logs = [];
  const calls = { ai: [], head: [], get: [] };
  return {
    logs,
    calls,
    logger: {
      info: (m) => logs.push({ level: 'info', message: m }),
      warn: (m) => logs.push({ level: 'warn', message: m }),
      error: (m) => logs.push({ level: 'error', message: m }),
    },
    progress: { update: () => {} },
    _partialItems: [],
    ai: {
      complete: async (opts) => {
        calls.ai.push(opts);
        if (handlers.ai) return handlers.ai(opts, calls.ai.length);
        return { text: '[]', tokens_in: 1, tokens_out: 1, model: opts.model, provider: opts.provider };
      },
    },
    http: {
      head: async (url, opts) => {
        calls.head.push({ url, opts });
        if (handlers.head) return handlers.head(url, opts);
        return { status: 200, headers: {}, body: '' };
      },
      get: async (url, opts) => {
        calls.get.push({ url, opts });
        if (handlers.get) return handlers.get(url, opts);
        return { status: 200, headers: {}, body: '' };
      },
    },
  };
}

const defaults = { ...MANIFEST.options_defaults };

function makeInput(entities) {
  return { entities, run_id: 'test-run', step_index: 1, submodule_id: 'ai-discovery-scout' };
}

function aiJson(arrOrObj) {
  return { text: JSON.stringify(arrOrObj), tokens_in: 10, tokens_out: 10, model: 'haiku', provider: 'anthropic' };
}

async function main() {
  // ── 1. Valid JSON array; all verified via HEAD 200 ──
  console.log('\n[1] valid JSON leads, all verified');
  {
    const tools = makeTools({
      ai: async () => aiJson([
        { url: 'https://acme.com/about', lead_type: 'official', rationale: 'own site', confidence: 0.9 },
        { url: 'https://linkedin.com/company/acme', lead_type: 'profile', rationale: 'linkedin', confidence: 0.8 },
      ]),
      head: async () => ({ status: 200, headers: {}, body: '' }),
    });
    const res = await execute(makeInput([{ name: 'Acme', website: 'acme.com' }]), { ...defaults }, tools);
    const items = res.results[0].items;
    assert(items.length === 2, `two verified leads emitted (got ${items.length})`);
    assert(items[0].url === 'https://acme.com/about', 'url mapped');
    assert(items[0].verified === 'true', 'verified is string "true"');
    assert(items[0].status_code === 200, 'status_code recorded');
    assert(items[0].lead_type === 'official', 'lead_type free string preserved');
    assert(items[0].confidence === '0.9', 'confidence stored as string');
    assert(items[0].found_via === 'ai_scout' && items[0].source === 'ai-discovery-scout', 'provenance fields');
    assert(items[0].entity_name === 'Acme', 'entity_name attached');
    assert(tools.calls.ai.length === 1, 'one LLM call');
  }

  // ── 2. Markdown-fenced JSON parsed (no retry needed) ──
  console.log('\n[2] markdown-fenced ```json output');
  {
    const fenced = '```json\n[{"url":"https://x.com/a","lead_type":"official","confidence":0.7}]\n```';
    const tools = makeTools({ ai: async () => ({ text: fenced, tokens_in: 5, tokens_out: 5 }), head: async () => ({ status: 200 }) });
    const res = await execute(makeInput([{ name: 'X', website: 'x.com' }]), { ...defaults }, tools);
    assert(res.results[0].items.length === 1, 'fence-wrapped JSON parsed without a retry');
    assert(tools.calls.ai.length === 1, 'no retry call needed for fenced JSON');
  }

  // ── 3. Prose first, corrective JSON retry succeeds ──
  console.log('\n[3] prose -> corrective JSON retry');
  {
    let n = 0;
    const tools = makeTools({
      ai: async (opts) => {
        n++;
        if (n === 1) return { text: 'Sure! Here are some good URLs for this company:\n1. their about page ...', tokens_in: 5, tokens_out: 5 };
        return aiJson([{ url: 'https://y.com/about', lead_type: 'official', confidence: 0.9 }]);
      },
      head: async () => ({ status: 200 }),
    });
    const res = await execute(makeInput([{ name: 'Y', website: 'y.com' }]), { ...defaults }, tools);
    assert(tools.calls.ai.length === 2, 'exactly one corrective retry issued');
    assert(/valid JSON/i.test(tools.calls.ai[1].prompt), 'retry prompt demands valid JSON');
    assert(res.results[0].items.length === 1, 'leads recovered from retry');
    assert(tools.logs.some((l) => l.level === 'warn' && /JSON/i.test(l.message)), 'retry warned loudly');
  }

  // ── 4. Hallucinated (dead) URL dropped by default ──
  console.log('\n[4] dead URL dropped (anti-hallucination gate)');
  {
    const tools = makeTools({
      ai: async () => aiJson([
        { url: 'https://real.com/live', lead_type: 'official', confidence: 0.9 },
        { url: 'https://hallucinated.com/nope', lead_type: 'profile', confidence: 0.9 },
      ]),
      head: async (url) => ({ status: url.includes('hallucinated') ? 404 : 200 }),
    });
    const res = await execute(makeInput([{ name: 'R', website: 'real.com' }]), { ...defaults }, tools);
    const urls = res.results[0].items.map((i) => i.url);
    assert(urls.length === 1 && urls[0] === 'https://real.com/live', 'only the live URL survives; 404 dropped');
    assert(res.results[0].meta.dropped >= 1, 'dropped count surfaced in meta');
  }

  // ── 5. keep_unverified=true keeps the dead URL, flagged ──
  console.log('\n[5] keep_unverified keeps + flags dead URLs');
  {
    const tools = makeTools({
      ai: async () => aiJson([{ url: 'https://dead.com/x', lead_type: 'official', confidence: 0.9 }]),
      head: async () => ({ status: 404 }),
    });
    const res = await execute(makeInput([{ name: 'D', website: 'dead.com' }]), { ...defaults, keep_unverified: true }, tools);
    const items = res.results[0].items;
    assert(items.length === 1 && items[0].verified === 'false', 'dead URL kept, flagged verified:false');
    assert(items[0].status_code === 404, 'status_code 404 recorded');
  }

  // ── 6. min_confidence prunes BEFORE verification ──
  console.log('\n[6] min_confidence prunes before HTTP');
  {
    const tools = makeTools({
      ai: async () => aiJson([
        { url: 'https://hi.com/a', lead_type: 'official', confidence: 0.9 },
        { url: 'https://lo.com/b', lead_type: 'guess', confidence: 0.3 },
      ]),
      head: async () => ({ status: 200 }),
    });
    const res = await execute(makeInput([{ name: 'C', website: 'c.com' }]), { ...defaults, min_confidence: 0.5 }, tools);
    assert(res.results[0].items.length === 1, 'only the high-confidence lead emitted');
    assert(tools.calls.head.length === 1, 'low-confidence lead never verified (HTTP saved)');
    assert(!tools.calls.head.some((c) => c.url.includes('lo.com')), 'no verification call for pruned lead');
  }

  // ── 7. max_urls_per_entity cap ──
  console.log('\n[7] max_urls_per_entity cap');
  {
    const leads = Array.from({ length: 5 }, (_, i) => ({ url: `https://s.com/${i}`, lead_type: 'official', confidence: 0.9 }));
    const tools = makeTools({ ai: async () => aiJson(leads), head: async () => ({ status: 200 }) });
    const res = await execute(makeInput([{ name: 'S', website: 's.com' }]), { ...defaults, max_urls_per_entity: 2 }, tools);
    assert(res.results[0].items.length === 2, `5 leads capped to 2 (got ${res.results[0].items.length})`);
    assert(tools.calls.head.length === 2, 'cap applied before verification (only 2 verified)');
  }

  // ── 8. HEAD 405 -> GET fallback + <title> extraction ──
  console.log('\n[8] HEAD 405 -> GET fallback + title');
  {
    const tools = makeTools({
      ai: async () => aiJson([{ url: 'https://g.com/p', lead_type: 'official', confidence: 0.9 }]),
      head: async () => ({ status: 405 }),
      get: async () => ({ status: 200, headers: {}, body: '<html><head><title>Real Page &amp; Co</title></head><body>hi</body></html>' }),
    });
    const res = await execute(makeInput([{ name: 'G', website: 'g.com' }]), { ...defaults }, tools);
    const item = res.results[0].items[0];
    assert(item.verified === 'true' && item.status_code === 200, 'GET fallback verified after HEAD 405');
    assert(item.title === 'Real Page & Co', 'title extracted + entity-decoded from GET body');
    assert(tools.calls.get.length === 1, 'GET fallback invoked once');
  }

  // ── 8b. 3xx counts as verified ──
  console.log('\n[8b] 3xx redirect counts as verified');
  {
    const tools = makeTools({ ai: async () => aiJson([{ url: 'https://r.com/moved', confidence: 0.9 }]), head: async () => ({ status: 301 }) });
    const res = await execute(makeInput([{ name: 'R', website: 'r.com' }]), { ...defaults }, tools);
    assert(res.results[0].items.length === 1 && res.results[0].items[0].verified === 'true', '301 verified');
  }

  // ── 9. prompt placeholder interpolation ──
  console.log('\n[9] prompt placeholders interpolated');
  {
    const tools = makeTools({ ai: async () => aiJson([]), head: async () => ({ status: 200 }) });
    await execute(
      makeInput([{ name: 'Acme Corp', website: 'acme.com', sector: 'fintech' }]),
      { ...defaults, prompt: 'Find {max} URLs about {entity_name} at {entity_website}. Context: {entity_context}', max_urls_per_entity: 7 },
      tools
    );
    const p = tools.calls.ai[0].prompt;
    assert(p.includes('Acme Corp') && p.includes('acme.com'), '{entity_name}/{entity_website} interpolated');
    assert(p.includes('7'), '{max} interpolated');
    assert(/sector/i.test(p) && /fintech/i.test(p), '{entity_context} carries extra columns');
  }

  // ── 9b. $-replacement chars in an entity value don't corrupt the inline prompt ──
  console.log('\n[9b] $-replacement safety in prompt interpolation');
  {
    const tools = makeTools({ ai: async () => aiJson([]), head: async () => ({ status: 200 }) });
    await execute(
      makeInput([{ name: 'Bet$&Win $1 A$$B', website: 'x.com' }]),
      { ...defaults, prompt: 'Research {entity_name} now.' },
      tools
    );
    const inline = tools.calls.ai[0].prompt.split('\n')[0];
    assert(inline === 'Research Bet$&Win $1 A$$B now.', `entity value with $ sequences interpolated verbatim (got: "${inline}")`);
  }

  // ── 10. emit_suggested_queries -> meta (newline-joined string) ──
  console.log('\n[10] suggested queries to meta');
  {
    const tools = makeTools({
      ai: async () => aiJson({ leads: [{ url: 'https://q.com/a', confidence: 0.9 }], suggested_queries: ['acme reviews', 'acme leadership'] }),
      head: async () => ({ status: 200 }),
    });
    const res = await execute(makeInput([{ name: 'Q', website: 'q.com' }]), { ...defaults, emit_suggested_queries: true }, tools);
    assert(res.results[0].items.length === 1, 'leads still emitted alongside queries');
    assert(res.results[0].meta.suggested_queries === 'acme reviews\nacme leadership', 'queries newline-joined string in meta');
    assert(/suggested_queries|search quer/i.test(tools.calls.ai[0].prompt), 'prompt asks for queries when enabled');
  }

  // ── 11. JSON fails after retry -> entity fails loudly, others proceed ──
  console.log('\n[11] unrecoverable JSON -> entity fails, others continue');
  {
    const tools = makeTools({
      ai: async (opts) => {
        // Route on "bad.com" — it appears in the first prompt (entity block) AND,
        // because the prose response embeds it, in the corrective-retry prompt too,
        // so "Bad" returns prose on BOTH calls and genuinely fails after retry.
        if (/bad\.com/.test(opts.prompt)) return { text: 'sorry, no json here for bad.com — just prose', tokens_in: 1, tokens_out: 1 };
        return aiJson([{ url: 'https://good.com/a', confidence: 0.9 }]);
      },
      head: async () => ({ status: 200 }),
    });
    const res = await execute(makeInput([{ name: 'Bad', website: 'bad.com' }, { name: 'Good', website: 'good.com' }]), { ...defaults }, tools);
    const bad = res.results.find((r) => r.entity_name === 'Bad');
    const good = res.results.find((r) => r.entity_name === 'Good');
    assert(bad.items.length === 0 && bad.error, 'Bad entity failed loudly with an error, 0 items');
    assert(good.items.length === 1, 'Good entity still produced items');
    assert(res.summary.errors.some((e) => /Bad/.test(e)), 'summary surfaces the failed entity');
  }

  // ── 12. _partialItems accumulated across entities ──
  console.log('\n[12] _partialItems per entity');
  {
    const tools = makeTools({ ai: async () => aiJson([{ url: 'https://p.com/a', confidence: 0.9 }]), head: async () => ({ status: 200 }) });
    const res = await execute(makeInput([{ name: 'A', website: 'a.com' }, { name: 'B', website: 'b.com' }]), { ...defaults }, tools);
    const total = res.results.reduce((s, r) => s + r.items.length, 0);
    assert(tools._partialItems.length === total, `_partialItems holds all ${total} items (got ${tools._partialItems.length})`);
    assert(tools._partialItems.every((i) => i.entity_name), 'partial items carry entity_name');
  }

  // ── 13. blank prompt -> loud no-op (no LLM call) ──
  console.log('\n[13] blank prompt -> loud no-op');
  {
    const tools = makeTools({ ai: async () => aiJson([{ url: 'https://z.com/a', confidence: 0.9 }]) });
    const res = await execute(makeInput([{ name: 'Z', website: 'z.com' }]), { ...defaults, prompt: '   ' }, tools);
    assert(tools.calls.ai.length === 0, 'no LLM call with a blank prompt');
    assert(res.results[0].items.length === 0, 'no items');
    assert(tools.logs.some((l) => l.level === 'warn' && /prompt/i.test(l.message)), 'blank prompt warned');
  }

  // ── 14. summary shape ──
  console.log('\n[14] summary');
  {
    const tools = makeTools({ ai: async () => aiJson([{ url: 'https://s.com/a', confidence: 0.9 }]), head: async () => ({ status: 200 }) });
    const res = await execute(makeInput([{ name: 'A', website: 'a.com' }, { name: 'B', website: 'b.com' }]), { ...defaults }, tools);
    assert(res.summary.total_entities === 2 && res.summary.total_items === 2, 'summary counts');
    assert(typeof res.summary.description === 'string' && res.summary.description.length > 0, 'description present');
    assert(Array.isArray(res.summary.errors), 'errors array present');
  }

  // ── 15. manifest contract + Rule 13 (agnostic default prompt) ──
  console.log('\n[15] manifest contract + Rule 13');
  {
    assert(MANIFEST.step === 1, 'step 1');
    assert(MANIFEST.data_operation_default === 'add', 'data_operation_default add');
    assert(MANIFEST.pool_precondition === 'empty_ok', 'pool_precondition empty_ok');
    assert(MANIFEST.item_key === 'url', 'item_key url');
    assert(MANIFEST.cost === 'expensive', 'cost expensive (LLM + verification)');
    assert(Array.isArray(MANIFEST.requires_columns) && MANIFEST.requires_columns.includes('name'), 'requires name');
    const dp = MANIFEST.options_defaults.prompt || '';
    assert(dp.length > 0 && /\{max\}/.test(dp), 'default prompt present with {max}');
    assert(!/igaming|casino|gambling|company profile|b2b/i.test(dp), 'default prompt carries NO vertical vocabulary (Rule 13)');
    assert(MANIFEST.options_defaults.keep_unverified === false, 'verification ON by default (keep_unverified false)');
  }

  console.log(`\n${'='.repeat(50)}\nTOTAL: ${pass} passed, ${fail} failed\n`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error('HARNESS ERROR:', e); process.exit(1); });
