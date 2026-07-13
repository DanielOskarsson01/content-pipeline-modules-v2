# Model Selection Research — Content Pipeline (mid-2026)

**Date:** 2026-07-13 · **Version:** 1.2 (three independent reviews incorporated — Perplexity, Gemini, Codex/repo-audit; see §11)
**Purpose:** Choose the best price/quality LLM per task for the modular content pipeline, and move off the single-model (Haiku-only) test setup.
**Method:** Deep research (22 sources, 25 adversarially-verified claims) + three independent second opinions. The Codex review read the actual repository; several of its code findings were re-confirmed in-repo this session and are marked **[repo-confirmed]**.
**Optimization target:** Balanced — best price-per-quality ratio *per task*.
**Deployment:** Global / no compliance gate; content is public iGaming marketing/editorial, so Chinese-hosted models are in scope (data-sovereignty is informational only).

> **Self-contained** — written to be handed to another AI or reviewer. Review questions in §10.

---

## 0. TL;DR — this is not a "swap model names" task

The three highest-value moves are cheaper *and* more important than the provider migration:

1. **Get `content-analyzer` and `content-writer` off Haiku now.** Confirmed empirically across many runs (operator report, 2026-07-13): Haiku **fails category analysis every time** and **cannot write** acceptable long-form copy. This needs **no provider migration** — Anthropic and OpenAI are already wired into `tools.ai`, so both tasks can move to Sonnet or a GPT-5.6 tier via a config change today.
2. **Fix the QA detector — it's fail-open by architecture, not by model.** [repo-confirmed] No content → pass; zero extracted claims → pass; passing is an *average* score, so one high-severity falsehood among supported claims still passes. Swapping Haiku→DeepSeek fixes none of this.
3. **Build an eval harness + a real provider-contract layer before adding providers.** Then add **one** adapter (Gemini), tested against the actual production baseline. Don't wire DeepSeek + Gemini + Qwen simultaneously.

Per-task routing is still directionally right, and the cheap high-volume wins (classification → Flash-Lite) are real. But the migration is bigger than manifest edits (§6), and two of the biggest wins above don't require new providers at all.

---

## 1. The observed problem (and how to confirm it)

Haiku 4.5 is Anthropic's smallest tier — right for cheap classification, under-powered for the two hardest steps. **Confirmed across many production runs (operator, 2026-07-13):**
- **`content-analyzer` fails category analysis every time.** This is consistent with the module's vocabulary-fidelity gate (W1.3): Haiku assigns category slugs that aren't in the injected master vocabulary, the gate rejects them, and the entity fails. A model that actually reasons over the taxonomy passes it — so the fix is a stronger model, not a gate change.
- **`content-writer` cannot produce acceptable long-form copy** — clinical, repetitive, obviously-AI.

The earlier "verify what's deployed first" caveat is retired: repeated real-run failure is stronger evidence than any config check. Both steps move off Haiku now.

---

## 2. The model landscape (verified July 2026)

**Billable rates** = standard synchronous first-party input/output per 1M text tokens. Legend: **✓** first-party · **[unv]** could not be reconciled with a comparable first-party rate · **†** disputed. Intelligence-Index "blended" figures are a **workload estimate, not a price** — kept out of the price column and shown only as a ranking note.

### Tier A — Frontier (use only where top-end reasoning pays)
| Model | ID | Billable price | Context | Notes |
|---|---|---|---|---|
| Claude Fable 5 | `claude-fable-5` | $10 / $50 ✓ | 1M | #1 intelligence |
| GPT-5.6 Sol | `gpt-5.6-sol` | $5 / $30 ✓ (>272K in: $10/$45) | 1.05M | flagship reasoning |
| Claude Opus 4.8 | `claude-opus-4-8` | $5 / $25 ✓ | 1M | top agentic |
| Gemini 3.1 Pro (Preview) | `gemini-3.1-pro-preview` | $2/$12 → $4/$18 (>200K) ✓ | 1.05M | output incl. thinking tokens; strong factual grounding + Search |
| GPT-5.4 Pro | `gpt-5.4-pro` | $30 / $180 ✓ (>272K: $60/$270) | 1.05M | Responses API only; overkill |

### Tier B — Balanced (the drafting/QA candidates)
| Model | ID | Billable price | Context | Notes |
|---|---|---|---|---|
| **GPT-5.6 Terra** | `gpt-5.6-terra` | **$2.50 / $15** ✓ (>272K: $5/$22.50) | 1.05M | **OpenAI's balanced tier — the drafting/QA arm** |
| Claude Sonnet 5 | `claude-sonnet-5` | $2/$10 → $3/$15 (Sep 1) ✓ | 1M | high-quality prose; ~30% heavier tokenizer; **400s on non-default sampling** |
| Claude Sonnet 4.6 | `claude-sonnet-4-6` | $3 / $15 ✓ | 1M | Claude prose without the tokenizer tax |
| Gemini 3.5 Flash | `gemini-3.5-flash` | $1.50 / $9 ✓ | 1M | stable; structured output + search grounding — premium-speed drafting arm |
| Grok 4.5 | `grok-4.5` | $2 / $6 ($0.50 cached) ✓ | 500K | X/web = **separately-billed tools, not native** |
| GLM-5.2 | `glm-5.2` | **$1.40 / $4.40** ($0.26 cached) ✓ | 1M | MIT open-weights |
| GPT-5.6 Luna | `gpt-5.6-luna` | $1 / $6 ✓ (>272K: $2/$9) | 1.05M | **cost/high-volume tier, ~prior nano — NOT the premium drafting arm** |
| Gemini 2.5 Pro | `gemini-2.5-pro` | $1.25/$10 → $2.50/$15 (>200K) ✓ | 1.05M | Codex confirmed $10 output (Perplexity's $5 refuted) |
| Qwen3.7 Max | `qwen3.7-max` | [unv] regional CNY (~$2.50/$7.50 intl list) | 1M | strong score/$, multilingual (untested here) |
| DeepSeek-V4-Pro | `deepseek-v4-pro` | $0.435 / $0.87 ✓ (cache-hit $0.003625 in) | 1M / 384K out | cheapest frontier-class reasoning |

> **DeepSeek `deepseek-reasoner` (R1)** deprecates **2026-07-24** → use V4-Pro. **Kimi K2.5** ($0.60/$3, 262K) is superseded by **K2.6**.

### Tier C/D — Workhorses & rock-bottom
| Model | ID | Billable price | Context | Best at |
|---|---|---|---|---|
| Gemini 2.5 Flash | `gemini-2.5-flash` | $0.30 / $2.50 ✓ (thinking billed as output) | 1.05M | drafting/formatting workhorse |
| DeepSeek-V4-Flash | `deepseek-v4-flash` | $0.14 / $0.28 ✓ (cache-hit $0.0028 in) | 1M | cheap long-context + extraction |
| Claude Haiku 4.5 | `claude-haiku-4-5-20251001` | $1 / $5 ✓ | 200K / 64K out | *(current test default — classification)* |
| Gemini 2.5 Flash-Lite | `gemini-2.5-flash-lite` | $0.10 / $0.40 ✓ | 1.05M | high-volume classify/cleanup |
| GPT-5.4 nano | `gpt-5.4-nano` | $0.20 / $1.25 ✓ | 400K | cheap simple text |
| qwen-plus / qwen3.5-flash | legacy aliases | [unv] regional CNY | 1M | **hosted aliases — NOT the open-weight self-host models** |
| Perplexity Sonar | `sonar` | $1/$1 + $5/$8/$12 per 1K low/med/high-context ✓ | 128K | search-grounded retrieval (already in `seo-planner`) |

**Unverified / underspecified (do not cite numbers):** Llama 4 (Scout 10M / Maverick 1M; no first-party token price — "near-free" ignores GPU/ops), Mistral, Cohere, MiniMax. Open-weight self-host uses parameterized model IDs, not the hosted aliases above.

---

## 3. QA step — fix the detector, then pick a judge

**The model is not the bottleneck; the architecture is.** [repo-confirmed] in `hallucination-detector/execute.js`:
- No `content_markdown` → `qa_pass: true, score 1` (execute.js:264).
- Score is a plain average `verifiedValue / totalClaims`; zero claims → `1` → pass (execute.js:432). Severity is reported, not a hard gate — 9 supported claims + 1 high-severity falsehood still passes at the 0.9 threshold.
- Codex additionally found: regex claim-extraction misses broad assertions and exempts "leading/major/continues to grow"; claims truncated at 200 chars; prompt marks "general knowledge" as supported; sources concatenated without IDs so quotes can't be tied to evidence.

Swapping Haiku→DeepSeek changes none of this. **Rebuild first:** atomic claim extraction (no truncation) → per-claim evidence retrieval preserving source ID/URL/char-span → structured verdict (`supported` / `contradicted` / `insufficient`) → programmatic check that the quoted span exists in the cited source → **any high-severity contradiction or insufficient-evidence blocks publication; missing sources = "unverified", never a pass.**

**Then pick the judge** on a hand-labelled gold set: A/B **GPT-5.6 Terra** (GA, cost-balanced) vs **Gemini 3.1 Pro** vs **DeepSeek-V4-Pro** (cost challenger). The 57.9 (V4-Pro) vs 75.6 (Gemini 3.1 Pro) SimpleQA gap all three reviewers cited is *vendor-reported*, so it doesn't crown a winner — but it does **not** support making DeepSeek the default verifier. Use `sonar` (already wired) or grounded Gemini/OpenAI search as the *evidence retriever* only, for claims meant to rely on fresh public facts; supplied-source claims stay source-bounded.

---

## 4. Drafting — A/B, don't assume

Move off Haiku (per §1, after confirming what's deployed). **Gemini 2.5 Flash is a cheap first challenger, not a proven win** — its price edge is established, its long-form-marketing edge is not.

**A/B design (per Codex, strengthened):**
1. 60–100 real pipeline jobs, stratified by article type / length / source volume / brand / SEO complexity. Freeze source order, prompt, reference docs, downstream editing.
2. Arms: deployed baseline · Gemini 2.5 Flash (thinking off) · Gemini 2.5 Flash (dynamic thinking) · **Claude Sonnet 5** (adaptive thinking, fixed effort) · **GPT-5.6 Terra** (fixed low/med reasoning) · optional Gemini 3.5 Flash. *Luna can be a cheap arm, not the premium OpenAI arm.*
3. **Hard gates before human judging:** every factual statement supported by supplied material; citations + bracket/slug markers retained; required sections / word-count band / FAQ / meta / CTA present; no invented claims or superlatives.
4. Blinded pairwise human judging (editor + marketer): brand fidelity, specificity, coherence, persuasion, cliché/repetition, SEO naturalness, **edit-minutes to publishable**.
5. Record **actual billed tokens incl. reasoning**, p50/p95 latency, truncation, refusal, schema-fail, retry rate. **Primary metric: publishable rate and editor-minutes-saved per dollar — not benchmark score.**

**[repo-confirmed] Sonnet-5 blocker:** `content-writer/execute.js:436` passes `temperature` (default 0.4) into every `ai.complete` call; Sonnet 5 returns HTTP 400 for non-default sampling. The adapter must omit temperature and expose thinking/effort controls before Sonnet 5 can be an arm. Tokenizer runs ~30% heavier → affects cost and limits.

---

## 5. Routing map (the 8 LLM submodules)

Host loads **41 active manifests**; **8** call an LLM (not 9 — `card-human-rewriter` is a `tone-seo-editor` preset with no executor, skipped by the module loader). All 8 default to `haiku`/`anthropic`; `seo-planner` also calls `sonar`.

| Submodule | Task | Current | Recommended |
|---|---|---|---|
| ai-discovery-scout | discovery | haiku | Gemini 2.5 Flash-Lite (~10× cheaper) |
| url-relevance | classification | haiku | Flash-Lite / DeepSeek-V4-Flash — *regression-test on your labels first* |
| intent-tagger | classification | haiku | Flash-Lite / DeepSeek-V4-Flash — *regression-test first* |
| content-analyzer | fact extraction | haiku | DeepSeek-V4-Flash (or V4-Pro) |
| seo-planner | SEO + research | haiku + `sonar` | keep `sonar`; LLM → Gemini 2.5 Flash |
| **content-writer** | long-form draft | haiku *(test)* / sonnet *(canonical template)* | A/B winner (§4) |
| tone-seo-editor | editing pass | haiku | pair with the writer winner |
| **hallucination-detector** | QA | haiku | judge A/B (§3) — **after** the architecture fix |

---

## 6. Migration reality — larger than a manifest edit

**Resolution chain (Codex, accurate):** manifest `options_defaults` → `run_submodule_config.options` → per-card overrides → worker remerge (`stageWorker.js:468`) → module passes `model`/`provider` to `tools.ai` → `tools.ai` maps alias & executes. Model choice is a host-config decision; `tools.ai` only resolves the final alias/provider.

Specific underestimates in prior versions of this doc:
- **OpenAI *and* Perplexity are already wired.** Gemini, DeepSeek, Qwen are absent and **throw explicitly**. Provider support is mandatory; a full model ID passes through un-aliased (`MODEL_MAP[model] || model`).
- **Alias mismatch:** `sonnet` currently maps to **Sonnet 4.5**, `opus` to **4.6** — not the models recommended here. Update the map or pin IDs.
- **All 8 manifests need changes AND a migration** — saved templates/presets/run overrides beat new manifest defaults; changing source defaults won't touch already-saved configs.
- The model map is **global, not provider-scoped** → the UI can build invalid combos (`haiku` + `openai` → an Anthropic ID sent to OpenAI). Manifests load at worker start → **deploy needs worker restarts**. Provider code is one big conditional, not an adapter.

**Operational gaps (the actual cost of going multi-provider):**
| Area | Missing / unsafe today |
|---|---|
| Rate limits | No per-provider RPM/TPM/concurrency buckets, admission control, circuit breakers, approved fallbacks |
| Retries | Fixed 2/4/8s backoff, no jitter/`Retry-After`, doesn't retry timeouts, no idempotency (duplicate-billing risk) |
| Streaming | Only Anthropic streams; OpenAI/Perplexity buffer. Each provider needs delta/usage/finish/refusal/cancel normalization |
| Token accounting | Char caps, not provider tokenizers; no preflight tokenization or per-model reasoning/output limits |
| Request semantics | `complete()` can't express JSON schema, reasoning effort, grounding/search, or safety controls |
| JSON/format drift | No common structured-output contract, validator, or repair policy |
| Safety filters | Refusals arrive as HTTP 200 + stop_reason, safety finish reason, empty body, or 4xx — gambling copy exercises all of them differently |
| Observability | No per-call log of resolved ID, provider, attempt, finish reason, reasoning/cache tokens, latency, cost, fallback |

---

## 7. Biggest risk — silent semantic drift

The single largest multi-provider risk: a deceptively uniform `complete()` interface hiding divergence — one provider reasons by default, another refuses, another changes JSON shape, another counts 30% more tokens — and the pipeline still returns plausible-looking output. **With the current fail-open QA (§3), that drift reaches publication instead of causing an obvious outage.** Mitigation is layered: per-provider output validation (schema/length/refusal-reason/spot-sample) before accepting a response, cross-provider fallback on 429/503/refusal, and the QA rebuild in §3.

---

## 8. Recommended rollout (sequenced)

1. **Confirm the deployed writer model** (§1) — one log check; may change the whole premise.
2. **Rebuild the QA detector** (§3) — biggest safety win, no new provider needed.
3. **Fund the eval harness** (§4) + a **provider-contract refactor** of `tools.ai` (adapter interface, structured output, token accounting, retry/fallback, observability).
4. **Add ONE Gemini adapter**, test it against the real baseline. Keep DeepSeek only if it wins the rebuilt QA gold set by a margin worth a 4th provider. **Do not add DeepSeek + Gemini + Qwen at once.**
5. Cheap, low-risk parallel win: route the two classification steps to Flash-Lite **after a regression test on your labels**.

---

## 9. Confidence & caveats

**High confidence:** first-party billable prices (Anthropic/OpenAI/Google/DeepSeek/xAI/Zhipu); the repo-confirmed code facts (fail-open QA, temperature blocker, 8 executors, alias mismatch, only Anthropic/OpenAI/Perplexity wired); Gemini 2.5 Pro output = $10.

**Corrected from earlier versions:** blended-as-price (now separated); GLM-5.2 $1.40/$4.40 (was ~$0.90 blended); Luna is the cost tier not the drafting arm (Terra is); Kimi $0.60/$3 & superseded by K2.6; Grok web/X needs paid tools; qwen aliases are hosted not open-weight; 9→8 submodules; migration scope.

**Unverified:** Qwen regional CNY pricing (not portable); Grok "blended $1.35" dropped; Llama 4 / Mistral / Cohere / MiniMax (no first-party token price); "Qwen best multilingual" and "Flash-Lite no quality loss" are **untested hypotheses** — regression-test before relying on them. Context length still matters (Haiku 200K, Kimi 262K, Grok 500K; long-context pricing tiers apply above 200–272K on several vendors).

**Time-sensitivity (July 13 2026):** Sonnet 5 intro ends **Aug 31**; DeepSeek legacy aliases retire **Jul 24**; GPT-5.6 GA'd Jul 9; Gemini 3.1 Pro still Preview.

**Data-sovereignty (informational):** Qwen/Kimi/DeepSeek/GLM are Chinese-hosted — fine for public iGaming content; revisit if private/PII data enters the pipeline.

---

## 10. Questions for a reviewing AI

1. Any **billable price/spec/ID** wrong today? Cite a first-party source; separate billable from blended.
2. For the **QA rebuild** (§3), is the atomic-claim + span-check + severity-gate design right, or is there a simpler reliable pattern?
3. For **drafting**, which arm do you bet wins the §4 A/B on iGaming editorial, and what eval settles it?
4. Is the **migration/operational** list (§6) complete for a 3–4 provider linear pipeline?
5. Given gambling copy, what's the exposure from **cross-provider safety-filter divergence**, and how do you detect a silent block?
6. Is the **rollout sequence** (§8) right, or would you reorder?

---

## 11. Changelog

- **v1.2 (2026-07-13):** Codex repo-audit incorporated; several code facts re-confirmed in-repo. Reframed: verify deployed model first (§1), QA is a fail-open architecture problem not a model choice (§3), migration materially larger (§6), sequenced rollout (§8). Fixed: blended-vs-billable separation, GLM-5.2 $1.40/$4.40, Luna/Terra tiering, Kimi/Qwen pricing, Grok real-time caveat, 9→8 submodules, alias mismatch (`sonnet`→4.5). Added Gemini 3.5 Flash, GPT-5.6 Terra as the balanced arm, Sonnet-5 temperature blocker.
- **v1.1:** Perplexity + Gemini second opinions; Grok $2/$6; consensus on moving off Haiku + integration risk.
- **v1.0:** Initial deep-research report.

---

*Billable prices are a July 13 2026 first-party snapshot of a fast-moving market — re-verify before committing budget.*
