# Page Scraper

> Fetch HTML pages and extract readable text content from validated URLs.

**Module ID:** `page-scraper` | **Step:** 3 (Scraping) | **Category:** scraping | **Cost:** expensive
**Version:** 1.0.0 | **Data Operation:** transform (＝)

---

## Background

### The Content Problem This Solves

After Steps 1 and 2, the pipeline has a curated pool of URLs — discovered, deduplicated, filtered, and classified as relevant. But URLs are just addresses. To build company profiles, generate news articles, or create any content, the system needs the actual *text* on those pages. Step 3 is where the pipeline goes from knowing *where* to look to knowing *what's there*.

The original Content Creation Master described two scraping approaches:
- **Step 5c (Cheerio/static)** — "default; static DOM render is enough." Fast, cheap, handles most websites
- **Step 5d (Playwright/JS)** — "consent walls, JS-rendered content, stubborn DOM." Slower, heavier, for JavaScript-heavy sites

And recommended a split strategy: *"You now have two distinct scraper nodes (5c Cheerio, 5d Playwright) you can develop/tune separately and route to via logic from Step 4 and a domain policy."*

This module implements the Cheerio-equivalent approach using Mozilla Readability (the same algorithm behind Firefox Reader Mode) with a regex fallback. It handles the majority of websites. A future Playwright-based variant would handle the JavaScript-heavy edge cases.

### How It Fits the Pipeline Architecture

Step 3 is the most expensive step in the pipeline so far — every URL requires an HTTP request and content extraction. The Strategic Architecture describes it:

> *"Not all pages can be fetched the same way. Some need simple HTTP requests. Some need a headless browser for JavaScript rendering. Some are behind authentication or rate limiting. Different submodules handle different scraping challenges."*

This is the first (and currently only) Step 3 module. It uses the **transform (＝)** data operation — the same URLs go in, but come out enriched with text content, titles, word counts, and metadata. No URLs are removed; instead, failed/skipped URLs are marked with status fields so operators can review them.

### Mozilla Readability: Why This Extraction Method

The module uses `@mozilla/readability` — the algorithm that powers Firefox's Reader Mode. When you click the "Reader View" button in Firefox, this is the code that strips navigation, ads, sidebars, and boilerplate to extract just the article content.

Why Readability over simple regex:
- **Content identification** — Readability uses scoring heuristics to identify the main content area, not just `<main>` or `<article>` tags
- **Boilerplate removal** — Automatically strips navigation, ads, cookie banners, sidebars, and repeated elements
- **Battle-tested** — Used by millions of Firefox users daily. Handles edge cases that simple extraction misses

The module falls back to regex-based extraction (targeting `<main>` → `<article>` → `<body>`, stripping scripts/styles/nav/footer) when Readability can't parse the page. This dual approach matches the original vision's emphasis on robustness.

### The Cost-Awareness Design

The module is classified as **expensive** — the only module with this cost level so far. Every option is designed with cost control in mind:
- `delay_between_requests` — prevents overwhelming target servers and getting blocked
- `request_timeout` — prevents hanging on unresponsive servers
- `max_content_length` — prevents memory issues from extremely large pages
- `skip_non_html` — gracefully handles PDFs, images, and other non-HTML content types

The original Content Creation Master recommended include/exclude globs for the scraper: *"Include globs: `*about*|*company*|*products*|*solutions*`... Exclude globs: `*privacy*|*terms*|*login*`"*. In the current architecture, this filtering happens in Step 2 (before scraping), not during scraping — which is more cost-efficient since it prevents requests entirely rather than fetching and discarding.

## Strategy & Role

**Why this module exists:** Transform URLs into readable text content. This is the bridge between knowing where to look (Step 1-2) and having material to work with (Steps 4-5). Every downstream content generation step depends on the quality of extraction here.

**Role in the pipeline:** The sole content extraction module in Step 3. Enriches the URL pool with actual page content — title, text, word count, metadata. Does not filter or remove URLs; marks failures for operator review.

**Relationship to other steps:**
- **Receives from Step 2:** Validated, deduplicated, relevance-filtered URLs
- **Feeds into Step 4:** Scraped content for filtering, language detection, and assembly
- **Quality here determines quality everywhere downstream:** Poor extraction → poor LLM generation → poor profiles

## When to Use

**Always use when:**
- You need actual page content for downstream processing
- The URL pool has been validated in Step 2

**Consider settings carefully when:**
- Processing many URLs (500+) — adjust delay and timeout to balance speed vs rate limiting
- Scraping sites known to be JavaScript-heavy — this module won't render JS (consider future Playwright module)
- Working with non-English content — extraction works on any language but `max_content_length` may need adjusting for character-dense languages

## Options Guide

| Option | Default | When to Change | Impact |
|--------|---------|----------------|--------|
| `request_timeout` | 10,000ms | Raise to 20-30s for slow servers; lower to 5s for fast, reliable sites | Per-URL HTTP timeout. Too low = missed pages. Too high = long waits on dead servers |
| `max_content_length` | 50,000 chars | Raise to 100-200k for very long pages (academic papers, legal docs); lower to 20k for quick extraction | Truncates extracted text after stripping HTML. 50k chars ≈ 8,000-10,000 words, enough for most pages |
| `delay_between_requests` | 500ms | Raise to 1-2s for rate-sensitive sites; lower to 0-100ms for your own domains or sites you're confident about | Pause between requests. Prevents rate limiting and IP bans. Critical for batch processing |
| `skip_non_html` | true | Set to false if you want non-HTML responses to be marked as errors instead of "skipped" | PDFs, images, downloads marked as "skipped" (neutral) vs "error" (red). Skipped items are visible but not alarming |
| `extract_meta` | true | Disable to save minor processing time if you don't need meta descriptions | Extracts `<meta name="description">` tag. Useful for quick content preview without reading full text |

## Recipes

### Standard Scraping
Balanced for most use cases:
```
request_timeout: 10000
max_content_length: 50000
delay_between_requests: 500
skip_non_html: true
extract_meta: true
```

### Fast Scraping (trusted sites)
When you control the target or trust it won't rate-limit:
```
request_timeout: 5000
max_content_length: 50000
delay_between_requests: 100
skip_non_html: true
extract_meta: true
```

### Gentle Scraping (rate-sensitive sites)
For sites that are known to rate-limit or block scrapers:
```
request_timeout: 20000
max_content_length: 50000
delay_between_requests: 2000
skip_non_html: true
extract_meta: true
```

### Deep Content Extraction
For very long pages where you need maximum text:
```
request_timeout: 15000
max_content_length: 200000
delay_between_requests: 500
skip_non_html: true
extract_meta: true
```

## Expected Output

**Healthy result:**
- 80-95% success rate (most validated URLs return content)
- Average 500-3,000 words per successfully scraped page
- 5-15% errors (timeouts, non-HTML, server errors)

**Output fields per URL:**
- `url` — the original URL
- `title` — page title (from `<title>` → og:title → first `<h1>`)
- `word_count` — words in extracted text
- `content_type` — HTTP content-type header (e.g., `text/html`)
- `status` — `success`, `error`, `skipped`, or `low_content`
- `error` — error message if status is error/skipped (null for success)
- `text_preview` — first 150 characters of extracted text (for quick table review)
- `meta_description` — from `<meta name="description">` tag
- `text_content` — full extracted text (visible in detail view, not in table)
- `final_url` — the final URL after any redirects (currently same as input due to tools.http limitation)

**Detail view:** Each item has an expandable detail view showing the full `text_content` as prose and the `meta_description` — allowing operators to quickly assess extraction quality.

**Red flags to watch for:**
- Low word counts (< 50 words) on pages that should have content → extraction may have failed to identify the main content area
- High error rate (> 30%) → site may be blocking requests, requiring authentication, or serving JavaScript-only content
- Many "skipped" items → URLs pointing to non-HTML resources (PDFs, images). Check if Step 2 filtering should have caught these
- All titles null → site doesn't use `<title>` tags or uses JavaScript to set them (SPA)
- "Cloudflare block page detected" errors → site is behind Cloudflare bot protection. These pages are correctly marked as errors so the browser-scraper can retry them with Playwright

## Limitations & Edge Cases

- **Boilerplate detection** — After all pages are scraped, a post-scrape pass checks for duplicate content within each domain. If 3+ pages from the same domain share identical `text_content`, they are demoted from `success` to `low_content` — the scraper likely extracted footer/nav/legal boilerplate instead of the real article. These pages are picked up by browser-scraper for re-extraction
- **`low_content` status** — Pages get `low_content` status (instead of `error`) in three cases: (1) JavaScript-truncated content detected, (2) word count below 50, or (3) boilerplate duplicate detected. `low_content` signals browser-scraper to re-try the page while keeping the partial content available for review
- **Partial results on timeout** — Uses `_partialItems` to save each scraped result incrementally. If the module times out mid-batch, already-scraped pages are preserved in the pool rather than lost
- **Cloudflare/bot-blocker detection** — Extracted text is checked against known Cloudflare block page markers (e.g., "Why have I been blocked", "Cloudflare Ray ID"). Pages matching 2+ markers are marked as `status: 'error'` with `error: 'Cloudflare block page detected'` so the browser-scraper can retry them. This prevents block pages from passing through as false successes
- **No JavaScript rendering** — This is the Cheerio/Readability equivalent from the original vision. JavaScript-rendered pages return empty or minimal content. The original Content Creation Master planned a Playwright fallback: *"consent walls, JS-rendered content, stubborn DOM"* — a future module for this
- **No authentication** — Cannot scrape pages behind login walls. The Raw Appendix identified this as a separate concern: *"Consent/JS detection: If typical consent elements or missing DOM content after a light fetch → set `needs_playwright=true`"*
- **Redirect tracking limited** — `tools.http.get` follows redirects automatically but doesn't expose the final URL. Content is correct but `final_url` always shows the original URL
- **Rate limiting is per-pipeline** — The `delay_between_requests` applies between sequential URLs, but doesn't coordinate across multiple pipeline runs. Running two pipelines simultaneously doubles the request rate
- **Content truncation is hard** — `max_content_length` truncates at a character boundary, which may cut mid-sentence or mid-word. Downstream modules should handle partial text gracefully
- **Title extraction priority** — Uses `<title>` first, then og:title, then first `<h1>`. Some sites have misleading `<title>` tags (e.g., "Home | Company Name" instead of the actual page title)

## What Happens Next

Scraped content enters the working pool enriched with `text_content`, `title`, `word_count`, and `meta_description`. This flows into **Step 4 (Filtering & Assembly)** where content is cleaned, deduplicated at the content level, language-detected, and assembled into source packages for generation.

The original Content Creation Master described Step 7 (now Step 4) as: *"Drop <100 words. Deduplicate exact + near duplicate. Strip boilerplate. Tag critical intents: About; Products/Solutions; Press; Partners; Careers; Contact. Adaptive Page Cap: base cap = 12 pages, expand up to 25 if signals justify."*

The `word_count` field from this module directly feeds the minimum word count filter. The `text_content` enables content-level deduplication (Jaccard similarity) and intent tagging. The quality of extraction here determines the quality of everything downstream through the pipeline.

## Technical Reference

- **Step:** 3 (Scraping)
- **Category:** scraping
- **Cost:** expensive
- **Data operation:** transform (＝) — same items enriched with scraped content
- **Requires:** `url` field in input items
- **Input:** `input.entities[]` with `items[]` from Step 2 working pool (grouped format) or flat URL list
- **Output:** `results[]` grouped by `entity_name`, each with `items[]` containing `url`, `title`, `word_count`, `content_type`, `status`, `error`, `text_preview`, `meta_description`, `text_content`, `final_url`
- **Selectable:** true — operators can deselect failed/empty pages
- **Detail view:** `detail_schema` with header fields (url as link, title, status, word_count) and expandable sections (text_content as prose, meta_description as text)
- **Error handling:** HTTP errors, timeouts, and non-HTML content are handled per-URL (partial success pattern). No URL is lost — all are returned with a status
- **Dependencies:** `@mozilla/readability` (content extraction), `linkedom` (DOM parsing), `tools.http`, `tools.logger`, `tools.progress`
- **Files:** `manifest.json`, `execute.js`
