# Citation Coverage Checker

Verifies that every factual claim in generated content is backed by an inline citation referencing a valid source URL from the content-analyzer's source_citations array.

| Field | Value |
|-------|-------|
| Module ID | `citation-coverage-checker` |
| Step | 6 -- QA |
| Category | qa |
| Cost | cheap |
| Data operation | transform (same items, enriched with QA verdicts) |

---

## What This Module Does

Parses content_markdown for inline citation references (`[#1]`, `[#2]`, etc.), cross-references them against the source_citations array in analysis_json, and uses heuristics to flag factual claims that lack citations. Produces a citation_score (0--1) and a pass/fail verdict.

### Checks

1. **Content has citations** -- Content with zero inline `[#n]` references is an automatic fail. If the writer did not cite anything, coverage is zero.

2. **Citation references resolve** -- Every `[#n]` in the content must have a matching entry in `source_citations`. A reference to `[#5]` when the citations array only has 3 entries is a broken citation.

3. **Factual claims have citations** -- Sentences containing numbers, dates, statistics, currency amounts, percentages, or company-specific claims ("founded in", "headquartered in", "employs", "licensed by", "acquired by") are flagged if they lack an inline citation. General knowledge statements ("iGaming is a growing industry") are excluded.

4. **Source URLs are live** (optional) -- When `verify_urls` is enabled, HEAD requests are sent to each unique source URL to check it still responds with a 2xx/3xx status.

---

## When to Use

- **Always** after content-writer and content-analyzer have both run
- **Always** before publishing or distribution (Step 9)
- Works without analysis_json (citation references are still checked, but source matching is skipped)
- Enable `verify_urls` for final pre-publish QA, disable for draft-stage checks

---

## Input Data

This module uses data-shape routing. It finds its input by checking which fields exist on pool items:

- **Content items**: items with `content_markdown` (from content-writer)
- **Analysis items**: items with `analysis_json` containing `source_citations` (from content-analyzer)

---

## Options Guide

| Option | Type | Default | What It Does | When to Change |
|--------|------|---------|--------------|----------------|
| `pass_threshold` | number | 0.7 | Minimum citation_score for qa_pass to be true | Increase to 0.9 or 1.0 for production content. Lower to 0.5 for early drafts. |
| `verify_urls` | boolean | false | Send HEAD requests to verify source URLs are live | Enable for final QA before publishing. Adds HTTP cost and latency. |
| `require_factual_citations` | boolean | true | Flag sentences with numbers/dates/stats that lack citations | Disable if the content style intentionally avoids inline citations. |

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

- Zero citations in content = automatic fail (score 0), regardless of threshold
- No analysis_json available = all citation refs are treated as broken (no source map to match against)
- Same source cited multiple times = fine, unique sources are counted separately

---

## Recommended Configurations

### Standard (default)

All defaults. Balanced check for draft-stage content:

```
pass_threshold: 0.7
verify_urls: false
require_factual_citations: true
```

### Strict

For content going directly to production without human review:

```
pass_threshold: 0.9
verify_urls: true
require_factual_citations: true
```

### Lenient

For early drafts where citations may be incomplete:

```
pass_threshold: 0.5
verify_urls: false
require_factual_citations: false
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
| `qa_pass` | boolean | Whether citation_score meets the pass_threshold |
| `citation_score` | number | Coverage score from 0 to 1 |
| `citation_count` | number | Unique inline `[#n]` references found in content |
| `source_count` | number | Entries in the source_citations array |
| `uncited_claims_count` | number | Factual-claim sentences without citations |
| `broken_citations_count` | number | `[#n]` references with no matching source |
| `uncited_claims_text` | string | List of uncited factual claims (detail view) |
| `broken_citations_text` | string | List of broken citation references (detail view) |
| `dead_urls_text` | string | List of dead source URLs, or "disabled" (detail view) |
| `summary_text` | string | Human-readable summary of all findings |

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

- **Spec**: `Content-Pipeline/specs/SUBMODULE_DEVELOPMENT.md`
- **Pattern**: Data-shape routing (field existence on items, never `source_submodule`)
- **Dependencies**: Upstream `content-writer` (for content_markdown), `content-analyzer` (for analysis_json.source_citations)
- **No AI calls**: Purely deterministic heuristic checks
- **External calls**: Optional HEAD requests when `verify_urls` is true (via tools.http)
