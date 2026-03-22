# Seed URL Builder

> Generate and validate candidate URLs from known high-value paths on a company's website.

**Module ID:** `seed-url-builder` | **Step:** 1 (Discovery) | **Category:** website | **Cost:** cheap
**Version:** 1.0.0 | **Data Operation:** add (+)

---

## What This Module Does

Most company websites follow predictable URL conventions. An /about page, a /careers page, a /press or /newsroom section -- these are the pages that carry the highest-value content for building company profiles. Rather than waiting for a sitemap or crawling links, this module probes these paths directly: it appends 28 common high-value paths to the company's base URL, sends HEAD requests (falling back to GET if HEAD is blocked), and returns only the paths that actually exist.

This is a brute-force complement to the smarter discovery modules. Sitemap Parser relies on the site having a valid sitemap. Page Link Extractor relies on the homepage having parseable navigation HTML. Seed URL Builder skips both dependencies and goes straight to "does /about exist?" The trade-off is obvious -- it can only find paths you already know to look for -- but for the standard corporate pages that matter most for iGaming company profiles, this is fast, cheap, and reliable.

Each validated URL is tagged with a `path_type` (about, press, careers, compliance, etc.) that carries through the pipeline. Downstream modules like URL Relevance Filter can use this tag as a high-confidence classification signal -- a URL found at /responsible-gaming is almost certainly about responsible gaming.

## When to Use

**Always use when:**
- Running any company profile pipeline -- it catches pages that sitemaps and navigation extraction miss
- The company might not have a sitemap (small companies, startups)
- You want guaranteed coverage of standard corporate pages

**Skip when:**
- You already have comprehensive URL coverage from sitemap-parser and page-links combined
- The company uses non-English path conventions exclusively (use custom_paths instead)

**Tune when:**
- Working with non-English or unconventional sites -- add paths via custom_paths
- Sites are slow or behind CDNs that rate-limit -- lower max_concurrent, raise request_timeout

## Options Guide

| Option | Default | When to Change | What It Does |
|--------|---------|----------------|--------------|
| `max_concurrent` | 5 | Raise to 10-20 for fast sites with no rate limiting. Lower to 1-2 for fragile or rate-limited servers | How many paths are checked in parallel per entity. Higher = faster but more aggressive |
| `request_timeout` | 5000 ms | Raise to 10000-15000 for slow servers or sites behind CDNs. Lower to 2000-3000 for known-fast sites | Maximum time to wait for each HEAD/GET response before giving up on that path |
| `custom_paths` | (empty) | Add paths for non-English sites (/uber-uns, /entreprise), industry-specific pages (/responsible-gaming/policy), or company-specific sections you know exist | Additional paths to check, one per line. Added to the 28 default paths. Lines starting with # are ignored |
| `include_redirects` | true | Disable if you only want pages that exist at the exact probed path with no redirect | Whether to keep URLs that returned 2xx after following redirects. Most sites redirect /about to /about-us or similar -- keeping redirects catches these |

## Recommended Configurations

### Standard (default)
Best for most company profile research. Checks all 28 default paths with moderate concurrency.
```
max_concurrent: 5
request_timeout: 5000
custom_paths: (empty)
include_redirects: true
```

### Conservative
For fragile servers, rate-limited APIs, or sites that block aggressive requests.
```
max_concurrent: 2
request_timeout: 10000
custom_paths: (empty)
include_redirects: true
```

### Aggressive
For large batches of well-known, fast-responding sites. Faster but risks rate limiting.
```
max_concurrent: 15
request_timeout: 3000
custom_paths: (empty)
include_redirects: true
```

### iGaming-Specific
Extended path list for iGaming operators and B2B suppliers.
```
max_concurrent: 5
request_timeout: 5000
custom_paths:
  /responsible-gaming/policy
  /responsible-gambling/tools
  /games
  /game-portfolio
  /live-casino
  /sportsbook
  /regulation
  /compliance
  /certifications
  /b2b
  /white-label
  /api
  /integration
  /demo
include_redirects: true
```

## What Good Output Looks Like

**Output fields per URL:**
- `url` -- the original candidate URL that was probed (e.g. `https://kindredgroup.com/about`)
- `final_url` -- the URL after redirect following (same as `url` if no redirect occurred)
- `path_type` -- category of the path: `about`, `products`, `press`, `news`, `partners`, `careers`, `contact`, `investors`, `resources`, `compliance`, or `custom`
- `status_code` -- HTTP status code (always 200-299)
- `found_via` -- whether the URL was validated via `head` or `get_fallback`

**Healthy result ranges:**
- Enterprise company: 8-15 valid paths (most standard pages exist)
- Mid-size company: 4-10 valid paths
- Small startup: 2-5 valid paths
- Minimal site: 0-2 valid paths (homepage only -- common for SPA sites)

**Warning signs:**
- 0 URLs for every entity -- the sites might be blocking all automated requests, or they are entirely JavaScript-rendered single-page apps
- All URLs have `found_via: get_fallback` -- the server blocks HEAD requests. Not a problem (GET fallback works), but indicates a more restrictive server configuration
- Very high hit rate (25+ of 28 paths) -- unusual; verify these are not all redirecting to the same page. A site that returns 200 for every path may have a catch-all route

## Limitations

- **No redirect-to-homepage detection** -- If a site redirects /careers to / (the homepage), this module cannot reliably detect that and will include it as a valid URL. The tools.http API follows redirects automatically but does not expose the final URL. Downstream deduplication in Step 2 mitigates this partially
- **English-biased default paths** -- The 28 default paths are English. Non-English sites need custom_paths for their equivalents (/uber-uns, /a-propos, /empresa, etc.)
- **No content validation** -- A 200 response does not guarantee the page has useful content. Some sites return 200 for custom 404 pages (soft 404s). Step 2 validation and Step 4 filtering handle this downstream
- **HEAD request blocking** -- Some servers (especially behind Cloudflare) return 403 or 405 for HEAD requests. The GET fallback handles this, but doubles the request time for those paths
- **Rate limiting** -- Aggressive concurrency (max_concurrent > 10) may trigger rate limiting on protected sites. The module does not implement retry-after handling

## What Happens Next

Validated URLs enter the Step 1 working pool alongside results from Sitemap Parser, Page Link Extractor, and other discovery modules. The `path_type` field carries through the pipeline -- Step 2's URL Relevance Filter can use it as a strong classification signal. A URL tagged `compliance` from the /responsible-gaming path is almost certainly relevant to a company profile's regulatory section.

Step 2 deduplication will merge any URLs found by both this module and sitemap-parser or page-links. The `found_via` field records how each URL was discovered, which helps operators understand which discovery methods are contributing the most.

## Technical Reference

- **Step:** 1 (Discovery)
- **Category:** website
- **Cost:** cheap
- **Data operation:** add (+) -- URLs are added to the working pool on approval
- **Requires:** `website` column in entity data
- **Input:** `input.entities[]` -- each entity must have a `website` field
- **Output:** `results[]` grouped by `entity_name`, each with `items[]` containing `url`, `final_url`, `path_type`, `status_code`, `found_via`
- **Error handling:** Entities without a `website` field are skipped with a warning. Failed requests per path are silently skipped (partial success pattern). Entity-level errors are caught and reported without stopping other entities
- **Dependencies:** None (uses only `tools.http`, `tools.logger`, `tools.progress`)
- **Files:** `manifest.json`, `execute.js`, `README.md`, `CLAUDE.md`

### Default Path List

| Path | Type |
|------|------|
| /about, /about-us, /company, /who-we-are | about |
| /products, /solutions, /platform, /services | products |
| /press, /press-releases, /media, /newsroom | press |
| /news, /blog | news |
| /partners, /affiliates | partners |
| /careers, /jobs | careers |
| /contact, /contact-us | contact |
| /investors, /investor-relations | investors |
| /resources, /case-studies | resources |
| /responsible-gaming, /responsible-gambling, /licenses, /regulatory | compliance |
