# Meta Output

> Generate validated SEO metadata (title, description, keywords, Open Graph, Twitter Card) from pipeline data.

**Module ID:** `meta-output` | **Step:** 8 (Bundling) | **Category:** seo | **Cost:** cheap
**Version:** 1.0.0 | **Data Operation:** transform (=)

---

## Background

### The Content Problem This Solves

Every published page needs SEO metadata: a title within Google's display limit, a description that fits the SERP snippet, keywords that match search intent, and social sharing tags (Open Graph, Twitter Cards) that control how the page appears when shared on social media. Getting these lengths right is critical -- a title over 60 characters gets truncated in search results, a description under 150 characters wastes valuable SERP real estate.

The seo-planner module produces `seo_plan_json` with raw meta title and description, but these need validation against length constraints and assembly with keywords, OG tags, and Twitter Card tags. Doing this manually for dozens of entities is error-prone and tedious.

### How It Fits the Pipeline Architecture

This is a Step 8 Bundling module that uses **data-shape routing**. It requires `seo_plan_json` as its primary input (from seo-planner) and optionally uses `analysis_json` (from content-analyzer) to assemble keywords from categories, tags, and target keywords.

Unlike markdown-output and html-output which focus on content formatting, meta-output focuses purely on SEO metadata. Its output is a validated meta object with warnings for any values that violate length constraints, making it easy for operators to spot and fix SEO issues before publishing.

## Strategy & Role

**Why this module exists:** Validate and assemble SEO metadata from pipeline data. Ensure titles and descriptions meet Google's display limits, assemble keywords from multiple sources, and generate Open Graph and Twitter Card tags -- all in a single validated output.

**Role in the pipeline:** One of five Step 8 output modules. The only module focused on SEO metadata validation. Complements html-output's schema.org JSON-LD with page-level meta tags.

**Relationship to other steps:**
- **Depends on:** seo-planner (produces `seo_plan_json` -- required)
- **Optionally uses:** content-analyzer (provides `analysis_json` for keyword assembly)
- **Sibling modules:** markdown-output, html-output, json-output, company-media

## When to Use

**Always use when:**
- You need validated SEO metadata for published pages
- You want to catch title/description length issues before publishing
- Pages will be shared on social media (Open Graph tags)

**Consider settings carefully when:**
- Your platform has different title/description length requirements than Google's defaults
- Twitter Cards are relevant to your audience -- enable `include_twitter_tags`
- You want keywords from analysis data -- ensure content-analyzer has run

## Options Guide

| Option | Default | When to Change | Impact |
|--------|---------|----------------|--------|
| `max_title_length` | 60 | Raise to 70-80 if targeting Bing (more generous); lower to 50 for strict compliance | Characters above this trigger a "Title too long" warning. Google typically displays 50-60 characters |
| `min_description_length` | 150 | Lower to 100 for short-form content; raise to 155 for strict SERP optimization | Characters below this trigger a "Description too short" warning. Google shows 150-160 characters |
| `max_description_length` | 160 | Raise to 300 for knowledge panel descriptions; lower to 155 for strict SERP | Characters above this trigger a "Description too long" warning |
| `include_keywords_array` | true | Disable if keywords are not used by your CMS or publishing platform | Assembles keywords from categories, tags (existing + suggested), and SEO target keywords (primary, secondary, long-tail) |
| `include_og_tags` | true | Disable if pages will not be shared on social media | Generates og:title, og:description, og:type (always "article") |
| `include_twitter_tags` | false | Enable if pages will be shared on Twitter/X | Generates twitter:card (summary), twitter:title, twitter:description |

## Recipes

### Standard SEO Validation
Google-optimized with Open Graph:
```
max_title_length: 60
min_description_length: 150
max_description_length: 160
include_keywords_array: true
include_og_tags: true
include_twitter_tags: false
```

### Full Social Media
All social tags enabled:
```
max_title_length: 60
min_description_length: 150
max_description_length: 160
include_keywords_array: true
include_og_tags: true
include_twitter_tags: true
```

### Relaxed Validation
For platforms with different display limits:
```
max_title_length: 80
min_description_length: 100
max_description_length: 300
include_keywords_array: true
include_og_tags: true
include_twitter_tags: false
```

### Metadata Only (No Social)
Just title, description, keywords, and slug:
```
max_title_length: 60
min_description_length: 150
max_description_length: 160
include_keywords_array: true
include_og_tags: false
include_twitter_tags: false
```

## Expected Output

**Healthy result:**
- One meta output per entity
- Status `ok` when title and description lengths are within bounds
- Status `warning` when any length constraint is violated
- 5-20 keywords assembled from multiple sources

**Output fields per entity:**
- `entity_name` -- the company/entity name
- `meta_title` -- the SEO title (from seo_plan_json.meta.title, fallback to entity name)
- `meta_description` -- the SEO description (from seo_plan_json.meta.description)
- `title_length` -- character count of the title
- `description_length` -- character count of the description
- `keyword_count` -- number of assembled keywords
- `status` -- `ok` or `warning`
- `meta_json` -- the full meta object as a JSON string (viewable in detail view)

**Full meta object fields:**
- `title` -- meta title
- `description` -- meta description
- `slug` -- URL-safe slug generated from entity name
- `keywords` -- array of assembled keywords (when enabled)
- `og` -- Open Graph tags object (when enabled)
- `twitter` -- Twitter Card tags object (when enabled)
- `warnings` -- array of validation warning messages (when present)

**Keyword assembly sources:**
- Categories: primary and secondary category slugs from analysis_json
- Tags: existing tag slugs + suggested new tag labels from analysis_json
- SEO keywords: primary, secondary (array), and long-tail (array) from seo_plan_json

**Red flags to watch for:**
- Many entities with `status: warning` -- seo-planner may be generating titles/descriptions outside Google limits
- `keyword_count: 0` -- neither analysis_json nor seo_plan_json contained categorization data
- Missing meta_description (empty string) -- seo_plan_json did not include a meta description

## Limitations & Edge Cases

- **Requires seo_plan_json** -- entities without this field are skipped with an error. Run seo-planner first
- **Title fallback to entity name** -- if seo_plan_json.meta.title is missing, the entity name is used. This may exceed the max_title_length for long company names
- **Slug generation is basic** -- uses simple regex to lowercase, strip special characters, and replace spaces with hyphens. Non-ASCII characters may be handled inconsistently
- **OG type is always "article"** -- does not support other Open Graph types (product, website, etc.)
- **Twitter Card is always "summary"** -- does not support summary_large_image, player, or other card types
- **Keywords are not deduplicated across sources** -- the same keyword could appear from both categories and SEO target keywords (though they are stored in a Set, so exact duplicates are removed)
- **No character encoding validation** -- special characters in titles/descriptions are not checked for HTML entity encoding

## What Happens Next

The meta output is a terminal artifact ready for use outside the pipeline. Typical destinations:

- **CMS meta fields** -- populate title, description, and keywords fields in your CMS
- **HTML head tags** -- use the OG and Twitter objects to generate `<meta>` tags in page headers
- **SEO audit** -- review the warnings to identify entities that need manual title/description adjustment
- **API integration** -- feed the meta JSON to publishing APIs

The status/warning system provides an immediate quality gate -- operators can review all warnings in the table view before publishing.

## Technical Reference

- **Step:** 8 (Bundling)
- **Category:** seo
- **Cost:** cheap
- **Data operation:** transform (=) -- metadata extracted and validated
- **Requires columns:** none (reads from pool items, not CSV columns)
- **Depends on:** seo-planner (required)
- **Input:** `input.entities[]` with `items[]` containing `seo_plan_json` and optionally `analysis_json`
- **Output:** `{ results[], summary }` where each result has `entity_name`, `items[]` with `meta_title`, `meta_description`, `title_length`, `description_length`, `keyword_count`, `status`, `meta_json`
- **Selectable:** true -- operators can deselect individual entity outputs
- **Flagged when:** `status` is `warning` (highlighted in the table)
- **Detail view:** header fields (entity_name, status badge, title_length, description_length, keyword_count) and sections for meta_title (text), meta_description (text), meta_json (prose)
- **Dependencies:** `tools.logger`, `tools.progress`
- **Files:** `manifest.json`, `execute.js`
