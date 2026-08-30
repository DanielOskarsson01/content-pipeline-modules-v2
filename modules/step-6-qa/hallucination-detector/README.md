# Hallucination Detector

> Compare generated content claims against original source material to flag statements that aren't supported by any source.

**Module ID:** `hallucination-detector` | **Step:** 6 (QA) | **Category:** qa | **Cost:** medium
**Version:** 1.3.0 | **Data Operation:** add (+)

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
| `source_selection` | select | `head` | How the source window is built. `head` (default) concatenates pages in pool order and truncates at `max_source_chars` -- byte-identical to prior behaviour. `claim_anchored` builds a focused per-batch window from the chunks whose terms overlap that batch's claims (deterministic, no extra LLM call) and emits honest-window meta. See [Source selection](#source-selection-head-vs-claim_anchored) | Set `claim_anchored` on fat entities (large source corpus) where the supporting page is often past the head window; keep `head` (and raise `max_source_chars`) to measure a raw window-raise |

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

## Source selection (`head` vs `claim_anchored`)

The verifier can only mark a claim "supported" if the supporting text is inside the source window it was shown. On a **fat entity** the corpus dwarfs the window — e.g. a 633,916-char corpus against the default `max_source_chars: 100000` means the verifier sees ~16% of the source. In `head` mode that 16% is the corpus **head**, so a fact that lives on page 100 (SNAITECH at char 320,933; Stanleybet/Vision NextGen at 155,069) is simply not in the window, and its claim is flagged "unsupported" — a pure **truncation artifact**, indistinguishable from a real fabrication.

- **`head` (default)** — pool-order concatenation truncated at `max_source_chars`. Unchanged, byte-identical to prior behaviour. A raw *window-raise* is just this mode with a larger `max_source_chars` (no new code path).
- **`claim_anchored`** — the window is the **full head window** (so it can never show less than `head`, i.e. an entity whose evidence is already in the head cannot regress) **plus a supplement**: the single best far chunk for each claim whose evidence sits beyond the head. Chunks are ranked by **IDF-weighted lexical overlap** — the ubiquitous entity name approaches zero weight, so rare discriminating terms (an acronym, a partner name, a number) drive the match; the entity name can't make every claim look "already covered". Deterministic — no second LLM pass, no embeddings service. Because the supplement adds an equal budget on top of the head, the window is **up to ~2× `max_source_chars`** (still far cheaper than a full-corpus raise — see cost note below); set `max_source_chars` with ~2× headroom against the model's context limit.

### Honest-window instrumentation (claim_anchored only)

In `claim_anchored` mode the module records where each flagged claim's evidence actually sits, so a truncation-driven verdict is never again indistinguishable from a fabrication:

| `meta` field | Meaning |
|--------------|---------|
| `source_selection` | `"claim_anchored"` (present only in this mode) |
| `source_corpus_chars` | total characters of source that existed for the entity |
| `source_chars_shown` | size of the largest per-batch window actually sent |
| `evidence_in_window` | flagged claims whose evidence was in a shown chunk (a genuine verdict) |
| `evidence_beyond_window` | flagged claims whose evidence exists in the corpus but was dropped from the window (**truncation artifact**) |
| `evidence_absent` | flagged claims whose terms appear nowhere in the corpus (**candidate fabrication**) |

Each flagged claim in `flagged_claims[].evidence` and in `flagged_claims_text` (as `{in_window}` / `{beyond_window}` / `{absent}`) carries the same tag. `head` mode emits none of these fields — its output is byte-identical to prior versions.

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
- **high** = specific number, date, statistic, or financial claim not found in sources
- **medium** = specific factual claim (company name, product, feature) not found in sources
- **low** = general phrasing, opinion, or common knowledge that is hard to verify

### Severity floor (`severity_floor: true`)

By default the verdict is purely `hallucination_score >= pass_threshold`. With the floor on, **any high-severity unsupported claim force-fails the check** even if the ratio clears the threshold -- e.g. 9 supported + 1 high-severity fabrication = 0.9 would pass at threshold 0.9, but force-fails with the floor. The score field is unchanged (it still reports the honest 0.9); only `qa_pass` flips to false, and it routes through the same `hallucination:fail` key (no new fail key). `meta.severity_floor_tripped: true` marks the entities where the floor fired.

### Special cases

- No content_markdown available = **fail closed** (`qa_pass: false`) by default -- content was expected but is absent, so nothing could be verified (set `allow_empty_content` to skip with a pass instead)
- No source text_content available = skip with pass and warning (cannot verify without sources)
- No factual claims detected = automatic pass (content has no verifiable facts)
- LLM call fails = that batch's claims treated as unsupported (fail-safe)
- LLM response unparseable, or fewer verdicts returned than claims sent = affected claims treated as unsupported (fail-safe)

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
- **Error handling:** LLM failures and unparseable responses fail safe (affected claims marked unsupported, run continues); missing content fails closed unless `allow_empty_content`; successfully-verified per-entity results are pushed to `tools._partialItems` so a timeout preserves completed entities (the skip and fail-closed paths return immediately and do not push)
- **External dependencies:** none beyond `tools.ai.complete()` -- no direct HTTP calls
- **Spec:** `Content-Pipeline/specs/SUBMODULE_DEVELOPMENT.md`
