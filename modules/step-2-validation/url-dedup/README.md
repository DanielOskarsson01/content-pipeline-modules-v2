# URL Deduplicator

> Remove duplicate items across all entities in a single pass -- by normalized URL (default) or by fuzzy title + company matching for cross-source dedup.

**Module ID:** `url-dedup` | **Step:** 2 (Validation) | **Category:** filtering | **Cost:** cheap
**Version:** 1.1.0 | **Data Operation:** remove (➖)

---

## Background

### The Content Problem This Solves

Step 1 (Discovery) intentionally casts a wide net -- multiple modules independently find URLs from sitemaps, navigation, deep crawling, and feeds. The same URL can easily appear across multiple discovery sources: the sitemap lists `/about`, the navigation links to `/about`, and deep crawling finds it again from the homepage. Before spending money on scraping and LLM processing, these duplicates need to be eliminated.

But deduplication isn't just about exact matches. The same page can appear as `https://www.example.com/about/`, `https://example.com/about`, `http://example.com/About`, and `https://example.com/about?utm_source=google#section1`. These are all the same page. The URL Deduplicator normalizes URLs before comparing them, catching duplicates that string comparison would miss.

There is a second duplicate problem URL normalization can never catch: **the same item published on different sites under different URLs**. A job posting syndicated to three job boards has three genuinely distinct URLs -- but it's one job. For this, the module offers a second match strategy, `title_company`: fuzzy title matching (Dice coefficient on character bigrams, with seniority prefixes like "Senior"/"Lead" stripped first) combined with exact company matching. Same company + near-identical title = duplicate, regardless of URL.

### How It Fits the Pipeline Architecture

Step 2 (Validation) is about saving money and time by filtering worthless URLs before they reach the expensive scraping step. The Strategic Architecture describes this as:

> *"Discovery typically produces far more URLs than are worth scraping. Validation filters these cheaply -- so the expensive scraping step only processes URLs likely to produce useful content."*

URL Deduplicator is the first module in the Step 2 chain (`sort_order: 1`). Step 2 uses the **remove (➖)** data operation with **chaining** -- each module reads the previous sibling's approved output and filters it further:

1. **URL Deduplicator** (this module) -- removes exact/normalized duplicates or cross-source title+company duplicates
2. **URL Pattern Filter** -- removes URLs matching exclusion patterns
3. **URL Relevance Filter** -- LLM-based classification of remaining URLs

This chaining order is intentional: dedup first (cheapest, removes the most), then pattern filter (cheap, rule-based), then AI relevance (cheapest last, as fewer URLs remain).

### The Original Two-Gate System

The Raw Appendix described a two-gate validation approach:
- **Pre-scrape validation** (old Step 4, now Step 2) -- cheap checks to reduce scrape cost
- **Post-scrape filtering** (old Step 7, now Step 4) -- quality checks on scraped content with adaptive page caps

Deduplication was identified as a critical pre-scrape check. The original document noted that duplicate detection should happen at multiple levels: exact URL match, near-duplicate detection via text hashing (Jaccard similarity), and content-level deduplication after scraping. This module handles the first level -- item-level deduplication before any content is fetched.

## Strategy & Role

**Why this module exists:** Multiple discovery modules independently find URLs, creating inevitable duplicates. Cross-source discovery (e.g., the same job on multiple boards) creates duplicates that share no URL at all. Eliminating both kinds before scraping prevents wasted HTTP requests, wasted LLM tokens, and duplicate entries in the content library.

**Role in the pipeline:** First filter in the Step 2 validation chain. Handles the cheapest, highest-impact filtering -- pure in-memory comparison with zero HTTP requests or API calls.

**Relationship to siblings:**
- **Runs before:** URL Pattern Filter and URL Relevance Filter (dedup first reduces their workload)
- **Operates across entities:** Unlike Step 1 modules that process one entity at a time, this module compares items *across* all entities to catch cross-entity duplicates

## When to Use

**Always use when:**
- Multiple Step 1 discovery modules were run (high duplicate probability)
- Processing many entities that might share URLs (e.g., companies linking to each other)

**Use `title_company` strategy when:**
- The same item appears on multiple sources under different URLs -- e.g., a job posted on several job boards. URL comparison cannot catch these; only title+company matching can

**Skip when:**
- Only one discovery module was run with very few results
- The discovery module already dedupes by an external ID (e.g., api-search dedupes by externalId)

**Typically the first module run in Step 2** -- always run before URL Pattern Filter and URL Relevance Filter to reduce their workload.

## Options Guide

| Option | Default | When to Change | What It Does |
|--------|---------|----------------|--------------|
| `match_strategy` | `url` | Switch to `title_company` for cross-source dedup where the same item appears on multiple sites with different URLs (job boards, syndicated content) | `url`: normalize and compare URLs (fast, same-source). `title_company`: fuzzy title match + exact company match |
| `fuzzy_threshold` | 0.85 | Raise toward 1.0 if distinct-but-similar titles are being merged (e.g., "Frontend Developer" vs "Backend Developer" at the same company); lower toward 0.5 if obvious rewordings of the same posting survive. Range 0.5-1.0. Only used with `title_company` | Dice coefficient threshold for title similarity (0.0-1.0). Higher = stricter matching |
| `normalize_www` | true | Disable only if www and non-www versions of a site serve genuinely different content (very rare) | Treats `www.example.com` and `example.com` as the same host |
| `normalize_trailing_slash` | true | Disable only if the site uses trailing slashes to distinguish different pages (very rare) | Treats `/about` and `/about/` as the same URL |
| `strip_query_params` | true | Disable if the site uses query parameters for meaningful page content (e.g., `?product=123`) rather than tracking | Removes `?utm_source=...`, `?ref=...`, etc. Most query params are tracking noise |
| `strip_fragments` | true | Disable if the site uses fragment identifiers for separate page content (single-page apps with hash routing) | Removes `#section` anchors. Usually just page-internal navigation |
| `case_insensitive` | true | Disable if the site uses case-sensitive URL paths (rare but exists in some CMSes) | Treats `/About` and `/about` as the same URL |

The five `normalize_*`/`strip_*`/`case_insensitive` options only apply to the `url` strategy -- `title_company` ignores them entirely. In `title_company` mode, an item missing either `title` or `company` is never matched against anything and always passes through as `unique`.

## Recipes

### Standard (recommended for most cases)
Maximum URL normalization -- catches the most duplicates:
```
match_strategy: url
fuzzy_threshold: 0.85
normalize_www: true
normalize_trailing_slash: true
strip_query_params: true
strip_fragments: true
case_insensitive: true
```

### Cross-Source
Same item on multiple sites with different URLs (job boards, syndication):
```
match_strategy: title_company
fuzzy_threshold: 0.85
normalize_www: true
normalize_trailing_slash: true
strip_query_params: true
strip_fragments: true
case_insensitive: true
```

### Conservative
Preserve more URL variations -- use when unsure:
```
match_strategy: url
fuzzy_threshold: 0.85
normalize_www: true
normalize_trailing_slash: true
strip_query_params: false
strip_fragments: true
case_insensitive: false
```

### Minimal
Only basic normalization:
```
match_strategy: url
fuzzy_threshold: 0.85
normalize_www: true
normalize_trailing_slash: false
strip_query_params: false
strip_fragments: false
case_insensitive: false
```

## Expected Output

**Healthy result:**
- 10-30% duplicates across combined discovery results is normal
- If multiple discovery modules were run, expect higher duplicate rates for well-known pages (/about, /contact)
- The run summary names the strategy used, e.g. "Found 12 duplicates. 88 unique of 100 total (url)"

**Output fields per item:**
- `url` -- the original URL
- `original_url` -- preserved original URL before normalization
- `title` -- item title, carried through from the source item (null if absent)
- `company` -- company name, carried through (null if absent)
- `location` -- location, carried through (null if absent)
- `source` -- source identifier, carried through (null if absent)
- `duplicate_of` -- if duplicate, the URL of the first occurrence it duplicates
- `status` -- `unique` or `duplicate`
- `entity_name` -- which entity this item belongs to

**Display behavior:** Results are sorted with duplicates first, and `duplicate` status is flagged in the UI (`flagged_when`), so operators can quickly review what's being removed. Results are selectable -- operators can override dedup decisions. The remove (➖) data operation means items marked `duplicate` are excluded from the pool when approved.

**Red flags to watch for:**
- 0 duplicates → either only one discovery module ran, or the modules found completely different URLs (expected for RSS vs Sitemap)
- 80%+ duplicates → discovery modules are finding mostly the same URLs. Consider whether all are needed
- Cross-entity duplicates → two companies linking to the same page (e.g., a shared partner page). Worth reviewing -- might indicate a relationship
- `title_company` finds 0 duplicates on job data → check that items actually carry `title` and `company` fields; items missing either are silently kept as unique

## Limitations & Edge Cases

- **URL-level / metadata-level only** -- Does not detect content-level duplicates (different URLs serving the same content, with different titles). That requires post-scrape comparison (future Step 4 module). The original Content Creation Master planned content-level dedup via "Jaccard similarity of intro/teaser across URLs"
- **Normalization is lossy** -- Stripping query params might merge distinct pages on sites that use params for routing (e.g., `?page=about` vs `?page=contact`). The Conservative recipe preserves these
- **First-seen wins** -- When two items are duplicates, the first one encountered is marked `unique` and the second is `duplicate`. The "first" is determined by entity order in the input
- **Cross-entity comparison** -- A URL found for Company A and Company B will be marked as duplicate for whichever entity appears second. This is correct (same URL = same content) but may surprise operators
- **`title_company` requires both fields** -- Items missing `title` or `company` never participate in fuzzy matching; they always pass through as `unique`, even if they are real duplicates
- **Company match is exact** -- Only lowercased/trimmed exact company names match. "Evolution" vs "Evolution Gaming" are different companies to this module; only the *title* side is fuzzy
- **Seniority prefixes are stripped before title comparison** -- senior/junior/lead/principal/staff/chief/head of/director of/vp of/vice president of. "Senior Frontend Developer" and "Frontend Developer" at the same company count as the same title. Raise `fuzzy_threshold` if this merges roles you want kept apart
- **Items without a `url` field are dropped** -- skipped with a logged warning, never included in results (`url` is the item key)

## What Happens Next

After deduplication, the remaining unique items flow to the next Step 2 module -- **URL Pattern Filter** -- which applies pattern-based include/exclude rules. The filtered set then reaches **URL Relevance Filter** for LLM-based classification.

The original Content Creation Master envisioned deduplication feeding back into the learning system: *"Weekly: aggregate removal counts by domain + content_type → feed into Step 4 rule/model updates."* High duplicate rates from specific domains could inform future discovery optimizations.

## Technical Reference

- **Step:** 2 (Validation)
- **Category:** filtering
- **Cost tier:** cheap -- pure in-memory computation, shortest timeout class
- **Data operation:** remove (➖) -- items marked `duplicate` are removed from the working pool; `unique` items remain
- **Pool precondition:** `requires_items` -- needs items in the pool for the entity; an empty pool marks the entity `skipped_no_input` instead of failing
- **Sort order:** 1 -- runs first in the Step 2 chain
- **Depends on:** none
- **Required input columns:** `url`
- **Input:** `input.entities[]` with `items[]` from Step 1 working pool (grouped format) or flat item list (entity IS the item, e.g. from CSV upload)
- **Output:** `results[]` grouped by `entity_name`, each with `items[]` containing `url`, `original_url`, `title`, `company`, `location`, `source`, `duplicate_of`, `status`, `entity_name`, plus per-entity `meta` (total_found, duplicates, unique, errors)
- **Selectable:** true -- operators can override dedup decisions in the UI
- **Matching internals:** `url` strategy normalizes via the WHATWG URL parser then applies the five toggle options; `title_company` strategy uses Dice coefficient over character bigrams on seniority-stripped lowercased titles, gated by exact lowercased company match, against `fuzzy_threshold`
- **Error handling:** Items without a `url` field are skipped with a warning; entities with neither an `items` array nor a `url` field are skipped with a warning. Malformed URLs fall back to basic string normalization (lowercase + trailing-slash strip only)
- **Timeout resilience:** Pushes all results to `tools._partialItems` so results survive a timeout/abort
- **External dependencies:** None (no HTTP requests, no API calls, no npm packages)
- **Files:** `manifest.json`, `execute.js`
