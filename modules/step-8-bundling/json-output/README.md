# JSON Output

> Assemble structured JSON per entity from all available pipeline data shapes (analysis, SEO plan, content).

**Module ID:** `json-output` | **Step:** 8 (Bundling) | **Category:** data | **Cost:** cheap
**Version:** 1.0.0 | **Data Operation:** transform (=)

---

## Background

### The Content Problem This Solves

The pipeline produces multiple data shapes across different steps: `content_markdown` from content-writer, `analysis_json` from content-analyzer (categories, tags, key facts, citations), and `seo_plan_json` from seo-planner (keywords, meta, FAQs). These are scattered across pool items. For CMS import, API integration, or data analysis, all of this information needs to be assembled into a single structured JSON object per entity with predictable field names.

Different consumers need different structures. A Strapi CMS import needs flat category slugs and a `content` field. A data analysis workflow needs the raw nested objects. This module supports both through configurable output formats.

### How It Fits the Pipeline Architecture

This is a Step 8 Bundling module that uses **data-shape routing**. Unlike markdown-output and html-output which primarily need `content_markdown`, json-output can work with **any combination** of the three data shapes. If only analysis_json is available, it produces a JSON with just categories, tags, and key facts. If all three shapes are present, it assembles the full structure.

The module supports two output formats: `strapi` (CMS-optimized with flat field names) and `flat` (raw nested objects for data analysis). It also prefers AI-written content items over raw scraped content when both are present.

## Strategy & Role

**Why this module exists:** Assemble all pipeline data into a single structured JSON per entity for CMS import, API feeding, or downstream data processing. This is the most structured and machine-readable output format.

**Role in the pipeline:** One of five Step 8 output modules. Produces JSON that combines all available data shapes into one object. The only module that merges analysis, SEO, and content data into a unified structure.

**Relationship to other steps:**
- **Depends on:** content-analyzer, seo-planner, content-writer (all optional -- works with any combination)
- **Sibling modules:** markdown-output, html-output, meta-output, company-media

## When to Use

**Always use when:**
- You need structured data for CMS import (Strapi, Contentful, etc.)
- You want a single JSON file per entity containing all pipeline outputs
- Downstream systems consume JSON via API

**Consider settings carefully when:**
- Only some data shapes are available -- the module gracefully handles partial data
- Your CMS has specific field name requirements -- check Strapi format field mapping
- You want raw pipeline data for analysis -- use `flat` format instead of `strapi`

## Options Guide

| Option | Default | When to Change | Impact |
|--------|---------|----------------|--------|
| `output_format` | `strapi` | Set to `flat` for raw nested objects; keep `strapi` for CMS-ready flat fields | `strapi` maps categories to `primary_category`, `secondary_category`, `categories[]`; `flat` keeps `analysis`, `seo_plan`, `content_markdown` as-is |
| `include_markdown` | true | Disable if you only need structured data without article text | Includes the `content_markdown` string in the JSON. Can significantly increase file size |
| `include_analysis` | true | Disable if analysis data is not relevant to the consumer | Includes categories, tags, key_facts, source_citations from analysis_json |
| `include_seo_plan` | true | Disable if SEO data is not needed | Includes target_keywords, meta title/description, FAQs from seo_plan_json |
| `flatten_key_facts` | false | Enable to hoist key_facts fields (founded, headquarters, employees, etc.) to the top level | Only applies in `strapi` format. Moves key_facts subfields to root level instead of nesting under `key_facts` |

## Recipes

### Strapi CMS Import (Standard)
Full data assembly with CMS-friendly field names:
```
output_format: strapi
include_markdown: true
include_analysis: true
include_seo_plan: true
flatten_key_facts: false
```

### Data Analysis Export
Raw nested objects for analytical processing:
```
output_format: flat
include_markdown: true
include_analysis: true
include_seo_plan: true
flatten_key_facts: false
```

### Metadata Only (No Content)
Just structured data without the article text:
```
output_format: strapi
include_markdown: false
include_analysis: true
include_seo_plan: true
flatten_key_facts: true
```

### Minimal SEO Focus
Just content and SEO plan:
```
output_format: flat
include_markdown: true
include_analysis: false
include_seo_plan: true
flatten_key_facts: false
```

## Expected Output

**Healthy result:**
- One JSON object per entity
- 20-100 fields per object (depending on data shapes and options)
- 2-50 KB per file (smaller without markdown content)

**Output fields per entity:**
- `entity_name` -- the company/entity name
- `final_json` -- the JSON string (downloadable as .json file)
- `field_count` -- total fields in the JSON object (including nested)
- `json_size_kb` -- file size in kilobytes
- `has_markdown` -- whether content_markdown was included
- `has_analysis` -- whether analysis_json data was included
- `has_seo_plan` -- whether seo_plan_json data was included

**Strapi format field mapping:**
- `name` -- entity name
- `content` -- content_markdown string
- `primary_category` / `primary_category_slug` -- first primary category slug
- `secondary_category` / `secondary_category_slug` -- first secondary category slug
- `categories` -- flat array of all category slugs
- `tags` -- flat array of tag slugs and labels
- `key_facts` -- nested object (or flattened to root level)
- `sources` -- source_citations array
- `seo.meta_title`, `seo.meta_description`, `seo.target_keywords`, `seo.faqs` -- SEO plan data

**Red flags to watch for:**
- `has_markdown: false`, `has_analysis: false`, `has_seo_plan: false` -- no data shapes found; entity was skipped
- Very large json_size_kb (> 100 KB) -- markdown content may be exceptionally long
- Low field_count (< 5) -- only minimal data was available from upstream steps

## Limitations & Edge Cases

- **Works with any combination of data shapes** -- unlike other Step 8 modules, json-output does not require any specific field. But if none of the three shapes (`content_markdown`, `analysis_json`, `seo_plan_json`) are present, the entity is skipped with an error
- **Strapi format assumes specific category/tag structures** -- if analysis_json uses a non-standard format for categories or tags, the field mapping may produce unexpected results
- **Multiple markdown items are concatenated** -- if an entity has multiple items with `content_markdown`, they are joined with double newlines into a single string
- **Undefined values are cleaned** -- in Strapi format SEO object, undefined values are explicitly removed to produce clean JSON
- **Field count is recursive** -- the `field_count` metric counts all fields including nested objects, which means complex analysis_json structures inflate the count
- **No JSON Schema validation** -- the output JSON structure is not validated against a schema. Consumers should handle missing fields gracefully

## What Happens Next

The JSON output is a terminal artifact ready for use outside the pipeline. Typical destinations:

- **CMS import** -- use the Strapi format JSON to create/update entries via CMS API
- **Data warehouse** -- store flat format JSON for analysis and reporting
- **API integration** -- feed JSON objects to downstream services
- **Backup** -- archive the complete pipeline output as structured data

The JSON format is the most complete output -- it can contain everything the pipeline knows about an entity in a single file.

## Technical Reference

- **Step:** 8 (Bundling)
- **Category:** data
- **Cost:** cheap
- **Data operation:** transform (=) -- data assembled into JSON format
- **Requires columns:** none (reads from pool items, not CSV columns)
- **Depends on:** content-analyzer, seo-planner, content-writer (all optional)
- **Input:** `input.entities[]` with `items[]` containing any combination of `content_markdown`, `analysis_json`, `seo_plan_json`
- **Output:** `{ results[], summary }` where each result has `entity_name`, `items[]` with `final_json`, `field_count`, `json_size_kb`, `has_markdown`, `has_analysis`, `has_seo_plan`
- **Selectable:** true -- operators can deselect individual entity outputs
- **Downloadable:** `final_json` field downloadable as `.json` file
- **Detail view:** header fields (entity_name, field_count, json_size_kb, has_markdown badge, has_analysis badge, has_seo_plan badge) and prose section for final_json
- **Dependencies:** `tools.logger`, `tools.progress`
- **Files:** `manifest.json`, `execute.js`
