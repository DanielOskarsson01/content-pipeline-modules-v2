# API Scraper (ScrapFly)

> Paid API fallback for pages that failed both page-scraper and browser-scraper. Uses ScrapFly's Anti-Scraping Protection to bypass Cloudflare, Turnstile, and aggressive bot detection.

**Module ID:** `api-scraper` | **Step:** 3 (Scraping) | **Category:** scraping | **Cost:** expensive
**Version:** 1.0.0 | **Data Operation:** transform (=)

---

## Background

### The Content Problem This Solves

Some websites are so heavily protected that neither HTTP fetch (page-scraper) nor a headless browser (browser-scraper) can extract content. These sites use advanced anti-bot systems -- Cloudflare Turnstile, Akamai Bot Manager, DataDome, PerimeterX -- that detect and block automated requests regardless of the method used.

The first live flow test revealed 56% of pages failed extraction. Browser-scraper recovers many of these, but a subset remains stubbornly blocked. These are typically high-value gambling industry sites with enterprise-grade protection -- exactly the sites whose content matters most for company profiles.

ScrapFly solves this by routing requests through residential proxies with anti-fingerprinting and challenge-solving built in. It's a paid service (~30 credits per request with ASP + JS rendering), making it the most expensive scraping method -- but also the most reliable for protected sites.

### How It Fits the Pipeline Architecture

This is the third and final scraper in Step 3's chain:

```
page-scraper (HTTP + Readability) -- handles ~70% of sites (free)
    ↓ pages with status "error" or low word_count
browser-scraper (Playwright + Wayback) -- recovers ~15-20% (free, needs Playwright)
    ↓ pages still failing
api-scraper (ScrapFly API) -- recovers remaining hard cases (paid)
    ↓
Step 4 (content filtering)
```

The module uses the **transform (=)** data operation -- the same items go in and come out. Pages already scraped successfully are passed through unchanged. Only failed/low-content pages consume API credits.

### Wayback Machine Fallback

If ScrapFly itself fails (API error, empty response, or returns a block page despite ASP), the module falls back to the Wayback Machine -- fetching the most recent archived snapshot from web.archive.org via plain HTTP. This provides a third tier of recovery at zero additional cost.

### Safety Features

**Circuit breaker:** If 3 consecutive URLs hit HTTP 429 (rate limited), the module immediately stops scraping remaining URLs instead of burning through the entity timeout. Remaining URLs are marked as "Skipped -- ScrapFly rate limit circuit breaker."

**Global rate limiter:** A token-bucket limiter (default 10 requests/minute) ensures all concurrent workers stay within ScrapFly's account-level rate limits. This prevents 429 errors when processing multiple entities.

**Duplicate text detection:** If 3+ scraped pages return identical text content, they're demoted from "success" to "error" -- a sign that ScrapFly returned a block page that passed initial checks.

## Strategy & Role

**Why this module exists:** Last-resort content recovery for pages that all free methods failed on. Ensures the pipeline can extract content from even the most heavily protected sites, at the cost of API credits.

**Role in the pipeline:** Third scraper in Step 3. Complements page-scraper and browser-scraper by handling their remaining failures. Only processes items that still need scraping -- never wastes credits on already-successful pages.

**Relationship to other steps:**
- **Depends on:** browser-scraper (must run first to identify remaining failures)
- **Receives from working pool:** Same items as browser-scraper, but only re-scrapes failures
- **Feeds into Step 4:** Enriched content for filtering, language detection, and assembly

## Setup

Set the `SCRAPFLY_KEY` environment variable on the server:

```bash
# In your .env file on Hetzner
SCRAPFLY_KEY=scp-live-your-key-here
```

Then restart PM2: `pm2 restart all`

## When to Use

**Always use when:**
- page-scraper and browser-scraper have both run
- The pool still contains pages with errors, low word counts, or block page content
- Target sites include heavily protected gambling/fintech/enterprise sites

**Do not use when:**
- page-scraper and browser-scraper haven't run yet -- api-scraper processes their failures
- All pages already have sufficient content (the module detects this and passes everything through)
- You're out of ScrapFly credits (check dashboard at scrapfly.io)

**Consider settings carefully when:**
- Running many entities at once -- the rate limiter prevents 429s but slows throughput
- ScrapFly credits are limited -- lower concurrency and consider running fewer entities per batch
- Sites are in specific regions -- set `country` to match the site's target audience

## Options Guide

| Option | Default | When to Change | Impact |
|--------|---------|----------------|--------|
| `min_word_threshold` | 50 | Raise to 100-200 to re-scrape marginal pages; lower to 20 for truly empty pages only | Only pages with word_count below this are re-scraped. Pages above are passed through unchanged |
| `max_content_length` | 50,000 chars | Raise to 100-200k for very long pages; lower to 20k for quick extraction | Truncates extracted text after this many characters |
| `concurrency` | 2 | Lower to 1 to minimize credit burn; raise to 3-4 if rate limits allow | Simultaneous ScrapFly API requests. Keep low -- each request costs credits |
| `request_timeout` | 45,000ms | Raise to 60-90s for very slow sites; lower to 30s for faster failures | Per-request API timeout. ScrapFly's challenge-solving can take 15-30s |
| `country` | (empty) | Set to `GB`, `US`, `MT` etc. if site geo-restricts content | Forces proxy to exit from a specific country. Leave empty for auto-selection |
| `requests_per_minute` | 10 | Raise to 20-30 on paid plans with higher limits; set to 0 to disable | Global rate limit across all workers. Prevents account-level 429 errors |

## Recipes

### Standard Recovery
Balanced for most use cases after browser-scraper:
```
min_word_threshold: 50
max_content_length: 50000
concurrency: 2
request_timeout: 45000
country: (empty)
requests_per_minute: 10
```

### Conservative (Limited Credits)
Minimize credit usage:
```
min_word_threshold: 30
max_content_length: 50000
concurrency: 1
request_timeout: 30000
country: (empty)
requests_per_minute: 10
```

### Aggressive Recovery
Re-scrape more pages including marginal ones:
```
min_word_threshold: 200
max_content_length: 50000
concurrency: 2
request_timeout: 60000
country: (empty)
requests_per_minute: 15
```

### UK Gambling Sites
Geo-targeted for UK-specific content:
```
min_word_threshold: 50
max_content_length: 50000
concurrency: 2
request_timeout: 45000
country: GB
requests_per_minute: 10
```

### High-Volume Batch (Paid Plan)
For paid plans with generous rate limits:
```
min_word_threshold: 50
max_content_length: 50000
concurrency: 3
request_timeout: 45000
country: (empty)
requests_per_minute: 30
```

## Cost

Each request uses ~30 ScrapFly credits (ASP + JS rendering). Plan costs:

| Plan | Credits/Month | ~Pages | Rate Limit |
|------|--------------|--------|------------|
| Free | 1,000 | ~33 | ~10 req/min |
| Discovery ($11) | 100,000 | ~3,300 | Higher |
| Startup ($59) | 1,000,000 | ~33,000 | Higher |

You are only charged for successful API calls -- failed requests don't consume credits. The `scrapfly_credits` field in output tracks actual consumption.

## Expected Output

**Healthy result:**
- 50-80% of previously-failed pages recovered with sufficient content
- Pass-through items unchanged from browser-scraper output
- Clear `scrape_method` markers showing which approach was used

**Output fields per URL:**
- `url` -- the original URL
- `final_url` -- the URL after any redirects
- `title` -- page title extracted from ScrapFly-rendered HTML
- `word_count` -- words in extracted text
- `content_type` -- HTTP content-type
- `status` -- `success`, `error`, or original status for pass-through items
- `error` -- error message if scraping failed (null for success)
- `text_preview` -- first 150 characters of extracted text
- `meta_description` -- from `<meta name="description">` tag
- `text_content` -- full extracted text (visible in detail view)
- `entity_name` -- which entity this URL belongs to
- `scrape_method` -- `scrapfly` (API-scraped), `wayback` (Wayback Machine fallback), or `passed_through` (kept from previous scraper)
- `extraction_method` -- `readability`, `cms-dom`, `regex`, or `none`
- `scrapfly_credits` -- credits consumed for this URL

**Red flags to watch for:**
- All URLs returning 429 errors -- ScrapFly account is rate-limited or out of credits. Check dashboard
- Many "Skipped -- circuit breaker" errors -- rate limit was hit early. Wait and retry, or increase `requests_per_minute` if plan allows
- Recovery rate below 30% -- sites may have protection that even ScrapFly cannot bypass
- `scrape_method: "wayback"` on many results -- ScrapFly failed but Wayback recovered. Content may be outdated
- High credit consumption -- check `scrapfly_credits` totals. Each ASP request costs ~30 credits

## Limitations & Edge Cases

- **Requires SCRAPFLY_KEY env var** -- throws an error if not set. Must be configured on the server
- **Paid service** -- every API request costs credits. Monitor usage at scrapfly.io dashboard
- **Rate limits are account-wide** -- running multiple pipeline batches simultaneously will share the same rate limit. The `requests_per_minute` option helps but cannot coordinate across separate server processes
- **Circuit breaker is per-entity** -- the consecutive-429 counter resets between entities. A rate-limited batch should wait before retrying
- **Wayback Machine content may be stale** -- archived snapshots can be months or years old
- **Same extraction algorithm as other scrapers** -- uses Readability with CMS DOM and regex fallbacks. If content is genuinely minimal (redirect page, 404), no scraper will help
- **Block page detection** -- Cloudflare block pages and generic block text are detected and treated as failures. However, novel block page formats may not be caught
- **Duplicate text detection requires 3+ matches** -- if only 2 pages return the same block text, they won't be automatically demoted
- **Entity timeout** -- expensive cost tier gets 600s (10 min) per entity. The rate limiter and circuit breaker are designed to stay within this, but very large URL sets may approach the limit

## What Happens Next

After api-scraper runs, the working pool contains the best available text content for every URL -- from page-scraper (HTTP), browser-scraper (Playwright/Wayback), or api-scraper (ScrapFly/Wayback). This enriched pool flows into **Step 4 (Filtering & Assembly)** where content is cleaned, deduplicated, language-detected, and assembled into source packages for generation.

The `scrape_method` field provides full transparency into which approach worked for each page, helping identify patterns (e.g., "all pages from domain X needed ScrapFly" or "ScrapFly couldn't bypass DataDome on domain Y").

## Technical Reference

- **Step:** 3 (Scraping)
- **Category:** scraping
- **Cost:** expensive
- **Data operation:** transform (=) -- same items enriched with scraped content
- **Requires:** `url` field in input items, `SCRAPFLY_KEY` environment variable
- **Depends on:** browser-scraper (must run first)
- **Input:** `input.entities[]` with `items[]` from working pool
- **Output:** `{ results[], summary }` where results are grouped by entity_name
- **Selectable:** true -- operators can deselect failed/empty pages
- **Detail view:** `detail_schema` with header fields (url as link, title, status badge, word_count, scrape_method, extraction_method, scrapfly_credits) and expandable section (text_content as prose)
- **Error handling:** per-URL 3-tier fallback (ScrapFly API -> Wayback Machine -> error). Circuit breaker stops after 3 consecutive 429s. Rate limiter prevents 429s proactively
- **Dependencies:** `@mozilla/readability` (content extraction), `linkedom` (DOM parsing), `tools.http` (API calls + Wayback), `tools.logger`, `tools.progress`
- **Files:** `manifest.json`, `execute.js`
