# Browser Scraper

> Re-scrape pages that failed text extraction using a real browser (Playwright Chromium) to render JavaScript-heavy content.

**Module ID:** `browser-scraper` | **Step:** 3 (Scraping) | **Category:** scraping | **Cost:** expensive
**Version:** 1.0.0 | **Data Operation:** transform (=)

---

## Background

### The Content Problem This Solves

The page-scraper module (Step 3's primary scraper) uses HTTP fetch + Mozilla Readability to extract text content. This works for the majority of websites, but fails in two scenarios:

1. **JavaScript-heavy pages:** SPAs, React/Vue/Angular sites, and pages with dynamic content loading. These return valid HTTP 200 responses but contain minimal or no readable text because the actual content is rendered client-side.
2. **Cloudflare-protected sites:** Sites behind Cloudflare return HTTP 403 with a "Just a moment..." challenge page. Simple HTTP fetch cannot solve the JS challenge, resulting in zero extracted content.

The first live flow test revealed this as a critical problem: 151 of 270 pages (56%) were excluded as "too short" (word_count < 50). These are not junk pages -- they are the valuable, hard-to-get pages that make the tool worth using.

Beyond JavaScript rendering, some sites use Cloudflare protection or aggressive bot detection that returns HTTP 403 even to headless browsers. For these sites, the module includes a **Wayback Machine fallback** — fetching the most recent archived snapshot from web.archive.org via plain HTTP, which bypasses all anti-bot measures entirely.

The original Content Creation Master planned for this split: *"Step 5c (Cheerio/static) -- default; static DOM render is enough"* and *"Step 5d (Playwright/JS) -- consent walls, JS-rendered content, stubborn DOM."* This module implements Step 5d -- the Playwright-based scraper that handles the pages the static scraper cannot, plus the Wayback Machine fallback for sites that block even headless browsers.

### How It Fits the Pipeline Architecture

This module runs **after** page-scraper in Step 3. It reads the working pool and identifies pages that need re-scraping:
- Items with **no status** (from Step 1/2 submodules that only discovered URLs)
- Items with `status: "error"` or `status: "dead_link"` (HTTP failures from page-scraper)
- Items with `status: "success"` but fewer than `min_word_threshold` words (JS-rendered pages)
- Items with `status: "success"` but boilerplate-only content (3+ pages with identical text)
- Items with `status: "success"` but detected as Cloudflare/bot-blocker pages (text marker detection)

Pages that already have sufficient real content are passed through unchanged.

Scraping uses a **3-tier fallback** approach:
1. **Browser fetch** (Playwright) — renders JavaScript, handles SPAs. Extracted text is checked for block page markers before being accepted as success
2. **Wayback Machine** — if browser fails or returns a block page, fetches archived snapshot from web.archive.org via plain HTTP
3. **Error** — if both tiers fail, marks the item with the browser error

After all pages are scraped, a **post-scrape duplicate detection** pass runs: if 3+ browser-scraped pages return identical text content, they are demoted from success to error (catches any bot blocker regardless of wording — Akamai, Imperva, DataDome, etc.).

This is the transform (=) data operation -- the same items go in and come out, but the previously-empty ones are now enriched with scraped content. The module adds a `scrape_method` field to every item: `browser`, `wayback`, or `passed_through`.

## Strategy & Role

**Why this module exists:** Recover content from pages that the static HTTP scraper could not extract — whether due to JavaScript rendering, Cloudflare protection, or HTTP errors. Without this module, the pipeline loses the pages that matter most.

**Role in the pipeline:** Second-pass scraper in Step 3. Complements page-scraper by handling its failures. Re-scrapes items that have errors, no status, low word count, or boilerplate content. Passes everything else through untouched. Falls back to Wayback Machine when even the browser cannot reach a page.

**Relationship to other steps:**
- **Depends on:** page-scraper (must run first to identify failures)
- **Receives from Step 2:** Same working pool as page-scraper, but only re-scrapes low-content items
- **Feeds into Step 4:** Enriched content for filtering, language detection, and assembly

## When to Use

**Always use when:**
- page-scraper has already run and produced results
- The pool contains pages with errors, no status, low word counts, or boilerplate content
- Target sites include SPAs, React/Angular/Vue sites, Cloudflare-protected sites, or JavaScript-heavy platforms

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
- `scrape_method` -- `browser` (re-scraped by Playwright), `wayback` (fetched from Wayback Machine archive), or `passed_through` (kept from page-scraper)

**Results are grouped by entity** with per-entity meta: `total`, `browser_scraped`, `browser_success`, `passed_through`, `errors`, `total_words`.

**Red flags to watch for:**
- Recovery rate below 30% -- sites may need longer timeouts or have non-standard rendering
- High error count among browser-scraped pages -- check if sites are blocking headless browsers (Wayback Machine fallback should catch most of these)
- Many `scrape_method: "wayback"` results -- site is heavily protected; content is recovered but may be outdated
- Pages still showing 0 words after all tiers -- content may be behind authentication or loaded via WebSocket
- "Duplicate text across N pages" errors -- post-scrape duplicate detection caught a bot blocker page. These items flow to the api-scraper for retry with ScrapFly ASP

## Limitations & Edge Cases

- **Requires Playwright on the server** -- throws an error if `tools.browser.fetch` is not available
- **Memory-intensive** -- each concurrent browser tab uses significant RAM. Three concurrent tabs on a 2GB server can cause OOM
- **Does not handle cookie consent banners** -- content behind "Accept cookies" overlays will not be extracted
- **Does not handle login walls** -- pages requiring authentication are out of scope
- **Same extraction algorithm as page-scraper** -- uses Readability with regex fallback. If the content is genuinely minimal (e.g., a redirect page, a 404), browser rendering will not help
- **Sort order:** results are sorted with errors first, then skipped, success, and passed-through last
- **Block page detection (two layers)** -- (1) Extracted text is checked against known Cloudflare markers before returning success; if detected, falls through to Wayback Machine. (2) After all scrapes finish, if 3+ pages returned identical text, they are demoted to error regardless of wording (catches any bot blocker). Both layers prevent block pages from passing through as false successes to the api-scraper
- **Re-scrapes all failed items** -- items with no status, `error`, `dead_link`, low word count, boilerplate content, or detected block page text are all attempted. The Wayback Machine fallback means even HTTP 403 pages have a chance of content recovery
- **Wayback Machine content may be stale** -- archived snapshots can be months or years old. Content from Wayback is still valuable for analysis but may not reflect the current state of the page

## What Happens Next

After browser-scraper runs, the working pool contains the best available text content for every URL -- from page-scraper (passed through), Playwright browser rendering, or Wayback Machine archive. This enriched pool flows into **Step 4 (Filtering & Assembly)** where content is cleaned, deduplicated, language-detected, and assembled into source packages for generation.

The `scrape_method` field allows operators to see exactly which approach worked for each page, providing transparency into the extraction pipeline and helping identify patterns (e.g., "all pages from domain X needed browser scraping" or "Cloudflare-protected site recovered via Wayback Machine").

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
- **Error handling:** per-URL 3-tier fallback (browser → Wayback Machine → error). Each tier is independent; failure in one tier triggers the next. All errors are caught per page; other pages continue processing
- **Dependencies:** `@mozilla/readability` (content extraction), `linkedom` (DOM parsing), `tools.browser` (Playwright), `tools.http` (Wayback Machine fallback), `tools.logger`, `tools.progress`
- **Files:** `manifest.json`, `execute.js`
