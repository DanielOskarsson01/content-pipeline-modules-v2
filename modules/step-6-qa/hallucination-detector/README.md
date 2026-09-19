# Hallucination Detector

> Compare generated content claims against original source material to flag statements that aren't supported by any source.

**Module ID:** `hallucination-detector` | **Step:** 6 (QA) | **Category:** qa | **Cost:** medium
**Version:** 1.10.0 | **Data Operation:** add (+)

> **v1.10.0 (extraction-truncation guard):** the claim-**extraction** call (`claim_extraction: llm`) inherited `ai.complete`'s **16384** default `max_tokens`. On a heavy draw — a rich profile's 150–200 claims **plus** sonnet-5's adaptive thinking, which is on when `thinking` is omitted and bills against the *same* output cap — the extraction JSON truncated, became unparseable, and the module **silently fell back to the regex extractor** (~4 claims on a v3 draft) → the severity floor never tripped → `qa_pass: true`. This is the **seventh** instance of this codebase's worst failure family and the **first that fails open**: a fabricated profile could publish. The fix has two halves. **(1)** the extraction call now passes an explicit `max_tokens = 65536` — a **code-locked constant** (`EXTRACTION_MAX_TOKENS`), *not* a template option, so it can't be lowered back into the hole; sonnet-5's real output ceiling is 131072 and the deployed draws emit only 4–7k extraction tokens for the fattest (200-claim) entity, so 65536 is ~4× the observed worst case plus room for the non-deterministic thinking tail; the adapter streams and forwards `max_tokens` unclamped, so it's safe from HTTP timeouts. Same class as the analyzer output ceiling (`content-pipeline-specs template-v3/ceiling/CEILING.md`); different model, different number. **(2)** a truncated extraction can **never again become a regex fallback that produces a verdict** — it hard-fails the entity as an **infrastructure** error (`meta.status: 'error'`, `meta.error: 'extraction_truncated'`, `qa_pass: false`, `needs_review: true`), the same v1.7.0 discipline that already covers failed verification batches. Two truncation signals: `stop_reason == 'max_tokens'` (definitive; present in **sync**) and a non-empty response that doesn't parse to a claim array (the only trace in **batch**, where the skeleton strips `stop_reason`). **Byte-identical** on the settled paths: a normal extraction (sync *and* batch), an errored call (still regex fallback — a transient blip), and a genuine empty `[]` (still regex fallback → the zero-claims guard). Banked run `9821ed56`: all six entities extracted at `end_turn` (0 truncations in that committed run); the false pass is a non-deterministic re-draw tail — this guard eliminates it whichever way it fires. Proven in `test-extraction-truncation.js` (the miss test asserts the pre-fix false pass *and* the post-fix loud fail, sync + batch).

> **v1.9.0 (severity-floor confirmation pass, option `floor_confirmation`):** with `severity_floor` on, a draft fails if ANY single claim grades unsupported/HIGH. A rich profile carries 150–200 claims, and at 25 claims/batch the shared window budget caps each claim's effective top-K at 1–2 chunks — so at production volume something corpus-true grades HIGH on most draws (retrieval starvation, not fabrication) and the floor blocks clean profiles: validation run `9821ed56` measured auto-approve **1/6** with **13 of 16 floor HIGHs corpus-true FPs**, unchanged by the v1.8.0 retrieval fix because small-batch gains do not survive full-batch contention. The repaired `in_window` instrument **cannot gate the floor**: at full volume genuine fabrications read `beyond_window` exactly like the FPs (measured: the Málaga/Sweden weld, BetMGM 17-Aug, the £50m program, and all three injected corpus-absent controls), while the few `in_window` tags sit on FPs — an evidence-gated floor would be inverted (pass the fabrications, keep blocking the FPs) and was **refused**. `floor_confirmation: true` instead re-verifies the floor-tripping HIGH claims in small batches (≤8 claims — uncontended retrieval, full top-K per claim) through the SAME verifier and code-locked prompt (incl. the v1.8.0 weld rule); the floor stands only on a claim that re-verifies at severity HIGH. Release is **severity-gated, not verdict-gated**: a claim that re-verifies `partial` but still severity-HIGH keeps blocking — measured on the BC £50m/€50m currency error (substance true, currency false), which re-verifies partial/HIGH on 2/2 small-batch draws and would escape a verdict-gated release. Severity is never regraded from an evidence tag (the weld-unsafe hole stays closed); fail-closed on any confirmation error (errored call / unparseable response / missing verdict keeps its claims blocking). A released floor hands the decision back to the score (`pass_threshold` untouched); ALL flags are retained for review with `floor_confirmed` per HIGH and `meta.floor_confirmation` counts. Sync-only — in `execution_mode: batch` it is ignored with a warning (the all-or-nothing floor is kept; conservative). Default `false` = byte-identical. Acceptance (measured 2026-09-19, v1.9.0 end-to-end on the six frozen entities of run `9821ed56` + injected controls): **every known fabrication still blocks** — Málaga/Sweden, BetMGM 17-Aug and Dinopolis CONFIRMED unsupported/high end-to-end; the £50m error blocks via the severity gate (partial/HIGH 2/2); injected Danske-Spil/Halcyon/Quasar HIGH 3/3 fixed draws each with the injected-draft run blocked. Auto-approve on the same draws: **0/6 → 1/6** (iGP recovered — 6/6 FP HIGHs cleared with affirmative verdicts, PASS 0.897, flags retained), and the remaining blocks are majority-genuine (confirmed-HIGH precision 19% → ~55–73%): the floor is calibrated; auto-approve *volume* is now bounded upstream by analyzer-origin defect density (the F-E/F-F classes), not by floor noise.
>
> **v1.8.0 (top-K retrieval + repaired `in_window` instrument + weld severity rule):** the claim-anchored supplement now pulls each claim's **top-5** candidate chunks instead of the single best — on the 27-specimen audit of validation run `9821ed56`, the top-1 supplement showed the true supporting page for only 2/25 locatable specimens because a **decoy** chunk sharing many generic terms outranked the short page actually stating the fact (~30 of the run's 43 flags were corpus-true false positives; 13 of 16 HIGHs). Term extraction repaired alongside (possessive stems: `SoftSwiss's` now matches `SoftSwiss`; digit-led tokens: `1X2` is no longer dropped). The `in_window` label was **broken** — it credited any selected chunk sharing any single discriminating term, so a decoy produced `in_window` on all 43 flags while the real support sat beyond the window, concealing the defect for the entire validation run. It now means *all of the claim's top-K candidates were shown* (see Honest-window instrumentation). A **weld severity rule** in the code-locked prompt grades a pairing of real elements that the sources contradict (`Málaga, Sweden` when the sources say `Málaga, Spain`) unsupported/HIGH **on the evidence** — previously this class was caught only when retrieval failed to show the claim's evidence at all, so any retrieval improvement softened it (that coupling is why the `max_source_chars` 300k raise was refused).
>
> **v1.7.0 (verification-failure discipline):** an unverified claim is **not** an unsupported claim. A verification request that fails or is never run (rate limit, network blip, refused call) now hard-fails the entity as an **infrastructure** error in BOTH modes — `meta.status: 'error'`, `meta.error: 'verification_incomplete'`, with `failed_batches` / `batches_not_attempted` / `claims_unverified` on meta — retried by the skeleton, never flagged as content. Previously the sync path degraded failed batches to `verdict: 'unsupported'`, reporting infra failures as content findings (offering-slot draw-2: 2 budget-refused batches → hallucination 0.495 + spurious QA FAIL + severity-floor trip on a fully corpus-grounded draft; 4th instance of the infra-as-content failure family, ENGINEERING_CONTRACT §5). Sync stops calling remaining batches after the first failure. Fully-verified runs are byte-identical to v1.6.0 (proven in `test-verification-failure.js`).

> **v1.6.0 (Phase 2B — Anthropic Message Batches):** new `execution_mode` option (`sync` default | `batch`). `batch` opts this step into the skeleton-driven Message Batches path — the step's entities are collected and submitted as **two** Message Batches (round 1 extractions, round 2 verifications; verification needs the extracted claims), billed at **50% of standard** with an async return (typically <1h, ceiling 24h). **Verdicts are unchanged** — only *when* the result arrives and the billing rate differ; the sync default is byte-identical to v1.5.0. Anthropic-only. A failed/expired batch request **fails that entity loudly** (`meta.status:'error'` → run `failed`), never a silent pass. Rollback = flip `execution_mode` back to `sync` (config, not a revert). See [Batch mode](#batch-mode-execution_mode-phase-2b).

> **v1.5.0 (UNIT B):** new `severity_model` option (`current` default | `evidence_absent`). `evidence_absent` reserves HIGH severity — and therefore the `severity_floor` force-fail — for claims whose SUBJECT is absent from the corpus entirely; a grounded fact carrying only an over-claimed qualifier (a superlative/absolute/over-extension whose evidence is `in_window`/`beyond_window`) is regraded to MEDIUM. Only severity is regraded — the supported/unsupported verdict and the score never change. Needs `source_selection: claim_anchored` to classify evidence. Default `current` is byte-identical. See [Severity model](#severity-model-severity_model).

---

## What This Module Does

Extracts factual claims from content_markdown using heuristic patterns (numbers, dates, statistics, company-specific facts), then sends batches of claims to an LLM along with the original source text_content for verification. Each claim gets a verdict: supported, partially supported, or unsupported. The module produces a hallucination_score (0--1) and a pass/fail verdict.

### Process

1. **Claim extraction** -- Sentences containing numbers, dates, percentages, currency amounts, or company-specific assertions ("founded in", "headquartered in", "employs", "licensed by", "operates in") are extracted from content_markdown. General knowledge sentences are excluded.

2. **Source gathering** -- All text_content from scraped pages (page-scraper, browser-scraper) is assembled into the source window sent to the verifier. By default (`source_selection: head`) pages are concatenated in pool order and truncated at max_source_chars. With `source_selection: claim_anchored`, a focused per-batch window is built from the source chunks whose terms overlap that batch's claims, so evidence beyond the head is still shown (see [Source selection](#source-selection-head-vs-claim_anchored)).

3. **LLM verification** -- Claims are batched (default 10 per batch) and sent to the configured LLM with the source text. The LLM returns a verdict per claim: supported, unsupported, or partial, along with a severity rating and supporting quote.

4. **Scoring** -- `hallucination_score = (supported + partial * 0.5) / total_claims`. The entity passes when `hallucination_score >= pass_threshold`.

---

## When to Use

- **Always** after content-writer has generated content from scraped sources
- **Before** publishing or distribution (Step 9)
- Particularly important for content about specific companies where facts must be verifiable
- Run alongside citation-coverage-checker for comprehensive QA

---

## Input Data

This module uses data-shape routing. It finds its input by checking which fields exist on pool items:

- **Content items**: items with `content_markdown` (from content-writer)
- **Source items**: items with `text_content` (from page-scraper or browser-scraper)

---

## Options Guide

| Option | Type | Default | What It Does | When to Change |
|--------|------|---------|--------------|----------------|
| `pass_threshold` | number | `0.9` | Minimum hallucination_score (0--1) for qa_pass to be true. 1.0 means every claim must be verified | Lower to 0.7 for draft-stage content. Set to 1.0 for zero-tolerance on unsupported claims |
| `ai_model` | select | `sonnet` | Which model runs claim verification. **Registry-driven** (`values_from: registry.models`): the skeleton populates the dropdown from the shared LLM registry, scoped to the default provider -- not a hardcoded list in this manifest | Switch to a larger registry model for better accuracy on nuanced claims; a smaller one to cut cost on draft batches |
| `ai_provider` | select | `anthropic` | Which LLM provider to call. **Registry-driven** (`values_from: registry.providers`): the skeleton populates the values from the shared registry (anthropic, openai, perplexity, gemini, openrouter) | Switch providers to compare verification quality or route around an outage |
| `max_source_chars` | number | `100000` | Max total characters of source text in the LLM context (range 10,000--500,000). Truncates from the end if exceeded | Increase if sources are large and claims reference distant content. Decrease to save tokens |
| `claims_per_batch` | number | `10` | Claims verified per LLM call (range 1--25) | Lower to 5 for more reliable results. Higher values use fewer API calls but may reduce accuracy |
| `allow_empty_content` | boolean | `false` | When `false`, an entity with no `content_markdown` **fails closed** (`qa_pass: false`) -- content was expected but is absent, and a QA gate must not certify content it never read. When `true`, such an entity skips with a pass (nothing to verify) | Set `true` only for pipelines that legitimately produce entities with no content to check |
| `claim_extraction` | select | `regex` | How claims are pulled from the draft. `regex` (default) keeps only enumerated numeric/date/company sentences in **prose** -- fast, free, but blind to facts in markdown **tables and lists**. `llm` runs a code-locked extraction pass over the FULL draft (prose + tables + lists), then verifies those claims unchanged. Adds one LLM call per entity | Set `llm` for formats that place facts in tables/lists (e.g. a Quick-Facts table), where the regex path finds too few claims and one partial dominates the score |
| `severity_floor` | boolean | `false` | When `true`, a claim verified as **unsupported + high-severity** (a specific fabricated number, date, statistic, or financial claim) force-fails the check regardless of the numeric score. The score still reports the honest ratio; only `qa_pass` is forced false, through the same `hallucination:fail` routing key | Turn on when a single hard fabrication must never pass just because the ratio clears the threshold (closes the "1 fabrication in 10 claims = 0.9 = pass" hole) |
| `floor_confirmation` | boolean | `false` | With `severity_floor`, a tripped floor no longer blocks immediately: the floor-tripping HIGH claims are re-verified in a small focused batch (≤8 claims, uncontended retrieval — each claim gets its full top-K supplement) and the floor stands only on a HIGH that survives re-verification. Fail-closed on any confirmation error. Score/threshold untouched; all flags retained with `floor_confirmed` per HIGH. Sync-only (warned + ignored in `execution_mode: batch`) | Turn on (production recommendation with `source_selection: claim_anchored`) when the floor is blocking clean 150–200-claim profiles on retrieval-starved FPs — run `9821ed56`: 13 of 16 floor HIGHs corpus-true, auto-approve 1/6. Genuine fabrications re-verify HIGH and still block |
| `severity_model` | select | `current` | Which severity gates `severity_floor`. `current` (default, byte-identical) uses the LLM's raw high/medium/low. `evidence_absent` regrades a high unsupported claim to medium when its subject IS in the corpus (evidence `in_window`/`beyond_window`) — a grounded over-claim, not a fabrication — so the floor reserves its force-fail for claims with no source anywhere. Verdict and score are never changed; requires `source_selection: claim_anchored`. See [Severity model](#severity-model-severity_model) | Turn on with `severity_floor` when the floor is firing on grounded facts with one over-claimed word (superlatives, absolutes) rather than genuine fabrications — publish them flagged-for-review instead of force-failing |
| `source_selection` | select | `head` | How the source window is built. `head` (default) concatenates pages in pool order and truncates at `max_source_chars` -- byte-identical to prior behaviour. `claim_anchored` builds a focused per-batch window from the chunks whose terms overlap that batch's claims (deterministic, no extra LLM call) and emits honest-window meta. See [Source selection](#source-selection-head-vs-claim_anchored) | Set `claim_anchored` on fat entities (large source corpus) where the supporting page is often past the head window; keep `head` (and raise `max_source_chars`) to measure a raw window-raise |
| `extraction_model` | select | `null` | **Unit A.** Model for the claim-EXTRACTION call only (`claim_extraction: "llm"`). `null`/empty (default) inherits `ai_model` -- byte-identical. Does **not** touch verification. See [Cost optimisation](#cost-optimisation-v140) | Leave inheriting sonnet. A cheaper extractor must first pass claim-count parity; the Screen-5 candidate `gpt-oss-120b` measured **-12% to -56% under-extraction** and is not safe |
| `extraction_provider` | select | `null` | **Unit A.** Provider for the extraction call only. `null`/empty (default) inherits `ai_provider`. Set alongside `extraction_model` | Only with a validated cheaper extractor |
| `cache_base_window` | boolean | `false` | **Unit B.** When `true`, the stable base (head) source window shared by an entity's verification batches is sent once as an Anthropic prompt `cache_prefix` (re-read at ~10% cost on later batches) instead of re-sent every batch. Same instructions/sources/claims, only reordered (sources before claims); verdict parity is the acceptance gate. Anthropic-only (non-anthropic verification providers fall back to the single prompt). See [Cost optimisation](#cost-optimisation-v140) | Set `true` in production with `source_selection: claim_anchored` -- acceptance-proven, ~$0.13/entity saved with no verdict change |
| `execution_mode` | select | `sync` | **Phase 2B.** `sync` (default) runs each extraction + verification call synchronously, one entity at a time -- byte-identical to v1.5.0. `batch` opts the step into the Anthropic Message Batches path (skeleton-driven): all the step's entities are submitted as two Message Batches (extractions, then verifications), billed at 50% with an async return (<1h typically, up to 24h). Verdicts unchanged. Anthropic-only. Failed/expired request → that entity fails loudly. See [Batch mode](#batch-mode-execution_mode-phase-2b) | Set `batch` (per template/run) to cut the detector's Anthropic cost ~50% with no quality change; the detector is the last LLM step so its async return blocks nothing but QA routing. Flip back to `sync` to roll back |

The model options are no longer hardcoded: the manifest declares `values_from` and the skeleton resolves the actual provider/model lists from the shared LLM registry at load time. Adding a provider or model to the registry makes it available here with no manifest change.

> **Both prompts are code-locked (W2.3).** The fact-checking prompt
> (`MANIFEST_DEFAULT_PROMPT`) AND the `llm`-mode claim-extraction prompt
> (`CLAIM_EXTRACTION_PROMPT`) are truth metrics standardized system-wide -- they
> are inlined in `execute.js` and are **not** template-overridable options. A
> template can choose the extraction *strategy* (`claim_extraction`) but cannot
> supply the extraction or verification *prompt* (a `prompt` supplied by a
> template is silently ignored). To change what counts as a claim or the verdict
> criteria, edit the module code (a deliberate, reviewed change), not a preset.

---

## Cost optimisation (v1.4.0)

The detector is the single largest per-entity LLM cost line (~37% of spend). v1.4.0 adds two **opt-in, default-off, byte-identical-when-off** levers. The verification model (the referee that grades every module) is never changed. Both were measured through the deployed harness on the frozen inputs of a real 3-entity run (ELK Studios / Pocket Rockets Gaming / Vermantia), 2026-09-03.

### Unit A -- cheaper extraction model (`extraction_model` / `extraction_provider`)

The claim-extraction call (`claim_extraction: "llm"`) is parsing-grade and could in principle run on a cheaper model than verification. The option ships as a **generic mechanism**; `null` default inherits the verification model (byte-identical).

**Acceptance FAILED for the Screen-5 candidate `openai/gpt-oss-120b`.** Measured N=3 against the sonnet extractor's claim counts:

| entity | sonnet claims | gpt-oss-120b claims (N=3) | vs sonnet | within +-15%? | table facts extracted? |
|--------|---------------|---------------------------|-----------|---------------|------------------------|
| ELK Studios | 48 | 42 / 47 / 37 | -13% / -2% / -23% | 2 of 3 (median -13%) | yes, every draw |
| Pocket Rockets Gaming | 68 | 30 / 57 / 36 | -56% / -16% / -47% | 0 of 3 | yes, every draw |
| Vermantia | 116 | 87 / 74 / 70 | -25% / -36% / -40% | 0 of 3 | yes, every draw |

gpt-oss-120b **systematically under-extracts** (fewer claims checked) with high run-to-run variance. It still reads table/list facts (the point of `llm` mode), just at coarser granularity. **Do not route extraction to gpt-oss-120b in production** -- for a fact-checker, checking materially fewer claims is a quality regression, not a free saving. The ~$90/1,700 Unit A saving is deferred until a cheaper model passes the parity gate (haiku is banned on this long-document read). This contradicts MODEL_SCREEN Screen 5's scope-only projection, which had assumed parity without measuring it.

### Unit B -- cache the base source window (`cache_base_window`)

Across an entity's verification batches the base (head) source window is identical; today it is re-sent in full every batch. `cache_base_window: true` sends the stable block (instructions + base window) once as an Anthropic `cache_prefix`; only the per-batch supplement + claims vary. The model sees the same content, reordered (sources before claims). `selectedOrders` and the honest-window meta are unchanged.

**Acceptance PASSED** (N=3 ELK/PRG, N=2 Vermantia):

| entity | batches | base cached (tokens) | `cache_read` on batches >=2 | cold-draw cost reduction | qa_pass vs baseline |
|--------|---------|----------------------|-----------------------------|--------------------------|---------------------|
| ELK Studios | 2 | 37,642 | yes, every draw | ~27% | FAIL = FAIL (score 0.75--0.78 vs 0.76) |
| Pocket Rockets Gaming | 3 | ~35k | yes, every draw | ~51% | PASS = PASS (score 0.92--0.97 vs 0.96) |
| Vermantia | 5 | 29,719 | yes, every draw | ~65% | FAIL = FAIL (score 0.77--0.79 vs 0.79) |

Verdict parity held on every draw: ELK and Vermantia still fail their genuine fabrications, PRG still passes, scores stay inside the run-to-run jitter band, and flagged claims match the deployed baseline. The cold-draw reduction scales with batch count (each extra batch is one more avoided base re-send); consecutive runs within the 5-minute cache TTL compound to 66--88%. Recommended: enable `cache_base_window: true` alongside `source_selection: claim_anchored`.

---

## Batch mode (`execution_mode`) — Phase 2B

`execution_mode: batch` runs the detector's LLM calls through the **Anthropic Message Batches API** instead of synchronous calls. It is billed at **50% of standard** with an asynchronous return, and captures the largest single lever of the pipeline's Anthropic bill (the detector is ~40% of it) with **no change to any verdict** — only *when* the result arrives and the billing rate differ. `sync` (default) is byte-identical to v1.5.0.

**Why the detector is safe to batch first:** it is the **last** LLM step, so its async return blocks nothing downstream except QA routing (a decision gate, not a data dependency); it is self-contained; and it is cheaper batched even at a 0% cache-hit rate.

**How it runs (skeleton-driven).** Because a verification prompt needs the *extracted* claims, the step becomes **two Message Batches**:

1. **Round 1 — extractions.** Every entity's `claim_extraction: llm` call is collected and submitted as one batch. (In `regex` mode there is no extraction call and this round is empty.)
2. **Round 2 — verifications.** Once round 1 returns, each entity's claim batches are built and all verification calls across all entities are submitted as one batch.

Guards (no content / no sources / zero claims) short-circuit **before** any batch call, exactly as in sync. `stream: true` is dropped (unsupported and pointless for an async batch); the same source-window caching applies.

**Loud-fail (never a silent pass).** A batch request can fail or expire independently of the rest of the batch. If any of an entity's requests errors or expires, **that entity fails loudly** — the result carries `meta.status: 'error'` (which the skeleton derives to a `failed` run, surfaced in `failed_count`), not a soft `qa_pass: false` and never a clean pass. Other entities in the batch are unaffected. Since v1.7.0 sync and batch behave **identically** here: a failed or never-run verification request hard-fails the entity as an infrastructure error in both modes (the sync path previously degraded failed batches to `unsupported` — see Special cases).

**Rollback** is a config flip back to `execution_mode: sync` — not a code revert.

**Module contract (for the skeleton).** In batch mode the skeleton drives three pure, exported entry points (no LLM call inside them — the skeleton owns submit/poll and assigns every `custom_id`, so the module never sees `entity_submodule_run_id`):

- `prepareExtractionRequests(entities, options, tools)` → `{ state, extractionRequests }`
- `prepareVerificationRequests(entities, options, state, extractionByEntityIdx, tools)` → `{ state, verificationRequests }`
- `parseResults(entities, options, state, verificationByEntityIdx, tools)` → `{ results, summary }`

These reuse the **same** staged code as `execute()`, so a parsed batch verdict is byte-identical to the sync verdict given the same responses (proven in `test-batch-mode.js`: round-trip equivalence across the standard, `claim_anchored`, `cache_base_window`, `severity_floor`, and `evidence_absent` configs). Responses are reconciled **by `custom_id`** (`…__x0` extractions, `…__v{n}` verifications), not by arrival order.

---

## Source selection (`head` vs `claim_anchored`)

The verifier can only mark a claim "supported" if the supporting text is inside the source window it was shown. On a **fat entity** the corpus dwarfs the window — e.g. a 633,916-char corpus against the default `max_source_chars: 100000` means the verifier sees ~16% of the source. In `head` mode that 16% is the corpus **head**, so a fact that lives on page 100 (SNAITECH at char 320,933; Stanleybet/Vision NextGen at 155,069) is simply not in the window, and its claim is flagged "unsupported" — a pure **truncation artifact**, indistinguishable from a real fabrication.

- **`head` (default)** — pool-order concatenation truncated at `max_source_chars`. Windowing unchanged from prior versions (note: the v1.8.0 weld severity rule lives in the shared verification prompt, so it applies in both modes). A raw *window-raise* is just this mode with a larger `max_source_chars` (no new code path).
- **`claim_anchored`** — the window is the **full head window** (so it can never show less than `head`, i.e. an entity whose evidence is already in the head cannot regress) **plus a supplement**: each claim's **top-5 candidate chunks** that sit beyond the head (v1.8.0; top-1 before). Chunks are ranked by **IDF-weighted lexical overlap** — the ubiquitous entity name approaches zero weight, so rare discriminating terms (an acronym, a partner name, a number) drive the match; the entity name can't make every claim look "already covered". Top-1 was defeated by **decoys**: a long listing page sharing many generic claim terms outranked the short page actually stating the fact, and a best-scoring head chunk suppressed the supplement entirely (23/27 audited flags of run `9821ed56` had their true support beyond the window while a decoy sat in it). The supplement budget is **unchanged** (≤ `max_source_chars` on top of the head) and is filled by **rank tier** — every claim's rank-1 chunk before any claim's rank-2 — so a deeper nomination never crowds out another claim's best chunk when the budget binds. Deterministic — no second LLM pass, no embeddings service. The window remains **up to ~2× `max_source_chars`**; set `max_source_chars` with ~2× headroom against the model's context limit.

### Honest-window instrumentation (claim_anchored only)

In `claim_anchored` mode the module records where each flagged claim's evidence actually sits, so a truncation-driven verdict is never again indistinguishable from a fabrication:

| `meta` field | Meaning |
|--------------|---------|
| `source_selection` | `"claim_anchored"` (present only in this mode) |
| `source_corpus_chars` | total characters of source that existed for the entity |
| `source_chars_shown` | size of the largest per-batch window actually sent |
| `evidence_in_window` | flagged claims **all** of whose top-K candidate chunks were shown — retrieval exhausted its lexical candidates, the verdict is as informed as this retrieval can make it (**trust the flag**) |
| `evidence_beyond_window` | flagged claims with at least one top-K candidate NOT shown (budget eviction) — the flag may be a **retrieval artifact**; retry/review |
| `evidence_absent` | flagged claims whose terms appear nowhere in the corpus (**candidate fabrication**) |

Each flagged claim in `flagged_claims[].evidence` and in `flagged_claims_text` (as `{in_window}` / `{beyond_window}` / `{absent}`) carries the same tag. `head` mode emits none of these fields (its meta shape is unchanged from prior versions; the v1.8.0 weld severity rule applies in both modes via the shared prompt).

> **Instrument repair (v1.8.0).** Before v1.8.0, `in_window` was credited when ANY selected chunk shared ANY single discriminating term with the claim — a decoy chunk satisfied it. Every one of validation run `9821ed56`'s 43 flags read `in_window` this way while 23 of 27 audited specimens had their real support beyond the window; the label concealed the retrieval defect for the whole run and mislead reviewers reading the bundle QA flags. The repaired label reports **retrieval coverage** (knowable, deterministic), not semantic support (not lexically knowable): `in_window` = "everything the retrieval ranked best for this claim was shown". `absent` semantics are unchanged (load-bearing for `severity_model: evidence_absent`).

---

## How Scoring Works

The hallucination_score is calculated as:

```
hallucination_score = (supported_count + partial_count * 0.5) / total_claims
```

Where:
- **supported_count** = claims the LLM confirmed are backed by source material
- **partial_count** = claims partially supported (key details may differ)
- **total_claims** = all factual claims extracted from content

The entity passes when `hallucination_score >= pass_threshold`. The half-weighting of partials lives only in the score -- the reported counts (verified / partial / flagged) sum to the total without blending.

### Severity ratings

Each unsupported claim is rated by severity:
- **high** = specific number, date, statistic, or financial claim not found in sources, **or a pairing of real elements that the sources contradict** (v1.8.0 weld rule: the sources pair the city with a different country, the award with a different product or year, the fact with a different subject — `Málaga, Sweden` when the sources say `Málaga, Spain`)
- **medium** = specific factual claim (company name, product, feature) not found in sources
- **low** = general phrasing, opinion, or common knowledge that is hard to verify

The weld rule exists because the weld class was previously caught only **by retrieval accident**: the detector flagged `Málaga, Sweden` HIGH only when its retrieval failed to show the claim's evidence at all — the same blindness that false-flagged ~30 corpus-true claims in run `9821ed56`. Any retrieval improvement therefore softened weld detection (the refused 300k window raise dropped it HIGH→MEDIUM; top-K retrieval without this rule: partial/medium). The rule moves the HIGH onto the **evidence** (the sources' own contradicting pairing), where better retrieval strengthens it instead of weakening it. It requires **contradiction** — a claim that merely aggregates facts the sources state individually (an offices list, a multi-region expansion summary) is not escalated.

### Severity floor (`severity_floor: true`)

By default the verdict is purely `hallucination_score >= pass_threshold`. With the floor on, **any high-severity unsupported claim force-fails the check** even if the ratio clears the threshold -- e.g. 9 supported + 1 high-severity fabrication = 0.9 would pass at threshold 0.9, but force-fails with the floor. The score field is unchanged (it still reports the honest 0.9); only `qa_pass` flips to false, and it routes through the same `hallucination:fail` key (no new fail key). `meta.severity_floor_tripped: true` marks the entities where the floor fired.

### Severity model (`severity_model`)

`severity_floor` force-fails on any HIGH unsupported claim. But "high severity" from the LLM fires on any *specific* unsupported claim — including a **grounded fact carrying one over-claimed qualifier** (a superlative, absolute, or scope over-extension), which is a review-flag, not a publish-blocking fabrication. `severity_model: evidence_absent` narrows HIGH to the case the floor was built for:

- **evidence `absent`** (the claim's discriminating subject appears in NO source chunk) → stays HIGH → still force-fails. This is the likely-fabrication case.
- **evidence `in_window` / `beyond_window`** (the subject IS in the corpus, only the qualifier is unsourced) → regraded to MEDIUM → the floor does not force-fail it. The claim still ships in the flagged output for a reviewer.

Only `severity` is regraded — the supported/unsupported **verdict is never touched** (this is a re-grade, not a re-verification), and the score is severity-independent so it never moves. The regraded severity is what appears in `flagged_claims`, `flagged_claims_text`, and the summary tally, so the report matches the decision. `meta.severity_model: evidence_absent` marks entities scored under this model.

Requires `source_selection: claim_anchored` (that mode produces the per-claim evidence classification). In `head` mode there is nothing to classify against, so no HIGH is regraded and a warning is logged (behaves as `current`).

**Evidence (run 36c75581, company-profile-v3).** The two claims that tripped the floor — ELK's *"…access to ELK's full slot suite via SOFTSWISS"* and Vermantia's *"largest retail deployment on record"* — are both grounded (`evidence: in_window`); the corpus supports the relationship, only the word "full"/superlative "on record" is unsourced. Under `evidence_absent` both regrade to MEDIUM, so ELK (0.914) and Vermantia (0.928) pass while still carrying their claims in the published `qa_flags` for review. A genuinely source-absent high claim (e.g. an invented installation count) still stays HIGH and fails. Pocket Rockets (0.867) is unaffected — it fails on the ratio, not the floor.

### Special cases

- No content_markdown available = **fail closed** (`qa_pass: false`) by default -- content was expected but is absent, so nothing could be verified (set `allow_empty_content` to skip with a pass instead)
- No source text_content available = **fail closed** by default (`no_sources_behavior`: `fail` | `flag` | `pass`)
- No factual claims detected = low-confidence pass on short content; substantial content **fails closed** (padding-blind signature, `flag_zero_claims_over_chars`)
- **A claim-extraction call truncates (hits the token ceiling) = the entity fails loudly as an INFRASTRUCTURE error (v1.10.0).** `meta.status: 'error'`, `meta.error: 'extraction_truncated'`, `qa_pass: false`, `needs_review: true`. A truncated extraction examines *fewer* claims than the draft contains — the missing ones may be the fabrications — so it must never fall back to the regex extractor and produce a verdict. Signals: `stop_reason == 'max_tokens'` (sync) or a non-empty response that doesn't parse to a claim array (batch, where the skeleton strips `stop_reason`). The `max_tokens` ceiling is raised to **65536** (code-locked) so real entities never truncate; this guard catches the residual tail. An **errored** extraction call and a genuine empty `[]` still fall back to regex (settled behaviour).
- **A verification LLM call fails or is never run = the entity fails loudly as an INFRASTRUCTURE error (v1.7.0).** `meta.status: 'error'`, `meta.error: 'verification_incomplete'`, with `failed_batches` / `batches_not_attempted` / `claims_unverified` on meta. The skeleton derives the run to `failed` and it is retried -- an unverified claim is **never** reported as `unsupported`, the score never moves because of a call that did not happen, and `severity_floor` never trips on a claim nobody examined. Remaining batches are not attempted after the first failure (their results would be discarded on retry). Before v1.7.0 the sync path degraded failed batches to `verdict: 'unsupported'`, which reported infra failures (rate limit, network blip, refused call) as content findings -- the offering-slot draw-2 incident: 2 budget-refused batches produced hallucination 0.495 + a spurious QA FAIL on a fully corpus-grounded draft.
- LLM response **received but unparseable**, or fewer verdicts returned than claims sent = affected claims treated as unsupported (fail-safe; the model DID examine the batch -- this is a degenerate response, not a refused call)

---

## Recommended Configurations

Model values below are registry aliases -- pick from whatever the registry dropdown offers in your deployment.

### Standard (default)

Balanced check for most content pipelines:

```
pass_threshold: 0.9
ai_model: sonnet
ai_provider: anthropic
max_source_chars: 100000
claims_per_batch: 10
allow_empty_content: false
```

### Strict

For content going directly to production without human review:

```
pass_threshold: 1.0
ai_model: sonnet
ai_provider: anthropic
max_source_chars: 100000
claims_per_batch: 5
allow_empty_content: false
```

### Quick

For draft-stage content or large batches where speed matters:

```
pass_threshold: 0.7
ai_model: haiku
ai_provider: anthropic
max_source_chars: 50000
claims_per_batch: 15
allow_empty_content: false
```

---

## What Good Output Looks Like

### All claims verified

```
entity_name: "Bet365"
qa_pass: true
hallucination_score: 0.952
verified_claims_count: 19
partial_claims_count: 2
total_claims_count: 21
flagged_claims_count: 0
```

### Typical failure

```
entity_name: "NewCasino"
qa_pass: false
hallucination_score: 0.714
verified_claims_count: 9
partial_claims_count: 2
total_claims_count: 14
flagged_claims_count: 3
flagged_claims_text: "1. [HIGH] Revenue reached $2.1 billion in 2025.\n2. [MEDIUM] The company partners with over 40 game providers.\n3. [HIGH] NewCasino holds licenses in 12 regulated markets."
```

### Output fields

| Field | Type | Description |
|-------|------|-------------|
| `entity_name` | string | Entity this check applies to |
| `qa_pass` | boolean | Whether hallucination_score meets the pass_threshold |
| `hallucination_score` | number | Verification score from 0 to 1 (1.0 = all verified) |
| `verified_claims_count` | number | Claims with "supported" verdict (matches `meta.supported`) |
| `partial_claims_count` | number | Claims with "partial" verdict (half-weighted in the score only) |
| `total_claims_count` | number | Total factual claims extracted from content (verified + partial + flagged) |
| `flagged_claims_count` | number | Claims with "unsupported" verdict |
| `flagged_claims` | array | Objects with `claim` and `severity` for each unsupported claim |
| `flagged_claims_text` | string | Formatted list of unsupported claims with severity (detail view) |
| `partial_claims_text` | string | Formatted list of partially supported claims with quotes (detail view) |
| `summary_text` | string | Human-readable summary of all findings |

### Warning signs

- **Entities passing with `total_claims_count: 0` and "No source text_content available"** -- the pass is a warning-level skip, not a verification. Check why Step 3 scraping produced no text_content for those entities.
- **`qa_pass: false` with summary "No content_markdown found"** -- the failure is upstream: content-writer produced nothing for this entity. Fix generation, or set `allow_empty_content` if the pipeline legitimately has content-free entities.
- **Log lines "returned unparseable response"** -- that whole batch was marked unsupported and the score dropped. Try a lower `claims_per_batch` or a stronger model.
- **Run failed with `verification_incomplete`** -- an infrastructure failure (rate limit, network blip, refused call) interrupted verification. This is NOT a content verdict: no fabrication was found. `meta.failed_batches` names each failed batch and its error; `meta.batches_not_attempted` lists batches skipped after the first failure; `meta.claims_unverified` counts the claims never examined. Retry the run; if it recurs, look at the provider/network, not the draft.
- **`hallucination_score` of exactly 1 with zero claims** -- no factual claims were detected, so nothing was actually checked; this is normal for opinion-heavy content but worth a spot-check on factual content.

---

## Limitations

- **LLM-dependent accuracy.** The verification quality depends on the LLM model. Smaller models may miss nuanced paraphrasing or incorrectly flag supported claims. Larger models are more accurate but cost more.
- **Heuristic claim extraction.** The factual claim patterns cover common cases but will miss unusual phrasings and may flag non-factual sentences that happen to contain numbers (e.g. "Step 3 of the process").
- **Source text truncation (`head` mode).** In the default `head` mode, if source material exceeds max_source_chars the corpus tail is truncated and claims whose evidence lives there are incorrectly flagged. `source_selection: claim_anchored` addresses this by pulling the relevant chunks into each batch's window regardless of position, and reports `evidence_beyond_window` so any residual truncation is visible rather than silent.
- **No cross-reference verification.** Claims are checked against the combined source corpus, not against external databases or APIs. If the source itself is wrong, the claim passes.
- **General knowledge is subjective.** The heuristic filter for general knowledge is conservative. Some domain-specific common knowledge may still be sent to the LLM for verification, adding cost without value.
- **Cost scales with claims.** Each batch of claims requires an LLM call. Content with many factual claims will generate more API calls. Monitor costs with large batches of entities.

---

## What Happens Next

Results feed into Step 7 (loop-router) for routing decisions. Typical configurations:

- **All pass**: route to Step 8 (bundling) or Step 9 (distribution)
- **Failures present**: route back to Step 5 (content-writer) with flagged_claims feedback for regeneration
- **High-severity unsupported claims**: may warrant manual review at Step 10

---

## Technical Reference

- **Step:** 6 (QA)
- **Category:** qa
- **Cost tier:** medium -- LLM calls per claim batch; gets the medium execution timeout
- **Data operation:** add (+) -- emits one QA-verdict item per entity, keyed by `entity_name` (`item_key: entity_name`)
- **Pool precondition:** `requires_items` -- entities with an empty pool are skipped upstream (`skipped_no_input`) before this module runs
- **Required input columns:** `text_content`
- **Depends on:** `content-writer`, `page-scraper` (per manifest; via data-shape routing, any module producing `text_content` -- e.g. browser-scraper -- also qualifies as a source)
- **Input format:** pool items with `content_markdown` (content to check) and `text_content` (sources), found by field presence, never by `source_submodule`
- **Output format:** one item per entity matching the output fields table above; `meta` additionally carries `supported` / `partial` / `unsupported` / `batches_sent` (and `skipped` + `skip_reason` on skip paths). In `claim_anchored` mode `meta` also carries `source_selection` / `source_corpus_chars` / `source_chars_shown` / `evidence_in_window` / `evidence_beyond_window` / `evidence_absent`, and each `flagged_claims[]` gains an `evidence` tag
- **Error handling:** a failed or never-run verification request hard-fails the entity as an infrastructure error (`meta.status: 'error'`, `meta.error: 'verification_incomplete'`; v1.7.0) — retried, never a content verdict; a received-but-unparseable response fails safe (affected claims marked unsupported, run continues — the model did examine them); missing content fails closed unless `allow_empty_content`; per-entity results (including error results) are pushed to `tools._partialItems` so a timeout preserves completed entities (the skip-with-pass paths do not push)
- **External dependencies:** none beyond `tools.ai.complete()` -- no direct HTTP calls
- **Spec:** `Content-Pipeline/specs/SUBMODULE_DEVELOPMENT.md`
