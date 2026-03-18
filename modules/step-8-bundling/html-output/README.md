# HTML Output

> Convert pipeline Markdown to HTML with optional schema.org Organization JSON-LD and CSS styling.

**Module ID:** `html-output` | **Step:** 8 (Bundling) | **Category:** formatting | **Cost:** cheap
**Version:** 1.0.0 | **Data Operation:** transform (=)

---

## Background

### The Content Problem This Solves

Markdown is great for portability and editing, but many publishing workflows require HTML: email newsletters, standalone web pages, CMS fields that expect HTML input, and SEO-optimized pages that need embedded schema.org structured data. Converting Markdown to HTML manually is tedious, and adding schema.org JSON-LD requires understanding both the Organization schema type and the available analysis data.

This module automates the full conversion: Markdown to HTML, inline citations to superscript anchor links with a Sources section, schema.org Organization JSON-LD from analysis data, and optional CSS templates for immediate preview.

### How It Fits the Pipeline Architecture

This is a Step 8 Bundling module that uses **data-shape routing** -- it finds input by checking for `content_markdown` and `analysis_json` fields on pool items, never by `source_submodule`. It always strips `[Type Marker]` heading prefixes (unlike markdown-output which makes this configurable) because HTML output is inherently for display, not machine parsing.

The schema.org generation maps analysis_json fields to Organization schema properties: key_facts.founded to foundingDate, key_facts.headquarters to address, key_facts.employees to numberOfEmployees, awards to award array, licenses to hasCredential, and key_people to member.

## Strategy & Role

**Why this module exists:** Produce ready-to-publish HTML with embedded structured data. The HTML output serves two purposes: direct publishing (standalone pages, email) and CMS import (HTML fragments for rich text fields).

**Role in the pipeline:** One of five Step 8 output modules. Produces the most web-ready format -- HTML with optional CSS and schema.org markup.

**Relationship to other steps:**
- **Depends on:** content-writer (produces `content_markdown`)
- **Optionally uses:** content-analyzer (provides `analysis_json` for schema.org generation)
- **Sibling modules:** markdown-output, json-output, meta-output, company-media

## When to Use

**Always use when:**
- You need HTML for web publishing, email newsletters, or CMS rich text fields
- SEO is important and you want schema.org Organization markup embedded in the page
- You want a preview-ready standalone page (use `article` CSS template + `wrap_in_document`)

**Consider settings carefully when:**
- Importing HTML fragments into a CMS -- disable `wrap_in_document` and `css_template` to avoid style conflicts
- You do not have analysis data -- disable `include_schema_org` since the JSON-LD would be minimal
- Publishing to platforms with their own styling -- use `css_template: none` to avoid conflicts

## Options Guide

| Option | Default | When to Change | Impact |
|--------|---------|----------------|--------|
| `include_schema_org` | true | Disable if no analysis data is available or schema.org is handled elsewhere | Generates `<script type="application/ld+json">` with Organization schema from analysis_json key_facts |
| `css_template` | `none` | Set to `basic` for clean sans-serif styling; `article` for polished serif editorial layout | Injects a `<style>` block. `none` = no CSS (for CMS embedding), `basic` = system-ui, `article` = Georgia serif with article-optimized spacing |
| `include_sources_section` | true | Disable if citations are not relevant or handled elsewhere | Converts `[#n]` to superscript anchor links and appends a Sources section with back-reference arrows |
| `wrap_in_document` | false | Enable for standalone HTML files (email, static hosting, preview pages) | Wraps output in `<!DOCTYPE html>` with `<head>`, `<meta charset>`, viewport tag, and `<title>`. Disable for HTML fragments |

## Recipes

### CMS Fragment (Standard)
Clean HTML fragment for Strapi/WordPress rich text fields:
```
include_schema_org: true
css_template: none
include_sources_section: true
wrap_in_document: false
```

### Standalone Preview Page
Complete HTML document for browser preview:
```
include_schema_org: true
css_template: article
include_sources_section: true
wrap_in_document: true
```

### Email Newsletter
Basic styled HTML document:
```
include_schema_org: false
css_template: basic
include_sources_section: false
wrap_in_document: true
```

### SEO-Optimized Fragment
HTML with schema.org but no styling (CMS handles CSS):
```
include_schema_org: true
css_template: none
include_sources_section: true
wrap_in_document: false
```

## Expected Output

**Healthy result:**
- One HTML output per entity
- 3-15 KB per file depending on content length and options
- 5-15 headings per file
- schema.org JSON-LD with Organization properties (when analysis data is available)

**Output fields per entity:**
- `entity_name` -- the company/entity name
- `final_html` -- the complete HTML string (downloadable as .html file)
- `html_size_kb` -- file size in kilobytes (rounded to one decimal)
- `has_schema_org` -- whether schema.org JSON-LD was included
- `heading_count` -- number of h1-h6 headings in the HTML
- `content_preview` -- first 200 characters of text content (tags stripped)

**Schema.org fields mapped:**
- `name` -- entity name
- `foundingDate` -- from key_facts.founded
- `address` -- from key_facts.headquarters (PostalAddress)
- `numberOfEmployees` -- from key_facts.employees (QuantitativeValue)
- `award` -- from key_facts.awards (array)
- `hasCredential` -- from key_facts.licenses (EducationalOccupationalCredential array)
- `member` -- from key_facts.key_people (Person array)
- `email`, `telephone` -- from key_facts.contact
- `description` -- generated from primary category

**Red flags to watch for:**
- `has_schema_org: false` when expected -- check that analysis_json exists in the working pool
- Very large HTML size (> 50 KB) -- content may be excessively long
- Low heading count (< 3) -- content-writer may have produced poorly structured content

## Limitations & Edge Cases

- **Requires content_markdown field** -- items without this field are skipped with a warning
- **Always strips [Type Marker] prefixes** -- unlike markdown-output, this is not configurable. HTML output is always display-ready
- **CSS templates are embedded inline** -- the `<style>` block is included directly in the HTML, not as an external stylesheet. This can conflict with CMS styling
- **Schema.org is Organization type only** -- does not generate Article, Product, or other schema types. The Organization schema is always used regardless of content type
- **Citations become anchor links** -- `[#n]` is converted to `<sup><a href="#source-n">[n]</a></sup>` with back-references. If source_citations are missing from analysis_json, generic "Source N" labels are used
- **HTML escaping** -- entity names and citation content are HTML-escaped to prevent XSS, but content_markdown is passed through `marked.parse()` which trusts the input

## What Happens Next

The HTML output is a terminal artifact ready for use outside the pipeline. Typical destinations:

- **CMS import** -- paste the HTML fragment into a Strapi/WordPress rich text field
- **Static hosting** -- serve the standalone HTML document directly
- **Email** -- use the full-document output as an email template body
- **SEO audit** -- review the schema.org JSON-LD for completeness

The other Step 8 modules run in parallel on the same working pool, allowing you to produce Markdown, JSON, meta, and media outputs alongside HTML from the same source content.

## Technical Reference

- **Step:** 8 (Bundling)
- **Category:** formatting
- **Cost:** cheap
- **Data operation:** transform (=) -- content converted to HTML format
- **Requires columns:** none (reads from pool items, not CSV columns)
- **Depends on:** content-writer
- **Input:** `input.entities[]` with `items[]` containing `content_markdown` and optionally `analysis_json`
- **Output:** `{ results[], summary }` where each result has `entity_name`, `items[]` with `final_html`, `html_size_kb`, `has_schema_org`, `heading_count`, `content_preview`
- **Selectable:** true -- operators can deselect individual entity outputs
- **Downloadable:** `final_html` field downloadable as `.html` file
- **Detail view:** header fields (entity_name, html_size_kb, heading_count, has_schema_org badge) and prose section for final_html
- **Dependencies:** `marked` (Markdown to HTML conversion), `tools.logger`, `tools.progress`
- **Files:** `manifest.json`, `execute.js`
