# Schema.org Injector

> Generate Schema.org structured data (JSON-LD) for company profiles — Organization, Product, FAQPage — for SEO rich snippets.

**Module ID:** `schema-org-injector` | **Step:** 8 (Bundling) | **Category:** bundling | **Cost:** cheap
**Version:** 1.0.0 | **Data Operation:** transform (=)

---

## Background

### The Content Problem This Solves

Search engines use Schema.org structured data to generate rich snippets — enhanced search results with company details, FAQ accordions, product info, and more. Manually creating JSON-LD for each company profile is tedious and error-prone: you need to map pipeline data to the correct Schema.org types, validate required fields, and format the output as a `<script>` block ready for HTML injection. This module automates all of that.

### How It Fits the Pipeline Architecture

This is a Step 8 Bundling module that uses **data-shape routing**. It reads from json-output items (structured JSON with `overview`, `categories`, `faq`, `credentials`, `contact`, `meta`) and from analysis_json items (key_facts, categories). It produces JSON-LD structured data as a `<script type="application/ld+json">` block ready to inject into any HTML `<head>`.

When multiple Schema.org types are generated (e.g. Organization + FAQPage + Products), they are combined using the `@graph` pattern in a single JSON-LD block. When only one type is generated, it uses a flat structure.

## Strategy & Role

**Why this module exists:** Produce SEO-ready Schema.org structured data that enables rich snippets in Google, Bing, and other search engines. Organization schema provides company knowledge panels, FAQPage schema enables FAQ accordions directly in search results, and Product schema provides product rich snippets.

**Role in the pipeline:** One of six Step 8 output modules. Produces JSON-LD structured data focused on SEO rich snippets. Complements html-output (which has basic Organization schema only) by adding FAQPage and Product schemas plus more comprehensive Organization data.

**Relationship to other steps:**
- **Depends on:** json-output (structured JSON), content-analyzer (analysis_json) — both optional, works with either
- **Sibling modules:** markdown-output, html-output, json-output, meta-output, company-media

## When to Use

**Always use when:**
- SEO rich snippets are important for the published content
- You want FAQ accordions to appear in Google search results
- You need structured data separate from the HTML output (for injection into templates, CMS, or static site generators)

**Consider settings carefully when:**
- The entity is not product-focused — disable `generate_products`
- No FAQ data exists in the pipeline — disable `generate_faq` to avoid empty warnings
- Company URL is stored in a non-standard entity field — set `company_url_field` accordingly

## Options Guide

| Option | Default | When to Change | Impact |
|--------|---------|----------------|--------|
| `generate_organization` | true | Rarely disable — Organization is the foundational schema for company profiles | Generates Organization schema with name, url, description, foundingDate, employees, address, logo, sameAs, credentials, awards |
| `generate_products` | true | Disable if entity is not product/service-focused or categories data is not available | Generates one Product schema per primary category/product found in the data |
| `generate_faq` | true | Disable if no FAQ data exists in upstream steps | Generates FAQPage schema from FAQ items — maps directly to Google's FAQ rich snippet format |
| `company_url_field` | `website` | Change if the company URL is stored in a different entity field (e.g. `url`, `domain`) | Used for the Organization `url` property and Product `url` property |

## Schema.org Types Generated

### Organization (always recommended)
Maps entity data to Schema.org Organization:
- `name` — entity name
- `url` — from entity's company URL field
- `description` — from overview (first sentence) or primary category
- `foundingDate` — from key_facts.founded
- `address` — from key_facts.headquarters (PostalAddress)
- `numberOfEmployees` — from key_facts.employees (QuantitativeValue)
- `logo` — from meta.logo
- `email`, `telephone` — from contact data
- `sameAs` — social links (LinkedIn, Twitter, Facebook, Instagram, YouTube)
- `hasCredential` — from credentials/licenses
- `award` — from key_facts.awards
- `member` — from key_facts.key_people (Person)

### Product (one per category)
Generated for each primary product/service category:
- `name` — category name (formatted from slug)
- `brand` — Organization reference back to the entity
- `url` — company URL
- `description` — category description or reasoning (when available)

### FAQPage (from FAQ items)
Maps FAQ data directly to Google's FAQ rich snippet format:
- `mainEntity` — array of Question/Answer pairs
- Each Question has `name` (the question) and `acceptedAnswer.text` (the answer)

## Example Output

A company with Organization + FAQPage generates:

```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "name": "Betsson Group",
      "url": "https://www.betssongroup.com",
      "description": "Betsson Group is a leading iGaming operator offering sports betting and casino.",
      "foundingDate": "1963",
      "address": {
        "@type": "PostalAddress",
        "addressLocality": "Stockholm, Sweden"
      },
      "numberOfEmployees": {
        "@type": "QuantitativeValue",
        "value": "1800+"
      },
      "sameAs": [
        "https://www.linkedin.com/company/betsson-group",
        "https://twitter.com/BetssonGroup"
      ],
      "hasCredential": [
        {
          "@type": "EducationalOccupationalCredential",
          "credentialCategory": "license",
          "name": "Malta Gaming Authority (MGA)"
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "When was Betsson Group founded?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Betsson Group was founded in 1963 in Stockholm, Sweden."
          }
        },
        {
          "@type": "Question",
          "name": "What licenses does Betsson hold?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Betsson holds licenses from the Malta Gaming Authority (MGA) and several other jurisdictions."
          }
        }
      ]
    }
  ]
}
```

This is wrapped in a `<script type="application/ld+json">` tag, ready for injection into any HTML `<head>`.

## Recipes

### Full Schema Coverage (Standard)
Generate all three schema types for maximum rich snippet potential:
```
generate_organization: true
generate_products: true
generate_faq: true
company_url_field: website
```

### Organization Only
Just the company knowledge panel schema:
```
generate_organization: true
generate_products: false
generate_faq: false
company_url_field: website
```

### FAQ Only
Just the FAQ rich snippet schema (e.g. for a page that already has Organization markup):
```
generate_organization: false
generate_products: false
generate_faq: true
company_url_field: website
```

## Expected Output

**Healthy result:**
- One JSON-LD script block per entity
- 1-5 KB per entity depending on data richness
- 1-3 schema types per entity
- Zero validation errors for well-populated entities

**Output fields per entity:**
- `entity_name` — the company/entity name
- `schema_jsonld` — the complete `<script type="application/ld+json">` block (downloadable as .json)
- `schema_types` — comma-separated list of generated Schema.org types (e.g. "Organization, Product (2), FAQPage")
- `validation_errors` — array of validation error strings
- `validation_error_count` — number of validation issues found
- `validation_errors_text` — human-readable validation report
- `jsonld_size_kb` — size of the JSON-LD block in kilobytes

**Red flags to watch for:**
- High `validation_error_count` — check upstream data quality
- Missing `url` on Organization — set `company_url_field` to the correct entity field
- No FAQPage generated when expected — verify FAQ data exists in json-output or seo-planner output
- Zero schema types — no data shapes found; check that json-output or content-analyzer ran before this step

## Limitations & Edge Cases

- **Missing fields are omitted, never fabricated** — if founding date, address, or employee count are not in the data, those Schema.org properties are simply absent
- **FAQ section empty or missing** — FAQPage schema is silently skipped (not an error)
- **Multiple products** — one Product schema per primary category; secondary categories are not included
- **No JSON Schema validation against schema.org** — validation checks required fields and basic types, but does not validate against the full Schema.org specification
- **Validation errors are warnings, not blockers** — schemas are still generated even with validation warnings (e.g. missing recommended fields like `url`)
- **Social links depend on meta field names** — expects `linkedin`, `twitter`, `facebook`, `instagram`, `youtube` fields in json-output's meta object
- **foundingDate format** — validated as ISO date (YYYY or YYYY-MM or YYYY-MM-DD); non-conforming values are included with a validation warning

## What Happens Next

The JSON-LD output is ready for use outside the pipeline:

- **HTML injection** — paste the `<script>` block into any HTML `<head>` section
- **CMS integration** — feed the JSON-LD string into a CMS structured data field
- **Static site generators** — include in page templates for SEO
- **Validation** — test with Google's Rich Results Test or Schema.org Validator
- **Combine with html-output** — use html-output for content + this module for comprehensive structured data

## Technical Reference

- **Step:** 8 (Bundling)
- **Category:** bundling
- **Cost:** cheap (pure data transformation, no API calls)
- **Data operation:** transform (=) — data assembled into JSON-LD format
- **Requires columns:** none (reads from pool items, not CSV columns)
- **Depends on:** json-output, content-analyzer (both optional)
- **Input:** `input.entities[]` with `items[]` containing any combination of json-output fields (`overview`, `categories`, `faq`, `credentials`, `contact`, `meta`, `final_json`), `analysis_json`, or `seo_plan_json`
- **Output:** `{ results[], summary }` where each result has `entity_name`, `items[]` with `schema_jsonld`, `schema_types`, `validation_errors`, `validation_error_count`, `jsonld_size_kb`
- **Selectable:** true — operators can deselect individual entity outputs
- **Downloadable:** `schema_jsonld` field downloadable as `.json` file
- **Detail view:** header fields (entity_name, schema_types, jsonld_size_kb, validation_error_count badge) and prose sections for JSON-LD output and validation errors
- **Dependencies:** `tools.logger`, `tools.progress`
- **Files:** `manifest.json`, `execute.js`, `README.md`, `CLAUDE.md`
