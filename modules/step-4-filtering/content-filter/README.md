# Content Filter

> Filter out low-quality, too-short, non-English, or irrelevant scraped pages before content generation.

**Module ID:** `content-filter` | **Step:** 4 (Filtering & Assembly) | **Category:** filtering | **Cost:** cheap
**Version:** 1.0.0 | **Data Operation:** remove (➖)

---

## Background

### The Content Problem This Solves

After Step 3 (Scraping), the pipeline has actual page content — text, titles, word counts. But not all scraped content is usable. Some pages failed to scrape (timeouts, server errors). Some returned near-empty content (stub pages, JavaScript-only renders). Some are in the wrong language. Some are pages that slipped through Step 2 validation — cookie policies, login pages, WordPress admin paths.

Feeding low-quality or irrelevant content into the LLM generation step (Step 5) wastes tokens and produces worse output. The original Content Creation Master described this as the "second quality gate" — the first being pre-scrape validation in Step 2 (now Step 4 in the old numbering):

> *"Purpose: Clean up raw scraped content before handing it to the LLM. This is the second quality gate."*

The rules were explicit: *"Drop <100 words. Deduplicate exact + near duplicate. Strip boilerplate (menus, cookie banners, disclaimers). Tag critical intents: About; Products/Solutions; Press; Partners; Careers; Contact."*

This module implements the first part of that vision — the deterministic, rule-based filters that catch obvious quality problems. Content-level deduplication (Jaccard similarity), intent tagging, and adaptive page caps are planned as additional Step 4 modules.

### How It Fits the Pipeline Architecture

Step 4 is the bridge between raw scraped content and generation-ready material. The Strategic Architecture describes its intent:

> *"Transform raw scraped content into clean, organized source packages ready for generation. Raw HTML needs cleaning — remove navigation, ads, boilerplate. Duplicate content needs deduplication. Multiple sources for the same entity need assembly into a coherent source package."*

This Content Filter module handles the cleanup portion — removing pages that shouldn't reach the LLM. It's the first module in Step 4, designed to run before more sophisticated filtering (content deduplication, language analysis, intent tagging) that may follow as additional Step 4 modules.

### The Five-Filter Pipeline

Rather than a single quality check, this module applies five filters in sequence, ordered cheapest-first:

1. **Scrape status** — Drop pages that failed scraping (error/skipped status from Step 3)
2. **Word count** — Drop pages below a minimum word threshold (catches stubs, empty pages)
3. **English detection** — Drop pages that lack common English stop words (heuristic, no external dependencies)
4. **URL patterns** — Safety net catching URL patterns that bypassed Step 2 (e.g., `/tag/`, `/wp-admin/`)
5. **Title keywords** — Drop pages with certain keywords in the title (e.g., "cookie", "privacy", "login")

This ordering ensures that the cheapest checks (status field lookup, integer comparison) run first, and every filter that excludes a page saves the remaining filters from processing it.

### The Adaptive Page Cap Vision

The original Content Creation Master described an ambitious filtering system with adaptive page caps:

> *"Base cap = 12 pages. Expand up to 25 if signals justify."*

And a feedback loop: *"Weekly: aggregate removal counts by domain + content_type — feed into Step 4 rule/model updates."*

This module doesn't implement adaptive caps yet — it filters by quality, not by quantity. The cap logic requires understanding entity-level page budgets and signal-based expansion, which is a separate concern from quality filtering. A future Step 4 module could implement the cap system, running after this filter has already removed the worst pages.

## Strategy & Role

**Why this module exists:** Prevent low-quality content from reaching the expensive LLM generation step. Every bad page filtered here saves token costs in Step 5 and avoids quality problems in the final output.

**Role in the pipeline:** First post-scrape quality gate. Applies deterministic, rule-based filters to scraped content. No API calls, no LLM costs — just fast local checks on data already in the working pool.

**Relationship to other steps:**
- **Receives from Step 3:** Scraped pages with `text_content`, `word_count`, `title`, and `status` fields
- **Feeds into Step 5 (or future Step 4 siblings):** Clean, quality-filtered pages ready for content deduplication, intent tagging, or direct generation
- **Complements Step 2:** Step 2 filtered URLs *before* scraping (cheap). This module filters content *after* scraping (catches problems only visible with actual page content)

## When to Use

**Always use when:**
- The pipeline has scraped content from Step 3
- You want to remove obviously bad pages before generation
- You need a consistent quality baseline across all entities

**Consider settings carefully when:**
- Processing multilingual content — the English detection heuristic will exclude non-English pages by default
- Working with very short but legitimate pages (product listings, contact pages) — adjust `min_word_count` accordingly
- Running after a thorough Step 2 — URL pattern and title keyword filters may have nothing to catch

**Skip when:**
- You want to manually review all scraped content regardless of quality
- Content is already pre-filtered by an external system

## Options Guide

| Option | Default | When to Change | Impact |
|--------|---------|----------------|--------|
| `min_word_count` | 50 | Raise to 100-200 for article/profile content where short pages are useless; lower to 20-30 if contact/team pages with minimal text are valuable | Pages below this word count are excluded. 50 words catches empty stubs while keeping most legitimate pages |
| `drop_errors` | true | Set to false only if you want to manually review failed scrapes in the UI before excluding them | Automatically excludes pages with `error` or `skipped` status from Step 3. These pages have no usable content |
| `require_english` | true | Set to false for multilingual pipelines or non-English content. The heuristic checks for English stop words in the first 200 characters | Excludes pages where fewer than 3 common English stop words appear in the opening text. Simple heuristic — no external API needed |
| `exclude_title_keywords` | cookie,privacy,terms,login,404,cart,checkout | Add industry-specific keywords (e.g., "demo,signup,webinar" for SaaS). Remove keywords if those page types are relevant to your content | Comma-separated. Pages whose title contains any keyword are excluded. Case-insensitive matching |
| `exclude_url_patterns` | /tag/,/author/,/page/,/category/,/wp-admin/ | Add patterns specific to your target sites. This is a safety net — most of these should have been caught by Step 2's URL Filter | Comma-separated. Pages whose URL contains any pattern are excluded. Overlaps with Step 2 intentionally as a fallback |

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
- Breakdown by reason: errors 5-10%, too short 3-8%, non-English 0-5%, URL/title patterns 2-5%

**Output fields per page:**
- `url` — the page URL
- `title` — page title (from Step 3)
- `word_count` — word count (from Step 3)
- `filter_status` — `kept` or `excluded`
- `filter_reason` — why it was excluded (null for kept pages). Examples: "Too short: 12 words (min: 50)", "Scrape failed: error", "Non-English content detected", "URL pattern: /tag/", "Title keyword: privacy"
- `text_preview` — first 300 characters of content (for quick review in the detail modal)
- `text_content` — full page text (carried through for downstream steps)
- `entity_name` — which company this page belongs to

**Display behavior:** Excluded items are sorted first (shown in red, auto-deselected). Each item has a detail modal showing the filter reason and full text content. Operators can override any decision via the selectable UI.

**Summary line:** Shows kept/excluded counts with reason breakdown, e.g.: "245 kept, 38 excluded (12 too short, 8 errors, 6 non-English, 7 title keywords, 5 URL patterns) of 283 total"

**Red flags to watch for:**
- Very high exclusion rate (>50%) — either scraping had many failures (check Step 3) or filter settings are too aggressive
- Many "too short" exclusions — may indicate JavaScript-rendered sites that the Page Scraper couldn't extract (Readability returns minimal text)
- Many "non-English" exclusions on expected-English sites — the heuristic may be too aggressive on very technical/jargon-heavy content. Consider lowering or disabling
- Zero exclusions — filters may not be configured for the content type, or Step 2 already caught everything

## Limitations & Edge Cases

- **English detection is heuristic** — Checks for common English stop words ("the", "is", "and", etc.) in the first 200 characters. Technical content with heavy jargon, code snippets, or data tables may have few stop words and get falsely excluded. The threshold is 3 stop words — intentionally low to minimize false positives
- **No content-level deduplication** — This module filters by quality signals, not content similarity. Two pages with nearly identical text will both pass if they meet quality thresholds. Content deduplication (Jaccard similarity) is planned as a separate Step 4 module, matching the original vision: *"Deduplicate exact + near duplicate"*
- **No intent tagging** — The original vision included tagging pages by intent (About, Products, Press, etc.) and applying different thresholds per intent. This module treats all pages equally. Intent-aware filtering is future work
- **No adaptive page caps** — The original vision's "base cap = 12 pages, expand to 25 if signals justify" is not implemented. This module decides per-page, not per-entity-budget
- **URL and title filters overlap with Step 2** — By design. The `exclude_url_patterns` and `exclude_title_keywords` are safety nets for items that bypassed Step 2 (e.g., if Step 2 modules were skipped or configured leniently). In a well-configured pipeline, these filters catch very few additional items
- **Filter order is fixed** — The five filters always run in the same order (errors → word count → English → URL patterns → title keywords). A page excluded by an earlier filter doesn't get checked by later filters, so the `filter_reason` reflects the first failing check, not all failing checks

## What Happens Next

Filtered content enters the working pool with `filter_status` and `filter_reason` fields. Pages marked `kept` proceed to the next stage — either additional Step 4 modules (content deduplication, intent tagging, adaptive page caps) or directly to **Step 5 (Analysis & Generation)** where LLM costs concentrate.

The original Content Creation Master described the full post-scrape filtering as including: *"Tag critical intents: About; Products/Solutions; Press (top 3 recent); Partners; Careers; Contact. Adaptive Page Cap: base cap = 12 pages, expand up to 25 if signals justify."* And a data hygiene mechanism: *"Store in content_removed table. Weekly: aggregate removal counts by domain + content_type — feed into Step 4 rule/model updates."*

This module handles the first layer — deterministic quality filtering. The intent tagging, adaptive caps, and feedback loops are separate concerns that would be implemented as additional Step 4 modules, each with their own manifest and README.

## Technical Reference

- **Step:** 4 (Filtering & Assembly)
- **Category:** filtering
- **Cost:** cheap (no HTTP requests, no LLM calls — pure local data processing)
- **Data operation:** remove (➖) — items with `filter_status: excluded` are removed from the working pool; `kept` items remain
- **Requires:** `url` and `text_content` fields in input items
- **Input:** `input.entities[]` with `items[]` from Step 3 working pool (grouped format) or flat item list
- **Output:** `results[]` grouped by `entity_name`, each with `items[]` containing `url`, `title`, `word_count`, `filter_status`, `filter_reason`, `text_preview`, `text_content`, `entity_name`
- **Selectable:** true — operators can override filter decisions in the UI
- **Detail view:** `detail_schema` with header fields (url as link, title, filter_status as badge, word_count) and expandable sections (filter_reason as text, text_content as prose)
- **Error handling:** Items missing the `url` field are skipped with a warning. Items with no `text_content` will fail the word count check (word_count defaults to 0). No fatal errors — all items are returned with a status
- **Dependencies:** `tools.logger`, `tools.progress` (no HTTP or AI tools needed)
- **Files:** `manifest.json`, `execute.js`
