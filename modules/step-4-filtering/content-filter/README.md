# Content Filter (optional)

> Optional safety-net pass that removes low-quality scraped pages -- failed scrapes, stubs, non-English content, leftover junk URLs -- before generation. Most checks overlap with Step 2 validation and Step 3 scraping, so skip it unless you need an extra pass.

**Module ID:** `content-filter` | **Step:** 4 (Filtering) | **Category:** filtering | **Cost:** cheap
**Version:** 1.0.0 | **Data Operation:** remove (-)

---

## Background

### The Content Problem This Solves

After Step 3 (Scraping), the pipeline has actual page content -- text, titles, word counts. But not all scraped content is usable. Some pages failed to scrape (timeouts, server errors). Some returned near-empty content (stub pages, JavaScript-only renders). Some are in the wrong language. Some are pages that slipped through Step 2 validation -- cookie policies, login pages, WordPress admin paths.

Feeding low-quality or irrelevant content into the LLM generation step (Step 5) wastes tokens and produces worse output. The original Content Creation Master described this as the "second quality gate" -- the first being pre-scrape validation in Step 2 (now Step 4 in the old numbering):

> *"Purpose: Clean up raw scraped content before handing it to the LLM. This is the second quality gate."*

The rules were explicit: *"Drop <100 words. Deduplicate exact + near duplicate. Strip boilerplate (menus, cookie banners, disclaimers). Tag critical intents: About; Products/Solutions; Press; Partners; Careers; Contact."*

This module implements the first part of that vision -- the deterministic, rule-based filters that catch obvious quality problems. Content-level deduplication (Jaccard similarity), intent tagging, and adaptive page caps are planned as additional Step 4 modules.

### How It Fits the Pipeline Architecture

Step 4 is the bridge between raw scraped content and generation-ready material. The Strategic Architecture describes its intent:

> *"Transform raw scraped content into clean, organized source packages ready for generation. Raw HTML needs cleaning -- remove navigation, ads, boilerplate. Duplicate content needs deduplication. Multiple sources for the same entity need assembly into a coherent source package."*

This Content Filter module handles the cleanup portion -- removing pages that shouldn't reach the LLM. Note that since this vision was written, much of it has been absorbed elsewhere: Step 2 modules filter junk URLs before scraping, and the Step 3 scrapers themselves flag failed and low-content pages. That's why this module is now marked **optional** -- it's a safety net for whatever slipped through, not a required gate.

### The Five-Filter Pipeline

Rather than a single quality check, this module applies five filters in sequence, ordered cheapest-first:

1. **Scrape status** -- Drop pages that failed scraping (error/skipped status from Step 3)
2. **Word count** -- Drop pages below a minimum word threshold (catches stubs, empty pages)
3. **English detection** -- Drop pages that lack common English stop words (heuristic, no external dependencies)
4. **URL patterns** -- Safety net catching URL patterns that bypassed Step 2 (e.g., `/tag/`, `/wp-admin/`)
5. **Title keywords** -- Drop pages with certain keywords in the title (e.g., "cookie", "privacy", "login")

This ordering ensures that the cheapest checks (status field lookup, integer comparison) run first, and every filter that excludes a page saves the remaining filters from processing it.

### The Adaptive Page Cap Vision

The original Content Creation Master described an ambitious filtering system with adaptive page caps:

> *"Base cap = 12 pages. Expand up to 25 if signals justify."*

And a feedback loop: *"Weekly: aggregate removal counts by domain + content_type -- feed into Step 4 rule/model updates."*

This module doesn't implement adaptive caps yet -- it filters by quality, not by quantity. The cap logic requires understanding entity-level page budgets and signal-based expansion, which is a separate concern from quality filtering. A future Step 4 module could implement the cap system, running after this filter has already removed the worst pages.

## Strategy & Role

**Why this module exists:** Prevent low-quality content from reaching the expensive LLM generation step. Every bad page filtered here saves token costs in Step 5 and avoids quality problems in the final output.

**Role in the pipeline:** Optional post-scrape quality gate. Applies deterministic, rule-based filters to scraped content. No API calls, no LLM costs -- just fast local checks on data already in the working pool. Because most of its checks duplicate work Step 2 and Step 3 already do, treat it as an extra pass rather than a standard step.

**Relationship to other steps:**
- **Receives from Step 3:** Scraped pages with `text_content`, `word_count`, `title`, and `status` fields (depends on `page-scraper`)
- **Feeds into Step 5 (or future Step 4 siblings):** Clean, quality-filtered pages ready for content deduplication, intent tagging, or direct generation
- **Complements Step 2:** Step 2 filtered URLs *before* scraping (cheap). This module filters content *after* scraping (catches problems only visible with actual page content)

## When to Use

**Run when:**
- Step 2 validation was skipped or configured leniently, so junk URLs may have reached the scrapers
- The scraped pool contains many failed or stub pages you want removed before generation
- You need a consistent, rule-based quality baseline across all entities

**Skip when (the common case):**
- The pipeline already ran a thorough Step 2 plus the Step 3 scraper chain -- most of this module's checks overlap with those steps, and it will have little left to catch
- You want to manually review all scraped content regardless of quality
- Content is already pre-filtered by an external system

**Tune the settings when:**
- Processing multilingual content -- the English detection heuristic will exclude non-English pages by default; set `require_english` to false
- Working with very short but legitimate pages (product listings, contact pages) -- lower `min_word_count`, or set it to 0 to keep all pages regardless of length
- Filtering domain-specific noise -- add title keywords relevant to your niche (e.g. "casino" for non-casino companies)

## Options Guide

| Option | Default | When to Change | What It Does |
|--------|---------|----------------|--------------|
| `min_word_count` | 50 | Raise to 100-200 for article/profile content where short pages are useless; lower to 20-30 if contact/team pages with minimal text are valuable; set to 0 to keep all pages regardless of length | Number (0-1000). Pages below this word count are excluded. 50 words catches empty stubs while keeping most legitimate pages |
| `drop_errors` | true | Set to false only if you want to manually review failed scrapes in the UI before excluding them | Boolean. Automatically excludes pages with `error` or `skipped` status from Step 3. These pages have no usable content |
| `require_english` | true | Set to false for multilingual pipelines or non-English content. The heuristic checks for English stop words in the first 200 characters | Boolean. Excludes pages where fewer than 3 common English stop words appear in the opening text. Simple heuristic -- no external API needed |
| `exclude_title_keywords` | cookie,privacy,terms,login,404,cart,checkout | Add industry-specific keywords (e.g., "demo,signup,webinar" for SaaS). Remove keywords if those page types are relevant to your content | Comma-separated string. Pages whose title contains any keyword are excluded. Case-insensitive matching. Preset dropdown available in the UI |
| `exclude_url_patterns` | /tag/,/author/,/page/,/category/,/wp-admin/ | Add patterns specific to your target sites. This is a safety net -- most of these should have been caught by Step 2's URL Filter | Comma-separated string. Pages whose URL contains any pattern are excluded. Overlaps with Step 2 intentionally as a fallback. Preset dropdown available in the UI |

The two options with the biggest impact are `min_word_count` and `require_english`. A too-high word count silently drops legitimate short pages (contact, team, pricing); `require_english: true` on a multilingual pipeline excludes every non-English page. Both exclude options support saved presets in the UI, so a template can carry its own keyword/pattern lists instead of editing the comma-separated string each run.

## Recipes

### Standard Company Profile
Balanced filtering for company profile generation:
```
min_word_count: 50
drop_errors: true
require_english: true
exclude_title_keywords: cookie,privacy,terms,login,404,cart,checkout
exclude_url_patterns: /tag/,/author/,/page/,/category/,/wp-admin/
```

### Strict Quality (article-length content only)
When you only want substantial pages with real content:
```
min_word_count: 200
drop_errors: true
require_english: true
exclude_title_keywords: cookie,privacy,terms,login,404,cart,checkout,demo,signup,webinar,faq
exclude_url_patterns: /tag/,/author/,/page/,/category/,/wp-admin/,/feed/,/archive/
```

### Permissive (keep short pages)
When contact pages, team listings, and other short pages are valuable:
```
min_word_count: 20
drop_errors: true
require_english: true
exclude_title_keywords: cookie,privacy,terms,login,404
exclude_url_patterns: /wp-admin/
```

### Multilingual Pipeline
When target companies have non-English content:
```
min_word_count: 50
drop_errors: true
require_english: false
exclude_title_keywords: cookie,privacy,terms,login,404,cart,checkout
exclude_url_patterns: /tag/,/author/,/page/,/category/,/wp-admin/
```

## Expected Output

**Healthy result:**
- 70-90% kept (most scraped pages are legitimate content)
- 10-30% excluded (errors, short pages, non-English, stragglers from Step 2)
- In a well-configured pipeline where Steps 2-3 did their jobs, near-zero exclusions are normal -- that's the safety net finding nothing, not a malfunction

**Output fields per page:**
- `url` -- the page URL
- `title` -- page title (from Step 3)
- `word_count` -- word count (from Step 3)
- `filter_status` -- `kept` or `excluded`
- `filter_reason` -- why it was excluded (null for kept pages). Examples: "Too short: 12 words (min: 50)", "Scrape failed: error", "Non-English content detected", "URL pattern: /tag/", "Title keyword: privacy"
- `text_preview` -- first 300 characters of content (for quick review in the detail modal)
- `text_content` -- full page text (carried through for downstream steps; downloadable as a .txt file labelled "Filtered Text")
- `entity_name` -- which company this page belongs to

**Display behavior:** Excluded items are sorted first and flagged (via `flagged_when` on `filter_status: excluded`). Each item has a detail modal showing the filter reason and full text content. The module is selectable, so operators can override any filter decision before approval.

**Summary line:** Shows kept/excluded counts with reason breakdown, e.g.: "245 kept, 38 excluded (12 too short, 8 errors, 6 non-English, 7 title keywords, 5 URL patterns) of 283 total". When nothing is excluded: "283 pages -- all kept".

**Red flags to watch for:**
- Very high exclusion rate (>50%) -- either scraping had many failures (check Step 3) or filter settings are too aggressive
- Many "too short" exclusions -- may indicate JavaScript-rendered sites that the Page Scraper couldn't extract (Readability returns minimal text)
- Many "non-English" exclusions on expected-English sites -- the heuristic may be too aggressive on very technical/jargon-heavy content. Consider disabling `require_english`

## Limitations & Edge Cases

- **English detection is heuristic** -- Checks for common English stop words ("the", "is", "and", etc.) in the first 200 characters. Technical content with heavy jargon, code snippets, or data tables may have few stop words and get falsely excluded. The threshold is 3 stop words -- intentionally low to minimize false positives
- **Word count comes from Step 3, not recomputed** -- The filter reads the item's `word_count` field; a missing field is treated as 0 words and excluded unless `min_word_count` is 0
- **No content-level deduplication** -- This module filters by quality signals, not content similarity. Two pages with nearly identical text will both pass if they meet quality thresholds. Content deduplication (Jaccard similarity) is planned as a separate Step 4 module, matching the original vision: *"Deduplicate exact + near duplicate"*
- **No intent tagging** -- The original vision included tagging pages by intent (About, Products, Press, etc.) and applying different thresholds per intent. This module treats all pages equally. Intent-aware filtering is future work
- **No adaptive page caps** -- The original vision's "base cap = 12 pages, expand to 25 if signals justify" is not implemented. This module decides per-page, not per-entity-budget
- **URL and title filters overlap with Step 2** -- By design. The `exclude_url_patterns` and `exclude_title_keywords` are safety nets for items that bypassed Step 2 (e.g., if Step 2 modules were skipped or configured leniently). In a well-configured pipeline, these filters catch very few additional items -- which is why the module as a whole is marked optional
- **Filter order is fixed** -- The five filters always run in the same order (errors -> word count -> English -> URL patterns -> title keywords). A page excluded by an earlier filter doesn't get checked by later filters, so the `filter_reason` reflects the first failing check, not all failing checks

## What Happens Next

Filtered content enters the working pool with `filter_status` and `filter_reason` fields. Pages marked `kept` proceed to the next stage -- either additional Step 4 modules (content deduplication, intent tagging, adaptive page caps) or directly to **Step 5 (Analysis & Generation)** where LLM costs concentrate.

The original Content Creation Master described the full post-scrape filtering as including: *"Tag critical intents: About; Products/Solutions; Press (top 3 recent); Partners; Careers; Contact. Adaptive Page Cap: base cap = 12 pages, expand up to 25 if signals justify."* And a data hygiene mechanism: *"Store in content_removed table. Weekly: aggregate removal counts by domain + content_type -- feed into Step 4 rule/model updates."*

This module handles the first layer -- deterministic quality filtering. The intent tagging, adaptive caps, and feedback loops are separate concerns that would be implemented as additional Step 4 modules, each with their own manifest and README.

## Technical Reference

- **Step:** 4 (Filtering)
- **Category:** filtering
- **Cost tier:** cheap -- no HTTP requests, no LLM calls, pure local data processing; runs in the short-timeout queue class
- **Data operation:** remove (-) -- items with `filter_status: excluded` are removed from the working pool; `kept` items remain
- **Pool precondition:** `requires_items` -- needs scraped items in the pool. An entity whose pool is empty is marked `skipped_no_input` (not failed); other entities proceed normally
- **Required input columns:** `url`, `text_content`
- **Depends on:** `page-scraper`
- **Input:** `input.entities[]` with `items[]` from Step 3 working pool (grouped format) or flat item list (entities carrying `url` directly)
- **Output:** `results[]` grouped by `entity_name`, each with `items[]` containing `url`, `title`, `word_count`, `filter_status`, `filter_reason`, `text_preview`, `text_content`, `entity_name`, plus per-entity `meta` (total/kept/excluded)
- **Selectable:** true -- operators can override filter decisions in the UI
- **Detail view:** `detail_schema` with header fields (url as link, title, filter_status as badge, word_count) and sections (filter_reason as text, text_content as prose); `text_content` is downloadable as .txt ("Filtered Text")
- **Error handling:** Items missing the `url` field are skipped with a warning, as are entities with neither an `items` array nor a `url`. A missing `word_count` field is treated as 0. No fatal errors -- every processed item is returned with a status. Each result (kept and excluded) is also pushed to `tools._partialItems` as it is processed, so a timeout or abort preserves the already-filtered items
- **Dependencies:** `tools.logger`, `tools.progress` (no HTTP or AI tools needed)
- **Files:** `manifest.json`, `execute.js`
