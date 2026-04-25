# URL Canonicalizer

> Resolves redirect chains so every URL in the pool points to its real destination before scraping begins.

**Module ID:** `url-canonicalizer` | **Step:** 2 (Validation) | **Category:** normalization | **Cost:** cheap
**Version:** 1.0.0 | **Data Operation:** transform (=)

---

## What This Module Does

Many websites use redirects -- vanity URLs, path rewrites, www/non-www normalization, HTTP-to-HTTPS upgrades. Discovery modules extract the `href` from HTML, which is often the pre-redirect URL. If the pipeline scrapes that URL, it either follows the redirect silently (wasting a round-trip) or gets a 301 response with no content.

URL Canonicalizer sends a HEAD request to each URL and checks whether the final destination differs from the original. If it does, the URL is replaced with the canonical version. This ensures downstream modules (url-filter, url-relevance, and all scrapers) work with the correct URLs.

It also helps url-dedup catch duplicates that were invisible before -- two different discovery URLs that both redirect to the same page are now identical strings and will be caught on a subsequent dedup pass.

```
url-dedup -> URL CANONICALIZER -> url-filter -> url-relevance -> scraping
```

## When to Use

**Always run when:**
- You're processing any batch of discovered URLs -- redirects are common on virtually every site
- Companies have recently restructured their websites (old paths redirect to new ones)
- Discovery found URLs from sitemap entries, which often contain legacy paths

**Skip when:**
- You've already verified that the target sites don't use redirects (rare)
- Speed is critical and you're willing to let scrapers follow redirects themselves

**Tune the settings when:**
- Target sites are slow to respond -- raise `request_timeout`
- You have hundreds of URLs per entity -- raise `concurrency` for throughput
- You're hitting rate limits on target servers -- lower `concurrency`

## Options Guide

| Option | Default | When to Change | What It Does |
|--------|---------|----------------|--------------|
| `request_timeout` | 5000ms | Raise to 10-15s for slow or Cloudflare-protected sites; lower to 3s for known-fast sites | How long to wait for each HEAD response before giving up |
| `concurrency` | 20 | Lower to 5-10 if target sites rate-limit HEAD requests; raise to 30-50 for large batches against tolerant servers | How many HEAD requests run in parallel per batch |

Both options are straightforward. The defaults work well for most iGaming company sites. The main risk is setting `concurrency` too high against a single domain -- some servers interpret rapid HEAD requests as a scan and start returning 429s. If you see many errors in the output, lower concurrency first.

## Recommended Configurations

### Standard
For most pipeline runs:
```
request_timeout: 5000
concurrency: 20
```

### Conservative
When target sites are slow or rate-limit aggressively:
```
request_timeout: 10000
concurrency: 5
```

### High-Volume
For large batches (500+ URLs) against diverse domains:
```
request_timeout: 5000
concurrency: 40
```

## What Good Output Looks Like

**Healthy result:**
- 5-20% of URLs redirected -- this is normal for most sites
- 0% errors -- HEAD requests rarely fail on live URLs
- All redirected URLs show clear `original_url` → `url` mappings

**Output fields:**
- `url` -- the canonical URL (after redirect resolution). This is what downstream modules will use
- `original_url` -- the URL as discovered. Preserved for transparency
- `status` -- `redirected` (URL was changed) or `unchanged` (URL was already canonical)
- `redirect_detail` -- human-readable description of the redirect (e.g., `https://example.com/old → https://example.com/new`)
- `entity_name` -- which entity this URL belongs to

**Warning signs:**
- 50%+ URLs redirected -- the discovery module may be extracting non-canonical URLs systematically. Check if the sitemap contains outdated entries
- Many errors -- target servers may be blocking HEAD requests. Consider raising `request_timeout` or lowering `concurrency`
- 0% redirected -- not necessarily a problem, but verify with a manual spot-check that redirects are actually being detected (the skeleton's `http.head()` must return `res.url` for this to work)

## Limitations

- **HEAD requests only** -- does not download page content. Some servers handle HEAD differently from GET (rare, but possible)
- **Does not check liveness** -- a URL that times out or returns 500 is kept unchanged. Liveness checking is url-filter's job
- **Trailing slash normalization only** -- the module ignores trailing slash differences when comparing original vs. final URL. Other normalization (www, case) is handled by url-dedup
- **Cannot detect JavaScript redirects** -- only follows HTTP-level redirects (301, 302, 307, 308). Sites that redirect via `window.location` in JavaScript won't be caught
- **Cross-domain redirects are followed** -- if a URL redirects to a completely different domain, the new domain URL is used. This is usually correct (domain migrations) but could be surprising

## What Happens Next

After canonicalization, the corrected URLs flow to **url-filter** for pattern matching and optional status checking, then to **url-relevance** for LLM-based classification. When URLs reach Step 3 (Scraping), they point directly to the real pages -- no redirect overhead, no mismatched paths.

If you run url-dedup again after this module, it will catch any new duplicates that were only visible after redirect resolution (two different discovery URLs pointing to the same canonical page).

## Technical Reference

- **Step:** 2 (Validation)
- **Category:** normalization
- **Cost tier:** cheap -- HEAD requests are lightweight, no body downloaded
- **Data operation:** transform (=) -- same items with URLs potentially updated
- **Required input columns:** `url`
- **Depends on:** url-dedup (should run first to reduce total HEAD requests)
- **Input:** `input.entities[]` with `items[]` from working pool
- **Output:** `{ results[], summary }` grouped by `entity_name`
- **Selectable:** true -- redirected items are flagged for review
- **Error handling:** per-URL try/catch. Failed HEAD requests keep the original URL unchanged -- url-filter handles dead link detection downstream
- **External dependencies:** `tools.http` (HEAD requests), `tools.logger`, `tools.progress`
- **Files:** `manifest.json`, `execute.js`
