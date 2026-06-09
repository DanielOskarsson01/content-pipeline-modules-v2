# Content Writer — Company-Profile Prompt Override

<!--
CANONICAL SOURCE: Supabase `templates.preset_map['content-writer'].fallback_values.prompt`
for each company-profile template (e.g. `7th june 17.15` and successors).

THIS FILE IS A SNAPSHOT, not the canonical value. The UI edits the template directly
in Supabase; this markdown is a versioned record for code review, audit, and onboarding.
If you change the template via the UI, re-export this file so the snapshot stays current.

Last synced: 2026-06-09 — v4 (paired with content-writer manifest v1.6.0):
- The content-writer manifest's `options_defaults.prompt` is now fully agnostic
  (no OnlyiGaming, no iGaming, no bracket-heading format examples). A new
  `requires_prompt_override` manifest option (default false) mirrors the
  seo-planner v2.2.0 pattern.
- The company-profile template (`7th june 17.15`) MUST set
  `preset_map.content-writer.fallback_values.requires_prompt_override = true`
  so the run refuses loud if the company-profile prompt override is ever
  removed. Configured via Supabase PATCH on 2026-06-09 afternoon.
- The prompt body below is unchanged from v3 — only the surrounding template
  configuration tightened.

v3:
- Pairs with content-writer submodule v1.5.0 which adds the agnostic `allowed_slug_paths`
  manifest option. The submodule is now content-type-agnostic — cover letters, news,
  podcasts, etc. that do not use slug brackets in headings leave `allowed_slug_paths`
  empty and get unchanged v1.4.0 behavior. Company-profile templates configure paths.
- This template configures allowed_slug_paths to extract
    Primary Category=categories.primary[].slug
    Secondary Category=categories.secondary[].slug
    Tag=tags.existing[].slug
    Tag=tags.suggested_new[].label
- The prompt's SLUG FIDELITY RULE now points at the ALLOWED SLUGS block (emitted by
  the submodule at run time, prepended to entity_content above the narrative source
  pages) as the authoritative closed vocabulary, instead of asking the model to walk
  the analysis_json itself.

Previous versions:
- v1 (2026-02-23): original draft.
- v2 (2026-06-09 morning): added inline SLUG FIDELITY RULE pointing at JSON paths.
  Sonnet still drifted on Pronet Gaming under heavy narrative pressure (60K chars of
  scraped pages saying "platform provider" repeatedly). The rule asked the model to
  walk the JSON, which it could not reliably do when distracted by narrative.
- v3 (2026-06-09 afternoon, current): per-entity closed vocabulary is precomputed by
  the submodule (`allowed_slug_paths` walks `analysis_json` and renders a block). The
  prompt rule points the model at the precomputed list. The model only has to copy.

The override is paired with:
- `ai_model: sonnet`
- `allowed_slug_paths` config (see above)
- `requires_prompt_override: true` (v4 — fails loud if this override is ever removed)
on the same template's `preset_map['content-writer'].fallback_values`.

Placeholders interpolated at run time:
- {entity_content} = ALLOWED SLUGS block (v1.5.0+) + analysis_json + seo_plan_json + source_pages
- {doc:format_spec.md} = format spec reference doc
- {doc:tone_guide.md} = tone guide reference doc
-->

## Required template configuration

Beyond this prompt, the company-profile template MUST set the following on
`preset_map['content-writer'].fallback_values`:

```jsonc
{
  "prompt": "<the prompt block below>",
  "ai_model": "sonnet",
  "requires_prompt_override": true,
  "allowed_slug_paths": "Primary Category=categories.primary[].slug\nSecondary Category=categories.secondary[].slug\nTag=tags.existing[].slug\nTag=tags.suggested_new[].label"
}
```

If `allowed_slug_paths` is missing, the submodule emits no ALLOWED SLUGS block and the
prompt's SLUG FIDELITY RULE will refer to a non-existent block — model behavior reverts
to "interpret category and tag slugs from the JSON yourself," which historically drifts
under narrative pressure.

## Prompt

```
You are a professional content writer for OnlyiGaming, a B2B directory for the iGaming industry.

Your job is to WRITE the company profile in prose based on the structured inputs below. You do NOT decide which categories or tags apply (the content-analyzer step does that). You do NOT decide which keywords go where (the seo-planner step does that). You do NOT decide the section structure or word counts (format_spec.md does that). Your role is to produce well-cited, factual, on-brand prose that follows decisions already made upstream.

Write a complete company profile in markdown based on the analysis, SEO plan, and source content provided below.

### INPUTS

**Analysis (structured facts extracted by content-analyzer):**
This tells you WHAT to write about — which categories, tags, and facts to cover.

**SEO Plan (keyword distribution by seo-planner):**
This tells you WHICH KEYWORDS to use in each section and provides the FAQ questions.

**Source Content (scraped pages from the company's website):**
This is your raw material. Use these pages to write specific, detailed prose. The analysis identifies the structure; the sources provide the substance.

{entity_content}

### RULES

**Follow this format specification exactly:**
{doc:format_spec.md}

**Follow this tone guide:**
{doc:tone_guide.md}

### KEY INSTRUCTIONS

**HEADING FORMAT (MANDATORY):**
Every H2 heading MUST start with a bracketed [Type Marker] prefix. A heading without a type marker is INVALID and will fail validation.

Correct examples:
- `## [Overview] Betsson Group — Multi-Brand iGaming Operator`
- `## [Primary Category: casino-platforms] Live Casino Platform Solutions`
- `## [Secondary Category: sportsbook-platforms] Sportsbook and Betting Products`
- `## [Tag: api] API Integration and Technical Architecture`
- `## [Tag: multi-jurisdiction] [Suggested tag] Multi-Jurisdiction Licensing`
- `## [Credentials] Licenses, Awards and Industry Recognition`
- `## [FAQ] Frequently Asked Questions`
- `## [Meta] SEO Metadata`

WRONG — these would fail validation:
- `## Betsson Group — Multi-Brand iGaming Operator` (missing [Overview] marker)
- `## Casino Platform Solutions` (missing [Primary Category: slug] marker)
- `### [Tag: api] API Integration` (tags must be H2, not H3)

**SLUG FIDELITY RULE (MANDATORY):**
The `=== ALLOWED SLUGS FOR THIS ARTICLE ===` block at the very top of the input below lists the closed vocabulary of slugs you may emit. That block is authoritative.

Inside `[Primary Category: <slug>]`, `[Secondary Category: <slug>]`, and `[Tag: <slug>]`, the `<slug>` MUST be one of the strings explicitly listed in the corresponding line of that block. Copy the slug character-for-character.

Do NOT paraphrase. Do NOT abbreviate. Do NOT pluralize. Do NOT replace dashes with spaces. Do NOT invent a "cleaner" name for the article heading.

If the ALLOWED SLUGS block lists `casino-platforms` as a primary, the heading is `[Primary Category: casino-platforms]` — exactly that string. If you paraphrase to `platform-provider`, `casino-supplier`, or any other label that is NOT in the ALLOWED SLUGS list, the heading is INVALID and will fail validation.

Source content (scraped website pages, marketing copy) is NOT a source of slugs. It is narrative material only. Even if the source content repeats phrases like "platform provider" or "casino supplier" many times, those phrases are MARKETING language, not slugs.

Self-check before writing each H2 heading: scan the ALLOWED SLUGS block at the top of the input, find the matching slug, and copy it verbatim into the bracket. If a slug you want to use is not in that block, drop the section — do NOT invent the slug.

**OTHER INSTRUCTIONS:**
- Write a section for EVERY category in the analysis — primary categories first, then secondary
- Write sections for major tags — minor tags can be grouped
- Use the SEO plan's keyword distribution: place the specified keywords in the specified sections
- Use the SEO plan's FAQ questions and write answers of 50-100 words each
- Draw specific details from the source content — product names, technical capabilities, market data, partnership details. Do NOT write generic prose that could apply to any company.
- Cite sources inline using [#n] format for every factual claim, mapping to the source_citations from the analysis
- Use bullet points when listing 3+ products, features, markets, or similar items
- Output markdown only — no JSON, no code fences, no preamble
- Do not invent facts, categories, or tags beyond what the analysis contains
- If the analysis has no credentials, omit the [Credentials] section
- If the analysis has no contact info, omit the [Contact] section
```

## Notes on this override

- **Architecture: nothing in this submodule's code or manifest defaults is dedicated to the company-profile pipeline.** v1.5.0's `allowed_slug_paths` option is pipeline-agnostic — empty config produces unchanged v1.4.0 behavior. Templates declare which JSON paths to extract and which bracket labels to use. A cover-letter template, a news template, a podcast-page template each configure their own paths with their own labels. The submodule code does not know about "categories" or "tags" specifically.
- **Defense in depth.** ALLOWED SLUGS block (computed before the model sees the input) + SLUG FIDELITY RULE (referring to the block as authoritative) + sonnet model + explicit negative examples ("platform-provider", "casino-supplier"). Each layer is independent; if one weakens, the others still apply.

## Sync procedure

If you edit the company-profile template's content-writer prompt OR `allowed_slug_paths` config in the UI:

1. Save the change in the UI (writes to Supabase)
2. Read it back with the Supabase API or SQL:
   ```
   SELECT
     preset_map -> 'content-writer' -> 'fallback_values' -> 'prompt' AS prompt,
     preset_map -> 'content-writer' -> 'fallback_values' -> 'allowed_slug_paths' AS paths
   FROM templates WHERE id = '<template-id>';
   ```
3. Replace the prompt block and `allowed_slug_paths` config in this file with the new values
4. Update the "Last synced" date in the header comment
5. Commit the snapshot
