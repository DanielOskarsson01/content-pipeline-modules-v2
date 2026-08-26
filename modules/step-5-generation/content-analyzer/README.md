# Content Analyzer

> Structural fact extraction from scraped content. Classifies into categories, assigns tags, extracts key facts, and maps source citations.

**Module ID:** `content-analyzer` | **Step:** 5 (Generation) | **Category:** analysis | **Cost:** expensive
**Version:** 1.5.0 | **Data Operation:** add (+)

> **⚠ MODEL FLOOR -- minimum model: sonnet.** haiku-4-5 reads its reference taxonomy doc (`master_categories.md`) but does not comply with it: it fabricates categories instead of assigning from the configured list. Tested 2026-06, reproduced 100% of tries; sonnet resolves it. Any template running haiku on content-analyzer is misconfigured. Because the floor is a Claude-5 thinking model, a sonnet template must also override `max_tokens` to 32,768 -- the 16,384 default is haiku-sized and truncates a thinking model (see the manifest `usage_notes`).

---

## Background

### The Content Problem This Solves

After Steps 1-4, the pipeline has scraped, validated, and filtered pages - real text from real websites. But raw text is not structured knowledge. A company's About page, Products page, and Press page each contain fragments of information. No single page tells the full story. Before writing a profile, the system needs to *understand* the company: what it does, who it serves, how it positions itself, and what makes it different.

The original Content Creation Master described this as Node 6a - Analysis & Classification:
- *"Multi-source synthesis - cross-reference About, Products, Press, Partners pages"*
- *"Extract: primary/secondary categories, tags, USPs, founding year, HQ, employee count"*
- *"Every claim must cite which source URL it came from"*

This module is the first LLM-powered step in the pipeline. It reads all scraped pages for a company, sends them to an AI model, and gets back structured analysis JSON. This analysis becomes the foundation for everything downstream - SEO planning and content writing both depend on the quality of analysis here.

### How It Fits the Pipeline Architecture

This is the first shape change in the pipeline. Steps 1-4 all work with URL-shaped items (many items per entity). Content-analyzer collapses those into one analysis per entity - a fundamentally different output shape.

The Strategic Architecture describes this transition:
> *"Step 5 is where raw data becomes structured understanding. The input is many pages per company; the output is one structured profile per company."*

Content-analyzer uses the **add (+)** data operation - it reads from the Step 4 pool independently (not chaining from a previous Step 5 submodule) and produces fresh output. The user reviews the analysis before it feeds into seo-planner.

### Why Three Separate Submodules (Not One)

The analysis - planning - writing chain could be one monolithic step. Splitting it into three gives:

- **Human review at each stage** - catch wrong categories before they become wrong keywords before they become wrong articles
- **Reusability** - content-analyzer works alone for tagging projects (no writing needed), seo-planner + content-writer work without analyzer for topics where analysis comes from elsewhere
- **Cost control** - run the cheap planner multiple times to iterate on keyword strategy without re-running the expensive analyzer
- **Debugging** - when output is wrong, you know exactly which stage introduced the error

### The LLM Cost Reality

Content-analyzer is classified as **expensive** because it sends the full scraped text of every page to the LLM. For a company with 10 pages averaging 2,000 words each, that's 20,000 words of input per entity. With Sonnet, that's roughly $0.06-0.12 per company depending on output length.

The `max_content_chars` option exists specifically for cost control. At the default 200,000 characters (~33,000 words), even large companies fit comfortably. Companies with very long pages may need higher limits (up to 500,000), but the cost scales linearly. For cost-sensitive draft runs, lower to 30,000-50,000.

**Prompt caching (Anthropic).** The portion of the prompt *before* `{entity_content}` -- the instructions plus the reference-doc vocabulary (`master_categories.md` / `master_tags.md`, identical on every entity in a run) -- is sent as a cached prefix. On batches of 2+ entities within the 5-minute cache window, that stable prefix (~20K tokens) is re-read at ~10% input cost instead of re-charged in full. This is **billing-only** -- the model sees byte-identical input (verified by `test-cache-split.js`), and since the function-form replacement fix, scraped text containing `$`-sequences (`$$`, `$&`, etc.) no longer breaks the split -- it engages normally (asserted by `test-dollar-cache.js`). The remaining fallback-to-no-cache cases are structural: zero or multiple `{entity_content}` occurrences in the prompt template, or `{entity_content}` nested inside a `{doc:...}` token. Requires the skeleton `ai.complete` `cache_prefix` support to be deployed (it is, as of the #21 rollout).

### Reference Documents

Content-analyzer supports **reference documents** via the doc_selector option. The most important reference docs are:

- **master_categories.md** - Defines the fixed taxonomy (~80 categories with slugs, names, and descriptions). The analyzer MUST only assign categories from this list.
- **master_tags.md** - Defines available tags (~300 tags with slugs). The analyzer assigns from this list but may also suggest new tags for USPs not covered.

Other useful reference docs: classification guidelines, industry glossaries. These are project-level assets - upload once, use across every run.

### Critical Rules

**Output is structured JSON only** - not prose, not an article, not markdown. The analyzer extracts and classifies. The SEO planner and content writer handle planning and writing respectively.

**No summaries, opinions, or marketing prose.** v1.3.0 made this explicit: the analyzer is a "classification and fact-extraction machine." It does not produce summaries, differentiators lists, or target audience descriptions. Those are editorial judgements that belong in the writing step.

**Categories are a fixed taxonomy.** The analyzer assigns only from master_categories.md. It does NOT suggest new categories.

**Tags can be suggested.** If the analyzer identifies a USP not covered by existing tags, it may suggest new tags flagged as `"suggested_new"` for editorial review.

## Strategy & Role

**Why this module exists:** Transform raw scraped text into structured company understanding. This is the bridge between having pages (Step 4) and having knowledge (Step 5+). Every downstream content step depends on the accuracy of analysis here.

**Role in the pipeline:** First submodule in Step 5's three-part chain. Produces the foundational analysis that seo-planner and content-writer build upon.

**Relationship to other submodules:**
- **Receives from Step 4 pool:** Filtered scraped pages with text_content, title, word_count, url
- **Feeds into seo-planner:** Structured analysis_json (categories, tags, key facts, source citations)
- **Feeds into content-writer:** Same analysis_json (alongside seo-planner output and scraped source content)
- **Quality here determines quality everywhere downstream:** Wrong categories -> wrong keywords -> wrong article structure

## When to Use

**Always use when:**
- Building company profiles from scraped content
- You need structured categorization and fact extraction before writing

**Consider settings carefully when:**
- Companies have many pages (15+) - may exceed max_content_chars, prioritize About/Products pages
- Using reference docs - ensure master_categories.md matches your taxonomy
- Cost-sensitive runs - lower `max_content_chars`; do NOT drop below sonnet (the MODEL FLOOR) -- cost control here comes from input truncation, not model choice

**Can use standalone (without seo-planner/content-writer) for:**
- Bulk categorization of companies
- Tag assignment and taxonomy mapping
- Fact extraction for databases

## Options Guide

| Option | Default | When to Change | What It Does |
|--------|---------|----------------|--------------|
| `ai_model` | `haiku` *(below floor -- see MODEL FLOOR)* | **Minimum model: sonnet.** haiku fabricates taxonomy categories despite reading the reference doc (tested 2026-06, 100% of tries). The `haiku` manifest default is a legacy value; a template MUST set sonnet (opus if you also want higher extraction accuracy on complex companies) | Which model runs the analysis. **Registry-driven** (`values_from: registry.models`): the skeleton populates the dropdown from the shared LLM registry, scoped to the default provider -- not a hardcoded list in this manifest |
| `ai_provider` | `anthropic` | Switch providers to compare extraction quality or route around an outage; anthropic is the tested default | Which LLM provider to call. **Registry-driven** (`values_from: registry.providers`): the skeleton populates the values from the shared registry (anthropic, openai, perplexity, gemini, openrouter) |
| `reference_docs` | (none) | Always upload master_categories.md at minimum. Add master_tags.md, classification guidelines as needed | Selected docs are injected into the prompt where `{doc:filename}` placeholders appear |
| `temperature` | 0.2 | Rarely. The low default exists for consistent structured extraction; lower toward 0.0 for maximum re-run consistency | LLM temperature for the analysis call (range 0.0-1.0). Lower = more deterministic extraction |
| `max_tokens` | 16,384 *(haiku-era; override to 32,768 for the sonnet floor)* | Set 32,768 whenever the module runs sonnet -- i.e. always, per the MODEL FLOOR. The 16,384 default was sized for haiku (no thinking overhead); sonnet's adaptive thinking consumes the budget invisibly and 16,384 truncates, which the skeleton fail-closed guard turns into a run failure | Max LLM response length (range 1,024-32,768). Covers visible JSON + (on a Claude-5 model) invisible thinking tokens |
| `max_content_chars` | 200,000 | Lower to 30-50k for cost control on simple companies. Raise to 300-500k for companies with many long pages | Truncates assembled source text. 200k ~ 33,000 words, enough for most companies |
| `include_page_intent` | `false` *(byte-identical legacy framing)* | Flip `true` when the pool carries Step-2 intent classification (`page_intent`/`intent_confidence`) and you want the analyzer to see it — the v3 template does. ~25 extra tokens per page | B029-1 (v1.6.0). When on, each page in the assembled prompt gets a numbered header: `--- PAGE {n} ---` + `url:`/`title:` lines + `intent: {page_intent} (confidence {intent_confidence})` (intent line omitted for pages without one). `requires_columns` hydrates the two intent fields so they survive §7b rehydration |
| `json_retry` | `false` *(legacy: degraded raw-text success)* | Flip `true` (the v3 template does) so a non-JSON model response can never reach downstream modules as garbage | B029-3 (v1.6.0). One temperature-0 corrective re-ask embedding the invalid response (seo-planner v2.2.1 pattern; `cache_prefix` stripped on the retry). A second non-JSON response FAILS the entity loud: `meta.status:'error'`, `analysis_json:null`. Off = the old path: raw text in `section_analysis`, status success |
| `vocabulary_checks` | (empty -- gate inert) | Set for content types that enforce a closed vocabulary. One line per check: `<analysis_json.path[].slug>=<reference_doc_name>`, e.g. `categories.primary[].slug=master_categories.md`. Blank lines and `#` comments ignored. Leave empty for content types without a fixed taxonomy | Opt-in vocabulary-fidelity gate (v1.4.1): after analysis, every slug at each configured path must exist in the named reference doc. An out-of-vocabulary slug FAILS that entity; a missing/empty referenced doc refuses the whole run before any LLM call |
| `prompt` | (analysis template) | Customize when your taxonomy differs from default, or when you need different output fields (presets enabled -- templates override per run) | The full LLM instruction. Uses `{entity_content}` for scraped pages and `{doc:filename}` for reference docs |

The model options are no longer hardcoded: the manifest declares `values_from` and the skeleton resolves the actual provider/model lists from the shared LLM registry at load time. Adding a provider or model to the registry makes it available here with no manifest change. The two options that most often need attention are `ai_model` (the floor is sonnet) and `max_tokens` (must be raised to 32,768 alongside it) -- forgetting the second is the most common misconfiguration, because truncation on a thinking model fails the run.

## Recipes

### Standard Analysis
Balanced for most companies (sonnet is the capability floor -- see MODEL FLOOR):
```
ai_model: sonnet
ai_provider: anthropic
temperature: 0.2
max_tokens: 32768
max_content_chars: 200000
vocabulary_checks: (empty -- fidelity gate off)
reference_docs: [master_categories.md, master_tags.md]
```

### Quick Draft Analysis
Fast wiring/smoke-test only. **⚠ haiku is below the capability floor -- the categories it returns are fabricated (not from the master list) and must NOT be trusted or approved. Re-run on sonnet before relying on any output.**
```
ai_model: haiku
ai_provider: anthropic
temperature: 0.2
max_tokens: 16384
max_content_chars: 50000
vocabulary_checks: (empty -- fidelity gate off)
reference_docs: [master_categories.md, master_tags.md]
```

### Deep Analysis (complex companies)
For companies with many products/brands/subsidiaries:
```
ai_model: sonnet
ai_provider: anthropic
temperature: 0.2
max_tokens: 32768
max_content_chars: 300000
vocabulary_checks: (empty -- fidelity gate off)
reference_docs: [master_categories.md, master_tags.md]
```

### Categorization Only (fidelity-gated)
When you only need categories, not full analysis (sonnet is mandatory here -- categorization is the exact task haiku fails). The `vocabulary_checks` lines make invented slugs a loud per-entity failure instead of a silent pass:
```
ai_model: sonnet
ai_provider: anthropic
temperature: 0.2
max_tokens: 32768
max_content_chars: 50000
vocabulary_checks:
  categories.primary[].slug=master_categories.md
  categories.secondary[].slug=master_categories.md
prompt: (modified to only return categories section)
reference_docs: [master_categories.md]
```

## Expected Output

**Healthy result:**
- One analysis item per entity (company)
- All fields populated - categories, tags, key_facts
- Source citations mapping claims to source URLs/titles
- Primary category assigned for 95%+ of entities
- All categories from master list only - no invented categories
- Output is valid JSON - not prose, not markdown, not an article

**Output fields per entity:**
- `entity_name` - entity name (carried from input)
- `status` - `analyzed` or `error` (`error` includes a **hollow analysis** -- one the model returned as valid-but-empty JSON with no usable extracted content; v1.4.3 fails it loud instead of shipping it green)
- `summary_preview` - auto-generated preview from the first few meaningful values in the analysis
- `word_count` - total source words analyzed
- `model_used` - which AI model was used (e.g., "anthropic/haiku")
- `analysis_json` - the full structured analysis object (carried to pool for downstream submodules)
- `_dynamic_sections` - auto-generated section definitions for the detail modal (derived from the LLM's JSON keys)

**Detail view sections:** Dynamic -- auto-generated from the LLM's JSON response keys. Labels are derived from key names (e.g., `key_facts` → "Key Facts"). Sections display as prose (multi-line) or text (single-line) depending on content. If the LLM returns non-JSON, the raw response is shown as a single "Analysis" prose section.

**The analysis_json structure:**
```json
{
  "categories": {
    "primary": [
      {"slug": "fraud-prevention", "why": "Core product is a fraud detection platform", "source": "https://example.com/about"}
    ],
    "secondary": [
      {"slug": "kyc-services", "why": "Location verification contributes to KYC workflows", "source": "https://example.com/products"}
    ]
  },
  "tags": {
    "existing": [
      {"slug": "ai-powered", "why": "Shortlisted in AI Solutions category"},
      {"slug": "gdpr-compliant", "why": "Privacy policy confirms GDPR compliance"}
    ],
    "suggested_new": [
      {"label": "clone-app-detection", "why": "Unique USP not covered by existing tags", "evidence": ["https://example.com/gatekeeper"]}
    ]
  },
  "key_facts": {
    "founded": null,
    "headquarters": "Athens, Greece",
    "employees": null,
    "key_people": [
      {"name": "Spiros Tassis", "role": "Data Protection Officer", "source": "https://example.com/privacy"}
    ],
    "licenses": [
      {"detail": "GLI Control Assessment -- Blueprint and Gatekeeper solutions", "source": "https://example.com/press/gli"}
    ],
    "awards": [
      {"detail": "EGR B2B Awards 2025 -- AI Solutions Supplier (shortlisted)", "source": "https://egr.global/awards"}
    ],
    "partnerships": [
      {"detail": "Gaming Laboratories International (GLI) -- certification partner", "source": "https://example.com/press/gli"}
    ],
    "offices": ["Athens, Greece"],
    "contact": {
      "email": "info@example.com",
      "phone": null,
      "website": "https://example.com"
    }
  },
  "source_citations": [
    {"index": 1, "url": "https://example.com/about", "title": "About Us"},
    {"index": 2, "url": "https://example.com/press/gli", "title": "GLI Certification Announcement"}
  ]
}
```

**Red flags to watch for:**
- Empty categories - reference doc may not have been selected, or company pages lack clear positioning
- No source citations - LLM may be hallucinating facts. Check analysis_json against scraped content
- Categories not in master list - prompt is wrong, LLM ignored the fixed taxonomy constraint
- Many suggested_new tags - company may have niche offerings. Review for taxonomy gaps
- Output is prose instead of JSON - prompt is wrong, LLM wrote an article instead of analyzing

## Citation-Map Stability Across Loop Re-Runs (v1.5.0)

Downstream articles cite sources inline as `[#n]`, minted against this module's
`analysis_json.source_citations` numbering. A loop pass re-runs the analyzer,
and the model regenerates that map nondeterministically -- observed live on run
`cb49ef80` (Hacksawgaming): 52 entries on loop 0, 19 on loop 1, from
byte-similar input (`stop_reason: end_turn` both times -- not truncation). The
`add`-upsert then replaced the 52-entry map every existing ref was written
against, so the round-2 rewrite's citations broke (27 broken refs, citation
coverage 41.3% vs a 70% threshold).

Since v1.5.0 the map is **append-only across re-runs**: when the input pool
carries a previous `analysis_json.source_citations` (hydrated via
`requires_columns`, which now includes `analysis_json`), the previous entries
are preserved verbatim -- same index, same URL -- and only genuinely new URLs are
appended after the previous max index. Refs minted against any earlier version
of the map stay resolvable.

- The previous map is selected as the candidate with the **highest max index**
  among pool items (§7b hydration broadcasts `analysis_json` onto every
  entity-keyed item, so stale copies can coexist; under append-only merging the
  most-evolved map always has the highest max index).
- The merge runs **after** the hollow-analysis gate -- preserved citations can
  never rescue a hollow analysis.
- A fresh (loop-0) run is untouched: no previous map, model output kept as-is.
- If a re-run's model output is valid JSON that omits `source_citations`, the
  previous map is preserved rather than dropped.
- Legacy-shaped maps (v1.0.0 plain URL strings, v1.2.0 `{claim, sources}`)
  are never merged -- the fix disengages and behaves exactly as pre-v1.5.0.

**Known residuals (documented, not fixed here):**

- **Non-JSON re-run responses still lose the map.** If the model answers in
  prose instead of JSON on a re-run, the raw-text path ships
  `analysis_json: null` and the add-upsert replaces the map -- the pre-v1.5.0
  collapse in full. Preserving the map there is NOT safe today because
  content-writer and seo-planner branch on `analysis_json` *truthiness* for
  their raw-text fallback -- a citations-only object would silently suppress
  that fallback. Closing this needs a fallback-aware change in those consumers
  first.
- **Downstream delivery of the merged map depends on skeleton §7b hydration.**
  `analysis_json` is stripped to per-run item data and re-hydrated for
  consumers; when multiple analyzer runs exist at the same step, the skeleton's
  row selection ties on `step_index` and the winning copy is arbitrary. The
  append-only guarantee is enforced *inside this module*; end-to-end
  determinism needs a skeleton tiebreaker (loop_iteration / recency).
- **URL-variant entries accumulate.** Dedup is by exact trimmed URL string, so
  `http/https` or trailing-slash variants of the same page can accrete separate
  indices across loops. The map stays resolvable; it just grows.

## Limitations & Edge Cases

- **Token limits** - Very large companies with 20+ long pages may exceed model context. max_content_chars prevents crashes but means some pages are truncated. **Truncation is now visible (B029-2, v1.6.0, always-on):** when the assembled source exceeds `max_content_chars`, the module logs a warning and stamps `content_truncated: true`, `content_chars_total` (pre-truncation length) and `content_chars_kept` on the result item AND `meta` — previously the only trace was an in-prompt marker the operator never saw. Under-cap runs carry none of these fields, and the prompt bytes are unchanged either way
- **Hallucination risk** - LLMs can infer facts not present in source text (e.g., guessing founding year from domain age). Source citations help catch this, but human review is essential
- **Category quality depends on reference doc** - Without master_categories.md, the LLM invents its own taxonomy. Garbage taxonomy in -> garbage categories out
- **Fixed taxonomy means missed companies** - If a company's core business doesn't match any of the ~80 categories, it will only get secondary assignments or no categories at all. Expand the taxonomy manually rather than letting the AI create one-off categories
- **Single-language assumption** - The default prompt is in English and expects English-language source text. Non-English companies may need a modified prompt
- **No cross-entity intelligence** - Each company is analyzed independently. The model doesn't know what categories other companies received, so consistency depends on the reference doc
- **JSON parse fragility** - LLMs occasionally return non-JSON. The parser strips markdown code fences (including truncated fences from max_tokens cutoff) and extracts the outermost JSON object past any preamble/trailing text. If parsing still fails, the DEFAULT behavior is unchanged: the entity does NOT error -- the raw model text is displayed as a single "Analysis" prose section and the item ships with `analysis_json: null`, a degraded success, visible in the detail view but unusable for structured downstream consumption. **With `json_retry: true` (B029-3, v1.6.0)** the module instead issues ONE temperature-0 corrective re-ask embedding the invalid response (the seo-planner v2.2.1 pattern, `cache_prefix` stripped); if the retry also fails to parse, the entity FAILS loud (`meta.status:'error'`, `analysis_json: null`) so garbage can never reach content-writer looking like success
- **Hollow-analysis content gate (v1.4.3, M2 -- always on)** - shape-valid is not content-valid. If the model returns a *valid-but-empty* analysis (e.g. `{}` or `{ categories: [], key_facts: {} }` -- parses fine, but carries no usable extracted value), the module now fails **loud**: the entity gets `meta.status:'error'` and turns red, instead of shipping an empty analysis as success. "Usable" is defined from the downstream requirement, not arbitrarily: content-writer and seo-planner both serialize the *entire* `analysis_json` into their prompt, so an empty analysis cascades into a hollow profile one step downstream -- this is the producer-side twin of the seo-planner hollow-plan gate. The gate names no field (the schema is fully dynamic, per Rule 13); it fails only when *every* leaf is empty, and one real string/number/boolean anywhere makes the analysis usable (so a partly-populated analysis still passes). **Boundary:** this covers the parsed-but-empty case only -- a *non-JSON* response (parse fails) keeps its existing raw-text path (its raw text still flows to content-writer via the whole-item fallback), so it is degraded, not empty. Not a salvage: no default substitution, no retry-into-empty, no warning downgrade.
- **Vocabulary fidelity gate (v1.4.1, opt-in)** - the optional `vocabulary_checks` option turns the "garbage taxonomy" risk above into a loud failure instead of a silent pass. When configured (e.g. `categories.primary[].slug=master_categories.md`), the module (a) pre-flight FAILS the run before any LLM call if a referenced vocab doc is missing/empty, and (b) FAILS any entity whose assigned slug at a configured path is not present in the named doc. Leave empty (default) and the gate is inert -- the module behaves exactly as before. The slug-membership check is deliberately lenient (it never rejects a slug that appears in the doc) so it cannot false-fail a valid run; its job is to catch grossly-invented slugs. Operator note: the vocab doc must contain each allowed slug as a contiguous token (e.g. `casino-platforms`, not `casino - platforms`) -- the real master_categories.md / master_tags.md formats already satisfy this.

## What Happens Next

After the user reviews and approves the analysis, items enter the working pool with `source_submodule: "content-analyzer"`. These are picked up by **seo-planner**, which uses the analysis_json to plan keyword distribution, meta tags, and FAQs. The user reviews the SEO plan, then **content-writer** uses the analysis, SEO plan, and the original scraped source content to write the full company profile.

The analysis_json is the single source of truth for downstream submodules. If a category is wrong here, it propagates through the entire chain. This is why human review at this stage is critical - it's cheaper to fix a category assignment than to regenerate an entire article.

## Technical Reference

- **Step:** 5 (Generation)
- **Category:** analysis
- **Cost:** expensive
- **Data operation:** add (+) - reads Step 4 pool independently, produces analysis per entity
- **Pool precondition:** `requires_items` - the module needs scraped items in the pool for an entity; the skeleton skips (does not fail) entities with an empty pool, and inside execute an entity with zero items is recorded as `skipped` with 0 pages analyzed
- **Requires:** `text_content`, `entity_name`, `analysis_json`, `page_intent`, `intent_confidence` fields hydrated on input items (`analysis_json` carries this module's own previous output on loop re-runs -- it feeds the v1.5.0 citation-map merge; the two intent fields feed the v1.6.0 `include_page_intent` framing)
- **Input:** `input.entities[]` with `items[]` from Step 4 working pool (scraped pages grouped by entity)
- **Output:** `results[]` grouped by `entity_name`, one item per entity containing flattened display fields + `analysis_json` object
- **Display type:** cards (not table) - one card per entity with expandable detail modal
- **Selectable:** true - operators approve/reject entire entity analysis
- **Detail view:** `detail_schema` with header (entity_name, status as badge, model_used) and dynamic sections auto-generated from LLM JSON keys via `_dynamic_sections`
- **Error handling:** LLM failures and missing input are handled per-entity (partial success pattern). JSON parse failures fall back to displaying raw LLM text as a prose section (degraded success, `analysis_json: null`). A parsed-but-hollow analysis (valid JSON, no usable content leaf) fails the entity loud with `meta.status: 'error'` (v1.4.3 content gate). Failed entities include the error message in a dynamic error section. With `vocabulary_checks` configured (v1.4.1), a missing/empty referenced vocab doc refuses the whole run before any LLM call, and an out-of-vocabulary slug fails that entity with an error naming the slug + source doc. Partial results are pushed to `tools._partialItems` after every entity so a timeout doesn't destroy progress.
- **Dependencies:** `tools.ai` (LLM calls; supports `cache_prefix` for the Anthropic prompt-cache split), `tools.logger`, `tools.progress`. Provider/model values resolve from the shared LLM registry via the manifest's `values_from` declarations
- **Files:** `manifest.json`, `execute.js`
- **v1.6.0 (B029, template-v3 unit):** `include_page_intent` framing option (default off, byte-identical legacy prompt; on = numbered url/title/intent per-page headers), always-on input-truncation visibility (`content_truncated`/`content_chars_total`/`content_chars_kept` on item + meta when over cap), `json_retry` option (default off; on = one corrective temperature-0 re-ask then loud fail). Tests: `test-b029.js` (39 assertions) + the pre-existing suites
