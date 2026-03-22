# Keyword Sufficiency Checker

Validates that generated content includes target SEO keywords at the right density and in the right positions (headlines, first paragraphs, meta tags), producing a pass/fail verdict with a detailed placement report.

| Field | Value |
|-------|-------|
| Module ID | `keyword-sufficiency-checker` |
| Step | 6 -- QA |
| Category | qa |
| Cost | cheap |
| Data operation | transform (same items, enriched with QA verdicts) |

---

## What This Module Does

Takes content from content-writer (`content_markdown`) and the keyword plan from seo-planner (`seo_plan_json`), then checks four dimensions of keyword usage:

1. **Head term placement and density** -- Are primary keywords in H1/H2 headings and first paragraphs? Is density between 1-3%?
2. **Mid-tail term coverage** -- Do secondary and long-tail keywords appear in subheadings or body text?
3. **Entity keyword coverage** -- Are entity-specific terms present in the content?
4. **Negative keyword absence** -- Do any forbidden keywords appear anywhere?

Citation references (`[#1]`, `[#2]`) are stripped before analysis so keywords appearing only in citations do not count.

---

## When to Use

- **Always** after content-writer and seo-planner have both run
- **Works without seo-planner** -- if no SEO plan is found, returns pass with a warning (nothing to check against)
- **Before Step 7** (loop-router) so failed entities can be routed back for rewriting
- Pairs well with `meta-compliance-checker` for comprehensive QA coverage

---

## Input Data

This module uses data-shape routing. It finds its input by checking which fields exist on pool items:

- **Content items**: items with `content_markdown`
- **SEO plan items**: items with `seo_plan_json`

The SEO plan keywords are extracted from two possible shapes:

1. `seo_plan_json.keywords_used` (with `head_terms`, `mid_tail`, `entities`, `negatives` arrays)
2. `seo_plan_json.target_keywords` (with `primary`, `secondary`, `long_tail`) plus `keyword_distribution`

Both shapes are handled transparently.

---

## Options Guide

| Option | Type | Default | What It Does | When to Change |
|--------|------|---------|--------------|----------------|
| `pass_threshold` | number | 0.6 | Minimum keyword_score for the entity to pass | Raise to 0.8 for strict SEO compliance. Lower to 0.4 for draft content. |
| `head_term_density_min` | number | 0.01 | Minimum density for head terms (1%) | Lower for long-form content where natural density is lower. |
| `head_term_density_max` | number | 0.03 | Maximum density for head terms (3%) | Lower to 0.02 for content where keyword stuffing is a bigger risk. |
| `check_negatives` | boolean | true | Whether to check for negative keywords | Disable if the SEO plan has no negative keywords defined. |

---

## Scoring Breakdown

The composite `keyword_score` (0-1) is a weighted average of four category scores:

| Category | Weight | How Scored |
|----------|--------|------------|
| Head terms | 40% | 60% placement (in H1/H2/first paragraph) + 40% density (1-3% range). Missing = 0. Body only = 0.5. |
| Mid-tail terms | 25% | Coverage ratio. Need at least 2 present. Below minimum gets harsh 50% penalty. |
| Entity terms | 15% | Simple found/total ratio. |
| Negatives | 20% | Binary: 1.0 if none found, 0.0 if any found. |

If a category has no keywords (e.g., no entity terms in the plan), its weight is redistributed proportionally to the other categories.

**Pass/fail**: `keyword_score >= pass_threshold` (default 0.6).

### Density rules for head terms

- Below `head_term_density_min` (default 1%): density score = 0.5 (partial credit)
- Within range (1-3%): density score = 1.0
- Above `head_term_density_max` (default 3%): density score = 0.3 (keyword stuffing penalty)
- Not found: density score = 0.0

---

## Example Output

### Passing entity

```
entity_name: "Bet365"
qa_pass: true
keyword_score: 0.85
missing_keywords: "[]"
misplaced_keywords: "[]"
negative_keywords_found: "[]"
placement_report: |
  Word count: 1240

  HEAD TERMS (2, score: 90%):
    "online betting": density=1.45% (ok), correctly placed
    "sports betting platform": density=1.05% (ok), correctly placed

  MID-TAIL TERMS (4/5 found, score: 80%):
    Missing: bet365 mobile app review

  COMPOSITE SCORE: 85% (threshold: 60%) -- PASS
```

### Failing entity

```
entity_name: "NewCasino"
qa_pass: false
keyword_score: 0.35
missing_keywords: "[\"online casino\",\"casino games\"]"
misplaced_keywords: "[\"casino bonus\"]"
negative_keywords_found: "[\"gambling addiction\"]"
placement_report: |
  Word count: 890

  HEAD TERMS (3, score: 30%):
    "online casino": density=0% (missing), MISSING
    "casino bonus": density=0.56% (low), in body only (should be in H1/H2/first paragraph)
    "casino games": density=0% (missing), MISSING

  NEGATIVE KEYWORDS (score: 0%):
    FOUND (must not appear): gambling addiction

  COMPOSITE SCORE: 35% (threshold: 60%) -- FAIL
```

### Skipped (no SEO plan)

```
entity_name: "UnplannedCorp"
qa_pass: true
keyword_score: 1
placement_report: "No SEO plan with keywords found. Keyword check skipped -- returning pass with warning."
```

---

## Output Fields

| Field | Type | Description |
|-------|------|-------------|
| `entity_name` | string | Entity this check applies to |
| `qa_pass` | boolean | Whether the entity passed the keyword sufficiency threshold |
| `keyword_score` | number | Composite score from 0 to 1 |
| `missing_keywords` | string | JSON array of keywords not found anywhere in the content |
| `misplaced_keywords` | string | JSON array of keywords found in body but not in prominent positions |
| `negative_keywords_found` | string | JSON array of negative keywords found (should be empty) |
| `placement_report` | string | Full human-readable breakdown of all checks |
| `density_report` | string | Per-keyword density values for head terms |

---

## Recommended Configurations

### Standard (default)

All defaults. Balanced check with 60% pass threshold.

```
pass_threshold: 0.6
head_term_density_min: 0.01
head_term_density_max: 0.03
check_negatives: true
```

### Strict SEO

For content going directly to production. Requires higher keyword coverage.

```
pass_threshold: 0.8
head_term_density_min: 0.01
head_term_density_max: 0.025
check_negatives: true
```

### Relaxed

For draft-stage content or when the SEO plan is incomplete.

```
pass_threshold: 0.4
head_term_density_min: 0.005
head_term_density_max: 0.05
check_negatives: false
```

---

## Edge Cases

- **No `seo_plan_json` available** (seo-planner did not run): returns pass with warning. Nothing to check against.
- **No `content_markdown` found**: returns fail with score 0. No content = no keywords.
- **Very short content** (< 200 words): density calculations are unreliable. Flagged in the placement report but does not automatically fail.
- **Keywords in citations only**: citation references (`[#1]`, `[#2]`) are stripped before analysis. Keywords must appear in prose.
- **Multi-word keywords**: matched as exact phrases with word boundaries. "online casino" matches "the best online casino bonus" but not "casinoonline".

---

## Limitations

- **Keyword matching is literal substring with word boundaries.** "online casino" does not match "casino online" (word order matters). Stemming and synonyms are not considered.
- **No semantic understanding.** The module checks for exact keyword presence, not whether the topic is adequately covered.
- **Density is approximate.** Based on simple word count of body text. Markdown formatting, code blocks, and tables may skew the count slightly.
- **Entity terms require explicit plan data.** If the SEO plan does not include an `entities` list, entity term checking is skipped (with weight redistributed).

---

## What Happens Next

Results feed into Step 7 (loop-router) for routing decisions:

- **Pass**: route to Step 8 (bundling) or Step 9 (distribution)
- **Fail**: route back to Step 5 (content-writer) for rewriting, with the placement report providing specific feedback on what to fix
- **Skipped**: treat as pass -- no SEO plan means nothing to enforce

---

## Technical Reference

- **Spec**: `Content-Pipeline/specs/SUBMODULE_DEVELOPMENT.md`
- **Pattern**: Data-shape routing (field existence on items, never `source_submodule`)
- **Dependencies**: Upstream `content-writer` (for `content_markdown`), `seo-planner` (for `seo_plan_json`)
- **No external API calls**: All checks are local string operations
- **No AI calls**: Purely deterministic rule-based checks
