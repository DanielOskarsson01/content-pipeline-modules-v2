# URL Pattern Filter

> Filter URLs by include/exclude regex patterns and HTTP status code validation.

**Module ID:** `url-filter` | **Step:** 2 (Validation) | **Category:** filtering | **Cost:** cheap
**Version:** 1.0.0 | **Data Operation:** remove (➖)

---

## Background

### The Content Problem This Solves

Discovery modules find everything — that's their job. But "everything" includes pagination pages (`/page/2`, `/page/3`), tag archives (`/tag/slots`), category listings (`/category/news`), privacy policies, login pages, and other non-content URLs that would waste scraping budget. Before the original Content Creation Master vision of ML-powered validators, the simplest and most reliable way to remove junk URLs is pattern matching.

The Raw Appendix defined this as part of Step 4 (Pre-scrape Link Validation): *"Light rules (regex/path): e.g., `/page\d+`, `/category/`, `/tag/`, `?s=`, `/search`, `/privacy`, `/terms`, `/login`, `/signup`."* These rules were described as "proposed by the labeled set, not hard-coded in advance" — meaning they should be configurable and evolve based on what operators learn about which URL patterns produce useful content.

### How It Fits the Pipeline Architecture

URL Pattern Filter is the second module in the Step 2 validation chain, running after URL Deduplicator and before URL Relevance Filter. It handles rule-based filtering — deterministic, fast, no API calls required. The chaining order is deliberate:

1. **URL Deduplicator** → removes duplicates (cheapest)
2. **URL Pattern Filter** (this module) → removes junk by regex patterns (cheap, deterministic)
3. **URL Relevance Filter** → LLM classification of remaining URLs (most expensive per-URL)

By removing obvious junk patterns before the LLM-based filter, this module saves both token costs and classification time. If 30% of URLs match junk patterns, the URL Relevance Filter processes 30% fewer URLs.

### The Validation Learning Vision

The original Content Creation Master envisioned a sophisticated validation pipeline:
- **Shadow mode** — log decisions but don't actually filter, to build a labeled dataset
- **Enforce mode** — only activate per-domain when precision is proven (≥95% precision, ≤2% false reject rate on article pages, across ≥200 samples)
- **Domain-level policies** — different rules for different site types

This module is the v1 implementation: manual regex patterns configured by the operator. The patterns themselves are the operator's knowledge encoded as rules — what the Content Creation Master called "rules proposed by the labeled set." As the pipeline processes more companies, operators learn which patterns are reliable and encode them here.

### Optional HTTP Status Checking

Beyond pattern matching, this module can optionally validate URLs by sending HTTP requests to verify they return 200. The Content Creation Master described this in Step 4: *"HTTP status check, content-type verification."* This catches dead links, redirects to error pages, and URLs that have been removed since discovery. It's disabled by default because it's slow (one HTTP request per URL) and better suited for large batches where dead link rates are high.

## Strategy & Role

**Why this module exists:** Remove obviously irrelevant URLs using deterministic regex patterns before the more expensive LLM-based relevance filter. Fast, predictable, and operator-controlled.

**Role in the pipeline:** Second filter in the Step 2 validation chain. Handles rule-based exclusions that don't require AI judgment — pagination, tag pages, legal pages, search results.

**Relationship to siblings:**
- **Runs after:** URL Deduplicator (works on deduplicated set)
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
| `exclude_patterns` | "" (none) | Add patterns for known junk URL types. One regex per line | URLs matching *any* exclude pattern are removed. Common patterns: `/page/\d+`, `/tag/`, `/category/`, `/search`, `/privacy`, `/terms`, `/login` |
| `include_patterns` | "" (none) | Set when you only want URLs matching specific patterns — everything else is excluded | If set, only matching URLs survive. Use for focused extraction (e.g., only `/about`, `/company`, `/partners`) |
| `check_status_codes` | false | Enable when you suspect many dead links (old discovery data, sites with frequent URL changes) | Sends HTTP GET to every URL. Dramatically slower but catches dead links (404, 500, timeout). Mark as `dead_link` status |

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

## Expected Output

**Healthy result:**
- With standard exclude patterns: 10-40% of URLs removed (junk patterns)
- With include patterns: may remove 50-80% (keeping only matching URLs)
- With status check: additional 5-15% removed as dead links

**Output fields per URL:**
- `url` — the URL being evaluated
- `status` — `kept`, `excluded`, or `dead_link`
- `matched_pattern` — which pattern matched (for excluded), HTTP status (for dead links), or null (for kept)
- `entity_name` — which entity this URL belongs to

**Display behavior:** Results sorted with excluded/dead items first (shown in red, auto-deselected). The remove (➖) data operation means flagged items are excluded from the pool when approved. Operators can override any decision via the selectable UI.

**Red flags to watch for:**
- 0 excluded → patterns may not match the URL formats in the pool. Check regex syntax
- 90%+ excluded → patterns are too aggressive. Review what's being removed
- Many `dead_link` results → site may have undergone restructuring since discovery. Consider re-running Step 1
- Include patterns removing everything → patterns too narrow. Broaden or remove

## Limitations & Edge Cases

- **Regex only** — No semantic understanding. A URL like `/partners-in-crime` would match the pattern `/partners` even though it's not a partnerships page. The URL Relevance Filter handles semantic judgment
- **No DOM/content signals** — Unlike the full validator vision from the Content Creation Master (which included `<article>` presence, text length, paragraph/link counts), this module only looks at the URL string. Content-aware filtering is planned for post-scrape Step 4
- **HTTP status checking is slow** — Uses HTTP GET (not HEAD, as `tools.http` doesn't support HEAD). One request per URL. For 1,000 URLs at 500ms each = ~8 minutes
- **No domain-level policies** — The original vision included per-domain rule sets with promotion thresholds. Current implementation uses the same patterns for all URLs. Domain-aware filtering could be a future enhancement
- **Pattern order doesn't matter** — Exclude patterns are checked first. If a URL matches both an exclude and include pattern, it's excluded

## What Happens Next

After pattern filtering, the remaining URLs flow to **URL Relevance Filter** — the LLM-based classifier that determines KEEP/MAYBE/DROP for each URL based on its path, link text, and source location. This is the final Step 2 gate before URLs proceed to Step 3 (Scraping).

The original Content Creation Master envisioned the pre-scrape validation step producing scored decisions with fields: `decision` (allow/reject), `score` (0-1), `reason` array, `validator_version`, and `domain_policy`. The current URL Pattern Filter produces a simplified version: `status` (kept/excluded/dead_link) with `matched_pattern`. The richer scoring model is part of the calibration roadmap.

## Technical Reference

- **Step:** 2 (Validation)
- **Category:** filtering
- **Cost:** cheap (expensive if `check_status_codes` enabled)
- **Data operation:** remove (➖) — items marked `excluded` or `dead_link` are removed from the working pool; `kept` items remain
- **Requires:** `url` field in input items
- **Input:** `input.entities[]` with `items[]` from previous sibling's approved output (grouped format) or flat URL list
- **Output:** `results[]` grouped by `entity_name`, each with `items[]` containing `url`, `status`, `matched_pattern`, `entity_name`
- **Selectable:** true — operators can override filter decisions in the UI
- **Error handling:** Invalid regex patterns are skipped with a warning (logged, not fatal). HTTP check failures are marked as `dead_link`
- **Dependencies:** `tools.http` (only when `check_status_codes` enabled), `tools.logger`
- **Files:** `manifest.json`, `execute.js`
