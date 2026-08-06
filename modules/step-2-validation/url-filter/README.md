# URL Pattern Filter

> Filter URLs by include/exclude regex patterns and optional HTTP status validation with a headless-browser retry for bot-protected sites.

**Module ID:** `url-filter` | **Step:** 2 (Validation) | **Category:** filtering | **Cost:** medium
**Version:** 1.0.0 | **Data Operation:** remove (➖)

---

## Background

### The Content Problem This Solves

Discovery modules find everything -- that's their job. But "everything" includes pagination pages (`/page/2`, `/page/3`), tag archives (`/tag/slots`), category listings (`/category/news`), privacy policies, login pages, and other non-content URLs that would waste scraping budget. Before the original Content Creation Master vision of ML-powered validators, the simplest and most reliable way to remove junk URLs is pattern matching.

The Raw Appendix defined this as part of Step 4 (Pre-scrape Link Validation): *"Light rules (regex/path): e.g., `/page\d+`, `/category/`, `/tag/`, `?s=`, `/search`, `/privacy`, `/terms`, `/login`, `/signup`."* These rules were described as "proposed by the labeled set, not hard-coded in advance" -- meaning they should be configurable and evolve based on what operators learn about which URL patterns produce useful content.

### How It Fits the Pipeline Architecture

URL Pattern Filter runs in the Step 2 validation chain after URL Deduplicator and URL Canonicalizer (`sort_order: 3`), and before URL Relevance Filter. It handles rule-based filtering -- deterministic, fast, no API calls required. The chaining order is deliberate:

1. **URL Deduplicator** → removes duplicates (cheapest)
2. **URL Canonicalizer** → normalizes URL forms
3. **URL Pattern Filter** (this module) → removes junk by regex patterns (cheap, deterministic)
4. **URL Relevance Filter** → LLM classification of remaining URLs (most expensive per-URL)

By removing obvious junk patterns before the LLM-based filter, this module saves both token costs and classification time. If 30% of URLs match junk patterns, the URL Relevance Filter processes 30% fewer URLs.

### The Validation Learning Vision

The original Content Creation Master envisioned a sophisticated validation pipeline:
- **Shadow mode** -- log decisions but don't actually filter, to build a labeled dataset
- **Enforce mode** -- only activate per-domain when precision is proven (≥95% precision, ≤2% false reject rate on article pages, across ≥200 samples)
- **Domain-level policies** -- different rules for different site types

This module is the v1 implementation: manual regex patterns configured by the operator. The patterns themselves are the operator's knowledge encoded as rules -- what the Content Creation Master called "rules proposed by the labeled set." As the pipeline processes more companies, operators learn which patterns are reliable and encode them here. Presets for common entity types (Operator, Affiliate, B2B) can be loaded into `exclude_patterns` from the UI.

### Optional HTTP Status Checking

Beyond pattern matching, this module can optionally validate URLs by checking that they respond with a healthy HTTP status. It uses a tiered approach: fast HEAD requests first, then a headless-browser retry for URLs that return 403/429/503 -- statuses that bot-protection systems (Cloudflare and similar) commonly return to plain HTTP clients even when the page is fine in a real browser. This catches dead links (404s, DNS failures, timeouts) without falsely killing bot-protected sites. It's disabled by default because it adds network I/O; enable it for large or stale URL pools where dead-link rates are high.

## Strategy & Role

**Why this module exists:** Remove obviously irrelevant URLs using deterministic regex patterns before the more expensive LLM-based relevance filter. Fast, predictable, and operator-controlled.

**Role in the pipeline:** Rule-based filter in the Step 2 validation chain. Handles exclusions that don't require AI judgment -- pagination, tag pages, legal pages, search results -- plus optional dead-link detection.

**Relationship to siblings:**
- **Runs after:** URL Deduplicator and URL Canonicalizer (declared in `depends_on`; works on the deduplicated, normalized set)
- **Runs before:** URL Relevance Filter (reduces its workload and token cost)
- **Complementary to URL Relevance:** Pattern Filter handles obvious junk (structural URL patterns); Relevance Filter handles judgment calls (is this /blog/post-about-awards relevant to a company profile?)

## When to Use

**Always use when:**
- Discovery produced a large URL pool (500+ URLs) with likely junk patterns
- You know specific URL patterns to exclude for your content type
- You want to reduce the URL count before the LLM-based relevance filter

**Skip when:**
- The URL pool is small and already curated
- You prefer to let the URL Relevance Filter handle everything (it can, but costs more tokens)

**Run before URL Relevance Filter** to reduce its input size and cost.

## Options Guide

| Option | Default | When to Change | Impact |
|--------|---------|----------------|--------|
| `exclude_patterns` | "" (none) | Add patterns for known junk URL types. One regex per line. Presets available in the UI for common entity types (Operator, Affiliate, B2B) | URLs matching *any* exclude pattern are removed. Common patterns: `/page/\d+`, `/tag/`, `/category/`, `/search`, `/privacy`, `/terms`, `/login`. Matching is case-insensitive |
| `include_patterns` | "" (none) | Set when you only want URLs matching specific patterns -- everything else is excluded | If set, only matching URLs survive. Use for focused extraction (e.g., only `/about`, `/company`, `/partners`). Case-insensitive |
| `check_status_codes` | false | Enable when you suspect many dead links (old discovery data, sites with frequent URL changes) | Sends HEAD requests (batched 20 concurrent, 3s timeout each). 2xx/3xx = kept; 403/429/503 = retried with a headless browser to rule out bot protection; anything else (404, 5xx, network error) = removed as a dead link |

Exclude patterns are checked first; if a URL matches both an exclude and an include pattern, it's excluded. Invalid regex lines are skipped with a logged warning -- they never abort the run, so check the logs if a pattern seems to have no effect.

## Recipes

### Standard iGaming Profile Cleanup
Remove common junk patterns for iGaming company sites:
```
exclude_patterns:
/page/\d+
/tag/
/category/
/author/
/search
/privacy
/terms
/login
/signup
/cart
/checkout
/my-account
\?s=
/feed/
/wp-json/
/wp-content/
include_patterns: ""
check_status_codes: false
```

### News Content Only
Keep only news/blog/press URLs:
```
exclude_patterns: ""
include_patterns:
/news
/blog
/press
/article
/post
/media
check_status_codes: false
```

### Corporate Pages Only
Keep only corporate information pages:
```
exclude_patterns: ""
include_patterns:
/about
/company
/team
/leadership
/partner
/investor
/career
/contact
/press
check_status_codes: false
```

### Full Validation (with dead link check)
Maximum filtering including HTTP status validation:
```
exclude_patterns:
/page/\d+
/tag/
/category/
/author/
/search
/privacy
/terms
include_patterns: ""
check_status_codes: true
```

## How the Status Check Works

When `check_status_codes` is enabled, filtering runs in two tiers after pattern matching:

1. **HEAD sweep** -- all pattern-passed URLs are HEAD-requested in batches of 20 with a 3-second timeout each. Status 200-399 keeps the URL. Status 403, 429, or 503 queues it for the browser retry. Any other status or a network error removes it as a dead link.
2. **Browser retry** -- queued URLs are fetched with a headless browser (batches of 2, 15s timeout, waits for network idle) under a **120-second total time budget**. A URL survives the retry if the page has no known bot-challenge markers (Cloudflare "Checking your browser" / "Just a moment..." style pages) AND either returns 2xx/3xx or delivers a substantial body (>1,000 characters) -- the latter catches sites that pass the challenge but still report an odd status. Challenge markers, small error bodies, and browser crashes all confirm the URL as dead.

If the 120s budget runs out before all retries finish, the remaining unchecked URLs are **kept optimistically** (they were only suspected, never confirmed dead) and a warning is logged. This means bot-protected sites are never mass-removed just because the retry queue was long.

## Expected Output

**Healthy result:**
- With standard exclude patterns: 10-40% of URLs removed (junk patterns)
- With include patterns: may remove 50-80% (keeping only matching URLs)
- With status check: additional 5-15% removed as dead links

**Output fields per URL:**
- `url` -- the URL that survived filtering
- `status` -- always `kept` (excluded and dead URLs are removed from the output entirely, not listed)
- `matched_pattern` -- always null for kept items (reserved field in the schema)
- `entity_name` -- which entity this URL belongs to

**Where the removals show up:** the run summary carries the counts -- `kept`, `excluded`, `dead_links`, and a description like "214 kept, 96 removed (80 excluded by pattern, 16 dead links) of 310 total". Individual removed URLs are visible in the run logs (each exclusion and dead link is logged with its reason), not in the result table.

**Display behavior:** Results are a selectable table of kept items. The remove (➖) data operation means only approved items stay in the working pool; operators can deselect kept URLs in the UI before approving.

**Red flags to watch for:**
- 0 excluded → patterns may not match the URL formats in the pool. Check regex syntax and the logs for "Invalid regex pattern" warnings
- 90%+ excluded → patterns are too aggressive. Review the exclusion log lines to see what's being removed
- Many dead links in the summary → site may have undergone restructuring since discovery. Consider re-running Step 1
- "Browser retry budget exceeded" warning → many URLs hit bot protection; the unchecked remainder was kept optimistically, so expect some dead URLs to reach Step 3

## Limitations & Edge Cases

- **Regex only** -- No semantic understanding. A URL like `/partners-in-crime` would match the pattern `/partners` even though it's not a partnerships page. The URL Relevance Filter handles semantic judgment
- **No DOM/content signals** -- Unlike the full validator vision from the Content Creation Master (which included `<article>` presence, text length, paragraph/link counts), this module only looks at the URL string (plus, optionally, HTTP status). Content-aware filtering happens post-scrape in Step 4
- **Removed URLs aren't reviewable in the result table** -- excluded and dead URLs are dropped from the output, so an operator can't un-remove a single URL from the UI; loosen the patterns and re-run instead
- **HEAD can lie** -- some servers reject HEAD but serve GET fine. Only 403/429/503 get the browser second opinion; a site that answers HEAD with 404 or 405 is removed as dead
- **Challenge markers are Cloudflare-centric** -- the browser retry recognizes Cloudflare-style challenge pages; other CDN challenge systems may slip through via the >1,000-character body heuristic or be misjudged
- **No domain-level policies** -- The original vision included per-domain rule sets with promotion thresholds. Current implementation uses the same patterns for all URLs
- **Pattern order doesn't matter** -- Exclude patterns are checked first. If a URL matches both an exclude and include pattern, it's excluded
- **Items without a `url` field are skipped** with a logged warning, not failed

## What Happens Next

After pattern filtering, the remaining URLs flow to **URL Relevance Filter** -- the LLM-based classifier that determines KEEP/MAYBE/DROP for each URL based on its path, link text, and source location. This is the final Step 2 gate before URLs proceed to Step 3 (Scraping).

The original Content Creation Master envisioned the pre-scrape validation step producing scored decisions with fields: `decision` (allow/reject), `score` (0-1), `reason` array, `validator_version`, and `domain_policy`. The current URL Pattern Filter produces a simplified version: kept items plus removal counts in the summary. The richer scoring model is part of the calibration roadmap.

## Technical Reference

- **Step:** 2 (Validation) -- `sort_order: 3` within the step
- **Category:** filtering
- **Cost tier:** medium -- 5-minute timeout tier; the status check does real network I/O (HEAD batches + browser retries)
- **Data operation:** remove (➖) -- only kept items survive approval; excluded and dead URLs leave the working pool
- **Pool precondition:** `requires_items` -- needs URLs in the pool for the entity; an empty pool marks the entity `skipped_no_input`, not failed
- **Required input columns:** `url`
- **Depends on:** `url-dedup`, `url-canonicalizer`
- **Input format:** `input.entities[]` -- grouped (`{ name, items: [{ url, ... }] }`) or flat (`{ url, ... }` per entity); both are flattened with entity association preserved
- **Output format:** `results[]` grouped by `entity_name`, each with `items[]` (kept URLs) and per-entity `meta`; top-level `summary` with `total_entities`, `total_items`, `kept`, `excluded`, `dead_links`, `description`
- **Selectable:** true -- operators pick which kept items to approve in the UI
- **Error handling:** invalid regex patterns skipped with a warning (not fatal); HEAD failures/timeouts treated as dead links; 403/429/503 escalate to browser retry; browser crashes count the URL as dead without re-retrying; browser-retry time budget (120s) exceeded → remaining URLs kept optimistically
- **Timeout resilience:** LIMITED -- the only `tools._partialItems` push happens at the very end of execution (just before the final return), so a timeout/abort during the HEAD sweep or browser-retry loop saves nothing. (Known gap vs repo Rule 10, which calls for a push after each successful batch)
- **Dependencies:** `tools.http` and `tools.browser` (both only when `check_status_codes` enabled), `tools.logger`, `tools.progress`
- **Files:** `manifest.json`, `execute.js`
