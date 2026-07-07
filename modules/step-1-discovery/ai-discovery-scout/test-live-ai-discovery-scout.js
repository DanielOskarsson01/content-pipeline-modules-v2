/**
 * LIVE test for ai-discovery-scout against the real Anthropic API + real HTTP.
 *
 * COSTS a few cents (haiku-class model, 3 small calls). Requires ANTHROPIC_API_KEY
 * in the environment; exits 0 with a notice when absent so it never breaks CI.
 *
 * Run from repo root (source your profile so the key is present):
 *   zsh -c 'source ~/.zshrc; node modules/step-1-discovery/ai-discovery-scout/test-live-ai-discovery-scout.js'
 *
 * Two proofs:
 *   A. Real Haiku run on 3 real entities — the parser handles real LLM output
 *      (strict-JSON array), leads are produced, the pipeline doesn't crash.
 *   B. Deterministic real-HTTP verifyUrl checks — the liveness gate keeps live
 *      URLs (2xx/3xx) and drops dead ones (404 / DNS failure).
 *
 * Uses a real fetch-backed tools.ai + tools.http (harness only — module code
 * never touches fetch or an SDK; in production the skeleton provides both).
 */

const execute = require('./execute.js');
const { verifyUrl } = execute.__testing;

if (!process.env.ANTHROPIC_API_KEY) {
  console.log('ANTHROPIC_API_KEY not set — live test skipped (this is not a failure).');
  process.exit(0);
}

const MODEL_MAP = { haiku: 'claude-haiku-4-5', sonnet: 'claude-sonnet-4-6', opus: 'claude-opus-4-8' };

function makeLiveTools() {
  const calls = { ai: 0, head: 0, get: 0 };
  return {
    calls,
    logger: {
      info: (m) => console.log(`  [info] ${m}`),
      warn: (m) => console.log(`  [warn] ${m}`),
      error: (m) => console.log(`  [error] ${m}`),
    },
    progress: { update: () => {} },
    _partialItems: [],
    ai: {
      complete: async (opts) => {
        calls.ai++;
        const model = MODEL_MAP[opts.model] || (String(opts.model || '').startsWith('claude-') ? opts.model : 'claude-haiku-4-5');
        const body = {
          model,
          max_tokens: 2048,
          messages: [{ role: 'user', content: opts.prompt }],
        };
        if (opts.temperature != null) body.temperature = opts.temperature;
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': process.env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(60000),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(`Anthropic ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
        const text = (json.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
        return { text, tokens_in: json.usage?.input_tokens, tokens_out: json.usage?.output_tokens, model: json.model, provider: 'anthropic' };
      },
    },
    http: {
      head: async (url, opts = {}) => {
        calls.head++;
        const res = await fetch(url, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(opts.timeout || 8000) });
        return { status: res.status, headers: Object.fromEntries(res.headers.entries()), body: '' };
      },
      get: async (url, opts = {}) => {
        calls.get++;
        const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(opts.timeout || 8000) });
        return { status: res.status, headers: Object.fromEntries(res.headers.entries()), body: await res.text() };
      },
    },
  };
}

async function main() {
  let failures = 0;

  // ── A. Real Haiku run on real entities ──
  console.log('\n── A. Real Haiku lead proposal + live verification ──');
  const tools = makeLiveTools();
  const entities = [
    { name: 'OpenAI', website: 'openai.com' },
    { name: 'Anthropic', website: 'anthropic.com' },
    { name: 'GitHub', website: 'github.com' },
  ];
  const res = await execute(
    { entities, run_id: 'live', step_index: 1, submodule_id: 'ai-discovery-scout' },
    {
      ...require('./manifest.json').options_defaults,
      ai_model: 'haiku',
      max_urls_per_entity: 5,
      verification_timeout: 8000,
    },
    tools
  );

  console.log(`  ${res.summary.description}`);
  let totalProposed = 0;
  let totalVerified = 0;
  let totalDropped = 0;
  let parseErrors = 0;
  for (const r of res.results) {
    if (r.error) parseErrors++;
    totalProposed += r.meta?.proposed || 0;
    totalVerified += r.items.length;
    totalDropped += r.meta?.dropped || 0;
    console.log(`  ${r.entity_name}: proposed ${r.meta?.proposed ?? '?'}, verified ${r.items.length}, dropped ${r.meta?.dropped ?? 0}`);
    for (const it of r.items.slice(0, 3)) {
      console.log(`    - [${it.verified}/${it.status_code}] ${it.url}  (${it.lead_type || 'lead'}, conf ${it.confidence})`);
    }
  }

  const aParsedOk = parseErrors === 0;
  const aProduced = totalVerified > 0;
  const aVerifiedAreLive = res.results.every((r) => r.items.every((i) => i.verified === 'true' && i.status_code >= 200 && i.status_code < 400));
  const aVerificationRan = tools.calls.head + tools.calls.get > 0;
  console.log(`  LLM calls ${tools.calls.ai}, HEAD ${tools.calls.head}, GET ${tools.calls.get}`);
  if (!aParsedOk) { console.log('  FAIL: real LLM output failed to parse for at least one entity'); failures++; }
  if (!aProduced) { console.log('  FAIL: no verified leads produced across 3 real entities'); failures++; }
  if (!aVerifiedAreLive) { console.log('  FAIL: an emitted item was not actually live (verified/status mismatch)'); failures++; }
  if (!aVerificationRan) { console.log('  FAIL: verification never ran'); failures++; }

  // ── B. Deterministic real-HTTP liveness gate ──
  console.log('\n── B. verifyUrl against known live/dead URLs (real HTTP) ──');
  const vt = makeLiveTools();
  const live = await verifyUrl('https://example.com/', 8000, vt.http, vt.logger);
  const dead404 = await verifyUrl('https://www.iana.org/this-page-does-not-exist-404-xyz', 8000, vt.http, vt.logger);
  const deadDns = await verifyUrl('https://this-domain-should-not-exist-9z8y7x.example.invalid/', 8000, vt.http, vt.logger);
  console.log(`  live (example.com):     verified=${live.verified} status=${live.status_code}`);
  console.log(`  dead 404 (iana):        verified=${dead404.verified} status=${dead404.status_code}`);
  console.log(`  dead DNS (.invalid):    verified=${deadDns.verified} status=${deadDns.status_code}`);
  if (!live.verified) { console.log('  FAIL: live URL not verified'); failures++; }
  if (dead404.verified) { console.log('  FAIL: 404 URL wrongly verified'); failures++; }
  if (deadDns.verified) { console.log('  FAIL: DNS-failure URL wrongly verified'); failures++; }

  console.log('\n── Verdict ──');
  console.log(`  A. real LLM parse + pipeline: ${aParsedOk && aProduced && aVerifiedAreLive ? 'PASS' : 'FAIL'} (${totalVerified} verified / ${totalProposed} proposed / ${totalDropped} dropped)`);
  console.log(`  B. liveness gate (live kept, dead dropped): ${live.verified && !dead404.verified && !deadDns.verified ? 'PASS' : 'FAIL'}`);

  if (failures > 0) { console.log('\nLIVE TEST FAILED.'); process.exit(1); }
  console.log('\nLIVE TEST PASSED — real Haiku output parsed, leads verified live, dead URLs dropped by the gate.');
}

main().catch((e) => { console.error('LIVE TEST ERROR:', e); process.exit(1); });
