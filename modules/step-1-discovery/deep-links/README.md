# Deep Link Crawler

> Follows pages found by earlier discovery modules and extracts the links on them -- discovering sub-pages one level deeper than sitemaps and homepage navigation reveal.

**Module ID:** `deep-links` | **Step:** 1 (Discovery) | **Category:** crawling | **Cost:** expensive
**Version:** 1.0.0 | **Data Operation:** transform (=)

---

## What This Module Does

Company websites often hide their most valuable content one click deeper than the homepage. An "About" page links to "Leadership" and "History". A "Products" page links to individual solution pages. A "News" listing links to individual articles. Sitemaps and homepage navigation find the parent pages -- Deep Link Crawler follows those parent pages and extracts the links on them.

This is the only Step 1 module that reads the working pool from sibling modules. While Sitemap Parser, Page Links, and RSS Feeds all work independently from entity data alone, Deep Link Crawler operates on their *results*. It takes URLs already discovered by those modules, fetches the actual HTML of those pages, and extracts every `<a href>` link found on them.

```
Sitemap Parser → finds hundreds of URLs from sitemap.xml
Page Links     → finds key navigation URLs from the homepage
Deep Links     → visits those URLs and discovers the sub-pages linked from them
```

The module filters out junk URLs automatically -- images, CSS, JavaScript files, CDN paths, WordPress admin pages, and other non-content URLs are excluded before output.

## When to Use

**Always run when:**
- You want thorough URL coverage beyond what sitemaps provide
- Companies have deep site structures (enterprise sites with many sub-sections)
- You're looking for partnership, integration, case study, or team sub-pages
- At least one other Step 1 module has already been run and approved

**Skip when:**
- Speed is critical and first-pass discovery was sufficient
- The company has a small, flat website (< 50 pages total)
- You're in a news-only pipeline (RSS Feeds is more appropriate)
- No sibling modules have been approved yet (the working pool will be empty)

## Options Guide

| Option | Default | When to Change | What It Does |
|--------|---------|----------------|--------------|
| `max_pages_per_entity` | 30 | Lower to 5-10 for quick runs; raise to 100-200 for maximum coverage on large sites | How many pool URLs to visit and extract links from. Each page = 1 HTTP request |
| `max_urls_per_page` | 50 | Raise to 100-200 if pages have many valuable links; lower to 20 to keep output focused | Caps how many links to extract from a single crawled page |
| `crawl_patterns` | *(empty)* | Add patterns like `/news\n/blog\n/press` to only crawl specific page types | When empty, crawls all pool URLs up to `max_pages_per_entity`. When set, only crawls URLs whose path contains one of these strings. Leave empty for best coverage -- Step 2 handles filtering |
| `same_domain_only` | false | Enable to restrict output to the company's own domain only | When disabled, captures links to partner sites, subsidiary domains, and external resources |
| `exclude_already_discovered` | false | Enable if you want to pre-filter duplicates (saves some output noise) | When disabled, lets Step 2's url-dedup handle deduplication -- which is more thorough |

**Most impactful options:** `max_pages_per_entity` directly controls how many HTTP requests are made. With 96 entities at 30 pages each, that's up to 2,880 requests -- which is why the module is classified as `expensive` (30 min timeout). The `crawl_patterns` option used to default to a narrow list (`/about`, `/company`, `/blog`, etc.) which caused most pool URLs to be skipped. It now defaults to empty, meaning all pool URLs are eligible for crawling.

## Recommended Configurations

### Standard (default)
Broad coverage for most pipeline runs:
```
max_pages_per_entity: 30
max_urls_per_page: 50
crawl_patterns:
same_domain_only: false
exclude_already_discovered: false
```

### Quick Pass
Fast second-pass when time is limited:
```
max_pages_per_entity: 5
max_urls_per_page: 30
crawl_patterns:
same_domain_only: true
exclude_already_discovered: true
```

### Maximum Coverage
For thorough enterprise-level discovery:
```
max_pages_per_entity: 100
max_urls_per_page: 100
crawl_patterns:
same_domain_only: false
exclude_already_discovered: false
```

### News & Press Focus
Only follow news/blog listing pages to find individual articles:
```
max_pages_per_entity: 20
max_urls_per_page: 100
crawl_patterns: /news
/blog
/press
/media
/articles
same_domain_only: true
exclude_already_discovered: false
```

## What Good Output Looks Like

**Healthy results:**
- Enterprise company: 50-300 new URLs discovered
- Mid-size company: 10-100 new URLs
- Small company: 0-20 new URLs
- Company with no pool items: 0 URLs (skipped -- not an error)

**Output fields:**
- `url` -- the newly discovered URL
- `found_on` -- which page this link was found on (provenance for downstream modules)
- `link_text` -- the anchor text of the link

**Warning signs:**
- 0 URLs with `skipped_reason: "no pool items"` → no sibling modules have been approved yet. Run Sitemap Parser or Page Links first
- `pages_crawled: 0` with pool items present → `crawl_patterns` is filtering out all URLs. Clear the patterns or add broader ones
- Many entities with 0-3 URLs despite pool items → `exclude_already_discovered` and/or `same_domain_only` are too restrictive
- Very high counts (500+) on a single entity → a listing/directory page is being crawled. The `max_urls_per_page` cap prevents this

## Limitations

- **Pool dependency** -- returns nothing if no sibling modules have been approved. Must run after at least one other discovery module
- **One level only** -- does not recursively follow links. By design -- deeper crawling is exponentially expensive
- **HTML-only link extraction** -- parses raw HTML `<a href>` tags. Links built by JavaScript frameworks won't be found (use browser-crawler for those)
- **No built-in delay** -- crawls sequentially using `tools.http`. Sites that rate-limit aggressively may block some requests
- **Junk filtering is path-based** -- filters images, CDN, and WordPress admin URLs by file extension and path pattern. Unusual junk URL formats may slip through

## What Happens Next

URLs flow into Step 2 where URL Deduplicator removes duplicates across all discovery sources, and URL Relevance scores each URL's value. The `found_on` field provides provenance -- downstream modules know these were second-level links, which can inform relevance scoring. A URL found on `/about` is likely corporate content; a URL found on `/blog` is likely editorial.

## Technical Reference

- **Step:** 1 (Discovery)
- **Category:** crawling
- **Cost tier:** expensive -- up to 30 min timeout, suitable for large-scale crawling across many entities
- **Data operation:** transform (=) -- independent results, merged into pool on approval
- **Required input columns:** `website`
- **Depends on:** `sitemap-parser`, `page-links`, `browser-crawler` (needs pool items from at least one)
- **Input format:** `input.entities[]` with `website` field and `items[]` from working pool
- **Output format:** `results[]` grouped by `entity_name`, each with `items[]` containing `url`, `found_on`, `link_text`
- **Progressive save:** Pushes to `tools._partialItems` after each page crawl -- timeout preserves partial results
- **Junk filtering:** Excludes images (.png/.jpg/.gif/.svg/.webp/.ico), media (.mp4/.mp3), documents (.pdf/.zip), fonts (.woff/.ttf/.eot), code (.css/.js), and WordPress/CDN infrastructure paths
- **Error handling:** Missing pool items = skip (not error). Failed page fetches = warn and continue. Missing `website` = skip with error
