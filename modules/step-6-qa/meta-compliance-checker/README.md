# Meta Compliance Checker

Validates that generated meta titles and meta descriptions meet SEO length requirements and contain target keywords.

| Field | Value |
|-------|-------|
| Module ID | `meta-compliance-checker` |
| Step | 6 -- QA |
| Category | qa |
| Cost | cheap |
| Data operation | transform (same items, enriched with QA verdicts) |

---

## What This Module Does

Runs seven automated checks against each entity's meta title and meta description, producing a pass/fail verdict with specific violations.

### Checks

1. **Title length (max)** -- Meta title must be <= 60 characters (configurable). Google truncates titles beyond this point, wasting the effort put into crafting them.

2. **Title length (min)** -- Warns if meta title is under 30 characters. Very short titles miss the opportunity to include keywords and context that improve click-through rates.

3. **Description length (range)** -- Meta description must be between 150--160 characters (configurable). Too short wastes SERP real estate; too long gets truncated by Google.

4. **Keyword in title** -- At least one head_term from the SEO plan must appear in the meta title (case-insensitive). Titles without target keywords rank poorly for those terms.

5. **Keyword in description** -- At least one head_term must appear in the meta description. While not a direct ranking factor, keyword presence in descriptions increases click-through rate from SERPs.

6. **No truncation indicators** -- Meta title and description must not end with "..." or the ellipsis character. This signals the upstream content-writer truncated the field rather than writing it to fit.

7. **No duplicates across entities** -- If multiple entities in the same run have identical meta titles or descriptions, both are flagged. Duplicate meta across pages causes keyword cannibalization and confuses search engines.

---

## When to Use

- **Always** after content-writer and/or meta-output have produced meta tags
- **Always** before publishing or distribution (Step 9)
- **Ideally** with SEO plan data available (from seo-planner) for keyword checks
- Works without SEO plan data -- keyword checks are skipped with a warning

---

## Input Data

This module uses data-shape routing. It finds its input by checking which fields exist on pool items:

- **Content items**: items with `meta_title`, `meta_description`, or `content_markdown`
- **SEO plan items**: items with `seo_plan_json`

If `meta_title` / `meta_description` are not directly on items, the module tries to extract them from:
1. YAML frontmatter in `content_markdown` (title/meta_title and description/meta_description fields)
2. First H1 heading (for title)
3. First paragraph (for description)
4. `seo_plan_json.meta.title` and `seo_plan_json.meta.description`

---

## Options Guide

| Option | Type | Default | What It Does | When to Change |
|--------|------|---------|--------------|----------------|
| `title_max_length` | number | 60 | Maximum meta title length | Increase to 70 if targeting Bing (more generous display). Decrease to 55 for mobile-first sites. |
| `description_min_length` | number | 150 | Minimum meta description length | Lower to 120 for entities with naturally short descriptions. |
| `description_max_length` | number | 160 | Maximum meta description length | Increase to 170 if targeting featured snippets. |
| `require_keyword_in_title` | boolean | true | Fail if no head_term in title | Disable if running without SEO plan data. |
| `require_keyword_in_description` | boolean | true | Fail if no head_term in description | Disable for brand/about pages where keyword density is less important. |
| `pass_threshold` | number | 1.0 | Fraction of checks that must pass | Lower to 0.8 for draft-stage QA where minor violations are acceptable. |

---

## Recommended Configurations

### Standard (default)

All defaults. Strictest SEO compliance -- all seven checks must pass.

### Strict

For content going directly to production without human review:

```
title_max_length: 55
description_min_length: 150
description_max_length: 155
pass_threshold: 1.0
```

### Lenient

For draft-stage content or entities where SEO plan may be incomplete:

```
title_max_length: 70
description_min_length: 120
description_max_length: 170
require_keyword_in_title: false
require_keyword_in_description: false
pass_threshold: 0.7
```

---

## What Good Output Looks Like

### All checks pass

```
entity_name: "Bet365"
qa_pass: true
checks_passed: 7
checks_total: 7
meta_title: "Bet365 Review 2026 -- Betting Odds, Bonuses & Features"
meta_title_length: 54
meta_description_length: 155
violations: "[]"
```

### Typical failures

```
entity_name: "NewCasino"
qa_pass: false
checks_passed: 4
checks_total: 7
meta_title: "NewCasino"
meta_title_length: 9
meta_description_length: 89
violations: "[\"Title too short: 9 chars (recommend >= 30 for SEO value)\",\"Description too short: 89 chars (min 150)\",\"No head_term found in title. Expected one of: online casino, casino bonus\"]"
```

### Output fields

| Field | Type | Description |
|-------|------|-------------|
| `entity_name` | string | Entity this check applies to |
| `qa_pass` | boolean | Whether the entity passed the compliance threshold |
| `checks_passed` | number | Number of checks that passed |
| `checks_total` | number | Total number of checks run |
| `meta_title` | string | The meta title that was checked |
| `meta_title_length` | number | Character count of the meta title |
| `meta_description_length` | number | Character count of the meta description |
| `meta_description_text` | string | The meta description that was checked (detail view) |
| `violations` | string | JSON array of violation messages |

---

## Limitations

- **No content quality assessment.** This module checks structural compliance (length, keyword presence), not whether the meta is well-written or compelling.
- **Keyword matching is literal substring.** "online casino" matches "the best online casino site" but does not match "casino online" (word order matters).
- **No search volume or competition data.** The module checks whether keywords are present, not whether they are the right keywords to target.
- **Frontmatter parsing is basic.** Handles simple `key: value` and `key: "value"` patterns. Deeply nested YAML or multiline values may not parse correctly.
- **Duplicate detection is within-run only.** Does not check against previously published meta from past runs.

---

## What Happens Next

Results feed into Step 7 (loop-router) for routing decisions. Typical configurations:

- **All pass**: route to Step 8 (bundling) or Step 9 (distribution)
- **Failures present**: route back to Step 5 (content-writer) for regeneration with specific violation feedback
- **pass_threshold < 1.0**: allows partial failures through, letting the operator decide at Step 10 (review)

---

## Technical Reference

- **Spec**: `Content-Pipeline/specs/SUBMODULE_DEVELOPMENT.md`
- **Pattern**: Data-shape routing (field existence on items, never `source_submodule`)
- **Dependencies**: Upstream `content-writer` or `meta-output` (for meta fields), `seo-planner` (for head_terms)
- **No external API calls**: All checks are local string operations
- **No AI calls**: Purely deterministic rule-based checks
