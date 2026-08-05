# Meta Compliance Checker

> Validates that generated meta titles and meta descriptions meet SEO length requirements and contain target keywords -- producing a per-entity pass/fail verdict with specific violations.

**Module ID:** `meta-compliance-checker` | **Step:** 6 (QA) | **Category:** qa | **Cost:** cheap
**Version:** 1.0.3 | **Data Operation:** add (+)

---

## What This Module Does

Runs up to seven automated checks against each entity's meta title and meta description, producing a `qa_pass` verdict with specific violations. Without it, over-length titles, thin descriptions, keyword-free meta, and duplicate meta across entities would flow straight to bundling and distribution unnoticed.

It sits after generation (content-writer, seo-planner) and before routing:

```
content-writer + seo-planner -> META-COMPLIANCE-CHECKER -> loop-router (Step 7)
```

It emits one new QA-verdict item per entity (keyed by `entity_name`, data operation `add`) alongside the upstream items -- it never modifies the content it grades.

### Checks

1. **Title length (max)** -- Meta title must be <= `title_max_length` (default 60). Google truncates titles beyond this point, wasting the effort put into crafting them.

2. **Title length (min)** -- Fails if the meta title is under `title_min_length` (default 30) characters, or empty. Very short titles miss the opportunity to include keywords and context that improve click-through rates.

3. **Description length (range)** -- Meta description must be between `description_min_length` and `description_max_length` (default 150--160). Too short wastes SERP real estate; too long gets truncated by Google. One check covering both bounds.

4. **Keyword in title** (only when `require_keyword_in_title`) -- At least one head_term from the SEO plan must appear in the meta title (case-insensitive substring). Titles without target keywords rank poorly for those terms.

5. **Keyword in description** (only when `require_keyword_in_description`) -- At least one head_term must appear in the meta description. While not a direct ranking factor, keyword presence in descriptions increases click-through rate from SERPs.

6. **No truncation indicators** -- Neither field may end with "..." or the ellipsis character. This signals the upstream content-writer truncated the field rather than writing it to fit.

7. **No duplicates across entities** -- If multiple entities in the same run have identical (case-insensitive) meta titles or descriptions, every entity involved is flagged. Duplicate meta across pages causes keyword cannibalization and confuses search engines. Title and description duplication together count as one check.

`checks_total` is 5 with both keyword checks disabled, 7 with both enabled (the default).

---

## Input Data & Meta Resolution

This module uses data-shape routing. It finds its input by checking which fields exist on pool items:

- **Content items**: items with `meta_title`, `meta_description`, or `content_markdown`
- **SEO plan items**: items with `seo_plan_json`

The meta title and description to grade are resolved in this priority (v1.0.3):

1. **Direct `meta_title` / `meta_description` fields on GENERATED items only** -- items that also carry `content_markdown`. Scraped page items carry og:description/meta-tag scrapes but never `content_markdown`, so they are excluded. (v1.0.3 fix: in run `cb49ef80`, ~45 scraped items preceded the writer's item in pool order, so the checker graded a scraped 102-char site tagline instead of the writer's validated 151-char meta.)
2. **YAML frontmatter** in `content_markdown` (`title`/`meta_title` and `description`/`meta_description` keys).
3. **The SEO plan's validated meta candidates** -- `seo_plan_json.meta.{title,description}` (legacy top-level) OR `seo_plan_json.sections.meta.meta_{title,description}.candidate` (seo-planner's actual output). This is the authoritative planned meta, so it beats the heuristics below.
4. **First H1 heading** (for title) / **first non-heading paragraph** (for description) -- heuristic last resort, only when no explicit or planned meta exists.

If NO meta title AND no description can be resolved from any item, the entity loud-fails: `qa_pass: false`, `checks_passed: 0`, `checks_total: 0`, with the error "No meta data found -- ensure content-writer or meta-output has run". This is not a skip -- it counts as a failed entity in the summary.

**Keyword source (v1.0.2):** `head_terms` are harvested container-shape-agnostically by `extractHeadTerms` -> `collectPlanKeywords`: every non-empty string under any key named `target_keywords`, `keywords`, or `head_terms` -- **at any nesting depth** (max 8), and whether the value is a string, a flat `string[]`, or a `{primary,secondary,long_tail}` object -- plus the `keyword_summary_table[].keyword` rollup. It keys only on the pipeline-agnostic keyword *field* names, never on section **container** names (`overview`/`category_sections`/`tag_sections`/`sections`/`credentials`), so it covers seo-planner's real per-section/per-tag output across content types. `keyword_sources`/`notes`/`meta` are exact-key mismatches and are never counted. History: v1.0.1 added per-section (`sections.<any>`) reading after a batch-wide "No head_terms found" auto-fail; v1.0.2 (fixes run `f4d501bd`) generalized to the top-level `overview`/`category_sections`/`tag_sections` flat-array shape that v1.0.1 still missed. Kept 1:1 in sync with seo-planner's content gate (identical `collectPlanKeywords`).

---

## When to Use

**Always run when:**
- content-writer (and ideally seo-planner) has produced meta tags -- this is the compliance gate before publication
- Content is heading to Step 8 (bundling) or Step 9 (distribution)

**Skip when:**
- The run produces no meta at all (no content-writer in the plan) -- every entity would loud-fail with "No meta data found"

**Tune the settings when:**
- **No SEO plan data in the run**: disable `require_keyword_in_title` and `require_keyword_in_description`. With them on (the default) and no head_terms harvestable, both keyword checks FAIL with "No head_terms found in SEO plan -- cannot verify keyword..." -- they are NOT silently skipped, so a plan-less entity scores at best 5/7 and fails the default threshold.
- **Draft-stage QA**: lower `pass_threshold` so minor violations pass through to human review instead of triggering regeneration.

---

## Options Guide

| Option | Type | Default | When to Change | What It Does |
|--------|------|---------|----------------|--------------|
| `title_max_length` | number | 60 | Raise toward 70--80 if targeting Bing (more generous display); lower to ~55 for mobile-first sites | Maximum characters for meta title. Google typically truncates at 60. |
| `description_min_length` | number | 150 | Lower to 120 for entities with naturally short descriptions | Minimum characters for meta description. Below this loses SEO value. |
| `description_max_length` | number | 160 | Raise to 170 if targeting featured snippets | Maximum characters for meta description. Google typically truncates at 160. |
| `require_keyword_in_title` | boolean | true | Disable if running without SEO plan data -- otherwise the check fails, it is not skipped | Fail if no head_term from the SEO plan appears in the meta title. |
| `require_keyword_in_description` | boolean | true | Disable for brand/about pages where keyword density matters less, or when no SEO plan exists | Fail if no head_term from the SEO plan appears in the meta description. |
| `title_min_length` | number | 30 | Lower to 15--20 for content types with legitimately terse titles (news wires, product SKUs) | Minimum characters for meta title. Below this (or an empty title) triggers a check failure. |
| `pass_threshold` | number | 1.0 | Lower to ~0.85 to tolerate one failed check of seven; ~0.7 for draft-stage QA | Fraction of checks that must pass for `qa_pass: true`. 1.0 means all checks must pass. |

The two most impactful options are the keyword requirements and `pass_threshold`. Common mistake: running without seo-planner while leaving the keyword checks on -- every entity then carries two guaranteed failures (5/7 = 0.71), which fails the default threshold. The UI clamps ranges: `title_max_length` 40--80, `title_min_length` 10--60, `description_min_length` 100--200, `description_max_length` 120--200, `pass_threshold` 0.5--1.0.

---

## Recommended Configurations

### Standard (default)

Strictest SEO compliance -- all seven checks must pass:

```
title_max_length: 60
title_min_length: 30
description_min_length: 150
description_max_length: 160
require_keyword_in_title: true
require_keyword_in_description: true
pass_threshold: 1.0
```

### Strict

For content going directly to production without human review -- tighter lengths leave headroom under Google's truncation points:

```
title_max_length: 55
title_min_length: 30
description_min_length: 150
description_max_length: 155
require_keyword_in_title: true
require_keyword_in_description: true
pass_threshold: 1.0
```

### Lenient

For draft-stage content or entities where the SEO plan may be incomplete:

```
title_max_length: 70
title_min_length: 20
description_min_length: 120
description_max_length: 170
require_keyword_in_title: false
require_keyword_in_description: false
pass_threshold: 0.7
```

### No SEO Plan

When seo-planner is not in the run -- length and duplicate discipline only (5 checks):

```
title_max_length: 60
title_min_length: 30
description_min_length: 150
description_max_length: 160
require_keyword_in_title: false
require_keyword_in_description: false
pass_threshold: 1.0
```

---

## What Good Output Looks Like

A healthy run with real SEO plans upstream passes most entities 7/7; the summary reads "All N entities passed meta compliance checks".

### All checks pass

```
entity_name: "Bet365"
qa_pass: true
checks_passed: 7
checks_total: 7
meta_title: "Bet365 Review 2026 -- Betting Odds, Bonuses & Features"
meta_title_length: 54
meta_description_length: 155
violations: ""
```

### Typical failure

```
entity_name: "NewCasino"
qa_pass: false
checks_passed: 4
checks_total: 7
meta_title: "NewCasino"
meta_title_length: 9
meta_description_length: 89
violations: "Title too short: 9 chars (recommend >= 30 for SEO value)
Description too short: 89 chars (min 150)
No head_term found in title. Expected one of: online casino, casino bonus"
```

### Output fields

| Field | Type | Description |
|-------|------|-------------|
| `entity_name` | string | Entity this check applies to |
| `qa_pass` | boolean | Whether checks_passed/checks_total met `pass_threshold`. Rows with `false` are flagged in the UI (`flagged_when`). |
| `checks_passed` | number | Number of checks that passed |
| `checks_total` | number | Total checks run (5--7 depending on keyword options; 0 when no meta was found at all) |
| `meta_title` | string | The meta title that was checked |
| `meta_title_length` | number | Character count of the meta title |
| `meta_description_length` | number | Character count of the meta description |
| `meta_description_text` | string | The meta description that was checked (detail view) |
| `violations` | string | Newline-joined violation messages; empty string when all checks pass |

The entity-level `meta` block mirrors `qa_pass`, `checks_passed`, `checks_total`, and adds `violations_count`. The run summary counts `passed`, `failed`, and `errors` (entities with no meta found).

**Warning signs:**
- **Every entity fails the two keyword checks with "No head_terms found in SEO plan"** -- seo-planner is missing from the run or produced empty plans; either fix upstream or disable the keyword requirements.
- **A graded `meta_title` that looks like a website tagline rather than the writer's meta** -- should not happen since v1.0.3 (scraped items are excluded from direct-field resolution); if it does, the writer's item is missing `content_markdown`.
- **"No meta data found" errors** -- content-writer (or meta-output) did not run for that entity, or its item carries neither meta fields, frontmatter, nor a plan candidate.
- **Widespread duplicate-title violations** -- the writer is emitting a shared template title; fix the prompt, don't lower the threshold.

---

## Limitations

- **No content quality assessment.** This module checks structural compliance (length, keyword presence), not whether the meta is well-written or compelling.
- **Keyword matching is literal substring.** "online casino" matches "the best online casino site" but does not match "casino online" (word order matters).
- **No search volume or competition data.** The module checks whether keywords are present, not whether they are the right keywords to target.
- **Frontmatter parsing is basic.** Handles simple `key: value` and `key: "value"` patterns. Deeply nested YAML or multiline values may not parse correctly.
- **Duplicate detection is within-run only.** Does not check against previously published meta from past runs.
- **Missing head_terms is a hard failure, not a skip.** With the keyword requirements on, an entity without a harvestable SEO plan cannot reach 1.0.

---

## What Happens Next

Results feed into Step 7 (loop-router) for routing decisions. Typical configurations:

- **All pass**: route to Step 8 (bundling) or Step 9 (distribution)
- **Failures present**: route back to Step 5 (content-writer) for regeneration with specific violation feedback
- **pass_threshold < 1.0**: allows partial failures through, letting the operator decide at Step 10 (review)

Per the pipeline QA convention, a `qa_pass: false` verdict does not fail the run -- the entity stays `completed` and the verdict is routing/review input.

---

## Technical Reference

- **Step:** 6 (QA)
- **Category:** qa
- **Cost tier:** cheap -- 2-minute timeout, no external I/O so it never comes close
- **Data operation:** add (+) -- emits one new QA-verdict item per entity (`item_key: entity_name`); upstream items are preserved untouched
- **Pool precondition:** `requires_items` -- entities with an empty pool are skipped as `skipped_no_input`, not failed
- **Required input columns:** `seo_plan_json`
- **Depends on:** `content-writer`, `seo-planner`
- **Input format:** pool items selected by data-shape routing (field presence: `meta_title`/`meta_description`/`content_markdown` for content, `seo_plan_json` for plans) -- never by `source_submodule`
- **Output format:** one item per entity matching the output fields table above; each item is also pushed to `tools._partialItems` for timeout resilience
- **Error handling:** entities with no resolvable meta get a loud-fail result row plus an `error` on the entity result; there are no retries or external calls to fail
- **External dependencies:** none -- no AI calls, no HTTP; purely deterministic local string operations
- **Tests:** `test-meta-chain.js` in the module folder; `execute.js` exports `__testing` helpers (`extractHeadTerms`, `addTargetKeywords`, `extractMetaFromFrontmatter`)
