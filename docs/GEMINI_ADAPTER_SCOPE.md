# Gemini Adapter — Scope (BACKLOG #49, step 1)

**Date:** 2026-07-13
**Parent:** BACKLOG #49 (multi-provider LLM routing). Routing spec: [`MODEL_SELECTION_RESEARCH_2026-07.md`](MODEL_SELECTION_RESEARCH_2026-07.md).
**Repo:** `content-pipeline-v2` (SKELETON — Skeleton-track owned; this is a hand-off spec, not skeleton code to be written by a modules/non-thread window).
**Why Gemini first:** Flash-Lite ($0.10/$0.40) is the biggest cheap-classification win (~10× cheaper than Haiku on `url-relevance`/`intent-tagger`/`ai-discovery-scout`), and the API is a clean drop-in.
**Effort:** ~1 focused session. **Blast radius:** one new `else if` branch + MODEL_MAP entries + one env var. Deliberately mirrors how `openai`/`perplexity` were already added — NOT the adapter-abstraction refactor (that's later in #49).

> Grounded in the real code: `ai.complete()` at `server/workers/stageWorker.js:153`, MODEL_MAP at `:34`, provider branches anthropic/openai/perplexity, throw at `:309`. Retry loop keys on `err.statusCode ∈ {429,500,502,503,529}` (`:140`); 600s timeout via `withTimeout` AbortController.

---

## 1. What changes (one file for the MVP)

All in `server/workers/stageWorker.js`:

- **`MODEL_MAP` (:34)** — add aliases (full IDs pass through via `MODEL_MAP[model] || model` anyway):
  ```js
  // Gemini
  'gemini-flash-lite': 'gemini-2.5-flash-lite',
  'gemini-flash': 'gemini-2.5-flash',
  'gemini-pro': 'gemini-2.5-pro',
  ```
- **New `provider === 'gemini'` branch** in `complete()` after the `perplexity` block (:306), before the throw.
- **Update the throw (:309)** → `Supported: anthropic, openai, perplexity, gemini`.
- **Env:** add `GEMINI_API_KEY` to `.env` (local) + Hetzner `/opt/.../.env`.

## 2. The branch (mirrors the `openai` buffered pattern, ~45 lines)

```js
} else if (provider === 'gemini') {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set in environment');

  const { status, body } = await withTimeout(async (signal) => {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`,
      { method: 'POST', signal,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey }, // key in header, not URL (logging safety)
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            ...(temperature != null && { temperature }),
            ...(max_tokens && { maxOutputTokens: max_tokens }),
          },
        }),
      });
    return { status: res.status, body: await res.text() };
  }, AI_REQUEST_TIMEOUT_MS);

  if (status !== 200) {
    const err = new Error(`Gemini API error ${status}: ${body.slice(0, 500)}`);
    err.statusCode = status;   // feeds the existing retry loop (429/503 retryable)
    throw err;
  }

  const data = JSON.parse(body);
  const cand = data.candidates?.[0];
  const finish = cand?.finishReason;
  // CRITICAL: Gemini returns HTTP 200 on a safety block — must NOT be treated as success
  if (!cand || finish === 'SAFETY' || finish === 'RECITATION' || data.promptFeedback?.blockReason) {
    const reason = data.promptFeedback?.blockReason || finish || 'no_candidate';
    const err = new Error(`Gemini blocked/empty response: ${reason}`);
    err.geminiBlock = reason;   // surfaces as a real failure, not silent empty text
    throw err;
  }
  const text = (cand.content?.parts || []).map(p => p.text || '').join('');
  const duration_ms = Date.now() - startTime;
  const u = data.usageMetadata || {};
  const result = {
    text,
    tokens_in: u.promptTokenCount || 0,
    tokens_out: u.candidatesTokenCount || 0,
    cache_read_tokens: u.cachedContentTokenCount || 0,
    model: modelId, provider: 'gemini', finish_reason: finish, duration_ms,
  };
  logger.info(`[ai] ${provider}/${model} — ${result.tokens_in} in, ${result.tokens_out} out, ${duration_ms}ms, finish: ${finish}`);
  return result;
```

> Field names (`generateContent` / `usageMetadata` / `finishReason`) are the current Gemini shape; verify against ai.google.dev at build time (this scope was written with a Jan-2026 cutoff). Everything else is grounded in the actual `stageWorker.js` code.

## 3. The three things that make Gemini different from a copy-paste

| Concern | Why it matters here | Handling |
|---|---|---|
| **Safety block = HTTP 200** | The research §6 risk for THIS content — gambling copy trips Gemini filters, and a naive port returns empty `text` as "success," silently publishing nothing. | The `finishReason === 'SAFETY'` / `promptFeedback.blockReason` guard above — throw, don't return empty. The one novel bit — put it through brutal-critic (skeleton Rule 2). |
| **No streaming (buffered)** | Anthropic streams to dodge undici's ~300s idle timeout on long generations (the Wazdan bug, `stageWorker.js:163`). Buffered Gemini has the same risk on LONG outputs. | MVP routes only short/fast tasks (Flash-Lite classification) → no idle risk. Long-form drafting on Gemini needs `streamGenerateContent` — defer, flag it. |
| **`cache_prefix` (#21)** | Anthropic uses inline cache_control; Gemini uses a separate `cachedContents` API. | Skip for MVP — Flash-Lite classification prompts are small and already cheap. Add when volume justifies. |

Bonus: temperature is a non-issue on Gemini (accepts 0–2), so unlike Sonnet 5, `content-writer`'s `temperature: 0.4` is a clean drop-in.

## 4. Testing & rollout

- **Unit test** (`server/tests/gemini.test.mjs`, follow the existing `.mjs` pattern): mocked fetch for success, **safety-block-200 → throws** (the important one), 429 → retries, missing key → throws.
- **Live smoke:** one Flash-Lite call with a real key (assert text + token counts), plus a deliberately safety-tripping prompt to confirm it throws rather than returning empty.
- **First real route:** point ONE classification module (`intent-tagger` or `url-relevance`) at `gemini-flash-lite` via a run/template config on a test project — NOT a manifest default on main. Regression-test on a labeled set vs the Haiku baseline (research: prove "no quality loss" before trusting it). If accuracy holds → ~10× cheaper on that step, expand.
- **Deploy:** skeleton deploys MANUALLY (not CI-on-push) — ships via the skeleton thread's deploy gate + Path B. `/code-review` before commit (skeleton Rule 18).

## 5. What the MVP deliberately skips (add when needed)

- **Streaming** — route short tasks first; add `streamGenerateContent` for drafting.
- **`cache_prefix` on Gemini** — Flash-Lite is already cheap; add at volume.
- **Adapter-abstraction refactor** — a 4th `else if` matches the existing pattern; refactor to adapters at provider #5 or when the branch grows unwieldy (that refactor is the broader #49 contract work).

## 6. Process notes

- Adding a provider is borderline-architectural (skeleton Rule 2). The **safety-block semantics** are the part to put through brutal-critic/CTO; the rest is a proven pattern.
- Skeleton-track territory — the owning thread implements/deploys. This doc is the hand-off.
