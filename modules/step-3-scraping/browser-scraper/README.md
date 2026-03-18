# Browser Scraper

> Re-scrape pages that failed text extraction using a real browser (Playwright Chromium) to render JavaScript-heavy content.

**Module ID:** `browser-scraper` | **Step:** 3 (Scraping) | **Category:** scraping | **Cost:** expensive
**Version:** 1.0.0 | **Data Operation:** transform (=)

---

## Background

### The Content Problem This Solves

The page-scraper module (Step 3's primary scraper) uses HTTP fetch + Mozilla Readability to extract text content. This works for the majority of websites, but fails on JavaScript-heavy pages: single-page applications (SPAs), React/Vue/Angular sites, and pages with dynamic content loading. These pages return valid HTTP 200 responses but contain minimal or no readable text because the actual content is rendered client-side by JavaScript.

The first live flow test revealed this as a critical problem: 151 of 270 pages (56%) were excluded as "too short" (word_count < 50). These are not junk pages -- they are the valuable, hard-to-get pages that make the tool worth using.

The original Content Creation Master planned for this split: *"Step 5c (Cheerio/static) -- default; static DOM render is enough"* and *"Step 5d (Playwright/JS) -- consent walls, JS-rendered content, stubborn DOM."* This module implements Step 5d -- the Playwright-based scraper that handles the pages the static scraper cannot.

### How It Fits the Pipeline Architecture

This module runs **after** page-scraper in Step 3. It reads the working pool, identifies pages where page-scraper returned `status: "success"` but extracted fewer than `min_word_threshold` words, and re-scrapes only those pages using a real browser. Pages that already have sufficient content are passed through unchanged.

This is the transform (=) data operation -- the same items go in and come out, but the previously-empty ones are now enriched with browser-rendered content. The module adds a `scrape_method` field to every item so operators can see which pages were browser-scraped versus passed through.

## Strategy & Role

**Why this module exists:** Recover content from JavaScript-rendered pages that the static HTTP scraper could not extract. Without this module, the pipeline loses the pages that matter most -- the ones behind modern JavaScript frameworks.

**Role in the pipeline:** Second-pass scraper in Step 3. Complements page-scraper by handling its failures. Only processes items that need browser rendering; passes everything else through untouched.

**Relationship to other steps:**
- **Depends on:** page-scraper (must run first to identify failures)
- **Receives from Step 2:** Same working pool as page-scraper, but only re-scrapes low-content items
- **Feeds into Step 4:** Enriched content for filtering, language detection, and assembly

## When to Use

**Always use when:**
- page-scraper has already run and produced results
- The pool contains pages with `status: "success"` but very low word counts (< 50 words)
- Target sites include SPAs, React/Angular/Vue sites, or JavaScript-heavy platforms

**Do not use when:**
- page-scraper has not run yet -- browser-scraper reads the working pool from page-scraper
- All pages already have sufficient content (the module will detect this and pass everything through)

**Consider settings carefully when:**
- Server has limited memory -- reduce `concurrency` to 1-2 (each browser tab uses significant RAM)
- Pages are very slow SPAs -- increase `request_timeout` to 30-60 seconds
- You want to re-scrape more aggressively -- raise `min_word_threshold` to 100-200 to catch more marginal pages

## Options Guide

| Option | Default | When to Change | Impact |
|--------|---------|----------------|--------|
| `request_timeout` | 20,000ms | Raise to 30-60s for slow SPAs; lower to 10s for known-fast sites | Per-page browser rendering timeout. SPAs may need 15-30 seconds to finish loading |
| `wait_for_network_idle` | true | Set to false for faster but less reliable scraping of pages that continuously make requests | Waits until no network requests for 500ms. Slower but ensures SPA content is fully loaded |
| `min_word_threshold` | 50 | Raise to 100-200 to catch more marginal pages; lower to 20 if you only want truly empty pages | Only pages with word_count below this are re-scraped. Pages above are passed through unchanged |
| `max_content_length` | 50,000 chars | Raise to 100-200k for very long pages; lower to 20k for quick extraction | Truncates extracted text after this many characters |
| `concurrency` | 3 | Lower to 1-2 on memory-constrained servers; raise to 4-8 on powerful machines | Number of browser tabs running simultaneously. Each tab uses significant memory |

## Recipes

### Standard Recovery
Balanced for most use cases after page-scraper:
```
request_timeout: 20000
wait_for_network_idle: true
min_word_threshold: 50
max_content_length: 50000
concurrency: 3
```

### Aggressive Recovery
Re-scrape more pages including marginal ones:
```
request_timeout: 30000
wait_for_network_idle: true
min_word_threshold: 200
max_content_length: 50000
concurrency: 2
```

### Memory-Constrained Server
Minimize resource usage:
```
request_timeout: 20000
wait_for_network_idle: true
min_word_threshold: 50
max_content_length: 50000
concurrency: 1
```

### Fast Pass
Quick re-scrape without waiting for full network idle:
```
request_timeout: 15000
wait_for_network_idle: false
min_word_threshold: 50
max_content_length: 50000
concurrency: 4
```

## Expected Output

**Healthy result:**
- 40-70% of previously-failed pages recovered with sufficient content
- Pass-through items unchanged from page-scraper output
- Clear `scrape_method` markers showing which approach was used

**Output fields per URL:**
- `url` -- the original URL
- `final_url` -- the URL after any redirects (from browser navigation)
- `title` -- page title extracted from browser-rendered HTML
- `word_count` -- words in extracted text
- `content_type` -- HTTP content-type (typically `text/html`)
- `status` -- `success`, `error`, or original status for pass-through items
- `error` -- error message if browser scraping failed (null for success)
- `text_preview` -- first 150 characters of extracted text
- `meta_description` -- from `<meta name="description">` tag
- `text_content` -- full extracted text (visible in detail view)
- `entity_name` -- which entity this URL belongs to
- `scrape_method` -- `browser` (re-scraped by this module) or `passed_through` (kept from page-scraper)

**Results are grouped by entity** with per-entity meta: `total`, `browser_scraped`, `browser_success`, `passed_through`, `errors`, `total_words`.

**Red flags to watch for:**
- Recovery rate below 30% -- sites may need longer timeouts or have non-standard rendering
- High error count among browser-scraped pages -- check if sites are blocking headless browsers
- Pages still showing 0 words after browser scrape -- content may be behind authentication or loaded via WebSocket

## Limitations & Edge Cases

- **Requires Playwright on the server** -- throws an error if `tools.browser.fetch` is not available
- **Memory-intensive** -- each concurrent browser tab uses significant RAM. Three concurrent tabs on a 2GB server can cause OOM
- **Does not handle cookie consent banners** -- content behind "Accept cookies" overlays will not be extracted
- **Does not handle login walls** -- pages requiring authentication are out of scope
- **Same extraction algorithm as page-scraper** -- uses Readability with regex fallback. If the content is genuinely minimal (e.g., a redirect page, a 404), browser rendering will not help
- **Sort order:** results are sorted with errors first, then skipped, success, and passed-through last
- **Only re-scrapes `status: "success"` items** -- pages that returned HTTP errors from page-scraper are not retried (they would likely fail again)

## What Happens Next

After browser-scraper runs, the working pool contains the best available text content for every URL -- either from page-scraper (passed through) or from browser re-scraping. This enriched pool flows into **Step 4 (Filtering & Assembly)** where content is cleaned, deduplicated, language-detected, and assembled into source packages for generation.

The `scrape_method` field allows operators to see exactly which approach worked for each page, providing transparency into the extraction pipeline and helping identify patterns (e.g., "all pages from domain X needed browser scraping").

## Technical Reference

- **Step:** 3 (Scraping)
- **Category:** scraping
- **Cost:** expensive
- **Data operation:** transform (=) -- same items enriched with scraped content
- **Requires:** `url` field in input items
- **Depends on:** page-scraper (must run first)
- **Input:** `input.entities[]` with `items[]` from page-scraper's working pool
- **Output:** `{ results[], summary }` where results are grouped by entity_name, each with `items[]` containing all output fields plus `scrape_method`
- **Selectable:** true -- operators can deselect failed/empty pages
- **Detail view:** `detail_schema` with header fields (url as link, title, status badge, word_count, scrape_method) and expandable section (text_content as prose)
- **Error handling:** per-URL error handling (partial success pattern). HTTP errors and timeouts are caught per page; other pages continue processing
- **Dependencies:** `@mozilla/readability` (content extraction), `linkedom` (DOM parsing), `tools.browser` (Playwright), `tools.logger`, `tools.progress`
- **Files:** `manifest.json`, `execute.js`
