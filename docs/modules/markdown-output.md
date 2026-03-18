# Markdown Output

> Transform pipeline content into clean, publishable Markdown with optional YAML frontmatter.

**Module ID:** `markdown-output` | **Step:** 8 (Bundling) | **Category:** formatting | **Cost:** cheap
**Version:** 1.0.0 | **Data Operation:** transform (=)

---

## Background

### The Content Problem This Solves

The content-writer module produces raw Markdown with internal conventions: `[Type Marker]` prefixes on headings (e.g., `## [Overview]`, `## [Primary Category: online-casinos]`), inline `[#n]` citation references, and a `## [Meta]` section with structured metadata. These conventions are useful for pipeline processing but unsuitable for publishing. Before content can be imported into a CMS, shared with editors, or published as standalone files, it needs to be cleaned, reformatted, and optionally enriched with YAML frontmatter.

### How It Fits the Pipeline Architecture

This is a Step 8 Bundling module -- the final stage of the pipeline where processed content is formatted for output. It uses **data-shape routing**: it finds its input by checking which fields exist on pool items (`content_markdown`, `analysis_json`), never by checking `source_submodule`. This means any upstream module that produces a `content_markdown` field will automatically feed into this module.

The module prefers AI-written content (items with `section_count` from content-writer) over raw scraped content (from page-scraper) when both are present, ensuring the highest quality output.

## Strategy & Role

**Why this module exists:** Convert internal pipeline Markdown into clean, publishable Markdown files ready for CMS import or editorial review. Strip internal conventions, convert citations to standard formats, and add YAML frontmatter with categories and tags from the analysis phase.

**Role in the pipeline:** One of five Step 8 output modules. Produces the most portable format -- Markdown files work with virtually every CMS, static site generator, and content management system.

**Relationship to other steps:**
- **Depends on:** content-writer (produces `content_markdown`)
- **Optionally uses:** content-analyzer (provides `analysis_json` for frontmatter categories and tags)
- **Sibling modules:** html-output, json-output, meta-output, company-media

## When to Use

**Always use when:**
- You need clean Markdown files for CMS import (WordPress, Strapi, Hugo, Jekyll, etc.)
- Content needs to be reviewed by human editors in a readable format
- You want portable files that work across platforms

**Consider settings carefully when:**
- Your CMS expects specific frontmatter fields -- check that the generated YAML matches
- You need citations preserved -- choose between footnotes, inline, or stripped
- The `## [Meta]` section should be kept for debugging -- enable `include_meta_section`

## Options Guide

| Option | Default | When to Change | Impact |
|--------|---------|----------------|--------|
| `heading_style` | `strip_markers` | Set to `keep_markers` if downstream tools need the `[Type Marker]` prefixes for machine parsing | `strip_markers` converts `## [Overview]` to `## Overview` and category slugs to title case |
| `citation_format` | `footnotes` | Set to `inline` to keep `[#n]` as-is; set to `strip` to remove all citations | `footnotes` converts `[#n]` to `[^n]` with a footnote definitions section at the bottom |
| `include_frontmatter` | true | Disable if your CMS does not support YAML frontmatter or you want raw Markdown only | Adds `---` delimited YAML block with title, categories, and tags from analysis data |
| `include_meta_section` | false | Enable to keep the `## [Meta]` section for debugging or if meta-output is not being used | The Meta section contains structured metadata that is typically handled by meta-output instead |

## Recipes

### CMS Import (Standard)
Clean Markdown with frontmatter for Strapi, WordPress, or similar CMS:
```
heading_style: strip_markers
citation_format: footnotes
include_frontmatter: true
include_meta_section: false
```

### Editorial Review
Clean readable Markdown without frontmatter or citations:
```
heading_style: strip_markers
citation_format: strip
include_frontmatter: false
include_meta_section: false
```

### Machine-Parseable
Keep all internal markers for automated processing:
```
heading_style: keep_markers
citation_format: inline
include_frontmatter: true
include_meta_section: true
```

### Static Site Generator
Full frontmatter with footnote citations for Hugo/Jekyll:
```
heading_style: strip_markers
citation_format: footnotes
include_frontmatter: true
include_meta_section: false
```

## Expected Output

**Healthy result:**
- One Markdown file per entity
- 800-3,000 words per file (depending on content-writer output)
- 5-15 sections (h2/h3 headings) per file
- YAML frontmatter with title, categories, and tags

**Output fields per entity:**
- `entity_name` -- the company/entity name
- `final_markdown` -- the complete Markdown string (downloadable as .md file)
- `word_count` -- total words in the final output
- `section_count` -- number of h2/h3 headings
- `has_frontmatter` -- whether YAML frontmatter was included
- `content_preview` -- first 200 characters (newlines replaced with spaces)

**Detail view:** Each item has a detail view showing the full Markdown output as prose, with header badges for entity name, word count, section count, and frontmatter status.

**Red flags to watch for:**
- Missing frontmatter categories/tags -- analysis_json may not have been produced by content-analyzer
- Very short output (< 300 words) -- content-writer may have produced minimal content
- No entities processed -- check that content_markdown field exists in the working pool

## Limitations & Edge Cases

- **Requires content_markdown field** -- items without this field are skipped with a warning. Run content-writer first
- **Frontmatter depends on analysis_json** -- if content-analyzer did not run, frontmatter will only contain the title (no categories or tags)
- **Citation footnotes require source_citations** -- if analysis_json lacks `source_citations`, footnotes will show generic "Source N" labels
- **Multiple markdown items are concatenated** -- if an entity has multiple items with `content_markdown`, they are joined with double newlines. This is typically fine but may produce unexpected results if items overlap
- **Category slug conversion** -- slugs like `online-casinos` are converted to title case `Online Casinos` when stripping markers. Non-standard slugs may convert awkwardly
- **Meta section removal uses regex** -- matches from `## [Meta]` or `## Meta` to the end of the string. If the Meta section is not the last section, content after it will also be removed

## What Happens Next

The Markdown output is a terminal artifact -- it is ready for use outside the pipeline. Typical destinations:

- **CMS import** -- upload the `.md` file to Strapi, WordPress, or any Markdown-supporting CMS
- **Static site generation** -- place in a Hugo/Jekyll/Gatsby content directory
- **Editorial workflow** -- send to editors for review and revision
- **Archive** -- store as the canonical content record for the entity

The other Step 8 modules (html-output, json-output, meta-output) can run in parallel on the same working pool to produce alternative output formats from the same source content.

## Technical Reference

- **Step:** 8 (Bundling)
- **Category:** formatting
- **Cost:** cheap
- **Data operation:** transform (=) -- content reformatted for output
- **Requires columns:** none (reads from pool items, not CSV columns)
- **Depends on:** content-writer
- **Input:** `input.entities[]` with `items[]` containing `content_markdown` and optionally `analysis_json`
- **Output:** `{ results[], summary }` where each result has `entity_name`, `items[]` with `final_markdown`, `word_count`, `section_count`, `has_frontmatter`, `content_preview`
- **Selectable:** true -- operators can deselect individual entity outputs
- **Downloadable:** `final_markdown` field downloadable as `.md` file
- **Detail view:** header fields (entity_name, word_count, section_count, has_frontmatter badge) and prose section for final_markdown
- **Dependencies:** `js-yaml` (frontmatter serialization), `tools.logger`, `tools.progress`
- **Files:** `manifest.json`, `execute.js`
