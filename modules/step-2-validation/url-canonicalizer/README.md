# URL Canonicalizer

> Resolves redirect chains so every URL in the pool points to its real destination before scraping begins, and drops duplicates that only become visible after redirects resolve.

**Module ID:** `url-canonicalizer` | **Step:** 2 (Validation) | **Category:** filtering | **Cost:** cheap
**Version:** 1.1.0 | **Data Operation:** transform (=)

---

## What This Module Does

Many websites use redirects -- vanity URLs, path rewrites, www/non-www normalization, HTTP-to-HTTPS upgrades. Discovery modules extract the `href` from HTML, which is often the pre-redirect URL. If the pipeline scrapes that URL, it either follows the redirect silently (wasting a round-trip) or gets a 301 response with no content.

URL Canonicalizer sends a HEAD request to each URL and checks whether the final destination differs from the original. If it does, the URL is replaced with the canonical version. This ensures downstream modules (url-filter, url-relevance, and all scrapers) work with the correct URLs.

It also deduplicates its own OUTPUT -- when two different discovery URLs both resolve to the same canonical page, the module keeps the first and drops the rest from what it emits (case-insensitive, ignoring trailing slashes). Caveat: under the skeleton's `transform` semantics this does NOT guarantee one pool row per canonical destination. Transform only replaces pool rows whose key or `original_url` appears in the module's output -- a dropped duplicate's pool row is left untouched, so its stale pre-redirect URL can survive in the pool alongside the canonical one. Redirect-alias collapse in the pool is therefore best-effort; genuinely critical dedup still belongs to url-dedup's key-based pass.

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
| `request_timeout` | 5000 | Raise to 10000-15000 for slow or Cloudflare-protected sites; lower to 3000 for known-fast sites (range 1000-15000) | Timeout per HEAD request in milliseconds |
| `concurrency` | 20 | Lower to 5-10 if target sites rate-limit HEAD requests; raise to 30-50 for large batches against tolerant servers (range 1-50) | How many HEAD requests run in parallel per batch |
| `v2_behavior` | false | Set `true` for any auto-execute run (and for the v3 template's R1 slot). Leave `false` only for the legacy v1 template flow | Merge-safe, auto-execute-compatible emit mode — see "v2 behavior" below |

## v2 behavior (v1.1.0)

The v1 (default) emit shape is **incompatible with auto-execute**, for two reasons proven in production (2026-08 forensics: 1213/1262 pool rows re-attributed, `link_text` surviving on 41/1262):

1. **Zero canonicalization applied.** v1 emits redirected items with `status: "redirected"`, which matches the manifest's `flagged_when`. The skeleton's step<6 auto-approval excludes flagged items (`content-pipeline-v2/server/routes/submoduleRuns.js:1177-1190`), so the redirect emit never reaches the pool — the old URL survives and the rewrite is silently discarded.
2. **Provenance destroyed on every other row.** v1 re-emits unchanged rows with a 5-field whitelist (`url`, `original_url`, `status`, `redirect_detail`, `entity_name`). The skeleton's `transform` operation replaces a pool row wholesale with the approved item (`content-pipeline-v2/server/lib/applyDataOperation.js:112-121` — replace, not merge), and approval stamps `source_submodule` on every approved item unconditionally (`submoduleRuns.js:1199-1203`). Result: `found_via`, `source_location`, `link_text`, and original source attribution are wiped from ~96% of rows.

With `v2_behavior: true`:

- **Redirected items** are emitted **unflagged** (`status: "canonicalized"`) with a **full field-spread** — every incoming field survives, plus `url` (the canonical URL), `original_url` (the old URL), and `redirect_from` (durable record of the rewrite). Under `transform`, a single emitted item with `url = new` and `original_url = old` puts **both** keys into the removal set and pushes the item (`applyDataOperation.js:108-121`) — i.e. the emit verifiably produces the add-new + remove-old pair, and auto-approval actually applies it.
- **Unchanged rows are not emitted at all.** This is deliberate, and it is the only shape that provably preserves pool state: a non-emitted row is untouched by `transform` (only emitted keys enter the removal set, `applyDataOperation.js:105-119`; the pass-through case is even called out at `:124-129`). A full-spread re-emit was rejected because (a) `transform` replaces the row rather than merging (`:112-121`), so any accidental field drift overwrites the pool copy, and (b) approval re-stamps `source_submodule: "url-canonicalizer"` on every approved item regardless of what the module emitted (`submoduleRuns.js:1199-1203`) — re-attribution is unavoidable on any re-emit. No emit = no replacement = no re-attribution.
- **Failed HEAD requests (timeout, DNS)** count as unchanged: not emitted, row passes through untouched. Timeouts never drop a row in either mode.
- The module's output-level dedup is **skipped** in v2 mode. Dropping an emit at the module level would leave its old-URL pool row alive (only emitted `original_url`s enter the transform's removal set), so every redirect is emitted. Duplicate canonical rows are collapsed by the skeleton itself (`applyDataOperation.js:130-138`, first occurrence wins), and a redirect whose canonical URL collides with an existing unchanged pool row collapses the two rows into one via the removal set. Net result in all cases: one pool row per canonical URL, with every stale pre-redirect row removed.
- The run summary still reports `unchanged` counts; `output_items` counts emitted rows only, and the description marks unchanged rows as "pool passthrough".

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
- 0% errors -- HEAD requests rarely fail on live URLs (a failed request shows up as `unchanged` with `redirect_detail` starting with `Error:`)
- All redirected URLs show clear `original_url` → `url` mappings
- A small number of deduped items when discovery produced aliases of the same page -- the summary reads like `3 redirected, 2 deduped, 45 unchanged of 50 total → 48 output`

**Output fields:**
- `url` -- the canonical URL (after redirect resolution). This is what downstream modules will use
- `original_url` -- the URL as discovered. Preserved for transparency
- `status` -- `redirected` (URL was changed) or `unchanged` (URL was already canonical)
- `redirect_detail` -- human-readable description of the redirect (e.g., `https://example.com/old → https://example.com/new`), or `Error: <message>` when the HEAD request failed
- `redirect_from` -- (`v2_behavior` only) the pre-redirect URL, kept as a durable record of the rewrite
- `entity_name` -- which entity this URL belongs to

With `v2_behavior: true` the output contains only redirected items (status `canonicalized`, full field-spread); unchanged rows are deliberately absent — see "v2 behavior" above.

The run summary also reports `output_items` (items after dedup) and `deduplicated` (how many rows were dropped because they resolved to a canonical URL already seen).

**Warning signs:**
- 50%+ URLs redirected -- the discovery module may be extracting non-canonical URLs systematically. Check if the sitemap contains outdated entries
- Many errors -- target servers may be blocking HEAD requests. Consider raising `request_timeout` or lowering `concurrency`
- High `deduplicated` count -- discovery is emitting many aliases of the same page (tracking parameters, mirrored paths). Worth checking the discovery module's output before scaling up
- 0% redirected -- not necessarily a problem, but verify with a manual spot-check that redirects are actually being detected (the skeleton's `http.head()` must return `res.url` for this to work)

## Limitations

- **HEAD requests only** -- does not download page content. Some servers handle HEAD differently from GET (rare, but possible)
- **Does not check liveness** -- a URL that times out or returns 500 is kept unchanged. Liveness checking is url-filter's job
- **Redirect detection ignores trailing slashes only** -- when comparing original vs. final URL, only trailing slash differences are ignored (the comparison is case-sensitive). The dedup pass at the end is broader: case-insensitive plus trailing-slash-insensitive on the canonical URL. Pre-redirect normalization (www variants as strings, tracking params) is still url-dedup's job
- **Cannot detect JavaScript redirects** -- only follows HTTP-level redirects (301, 302, 307, 308). Sites that redirect via `window.location` in JavaScript won't be caught
- **Cross-domain redirects are followed** -- if a URL redirects to a completely different domain, the new domain URL is used. This is usually correct (domain migrations) but could be surprising

## What Happens Next

After canonicalization, the corrected URLs flow to **url-filter** for pattern matching and optional status checking, then to **url-relevance** for LLM-based classification. When URLs reach Step 3 (Scraping), they point directly to the real pages -- no redirect overhead, no mismatched paths.

Duplicates that only appear after redirect resolution are removed from this module's OUTPUT, but the dropped alias's own pool row is not replaced by the transform operation and can survive as a stale pre-redirect URL. If redirect-heavy sites matter to your run, keep url-dedup positioned before this module (as in the standard chain) and treat any surviving aliases as candidates for url-filter exclusion patterns.

## Technical Reference

- **Step:** 2 (Validation)
- **Category:** filtering (sort_order 2 -- runs after url-dedup within Step 2)
- **Cost tier:** cheap -- HEAD requests are lightweight, no body downloaded
- **Data operation:** transform (=) -- same items with URLs potentially updated; the canonical dedup pass means the output can contain fewer items than the input
- **Pool precondition:** `requires_items` -- needs URLs in the pool; entities with an empty pool are skipped (`skipped_no_input`), not failed
- **Required input columns:** `url`
- **Depends on:** url-dedup (should run first to reduce total HEAD requests)
- **Input:** `input.entities[]` with `items[]` from working pool
- **Output:** `{ results[], summary }` grouped by `entity_name`; summary includes `output_items` and `deduplicated` counts
- **Selectable:** true -- redirected items are flagged for review
- **Error handling:** per-URL try/catch. Failed HEAD requests keep the original URL unchanged -- url-filter handles dead link detection downstream. Each checked item is pushed to `tools._partialItems`, so a timeout mid-run preserves the batches already completed
- **External dependencies:** `tools.http` (HEAD requests), `tools.logger`, `tools.progress`
- **Files:** `manifest.json`, `execute.js`
