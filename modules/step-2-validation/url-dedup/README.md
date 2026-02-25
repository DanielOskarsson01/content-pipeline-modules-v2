# URL Deduplicator

> Remove duplicate URLs across entities, normalize formats, and strip tracking parameters.

**Module ID:** `url-dedup` | **Step:** 2 (Validation) | **Category:** filtering | **Cost:** cheap
**Version:** 1.0.0 | **Data Operation:** remove (➖)

---

## Background

### The Content Problem This Solves

Step 1 (Discovery) intentionally casts a wide net — multiple modules independently find URLs from sitemaps, navigation, deep crawling, and feeds. The same URL can easily appear across multiple discovery sources: the sitemap lists `/about`, the navigation links to `/about`, and deep crawling finds it again from the homepage. Before spending money on scraping and LLM processing, these duplicates need to be eliminated.

But deduplication isn't just about exact matches. The same page can appear as `https://www.example.com/about/`, `https://example.com/about`, `http://example.com/About`, and `https://example.com/about?utm_source=google#section1`. These are all the same page. The URL Deduplicator normalizes URLs before comparing them, catching duplicates that string comparison would miss.

### How It Fits the Pipeline Architecture

Step 2 (Validation) is about saving money and time by filtering worthless URLs before they reach the expensive scraping step. The Strategic Architecture describes this as:

> *"Discovery typically produces far more URLs than are worth scraping. Validation filters these cheaply — so the expensive scraping step only processes URLs likely to produce useful content."*

URL Deduplicator is the first module in the Step 2 chain. Step 2 uses the **remove (➖)** data operation with **chaining** — each module reads the previous sibling's approved output and filters it further:

1. **URL Deduplicator** (this module) — removes exact and normalized duplicates
2. **URL Pattern Filter** — removes URLs matching exclusion patterns
3. **URL Relevance Filter** — LLM-based classification of remaining URLs

This chaining order is intentional: dedup first (cheapest, removes the most), then pattern filter (cheap, rule-based), then AI relevance (cheapest last, as fewer URLs remain).

### The Original Two-Gate System

The Raw Appendix described a two-gate validation approach:
- **Pre-scrape validation** (old Step 4, now Step 2) — cheap checks to reduce scrape cost
- **Post-scrape filtering** (old Step 7, now Step 4) — quality checks on scraped content with adaptive page caps

Deduplication was identified as a critical pre-scrape check. The original document noted that duplicate detection should happen at multiple levels: exact URL match, near-duplicate detection via text hashing (Jaccard similarity), and content-level deduplication after scraping. This module handles the first level — URL-level deduplication before any content is fetched.

## Strategy & Role

**Why this module exists:** Multiple discovery modules independently find URLs, creating inevitable duplicates. Eliminating them before scraping prevents wasted HTTP requests, wasted LLM tokens, and duplicate entries in the content library.

**Role in the pipeline:** First filter in the Step 2 validation chain. Handles the cheapest, highest-impact filtering — pure URL normalization with zero HTTP requests or API calls.

**Relationship to siblings:**
- **Runs before:** URL Pattern Filter and URL Relevance Filter (dedup first reduces their workload)
- **Operates across entities:** Unlike Step 1 modules that process one entity at a time, this module compares URLs *across* all entities to catch cross-entity duplicates

## When to Use

**Always use when:**
- Multiple Step 1 discovery modules were run (high duplicate probability)
- Processing many entities that might share URLs (e.g., companies linking to each other)

**Skip when:**
- Only one discovery module was run with very few results
- You're confident there are no duplicates (rare)

**Typically the first module run in Step 2** — always run before URL Pattern Filter and URL Relevance Filter to reduce their workload.

## Options Guide

| Option | Default | When to Change | Impact |
|--------|---------|----------------|--------|
| `normalize_www` | true | Disable only if www and non-www versions of a site serve genuinely different content (very rare) | Treats `www.example.com` and `example.com` as the same host |
| `normalize_trailing_slash` | true | Disable only if the site uses trailing slashes to distinguish different pages (very rare) | Treats `/about` and `/about/` as the same URL |
| `strip_query_params` | true | Disable if the site uses query parameters for meaningful page content (e.g., `?product=123`) rather than tracking | Removes `?utm_source=...`, `?ref=...`, etc. Most query params are tracking noise |
| `strip_fragments` | true | Disable if the site uses fragment identifiers for separate page content (single-page apps with hash routing) | Removes `#section` anchors. Usually just page-internal navigation |
| `case_insensitive` | true | Disable if the site uses case-sensitive URL paths (rare but exists in some CMSes) | Treats `/About` and `/about` as the same URL |

## Recipes

### Standard (recommended for most cases)
Maximum normalization — catches the most duplicates:
```
normalize_www: true
normalize_trailing_slash: true
strip_query_params: true
strip_fragments: true
case_insensitive: true
```

### Conservative
Preserve more URL variations — use when unsure:
```
normalize_www: true
normalize_trailing_slash: true
strip_query_params: false
strip_fragments: true
case_insensitive: false
```

### Minimal
Only basic normalization:
```
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

**Output fields per URL:**
- `url` — the original URL
- `original_url` — preserved original URL before normalization
- `duplicate_of` — if duplicate, which URL it duplicates (the first occurrence)
- `status` — `unique` or `duplicate`
- `entity_name` — which entity this URL belongs to

**Display behavior:** Results are sorted with duplicates first (shown in red, auto-deselected in the UI) so operators can quickly review what's being removed. The remove (➖) data operation means items marked `duplicate` are excluded from the pool when approved.

**Red flags to watch for:**
- 0 duplicates → either only one discovery module ran, or the modules found completely different URLs (expected for RSS vs Sitemap)
- 80%+ duplicates → discovery modules are finding mostly the same URLs. Consider whether all are needed
- Cross-entity duplicates → two companies linking to the same page (e.g., a shared partner page). Worth reviewing — might indicate a relationship

## Limitations & Edge Cases

- **URL-level only** — Does not detect content-level duplicates (different URLs serving the same content). That requires post-scrape comparison (future Step 4 module). The original Content Creation Master planned content-level dedup via "Jaccard similarity of intro/teaser across URLs"
- **Normalization is lossy** — Stripping query params might merge distinct pages on sites that use params for routing (e.g., `?page=about` vs `?page=contact`). The Conservative recipe preserves these
- **First-seen wins** — When two URLs are duplicates, the first one encountered is marked `unique` and the second is `duplicate`. The "first" is determined by entity order in the input
- **Cross-entity comparison** — A URL found for Company A and Company B will be marked as duplicate for whichever entity appears second. This is correct (same URL = same content) but may surprise operators

## What Happens Next

After deduplication, the remaining unique URLs flow to the next Step 2 module — **URL Pattern Filter** — which applies regex-based include/exclude rules and optionally checks HTTP status codes. The filtered set then reaches **URL Relevance Filter** for LLM-based classification.

The original Content Creation Master envisioned deduplication feeding back into the learning system: *"Weekly: aggregate removal counts by domain + content_type → feed into Step 4 rule/model updates."* High duplicate rates from specific domains could inform future discovery optimizations.

## Technical Reference

- **Step:** 2 (Validation)
- **Category:** filtering
- **Cost:** cheap
- **Data operation:** remove (➖) — items marked `duplicate` are removed from the working pool; `unique` items remain
- **Requires:** `url` field in input items
- **Input:** `input.entities[]` with `items[]` from Step 1 working pool (grouped format) or flat URL list
- **Output:** `results[]` grouped by `entity_name`, each with `items[]` containing `url`, `original_url`, `duplicate_of`, `status`, `entity_name`
- **Selectable:** true — operators can override dedup decisions in the UI
- **Error handling:** Items without a `url` field are skipped with a warning. Malformed URLs fall back to basic string normalization
- **Dependencies:** None (pure computation, no HTTP requests or API calls)
- **Files:** `manifest.json`, `execute.js`
