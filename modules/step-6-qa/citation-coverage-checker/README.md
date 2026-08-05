# Citation Coverage Checker

> Verifies that every factual claim in generated content is backed by an inline citation referencing a valid source URL from the content-analyzer's source_citations array.

**Module ID:** `citation-coverage-checker` | **Step:** 6 (QA) | **Category:** qa | **Cost:** cheap
**Version:** 1.0.0 | **Data Operation:** add (+)

---

## What This Module Does

Parses content_markdown for inline citation references (`[#1]`, `[#2]`, etc.), cross-references them against the source_citations array in analysis_json, and uses heuristics to flag factual claims that lack citations. Produces a citation_score (0--1) and a pass/fail verdict per entity, emitted as one QA verdict item per entity into the pool (upstream content items are not modified).

```
content-writer + content-analyzer -> THIS MODULE -> loop-router (Step 7)
```

### Checks

1. **Content has citations** -- Content with zero inline `[#n]` references is an automatic fail (score 0) when `require_at_least_one_citation` is true (the default). If the writer did not cite anything, coverage is zero.

2. **Citation references resolve** -- Every `[#n]` in the content must have a matching entry in `source_citations`. A reference to `[#5]` when the citations array only has 3 entries is a broken citation.

3. **Factual claims have citations** -- Sentences containing numbers, dates, statistics, currency amounts, percentages, or company-specific claims ("founded in", "headquartered in", "employs", "licensed by", "acquired by") are flagged if they lack an inline citation. General knowledge statements ("iGaming is a growing industry") are excluded.

4. **Source URLs are live** (optional) -- When `verify_urls` is enabled, HEAD requests (10s timeout, deduplicated across sources, sent in parallel) check that each unique source URL responds with a 2xx/3xx status.

### Input Data

This module uses data-shape routing. It finds its input by checking which fields exist on pool items, never by checking `source_submodule`:

- **Content items**: items with `content_markdown` (from content-writer). All content items for an entity are combined before checking.
- **Analysis items**: items with `analysis_json` containing `source_citations` (from content-analyzer). The first analysis_json found is used.

If an entity has no `content_markdown` item at all, it fails loudly: `qa_pass: false`, score 0, with summary "No content_markdown found -- ensure content-writer has run."

If `analysis_json` is missing (or has no `source_citations`), the source map is empty, so **every** `[#n]` reference counts as broken -- the score collapses. This is not a skip; run content-analyzer first.

---

## When to Use

**Always run when:**
- content-writer and content-analyzer have both run and the content is expected to carry inline `[#n]` citations
- Content is heading toward publishing or distribution (Step 9) -- this is the citation gate

**Skip when:**
- The template's content style has no citations at all AND you don't want a QA verdict for it (alternatively, keep it running with the no-citation recipe below)
- content-analyzer is not part of the pipeline -- without source_citations every reference counts as broken and the check only produces noise

**Tune the settings when:**
- Draft-stage runs: lower `pass_threshold`, keep `verify_urls` off
- Final pre-publish QA: raise `pass_threshold`, turn `verify_urls` on
- Citation-free house style: see the "No-citation content style" recipe -- flipping `require_at_least_one_citation` alone is not enough (see Options Guide)

---

## Options Guide

| Option | Type | Default | What It Does | When to Change |
|--------|------|---------|--------------|----------------|
| `pass_threshold` | number | 0.7 | Minimum citation_score (0--1) for qa_pass to be true. 1.0 means every factual claim must have a citation. | Raise to 0.9--1.0 for production content going out without human review. Lower to 0.5 for early drafts. |
| `verify_urls` | boolean | false | Send HEAD requests to each source URL to check it is still live. Adds HTTP cost and latency. | Enable for final QA before publishing. Keep off for draft-stage checks. |
| `require_factual_citations` | boolean | true | Flag sentences with numbers, dates, statistics, or company-specific claims that lack an inline citation. | Disable if the content style intentionally avoids inline citations. |
| `require_at_least_one_citation` | boolean | true | Content with zero `[#n]` citations fails automatically, regardless of pass_threshold. | Disable for content styles that legitimately ship without citations. |

The most impactful pair is `require_at_least_one_citation` + `pass_threshold`. Note the interaction: turning `require_at_least_one_citation` off does NOT make zero-citation content pass on its own -- with zero citations the score is always 0, so the entity still fails any `pass_threshold` above 0.0. To fully accept citation-free content you must also set `pass_threshold: 0.0` (and usually `require_factual_citations: false`).

---

## How Scoring Works

The citation_score is calculated as:

```
citation_score = valid_citations / (valid_citations + uncited_claims + broken_citations)
```

Where:
- **valid_citations** = number of unique `[#n]` references that have a matching source in source_citations
- **uncited_claims** = number of factual-claim sentences without any citation (only counted when `require_factual_citations` is true)
- **broken_citations** = number of `[#n]` references with no matching source

The entity passes when `citation_score >= pass_threshold`.

### Special cases

- Zero citations in content = automatic fail (score 0) when `require_at_least_one_citation` is true. With the option off, the entity still gets score 0 and only passes if `pass_threshold` is 0.0.
- No content_markdown at all = automatic fail with an explicit "ensure content-writer has run" summary.
- No analysis_json available = all citation refs are treated as broken (no source map to match against).
- Same source cited multiple times = fine; `citation_count` counts unique reference numbers.
- Dead URLs (from `verify_urls`) are reported in the detail view and counted in meta, but do NOT reduce the citation_score or flip qa_pass on their own.

---

## Recommended Configurations

### Standard (default)

Balanced check for draft-stage content:

```
pass_threshold: 0.7
verify_urls: false
require_factual_citations: true
require_at_least_one_citation: true
```

### Strict

For content going directly to production without human review:

```
pass_threshold: 0.9
verify_urls: true
require_factual_citations: true
require_at_least_one_citation: true
```

### Lenient

For early drafts where citations may be incomplete:

```
pass_threshold: 0.5
verify_urls: false
require_factual_citations: false
require_at_least_one_citation: true
```

### No-citation content style

For templates whose content intentionally carries no inline citations (all three changes are required -- see Options Guide):

```
pass_threshold: 0.0
verify_urls: false
require_factual_citations: false
require_at_least_one_citation: false
```

---

## What Good Output Looks Like

### All checks pass

```
entity_name: "Bet365"
qa_pass: true
citation_score: 0.923
citation_count: 12
source_count: 8
uncited_claims_count: 1
broken_citations_count: 0
```

### Typical failures

```
entity_name: "NewCasino"
qa_pass: false
citation_score: 0.429
citation_count: 3
source_count: 5
uncited_claims_count: 4
broken_citations_count: 0
uncited_claims_text: "1. The company employs over 500 staff across three offices.\n2. Revenue reached $2.1 billion in 2025.\n3. Founded in 2018 by two industry veterans.\n4. Licensed by the Malta Gaming Authority and the UKGC."
```

### Output fields

| Field | Type | Description |
|-------|------|-------------|
| `entity_name` | string | Entity this check applies to |
| `qa_pass` | boolean | Whether citation_score meets the pass_threshold. Rows with `qa_pass: false` are flagged in the results table. |
| `citation_score` | number | Coverage score from 0 to 1 |
| `citation_count` | number | Unique inline `[#n]` references found in content |
| `source_count` | number | Entries in the source_citations array |
| `uncited_claims_count` | number | Factual-claim sentences without citations |
| `broken_citations_count` | number | `[#n]` references with no matching source |
| `uncited_claims_text` | string | Numbered list of uncited factual claims (detail view) |
| `broken_citations_text` | string | List of broken citation references (detail view) |
| `dead_urls_text` | string | List of dead source URLs, or "URL verification disabled." (detail view) |
| `summary_text` | string | Human-readable summary of all findings |

### Warning signs

- **Every entity fails with "Content contains no inline citations"** -- the content-writer template prompt does not instruct `[#n]` citations. Fix the prompt, or use the No-citation recipe if that's intentional.
- **High `broken_citations_count` with `source_count: 0`** -- content-analyzer didn't run for these entities or its analysis_json has no `source_citations`. Check Step 5 output before blaming the writer.
- **summary_text says "No content_markdown found"** -- content-writer failed or was skipped for that entity; the verdict is about missing input, not citation quality.
- **Many dead URLs reporting timeouts/errors** -- some sites reject HEAD requests. Dead URLs are advisory (they don't fail the entity); verify manually before removing sources.

---

## Limitations

- **Heuristic-based claim detection.** The factual claim patterns cover common cases (numbers, dates, company facts) but will miss unusual phrasings and may flag non-factual sentences that happen to contain numbers.
- **No semantic understanding.** The module cannot tell if a number is a factual claim or a UI element ("Step 1", "Section 3"). It uses pattern matching, not NLP.
- **URL verification is basic.** HEAD requests check reachability, not content. A URL returning 200 with a "Page Not Found" body would pass.
- **Single-pass analysis.** Citation references and factual claims are checked independently. The module does not verify that a citation actually supports the claim it is attached to.
- **General knowledge filter is conservative.** Some domain-specific common knowledge may still be flagged. Operators should review uncited claims rather than treating the count as absolute.

---

## What Happens Next

Results feed into Step 7 (loop-router) for routing decisions. Typical configurations:

- **All pass**: route to Step 8 (bundling) or Step 9 (distribution)
- **Failures present**: route back to Step 5 (content-writer) with uncited_claims feedback for regeneration
- **pass_threshold < 1.0**: allows partially-cited content through for operator review at Step 10

---

## Technical Reference

- **Step:** 6 (QA)
- **Category:** qa
- **Cost tier:** cheap -- pure deterministic checks, shortest timeout tier (URL verification adds HTTP latency but no LLM cost)
- **Data operation:** add (+) -- emits one QA verdict item per entity, keyed by `entity_name`; upserted alongside upstream items without modifying them
- **Pool precondition:** `requires_items` -- entities with an empty pool are marked `skipped_no_input` (not failed) before execution
- **Required input columns:** `analysis_json`
- **Depends on:** `content-writer` (content_markdown), `content-analyzer` (analysis_json.source_citations)
- **Input format:** data-shape routing on pool items -- `content_markdown` for content, `analysis_json.source_citations` for the source map. Tolerates three source_citations shapes: `[{index, url, title}]`, `[{claim, sources: [url, ...]}]`, and plain `["url", ...]` (1-indexed).
- **Output format:** one item per entity matching the output fields table above; per-entity `meta` carries qa_pass, citation_score, and counts; run summary reports passed/failed totals and average score
- **Error handling:** missing content or zero citations produce explicit fail items (never silent skips); each entity's result is pushed to `tools._partialItems` so a timeout preserves completed entities; failed URL checks are caught per-URL and reported as dead
- **External dependencies:** none for the core checks (no AI calls, purely deterministic). Optional HEAD requests via `tools.http` when `verify_urls` is true.
