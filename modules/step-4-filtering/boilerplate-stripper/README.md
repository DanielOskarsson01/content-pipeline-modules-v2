# Boilerplate Stripper

> Removes navigation menus, cookie banners, footer disclaimers, and repeated boilerplate from scraped text so downstream LLM steps work from clean source material.

**Module ID:** `boilerplate-stripper` | **Step:** 4 (Filtering) | **Category:** filtering | **Cost:** cheap
**Version:** 1.0.0 | **Data Operation:** transform (=)

---

## What This Module Does

Scraped web pages carry significant amounts of boilerplate -- navigation menus, cookie banners, footer disclaimers, newsletter signup CTAs, social sharing widgets, and copyright notices. This text is identical (or near-identical) across every page on a site and adds no informational value. If passed to downstream LLM steps, it wastes tokens, confuses classifiers, and degrades content quality.

The Boilerplate Stripper removes this noise using two complementary strategies. First, **cross-page fingerprinting**: it groups all scraped pages belonging to the same entity, splits each page into text blocks (paragraphs), hashes them, and identifies blocks that appear on a configurable fraction of pages. Blocks that show up on 50%+ of pages are almost certainly navigation, headers, or footers -- not article content. Second, **known-pattern matching**: a curated list of common boilerplate phrases (cookie consent, GDPR notices, newsletter CTAs, social sharing prompts, navigation artifacts) catches boilerplate even on single-page entities where cross-page analysis is impossible. Pattern matching only applies to blocks between `min_block_length` and 300 characters -- a long paragraph *discussing* a privacy policy or terms of service is substantive content, not boilerplate, and is never pattern-stripped.

The module outputs the same items it receives with all input fields preserved, `text_content` cleaned, `word_count` recalculated, and new fields (`stripped_chars`, `boilerplate_ratio`, `flagged`) added. **Over-stripping is self-correcting:** if cleaning would leave an item below `min_content_ratio` of its original length, the item is flagged AND its original text is restored -- downstream steps always receive usable content, never a gutted page. Flagged items report `stripped_chars: 0` and `boilerplate_ratio: 0` because nothing was actually removed.

```
page-scraper (Step 3) -> BOILERPLATE STRIPPER -> Step 5 generation modules
```

## When to Use

**Always run when:**
- Scraped content comes from real websites (Step 3 scrapers). Boilerplate in scraped text is the norm, not the exception.
- Downstream steps feed `text_content` into LLMs -- every stripped block is tokens saved on every later call.

**Skip when:**
- Your source already produces clean text (e.g., API responses that were never HTML, structured feeds).
- Text was extracted by a reader-mode algorithm you trust to have removed chrome already.

**Tune the settings when:**
- Entities have many pages (5+): lower `frequency_threshold` toward 0.3 for more aggressive cross-page stripping.
- Entities are single-page: only known-pattern stripping applies -- tune `strip_known_patterns` and `min_block_length`, the frequency options are inert.
- Many items come back flagged: raise `frequency_threshold` or `min_block_length` so less is stripped in the first place.

## Options Guide

| Option | Default | Type | When to Change | What It Does |
|--------|---------|------|----------------|--------------|
| `frequency_threshold` | 0.5 | number (0.3--1.0) | Lower toward 0.3 for aggressive stripping on heavy-boilerplate sites; raise toward 1.0 to be conservative | Fraction of an entity's pages a block must appear on to be considered boilerplate. At 0.5, a block appearing on half or more pages is stripped. Two-page entities always require 100% (both pages) regardless of this setting. |
| `min_block_length` | 20 | number (5--100) | Raise if short legitimate content is being stripped | Minimum characters (after normalization) for a block to be fingerprinted or pattern-matched. Shorter blocks are ignored by both strategies -- too small to identify reliably. |
| `min_content_ratio` | 0.3 | number (0.1--0.9) | Lower if you expect genuinely heavy boilerplate (0.4+ ratios); raise if you want the safety net to trip earlier | The over-strip guard. If cleaned content would fall below this fraction of original length, the item is flagged and its **original text is kept** -- the stripping is reverted for that item, not just marked. |
| `strip_known_patterns` | true | boolean | Disable if known patterns are removing legitimate content | When enabled, removes blocks matching common boilerplate phrases (cookie banners, GDPR, newsletter CTAs, social sharing, navigation artifacts, copyright lines) regardless of cross-page frequency. Only applies to blocks of `min_block_length`--300 characters. |

The most impactful option is `frequency_threshold` -- it drives nearly all stripping on multi-page entities. The most misunderstood is `min_content_ratio`: it is a revert-and-flag guard, not a marker. Setting it high (0.7+) means moderately boilerplate-heavy pages get NO cleaning at all, because the guard trips and restores the original text.

## Recommended Configurations

### Standard
For most pipeline runs with default entities:
```json
{
  "frequency_threshold": 0.5,
  "min_block_length": 20,
  "min_content_ratio": 0.3,
  "strip_known_patterns": true
}
```

### Conservative
When you are worried about removing real content:
```json
{
  "frequency_threshold": 0.8,
  "min_block_length": 40,
  "min_content_ratio": 0.5,
  "strip_known_patterns": false
}
```

### Aggressive
Heavy boilerplate sites, many pages per entity:
```json
{
  "frequency_threshold": 0.3,
  "min_block_length": 10,
  "min_content_ratio": 0.15,
  "strip_known_patterns": true
}
```

## What Good Output Looks Like

**Typical boilerplate_ratio ranges:**
- 0.00--0.05: Very little boilerplate found (already clean, single-page entity with no pattern matches, or a flagged item -- flagged items always report 0)
- 0.05--0.20: Normal range for well-structured sites
- 0.20--0.40: Heavy boilerplate -- common for sites with large navs, mega-menus, extensive footers
- 0.40+: Unusually high -- verify real content survived; anything higher would normally trip the `min_content_ratio` guard

The run summary reports pages cleaned, total characters stripped, average boilerplate percentage, and the flagged count.

**Output fields per item** (all input fields are preserved; these are updated or added):

| Field | Type | Description |
|-------|------|-------------|
| `url` | string | The page URL (unchanged from input) |
| `text_content` | string | Cleaned text with boilerplate removed -- or the untouched original text if the item was flagged |
| `word_count` | number | Recalculated word count for the final text |
| `stripped_chars` | number | Characters removed; 0 for flagged items (stripping was reverted) |
| `boilerplate_ratio` | number | Fraction of original content removed (0.0--1.0); 0 for flagged items |
| `flagged` | boolean | True if cleaning would have cut content below `min_content_ratio` -- original text was kept, shown as a badge in the item detail view |

Cleaned `text_content` is downloadable per item as a `.txt` file ("Cleaned Text").

**Warning signs:**
- **Many flagged items** -- stripping is too aggressive for this entity set; those items received NO cleaning. Raise `frequency_threshold` or `min_block_length`, or lower `min_content_ratio` if the heavy stripping is actually correct.
- **boilerplate_ratio near 0 across a multi-page entity** -- the scraper may be emitting text without double-newline paragraph breaks, so no blocks can be isolated. Inspect a raw `text_content` and check the upstream scraper.
- **Log line "single page -- cross-page analysis skipped"** on entities you expected to have many pages -- upstream discovery/scraping delivered fewer pages than expected; only pattern matching ran.
- **Log warning "Skipping entity with no items and no url"** -- an upstream module produced a malformed entity; it passes through unprocessed.

## Limitations

- **Single-page entities** get pattern matching only -- no cross-page fingerprinting is possible. If the entity has unusual boilerplate that does not match known patterns, it will not be caught.
- **Two-page entities** use a 100% frequency threshold (both pages must have the block). This is deliberately conservative to avoid stripping content that happens to appear on both pages legitimately.
- **Block boundary sensitivity**: the module splits on double newlines. If the scraper outputs boilerplate glued to real content in a single paragraph (no newline separation), the boilerplate will not be isolated and will survive stripping.
- **Pattern matching caps at 300 characters**: boilerplate blocks longer than 300 characters (e.g., a full-length legal footer paragraph) are never pattern-stripped -- only cross-page fingerprinting can catch them.
- **Pattern list is English-only**: the known boilerplate patterns are English phrases. Non-English boilerplate will only be caught by cross-page fingerprinting.
- **No semantic analysis**: the module uses text frequency and substring matching, not LLM classification. It cannot distinguish a legitimately repeated paragraph (e.g., a company tagline on every page) from boilerplate.
- **Empty pages pass through empty**: items with no `text_content` are emitted with empty text, `word_count: 0`, and `flagged: false` -- they are not dropped and not flagged.

## What Happens Next

After boilerplate stripping, the cleaned `text_content` flows to Step 5 (Generation) where LLMs classify, summarize, and generate content from the source material. Cleaner input text means fewer wasted tokens, more accurate classification, and higher-quality generated content. Flagged items still carry their full original text, so downstream steps are never starved -- but their content is uncleaned, which is worth remembering when reviewing generation quality for those entities.

## Technical Reference

- **Step:** 4 (Filtering)
- **Category:** filtering
- **Cost tier:** cheap -- 2-minute timeout; pure in-memory transform, no network I/O or LLM calls
- **Data operation:** transform (=) -- same items in, same items out with cleaner text; keyed by `url`
- **Pool precondition:** `requires_items` -- entities with an empty pool are skipped (`skipped_no_input`), not failed
- **Required input columns:** `text_content`
- **Depends on:** `page-scraper`
- **Input format:** `entity.items[]` with `url` + `text_content`; a flat entity carrying its own `url` acts as a single item; entities with neither are skipped with a logged warning
- **Output format:** input items spread through with cleaned `text_content`, recalculated `word_count`, plus `stripped_chars`, `boilerplate_ratio`, `flagged`; per-entity meta reports `total`, `boilerplate_blocks_found`, `total_stripped_chars`, `flagged`
- **Error handling:** no network I/O, so no retries or circuit breakers; the `min_content_ratio` guard reverts over-stripped items to their original text; every processed item is pushed to `tools._partialItems`, so a timeout or abort preserves partial results; the summary `errors` array is always empty
- **External dependencies:** none -- djb2 string hash implemented inline, no npm packages, no env vars
- **Algorithm details:** blocks split on double newlines; normalization = lowercase + collapse whitespace + trim; per-page dedupe before counting so a block repeated within one page counts once; cross-page threshold `ceil(pageCount * frequency_threshold)` with special handling for 1-page (skip fingerprinting) and 2-page (require 100% match) entities; known-pattern window is `min_block_length`--300 normalized characters
