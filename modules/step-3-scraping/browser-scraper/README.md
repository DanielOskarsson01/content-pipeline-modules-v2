# Browser Scraper

> Re-scrape pages that failed text extraction using a real browser (Playwright Chromium) to render JavaScript-heavy content.

**Module ID:** `browser-scraper` | **Step:** 3 (Scraping) | **Category:** scraping | **Cost:** expensive
**Version:** 1.1.0 | **Data Operation:** transform (=)

---

## Background

### The Content Problem This Solves

The page-scraper module (Step 3's primary scraper) uses HTTP fetch + Mozilla Readability to extract text content. This works for the majority of websites, but fails in two scenarios:

1. **JavaScript-heavy pages:** SPAs, React/Vue/Angular sites, and pages with dynamic content loading. These return valid HTTP 200 responses but contain minimal or no readable text because the actual content is rendered client-side.
2. **Cloudflare-protected sites:** Sites behind Cloudflare return HTTP 403 with a "Just a moment..." challenge page. Simple HTTP fetch cannot solve the JS challenge, resulting in zero extracted content.

The first live flow test revealed this as a critical problem: 151 of 270 pages (56%) were excluded as "too short" (word_count < 50). These are not junk pages -- they are the valuable, hard-to-get pages that make the tool worth using.

Beyond JavaScript rendering, some sites use Cloudflare protection or aggressive bot detection that returns HTTP 403 even to headless browsers. For these sites, the module includes a **Wayback Machine fallback** -- fetching the most recent archived snapshot from web.archive.org via plain HTTP, which bypasses all anti-bot measures entirely.

The original Content Creation Master planned for this split: *"Step 5c (Cheerio/static) -- default; static DOM render is enough"* and *"Step 5d (Playwright/JS) -- consent walls, JS-rendered content, stubborn DOM."* This module implements Step 5d -- the Playwright-based scraper that handles the pages the static scraper cannot, plus the Wayback Machine fallback for sites that block even headless browsers.

### How It Fits the Pipeline Architecture

This module runs **after** page-scraper in Step 3. It reads the working pool and partitions items with a **whitelist**: only items in a known-good state are passed through; everything else is re-scraped. Passed through unchanged:

- Items with `status: "success"`, at least `min_word_threshold` words, no boilerplate match, and no block-page text
- Items with `status: "skipped"` (non-HTML content like PDFs and images -- a browser render cannot help)

Everything else is re-scraped, including:

- Items with **no status** (from Step 1/2 submodules that only discovered URLs)
- Items with `status: "error"`, `"dead_link"`, or `"low_content"` (failures and thin pages from page-scraper)
- Items with `status: "success"` but fewer than `min_word_threshold` words (JS-rendered pages)
- Items with `status: "success"` but boilerplate-only content (3+ pages with identical text)
- Items with `status: "success"` but detected as Cloudflare/bot-blocker pages (2+ known block-page text markers)
- Items with any **unknown status** (e.g. `"unique"` from url-dedup) -- unknown defaults to re-scrape, not pass-through

Scraping uses a **3-tier fallback** approach:
1. **Browser fetch** (Playwright) -- renders JavaScript, waits for common content selectors, optionally auto-scrolls to trigger lazy-loaded content. Extracted text is checked for block-page markers and og:description truncation before being accepted as success
2. **Wayback Machine** -- if browser fails or returns a block page, fetches the archived snapshot from web.archive.org via plain HTTP
3. **Error** -- if both tiers fail, marks the item with the browser error

After the browser renders a page, **text extraction** runs its own 3-tier chain: (1) Mozilla Readability, (2) CMS-aware DOM extraction that strips noise elements (nav, footer, cookie banners, sidebars) and collects ALL matching content containers for WordPress, Elementor, Divi, WPBakery, semantic HTML, and generic CMS selectors, (3) regex fallback for HTML too malformed for DOM parsing, with plain body text as the last resort. A tier's output is accepted at 30+ words.

After all pages are scraped, a **post-scrape duplicate detection** pass runs: if 3+ browser-scraped pages return identical text content, they are demoted from success to error (catches any bot blocker regardless of wording -- Akamai, Imperva, DataDome, etc.).

This is the transform (=) data operation -- the same items go in and come out, but the previously-empty ones are now enriched with scraped content. The module adds a `scrape_method` field to every item: `browser`, `wayback`, or `passed_through`.

## Strategy & Role

**Why this module exists:** Recover content from pages that the static HTTP scraper could not extract -- whether due to JavaScript rendering, Cloudflare protection, or HTTP errors. Without this module, the pipeline loses the pages that matter most.

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
- Target sites have no lazy-loaded content -- disable `auto_scroll` to save ~3-6 seconds per page

## Options Guide

| Option | Default | When to Change | Impact |
|--------|---------|----------------|--------|
| `request_timeout` | 20,000ms | Raise to 30-60s for slow SPAs; lower to 10s for known-fast sites | Per-page browser rendering timeout. SPAs may need 15-30 seconds to finish loading |
| `wait_for_network_idle` | true | Set to false for faster but less reliable scraping of pages that continuously make requests | Waits until no network requests for 500ms. Slower but ensures SPA content is fully loaded |
| `min_word_threshold` | 50 | Raise to 100-200 to catch more marginal pages; lower to 20 if you only want truly empty pages | Only pages with word_count below this are re-scraped. Pages above are passed through unchanged. Also the success bar for re-scraped pages |
| `max_content_length` | 50,000 chars | Raise to 100-200k for very long pages; lower to 20k for quick extraction | Truncates extracted text after this many characters |
| `concurrency` | 4 | Lower to 1-2 on memory-constrained servers; raise toward the max of 8 only on powerful machines | Number of browser tabs running simultaneously. Each tab uses significant memory |
| `auto_scroll` | true | Set to false when target sites have no lazy-loaded content and you want speed | Scrolls through the page before extraction to trigger lazy-loaded content. Adds ~3-6 seconds per page |

The most impactful option is `min_word_threshold`: it controls both which pages get re-scraped AND what counts as a successful re-scrape. The most common mistake is running high `concurrency` on a small server -- each Playwright tab is a real Chromium page, and OOM kills lose the whole batch (partial results are saved, but the run still fails).

## Recipes

### Standard Recovery
Balanced for most use cases after page-scraper:
```
request_timeout: 20000
wait_for_network_idle: true
min_word_threshold: 50
max_content_length: 50000
concurrency: 4
auto_scroll: true
```

### Aggressive Recovery
Re-scrape more pages including marginal ones:
```
request_timeout: 30000
wait_for_network_idle: true
min_word_threshold: 200
max_content_length: 50000
concurrency: 2
auto_scroll: true
```

### Memory-Constrained Server
Minimize resource usage:
```
request_timeout: 20000
wait_for_network_idle: true
min_word_threshold: 50
max_content_length: 50000
concurrency: 1
auto_scroll: true
```

### Fast Pass
Quick re-scrape without network-idle waits or scrolling:
```
request_timeout: 15000
wait_for_network_idle: false
min_word_threshold: 50
max_content_length: 50000
concurrency: 4
auto_scroll: false
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
- `content_type` -- `text/html` for scraped pages, null on total failure
- `status` -- `success`, `error`, or original status for pass-through items
- `error` -- error message if browser scraping failed (null for success)
- `text_preview` -- first 150 characters of extracted text
- `meta_description` -- from `<meta name="description">` tag
- `og_description` -- from `<meta property="og:description">` tag (used for truncation detection)
- `text_content` -- full extracted text (visible in detail view, downloadable as .txt)
- `entity_name` -- which entity this URL belongs to
- `scrape_method` -- `browser` (re-scraped by Playwright), `wayback` (fetched from Wayback Machine archive), or `passed_through` (kept from page-scraper)
- `extraction_method` -- `readability`, `cms_dom`, `regex_fallback`, or `none` (which text extraction tier produced the content); `original` for pass-through items that carry no extraction marker of their own

**Results are grouped by entity** with per-entity meta: `total`, `browser_scraped`, `browser_success`, `passed_through`, `errors`, `total_words`, `extraction_methods` (count per extraction tier -- useful for spotting how much content came from fallback tiers).

**Red flags to watch for:**
- Recovery rate below 30% -- sites may need longer timeouts or have non-standard rendering
- High error count among browser-scraped pages -- check if sites are blocking headless browsers (Wayback Machine fallback should catch most of these)
- Many `scrape_method: "wayback"` results -- site is heavily protected; content is recovered but may be outdated
- Many `extraction_method: "regex_fallback"` results -- pages are serving malformed HTML; spot-check the extracted text quality
- Pages still showing 0 words after all tiers -- content may be behind authentication or loaded via WebSocket
- "Duplicate text across N pages" errors -- post-scrape duplicate detection caught a bot blocker page. These items flow to the api-scraper for retry with ScrapFly ASP

## Limitations & Edge Cases

- **Requires Playwright on the server** -- throws an error immediately if `tools.browser.fetch` is not available
- **Memory-intensive** -- each concurrent browser tab uses significant RAM. Several concurrent tabs on a 2GB server can cause OOM
- **Does not handle cookie consent banners** -- banner elements are stripped from the extracted DOM, but content hidden behind an "Accept cookies" overlay will not be extracted
- **Does not handle login walls** -- pages requiring authentication are out of scope
- **Truncation detection** -- after browser extraction, content length is compared against the `og:description` meta tag (when that tag is 100+ chars). If the extracted text is no longer than the og:description, the page is treated as a browser failure (likely truncated/incomplete rendering) and falls through to the Wayback Machine tier
- **Partial results on timeout** -- pass-through items are saved to `_partialItems` immediately, and each scraped result is saved as it completes. If the module times out mid-batch, already-scraped pages are preserved in the pool rather than lost
- **3-tier extraction chain** -- Readability first, then CMS-aware DOM selectors (WordPress, Elementor, Divi, WPBakery, semantic/generic containers), then a regex fallback with body text as last resort. If the content is genuinely minimal (e.g., a redirect page, a 404), browser rendering will not help
- **Sort order:** results are sorted by status -- errors first, then skipped, then success. Pass-through items keep their original status and sort within it
- **Block page detection (two layers)** -- (1) Extracted text is checked against known Cloudflare markers (2+ marker matches required, to avoid false positives) before returning success; if detected, falls through to Wayback Machine. The same check runs on input items so block pages that slipped through page-scraper as "success" get re-scraped. (2) After all scrapes finish, if 3+ pages returned identical text, they are demoted to error regardless of wording (catches any bot blocker). Both layers prevent block pages from passing through as false successes to the api-scraper
- **Re-scrapes all failed items** -- items with no status, `error`, `dead_link`, `low_content`, unknown status, low word count, boilerplate content, or detected block-page text are all attempted. The Wayback Machine fallback means even HTTP 403 pages have a chance of content recovery
- **Wayback tier requires `tools.http`** -- if the HTTP tool is unavailable, a browser failure is final
- **Wayback Machine content may be stale** -- archived snapshots can be months or years old. Content from Wayback is still valuable for analysis but may not reflect the current state of the page

## What Happens Next

After browser-scraper runs, the working pool contains the best available text content for every URL -- from page-scraper (passed through), Playwright browser rendering, or Wayback Machine archive. This enriched pool flows into **Step 4 (Filtering & Assembly)** where content is cleaned, deduplicated, language-detected, and assembled into source packages for generation.

The `scrape_method` field allows operators to see exactly which approach worked for each page, providing transparency into the extraction pipeline and helping identify patterns (e.g., "all pages from domain X needed browser scraping" or "Cloudflare-protected site recovered via Wayback Machine").

## Technical Reference

- **Step:** 3 (Scraping)
- **Category:** scraping
- **Cost:** expensive -- long execution timeout class; one full Playwright render per re-scraped page
- **Data operation:** transform (=) -- same items enriched with scraped content
- **Pool precondition:** `requires_items` -- entities with an empty pool are marked `skipped_no_input` (not failed) before enqueue; run page-scraper first
- **Requires:** `url` field in input items
- **Depends on:** page-scraper (must run first)
- **Input:** `input.entities[]` with `items[]` from page-scraper's working pool
- **Output:** `{ results[], summary }` where results are grouped by entity_name, each with `items[]` containing all output fields plus `scrape_method`; summary includes `browser_attempted`, `browser_success`, `errors`, `passed_through`, `extraction_methods`, and a human-readable `description`
- **Browser fetch settings:** waits for common content selectors (`article, main, [role="main"], .entry-content, .post-content`), honors `wait_for_network_idle` and `auto_scroll` options
- **Selectable:** true -- operators can deselect failed/empty pages
- **Flagged rows:** items with `status` of `error` or `timed_out` are flagged in the UI
- **Detail view:** `detail_schema` with header fields (url as link, title, status badge, word_count, scrape_method, extraction_method) and expandable section (text_content as prose); `text_content` downloadable as .txt
- **Error handling:** per-URL fallback chain (browser -> Wayback Machine -> error). Each tier is independent; failure in one tier triggers the next. All errors are caught per page; other pages continue processing
- **Dependencies:** `@mozilla/readability` (content extraction), `linkedom` (DOM parsing), `tools.browser` (Playwright), `tools.http` (Wayback Machine fallback), `tools.logger`, `tools.progress`, `tools._partialItems` (timeout resilience)
- **Files:** `manifest.json`, `execute.js`
