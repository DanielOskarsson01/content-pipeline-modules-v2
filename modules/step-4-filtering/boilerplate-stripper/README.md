# Boilerplate Stripper

**Module ID:** `boilerplate-stripper` | **Step:** 4 (Filtering) | **Category:** filtering | **Cost:** cheap | **Data operation:** transform (same items, cleaned content)

---

## What This Module Does

Scraped web pages carry significant amounts of boilerplate -- navigation menus, cookie banners, footer disclaimers, newsletter signup CTAs, social sharing widgets, and copyright notices. This text is identical (or near-identical) across every page on a site and adds no informational value. If passed to downstream LLM steps, it wastes tokens, confuses classifiers, and degrades content quality.

The Boilerplate Stripper removes this noise using two complementary strategies. First, **cross-page fingerprinting**: it groups all scraped pages belonging to the same entity, splits each page into text blocks (paragraphs), hashes them, and identifies blocks that appear on a configurable fraction of pages. Blocks that show up on 50%+ of pages are almost certainly navigation, headers, or footers -- not article content. Second, **known-pattern matching**: a curated list of common boilerplate phrases (cookie consent, GDPR notices, newsletter CTAs, social sharing prompts, navigation artifacts) catches boilerplate even on single-page entities where cross-page analysis is impossible.

The module outputs the same items it receives, with `text_content` cleaned, `word_count` recalculated, and new fields (`stripped_chars`, `boilerplate_ratio`, `flagged`) added. Items where stripping removed an unusually large proportion of content are flagged for human review but never dropped -- the operator decides what to do with edge cases.

## When to Use

- **Always run** after scraping (Step 3) and before content analysis (Step 5). Boilerplate in scraped text is the norm, not the exception.
- **Skip** only if your scraper already produces perfectly clean text (rare) or if you are processing structured data that was never HTML.
- **Tune** the frequency threshold and pattern matching based on your entity set. Sites with many pages benefit most from cross-page analysis. Single-page entities rely entirely on pattern matching.

## Options Guide

| Option | Default | Type | When to Change | What It Does |
|--------|---------|------|----------------|--------------|
| `frequency_threshold` | 0.5 | number (0.3--1.0) | Lower to be more aggressive, raise to be more conservative | Fraction of an entity's pages a block must appear on to be considered boilerplate. At 0.5, a block appearing on half or more pages is stripped. |
| `min_block_length` | 20 | number (5--100) | Raise if short legitimate content is being stripped | Minimum characters for a block to be fingerprinted. Blocks shorter than this are ignored during cross-page analysis (too short to reliably identify). |
| `min_content_ratio` | 0.3 | number (0.1--0.9) | Lower if you expect heavy boilerplate, raise if flagging too many items | If cleaned content is below this fraction of original length, the item is flagged. Does not prevent stripping -- just marks items for review. |
| `strip_known_patterns` | true | boolean | Disable if known patterns are removing legitimate content | When enabled, removes blocks matching common boilerplate phrases (cookie banners, GDPR, newsletter CTAs, social sharing) regardless of cross-page frequency. |

## Recommended Configurations

**Standard** (default -- good for most entity sets):
```json
{
  "frequency_threshold": 0.5,
  "min_block_length": 20,
  "min_content_ratio": 0.3,
  "strip_known_patterns": true
}
```

**Conservative** (when you are worried about removing real content):
```json
{
  "frequency_threshold": 0.8,
  "min_block_length": 40,
  "min_content_ratio": 0.5,
  "strip_known_patterns": false
}
```

**Aggressive** (heavy boilerplate sites, many pages per entity):
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
- 0.00--0.05: Very little boilerplate found (already clean or single-page entity with no pattern matches)
- 0.05--0.20: Normal range for well-structured sites
- 0.20--0.40: Heavy boilerplate -- common for sites with large navs, mega-menus, extensive footers
- 0.40+: Unusually high -- check flagged items to verify real content was not stripped

**Output fields per item:**

| Field | Type | Description |
|-------|------|-------------|
| `url` | string | The page URL (unchanged from input) |
| `text_content` | string | Cleaned text with boilerplate removed |
| `word_count` | number | Recalculated word count after cleaning |
| `stripped_chars` | number | Number of characters removed |
| `boilerplate_ratio` | number | Fraction of original content that was boilerplate (0.0--1.0) |
| `flagged` | boolean | True if cleaned content fell below `min_content_ratio` of original |

## Limitations

- **Single-page entities** get pattern matching only -- no cross-page fingerprinting is possible. If the entity has unusual boilerplate that does not match known patterns, it will not be caught.
- **Two-page entities** use a 100% frequency threshold (both pages must have the block). This is deliberately conservative to avoid stripping content that happens to appear on both pages legitimately.
- **Block boundary sensitivity**: the module splits on double newlines. If the scraper outputs boilerplate glued to real content in a single paragraph (no newline separation), the boilerplate will not be isolated and will survive stripping.
- **Pattern list is English-only**: the known boilerplate patterns are English phrases. Non-English boilerplate will only be caught by cross-page fingerprinting.
- **No semantic analysis**: the module uses text frequency and substring matching, not LLM classification. It cannot distinguish a legitimately repeated paragraph (e.g., a company tagline on every page) from boilerplate.

## What Happens Next

After boilerplate stripping, the cleaned `text_content` flows to Step 5 (Analysis & Generation) where LLMs classify, summarize, and generate content from the source material. Cleaner input text means fewer wasted tokens, more accurate classification, and higher-quality generated content.

## Technical Reference

- **Input**: `entity.items[]` with `url`, `text_content`, `word_count` from Step 3 scraping
- **Output**: same items with cleaned `text_content`, updated `word_count`, plus `stripped_chars`, `boilerplate_ratio`, `flagged`
- **Hash function**: djb2 (simple, fast string hash -- no crypto dependency)
- **Block splitting**: double newlines (`\n\n`)
- **Normalization**: lowercase, collapse whitespace, trim
- **Cross-page threshold**: configurable, with special handling for 1-page (skip) and 2-page (require 100% match) entities
