# FORMAT SPEC — OnlyiGaming Company Profiles

> Reference document for content-writer and seo-planner.
> Defines the exact structure, section order, word counts, and output format for company profiles.
> Every generated profile must follow this specification.
> Updated: 2026-02-23 — Added mandatory [Section Type] heading markers for machine-parseable output. Clarified that structure is FIXED and not determined by seo-planner.

---

## What the Writer Receives

The content-writer receives THREE inputs:

**1. From content-analyzer (analysis_json):**
- Primary and secondary categories (with slugs and rationale)
- Existing and suggested tags (suggested tags are flagged)
- Key facts (founded, HQ, employees, key people, licenses, awards, partnerships, offices, contact)
- Source citations

**2. From seo-planner (seo_plan_json):**
- Target keywords mapped to each section
- Meta title and meta description
- 5 FAQ questions with answer briefs
- Tone notes

**3. Scraped source content (source_pages):**
- The full scraped text from the company's website pages
- This is the raw material the writer uses to write specific, detailed prose
- The analysis tells the writer WHAT to write about; the sources provide the DETAIL to write with

**The writer's job:** Turn these inputs into polished, readable markdown prose. Do not invent categories, tags, or facts. Write only what the source content supports, structured according to the analysis, optimized according to the SEO plan.

---

## CRITICAL: Section Heading Format

Every section heading MUST include a bracketed type marker as a prefix. This allows downstream systems (Step 8 Bundling) to parse the profile into structured formats.

**Format:** `## [Type Marker] Creative Heading`

The type marker is mandatory and machine-readable. The creative heading after it is what readers see and should incorporate keywords from the SEO plan.

**Examples:**
```
## [Overview] Evolution Gaming — The Pioneer Behind Live Casino Innovation
## [Primary Category: live-casino-studios] Live Casino Solutions by Evolution
## [Primary Category: game-providers] Game Content and Studio Portfolio
## [Secondary Category: mobile-platforms] Mobile-First Live Dealer Experiences
## [Tag: api] Seamless API Integration Across Platforms
## [Tag: multi-jurisdiction] [Suggested tag] Multi-Jurisdiction Streaming
## [Credentials] Licenses, Awards and Industry Recognition
## [Contact] Company Information
## [FAQ] Frequently Asked Questions
## [Meta] SEO Metadata
```

**Rules:**
- Type markers use the exact category/tag slug from the analysis
- Primary vs secondary tier is explicit in the marker
- Suggested new tags include `[Suggested tag]` label AFTER the type marker
- The creative heading after the marker should use SEO plan heading keywords when available
- H3 subheadings within a section do NOT need type markers

---

## Profile Structure

Each company profile consists of the following sections, in this exact order. The structure is FIXED — the seo-planner does not determine sections, it only maps keywords to them.

### 1. Overview

- **Heading format**: `## [Overview] {Company Name} — {USP/positioning in iGaming}`
- **Word count**: 300–400 words
- **Content**: Company history, headquarters, key markets, credibility signals, core offerings
- **Requirements**:
  - Must include the primary keyword in headline or first paragraph
  - Cover: what the company does, who it serves, where it operates, why it matters
  - Draw from key_facts in the analysis AND detail from the scraped source content
  - End with a positioning statement that differentiates from competitors
  - Cite sources for founding date, HQ location, market claims

### 2. Category Sections

Write one section for EACH category provided by the content-analyzer — primary AND secondary. Do not skip any. Do not add categories that aren't in the analysis.

**Order:** All primary categories first, then all secondary categories.

- **Heading format**: `## [Primary Category: {slug}] {Creative Heading}` or `## [Secondary Category: {slug}] {Creative Heading}`
- **Word count**: 150–300 words per category
- **Creative heading**: Use the SEO plan's heading keywords if available, otherwise `{Category Name} Solutions by {Company}`
- **Requirements**:
  - Describe what the company specifically offers in this category
  - Use the company's actual products, services, and capabilities from the source content
  - Explain how this offering fits the company's broader business
  - Include keywords from the SEO plan's keyword distribution for this category
  - Use bullet points when listing 3+ products, features, or markets within a category

### 3. Tag Sections

Write a section for each major tag provided by the content-analyzer. Minor tags can be grouped or listed briefly.

- **Heading format**: `## [Tag: {slug}] {Creative Heading}` or for suggested tags: `## [Tag: {slug}] [Suggested tag] {Creative Heading}`
- **Word count**: 80–300 words per tag that warrants its own section
- **Content**: How this specific tag applies to the company, with evidence from sources
- **Requirements**:
  - Integrate keywords from the SEO plan's keyword distribution for this tag
  - Tags that overlap heavily with a category section can be brief — don't repeat content

### 4. Credentials & Recognition

- **Heading format**: `## [Credentials] Licenses, Awards and Industry Recognition`
- **Content**: Licenses, awards, certifications, partnerships — all from the analyzer's key_facts
- **Format**: Grouped by type (Licenses, Certifications, Awards, Partnerships)
- **Requirements**:
  - Every credential must cite a source
  - Include jurisdiction for licenses (e.g., "MGA license B2B/370/2017")
  - Include year for awards where known
  - If the analysis contains no credentials, omit this section entirely

### 5. Contact & Company Information

- **Heading format**: `## [Contact] Company Information`
- **Content**: HQ address, general email/phone, regional offices — from the analyzer's key_facts
- **Format**: Structured list
- **Requirements**:
  - Only include information found in the analysis/sources — never invent contact details
  - If no contact info exists in the analysis, omit this section entirely

### 6. FAQ

- **Heading format**: `## [FAQ] Frequently Asked Questions`
- **Count**: 5 questions and answers (from the seo-planner)
- **Answer word count**: 50–100 words each
- **Requirements**:
  - Use the exact questions from the seo-planner
  - Answers must be factual and cited where possible, drawing from the source content
  - Format as: `**Q: {question}**` followed by answer paragraph
  - Incorporate long-tail keywords from the SEO plan's FAQ keyword distribution

### 7. Meta

- **Heading format**: `## [Meta] SEO Metadata`
- **Source**: Use meta title and description from the seo-planner
- **Requirements**:
  - Meta title: ≤60 characters
  - Meta description: 150–160 characters
  - If the SEO plan's meta exceeds these limits, trim to fit
  - Format as:
    ```
    **Meta Title:** {title}
    **Meta Description:** {description}
    ```

---

## Citation Format

- Inline citations using `[#n]` format where n = source index number
- Place at end of the sentence or clause the source supports
- Multiple citations: `[#1][#3]`
- Every factual claim requires at least one citation
- Source index maps to the source_citations in the analysis

Example:
> The company was founded in 2015 in Malta [#1] and holds an MGA B2B license [#3].

---

## Output Format

The content-writer produces **markdown only**. No JSON output.

- Heading hierarchy: `##` for H2 (with type markers), `###` for H3 (no type markers needed)
- Inline citations `[#n]`
- Bullet lists when listing 3+ parallel items (licenses, markets, products)
- Suggested new tags labeled as `[Suggested tag]` in headings
- No code fences around the output
- No preamble or explanation — just the profile content

Structured data formatting (JSON for CMS, HTML conversion, etc.) is handled by Step 8 Bundling, not by the content-writer.

---

## Word Count Summary

| Section | Min | Max | Notes |
|---------|-----|-----|-------|
| Overview | 300 | 400 | Single section per profile |
| Category | 150 | 300 | Per category from analyzer |
| Tag | 80 | 300 | Per major tag from analyzer |
| FAQ answer | 50 | 100 | Per question (5 total) |
| Meta title | — | 60 chars | Characters, not words |
| Meta description | 150 chars | 160 chars | Strict range |

---

## Validation Rules

These are checked during QA. Content that fails is sent back for revision:

- All required sections present (overview, at least one category, FAQ, meta)
- Every section heading starts with the correct `[Type Marker]` prefix
- A section exists for EVERY category in the analysis (none skipped)
- Primary categories appear before secondary categories
- Word counts within ranges (±10% tolerance on first pass)
- Meta title ≤60 characters
- Meta description 150–160 characters
- Heading hierarchy clean (H2 → H3, no level skips)
- Every factual claim has at least one citation
- Suggested new tags labeled with `[Suggested tag]`
- No content invented beyond what the analysis and sources support
