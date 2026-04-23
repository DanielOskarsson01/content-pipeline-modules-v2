# Hallucination Detector

Compare generated content claims against original source material to flag statements that aren't supported by any source.

| Field | Value |
|-------|-------|
| Module ID | `hallucination-detector` |
| Step | 6 -- QA |
| Category | qa |
| Cost | medium (LLM calls) |
| Data operation | add (new items with QA verdicts) |

---

## What This Module Does

Extracts factual claims from content_markdown using heuristic patterns (numbers, dates, statistics, company-specific facts), then sends batches of claims to an LLM along with the original source text_content for verification. Each claim gets a verdict: supported, partially supported, or unsupported. The module produces a hallucination_score (0--1) and a pass/fail verdict.

### Process

1. **Claim extraction** -- Sentences containing numbers, dates, percentages, currency amounts, or company-specific assertions ("founded in", "headquartered in", "employs", "licensed by", "operates in") are extracted from content_markdown. General knowledge sentences are excluded.

2. **Source gathering** -- All text_content from scraped pages (page-scraper, browser-scraper) is combined into a single source corpus, respecting the max_source_chars limit.

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
| `pass_threshold` | number | 0.9 | Minimum hallucination_score for qa_pass to be true | Lower to 0.7 for draft-stage content. Set to 1.0 for zero-tolerance on unsupported claims. |
| `ai_model` | string | `claude-haiku-4-5-20251001` | LLM model for verification | Switch to a larger model (e.g. Claude Sonnet) for better accuracy on nuanced claims. |
| `ai_provider` | string | `anthropic` | LLM provider | Change if using a different provider (e.g. Mercury, Gemini). |
| `max_source_chars` | number | 100000 | Max source text to include in LLM context | Increase if sources are large and claims reference distant content. Decrease to save tokens. |
| `claims_per_batch` | number | 10 | Claims verified per LLM call | Lower to 5 for more reliable results. Higher values use fewer API calls but may reduce accuracy. |
| `prompt` | textarea | (built-in) | System prompt for claim verification | Customize to adjust verdict criteria, severity definitions, or domain-specific rules. Uses `{{CLAIMS}}` and `{{SOURCES}}` placeholders. |

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

The entity passes when `hallucination_score >= pass_threshold`.

### Severity ratings

Each unsupported claim is rated by severity:
- **high** = specific number, date, statistic, or financial claim not found in sources
- **medium** = specific factual claim (company name, product, feature) not found in sources
- **low** = general phrasing, opinion, or common knowledge that is hard to verify

### Special cases

- No content_markdown available = skip with pass (nothing to verify)
- No source text_content available = skip with pass and warning (cannot verify without sources)
- No factual claims detected = automatic pass (content has no verifiable facts)
- LLM call fails = claims treated as unsupported (fail-safe)
- LLM response unparseable = claims treated as unsupported (fail-safe)

---

## Recommended Configurations

### Standard (default)

Balanced check for most content pipelines:

```
pass_threshold: 0.9
ai_model: claude-haiku-4-5-20251001
ai_provider: anthropic
max_source_chars: 100000
claims_per_batch: 10
```

### Strict

For content going directly to production without human review:

```
pass_threshold: 1.0
ai_model: claude-sonnet-4-20250514
ai_provider: anthropic
max_source_chars: 100000
claims_per_batch: 5
```

### Quick

For draft-stage content or large batches where speed matters:

```
pass_threshold: 0.7
ai_model: claude-haiku-4-5-20251001
ai_provider: anthropic
max_source_chars: 50000
claims_per_batch: 15
```

---

## What Good Output Looks Like

### All claims verified

```
entity_name: "Bet365"
qa_pass: true
hallucination_score: 0.952
verified_claims_count: 20
total_claims_count: 21
flagged_claims_count: 0
```

### Typical failure

```
entity_name: "NewCasino"
qa_pass: false
hallucination_score: 0.714
verified_claims_count: 10
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
| `verified_claims_count` | number | Claims counted as verified (supported + partial * 0.5) |
| `total_claims_count` | number | Total factual claims extracted from content |
| `flagged_claims_count` | number | Claims with "unsupported" verdict |
| `flagged_claims` | array | Objects with `claim` and `severity` for each unsupported claim |
| `flagged_claims_text` | string | Formatted list of unsupported claims with severity (detail view) |
| `partial_claims_text` | string | Formatted list of partially supported claims with quotes (detail view) |
| `summary_text` | string | Human-readable summary of all findings |

---

## Limitations

- **LLM-dependent accuracy.** The verification quality depends on the LLM model. Smaller models may miss nuanced paraphrasing or incorrectly flag supported claims. Larger models are more accurate but cost more.
- **Heuristic claim extraction.** The factual claim patterns cover common cases but will miss unusual phrasings and may flag non-factual sentences that happen to contain numbers (e.g. "Step 3 of the process").
- **Source text truncation.** If source material exceeds max_source_chars, some sources are truncated. Claims referencing truncated content may be incorrectly flagged.
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

- **Spec**: `Content-Pipeline/specs/SUBMODULE_DEVELOPMENT.md`
- **Pattern**: Data-shape routing (field existence on items, never `source_submodule`)
- **Dependencies**: Upstream `content-writer` (for content_markdown), `page-scraper` / `browser-scraper` (for text_content)
- **AI calls**: LLM via tools.ai.complete() -- batched claim verification
- **No external HTTP calls**: All verification is LLM-based against provided source text
