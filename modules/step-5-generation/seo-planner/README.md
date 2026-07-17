# SEO Planner

> Keyword distribution planner with web-researched keyword data. Selects target keywords and produces meta tags, optional FAQs, and section-level keyword distribution. The manifest default is fully project-agnostic; pipeline-specific shapes (e.g. company-profile section breakdowns) come from template-level prompt overrides.

**Module ID:** `seo-planner` | **Step:** 5 (Generation) | **Category:** planning | **Cost:** expensive
**Version:** 2.3.1 | **Data Operation:** add (➕)

> **⚠ MODEL FLOOR (inferred by analogy — UNVERIFIED) — recommended minimum model: sonnet.** Daniel's 2026-06 doc-non-compliance test covered content-analyzer, NOT seo-planner. seo-planner shares the same doc-following pattern (it reads `format_spec.md` / `tone_guide.md` and must honor a strict JSON output contract), so the risk that haiku reads its reference docs without complying is plausible here — but it has **not** been reproduced. Treat sonnet as the recommended floor pending a seo-planner-specific test; do not present it as proven. Moving to sonnet also means overriding `max_tokens` to 32,768 — the 16,384 default is haiku-sized (see the manifest `usage_notes`).

---

## Background

### The Content Problem This Solves

Content-analyzer produced structured understanding - categories, tags, key facts. But structured data isn't a writing plan. Before writing 2,000 words, someone needs to decide: which keywords to target, where to place them, what questions to answer, and how to optimize the content for search engines.

Without an SEO plan, the content-writer has to make all these decisions simultaneously while also writing prose. That produces mediocre results - generic keyword usage, missed FAQ schema opportunities. Separating planning from writing lets each step focus on what it's best at.

The original Content Creation Master described this as Node 6b - Tone & SEO Plan:
- *"For each entity, produce: target keywords, slug suggestion, meta-title (<=60 chars), meta-description (150-160 chars)"*
- *"FAQ questions based on buyer intent and search patterns"*

### How It Fits the Pipeline Architecture

SEO Planner is the second submodule in Step 5's chain, sitting between analysis and writing:

```
content-analyzer (＝) -> seo-planner (➕) -> content-writer (➕)
```

It uses the **add (➕)** data operation - it chains from the working pool, finding content-analyzer output by the `source_submodule` field, and adds its own output alongside. After approval, the pool contains both analysis items and SEO plan items, distinguished by `source_submodule`.

This is the cheapest step in the chain. The input is just the analysis JSON (a few KB), not the full scraped text (50KB+). This makes it safe to re-run multiple times while iterating on keyword strategy without significant cost.

### v2.3.0: Quantitative keyword-data providers (2026-07-07)

Adds an **additive** `keyword_data_providers` layer that grounds the plan in **real numbers** — search volume, keyword difficulty, own-site rank/impressions/clicks — from SEO/search APIs, running **alongside** the qualitative (Perplexity) research, not instead of it. It resolves the long-standing limitation that seo-planner "explicitly refuses to invent volume numbers" and had "no search volume data."

**Empty by default → fully inert.** The `keyword_data_providers` default is `[]`, so existing templates make **zero** extra API calls and produce **byte-identical** output (proven via A/B diff against the prior version on the empty-providers path). The whole layer only activates when a template configures at least one provider.

**How it works.** Per entity: (1) seeds are derived generically (entity name + conventional analysis fields — categories/tags/primary_category/industry/keywords); (2) **expansion** providers widen the seed set; (3) **metrics** providers score the widened set with real numbers; (4) results normalize to `keyword_metrics[]` and are attached to `seo_plan_json.keyword_metrics` (an **additive** audit-trail field — the backbone `target_keywords`/`meta`/`faqs`/`keyword_distribution`/`keyword_sources` are untouched). To feed the numbers into the planning LLM, add a `{keyword_metrics}` placeholder to your prompt override; the metrics land in `seo_plan_json.keyword_metrics` regardless of whether the prompt uses them.

**Built-in provider kinds** (see [Keyword Data Providers](#keyword-data-providers-v230) for the full config schema): `gsc` (Google Search Console — **free**, own verified properties only, real rank/impressions/clicks), `dataforseo` (**paid** — true search volume + CPC + competition via the Google-Ads live endpoint), `autocomplete` (**free**, no auth — seed expansion). New providers of an existing kind are config-only; a new kind is one small handler.

**Cost guards** (only apply when the layer is active): `max_seed_keywords` (25), `max_metric_lookups_per_entity` (100), `per_run_budget_usd` (1.0 — refuses paid lookups past the cap, warns, continues with free providers), and `metrics_required` (loud warning if the layer produces nothing — never silent). A provider with missing credentials is **config-present-but-inert** (warning + skip, never a failure). Pipeline-agnostic per Rule 13: the GSC site URL, DataForSEO locale, and provider selection are all template config; the manifest carries no domain, vertical, or content-type assumptions. Tested in `test-keyword-data.js` (82 assertions; the real RS256 JWT signing path is exercised with a throwaway keypair). **GSC live-verify deferred** (the service-account key was not resolvable in the build shell) — see [Limitations](#limitations--edge-cases).

### v2.2.1: Corrective JSON retry (2026-06-13)

The defensive parser (v2.2.0) recovers JSON when markdown *headings leak into* an otherwise-JSON response. It cannot recover when the model returns the entire plan as **markdown prose** (no JSON object at all) — observed 2026-06-13 on a template whose prompt had lost its `OUTPUT FORMAT`/JSON-contract section, so sonnet produced a readable report instead of JSON. v2.2.1 adds `completeWithJsonRetry`: on a parse failure it re-issues the call **once** at `temperature: 0` with a strict JSON-only correction that includes the prior (invalid) response and asks the model to re-output the same information as a single JSON object (a reformat, which models comply with reliably). On a second failure it still throws loudly, preserving `rawText`. The retry is pipeline-agnostic — it names no content-type-specific keys, only constrains the output format — so it protects every template against prompt drift and stochastic markdown. The root-cause fix for a missing JSON contract still lives in the template prompt (the `OUTPUT FORMAT` section); this retry is the second line of defense. Tested in `test-json-retry.js`.

### v2.2.0: Agnostic Manifest + Per-Template Refusal Flag + Defensive Parser (2026-06-09)

v2.2.0 is the pilot of an architectural principle that will be rolled out across all submodule manifests: **manifest defaults must be 100% project-agnostic**. Pipeline-specific shape (company-profile categories/tags/credentials sections, news-article lede/quotes, podcast episode/guest structure, etc.) lives only in template-level prompt overrides, never in manifest defaults.

#### What changed

1. **Manifest default prompt is now fully agnostic.** All references to company-profile concepts (categories, tags, credentials, FAQ sections by name, 5-FAQ hardcoding, B2B/iGaming framing) have been removed from `options[prompt].default` and the matching `options_defaults.prompt`. The agnostic default produces a flat plan: `target_keywords` (primary/secondary/long_tail), `keyword_sources` (provenance audit), `meta` (title/description with character counts), `faqs` (count-driven), `tone_notes`, `warnings`, and a free-form `keyword_distribution: {}` object that the template fills via `format_spec.md`.

2. **New `requires_prompt_override` option (boolean, default `false`).** Per-template fail-loud flag. When a template sets this `true` via `preset_map.<sub>.fallback_values.requires_prompt_override` and the runtime prompt equals the manifest default (no override configured), seo-planner refuses the run *before* any keyword research fires, with an actionable error: *"Template requires a seo-planner prompt override but none is configured. Upload a prompt override in this template's seo-planner settings, or unset requires_prompt_override on this template."* When the flag is `false` (or absent), the agnostic manifest default is a legitimate run path.

3. **Refusal detection is comparison-based, not sentinel-based.** `execute.js` loads its own manifest at module-load time and stores `MANIFEST_DEFAULT_PROMPT`. The refusal trigger is strict equality: `options.prompt === MANIFEST_DEFAULT_PROMPT`. Any UI edit — even a single-character tweak — counts as an override and proceeds. No sentinel string is injected into the prompt text. (Detection survives all edit styles.)

4. **New `faq_count` option (number, default 0).** Drives FAQ count on the agnostic path (`{faq_count}` placeholder in the manifest default prompt). On override paths, `faq_count` is ignored unless the override prompt explicitly uses the `{faq_count}` placeholder. Single source of truth per run: either the override's hardcoded count or `faq_count`, never both.

5. **Defensive parser with markdown-leak recovery.** `parseJsonResponse()` now runs a defensive cleanup pass when initial parse fails: it strips lines starting with `#` (markdown headings) from inside the extracted JSON region and retries. This recovers from the failure pattern seen in 2026-06-08 production runs where the LLM emitted `# KEYWORD PLAN` headings before or inside the JSON.

6. **Raw LLM output preserved on parse failure.** When JSON parsing fails after defensive cleanup, the error carries the original (pre-cleanup) LLM response as `err.rawText`. The catch block in `execute()` logs the first 2000 characters of that raw text to the submodule_run's `logs` array. Forensic diagnosis after a parse failure is now minutes instead of hours.

7. **JSON-only enforcement strengthened in the prompt.** The agnostic default's OUTPUT FORMAT section ends with: *"The first character of your response MUST be `{` and the last character MUST be `}`. No markdown headings before, after, or inside the JSON. No code fences. No explanation. No preamble."* The defensive parser is the second line of defense; the prompt is the first.

#### Semver decision

This is a **minor bump (2.1.0 → 2.2.0)**, not major, because no code path in `content-pipeline-v2/` or `content-pipeline-modules-v2/` consumes manifest defaults at the field-name level. The skeleton's `moduleLoader.js` and `submoduleRuns.js` pass `output_schema` through as `output_render_schema` for the UI's result cards, but downstream submodules (content-writer, tone-seo-editor, meta-compliance-checker, keyword-sufficiency-checker) introspect runtime `seo_plan_json` data, not the manifest. Documented assumption: if a future consumer of manifest defaults emerges, the consumer needs to handle the now-thinner agnostic schema, but the existing four are unaffected.

#### Configuring per content type (template prompt overrides)

The manifest default is a legitimate generic run path. Pipelines that need section-structured output (the company-profile pipeline today, future news/podcast/marketplace pipelines tomorrow) override the prompt via the template's `preset_map.<sub>.fallback_values.prompt`, paired with `requires_prompt_override = true` to fail-loud if the override is later removed.

Three example template configurations:

##### Example A — Company-profile pipeline (live: template `7th june 17.15`)

```jsonc
{
  "preset_map": {
    "seo-planner": {
      "fallback_values": {
        "requires_prompt_override": true,
        "prompt": "You are an SEO strategist for OnlyiGaming, a B2B directory ... [full text in /modules/step-5-generation/pipeline-company-profiles/seo_planner_prompt.md]",
        "ai_model": "sonnet"
      }
    }
  }
}
```

Output shape: target_keywords + keyword_distribution with **categories[]** / **tags[]** / **credentials** / **faq** sub-objects + 5 hardcoded FAQs + meta. The override's prompt drives FAQ count (hardcoded 5); `faq_count` is unused on this path.

##### Example B — News-article pipeline (hypothetical)

```jsonc
{
  "preset_map": {
    "seo-planner": {
      "fallback_values": {
        "requires_prompt_override": true,
        "prompt": "You are an SEO strategist for a news outlet ... Map keywords to: lede, nut graf, quotes, context, callout box ...",
        "faq_count": 0,
        "ai_model": "haiku"
      }
    }
  }
}
```

Output shape: target_keywords + keyword_distribution with **lede / nut_graf / quotes / context / callout** sub-objects + 0 FAQs (news articles don't use FAQ schema) + meta.

##### Example C — Podcast-episode pipeline (hypothetical)

```jsonc
{
  "preset_map": {
    "seo-planner": {
      "fallback_values": {
        "requires_prompt_override": true,
        "prompt": "You are an SEO strategist for a podcast ... Map keywords to: episode_summary, timestamps, guest_intros, key_takeaways ...",
        "faq_count": 3,
        "ai_model": "haiku"
      }
    }
  }
}
```

Output shape: target_keywords + keyword_distribution with **episode_summary / timestamps / guest_intros / key_takeaways** sub-objects + 3 FAQs + meta. Podcast pipeline uses the `{faq_count}` placeholder in its prompt to make count template-configurable.

#### Cross-submodule schema coupling (downstream consumers)

Override prompts must produce a `seo_plan_json` shape that downstream submodules can read. The shared, backward-compatible backbone is:

| Field | Required by | Required value |
|---|---|---|
| `meta.title` (string) | content-writer | Any non-empty string |
| `target_keywords.primary` (string) | meta-compliance-checker, tone-seo-editor, keyword-sufficiency-checker | Any non-empty string |
| `target_keywords.secondary` (string[]) | (same as above) | Array of strings (can be empty) |
| `target_keywords.long_tail` (string[]) | (same as above) | Array of strings (can be empty) |

Optional fields downstream consumers handle gracefully when present:

| Field | Used by | What it enables |
|---|---|---|
| `meta.description`, `meta.title_chars`, `meta.description_chars` | meta-compliance-checker | Per-field length compliance checks |
| `keyword_distribution.overview.headline_keywords[]` | keyword-sufficiency-checker | Extra head-term coverage source |
| `keyword_sources` | (forensic audit only) | Records which research query each keyword came from |
| `faqs[].{question, answer_brief, target_keyword}` | content-writer (carried in JSON.stringify) | FAQ section in the article |
| `tone_notes` | tone-seo-editor (carried in JSON.stringify) | Tone guidance for the editor |
| `warnings[]` | UI display | Operator review flags |

Override prompts that produce additional `keyword_distribution` sub-objects (categories/tags/credentials/faq for company profiles, etc.) are extensions on top of this backbone — they don't replace it.

### v2.1.0: Prompt Coherence + Configurable Perplexity Model (2026-06-07)

v2.1.0 closes the half-migration left by v2.0.0. v2.0.0 swapped IN Perplexity keyword research but left the LLM prompt scaffolded as if a `keyword-summary.md` reference document were still the source. v2.1.0 makes the whole submodule coherent with the Perplexity-as-source design.

Changes:

1. **New `perplexity_model` option** — operators can choose between Perplexity's Sonar tiers without editing code:
   - `sonar` (default) — cheapest, fastest, basic search grounding
   - `sonar-pro` — better quality, more expensive
   - `sonar-reasoning` — chain-of-thought capable for complex queries
   - `sonar-reasoning-pro` — top-tier reasoning, highest cost
   
   Previously hardcoded to `sonar` in execute.js.

2. **Restructured `research_queries` default** — three queries are now explicitly labeled (Query 1 Core / Query 2 Competitor / Query 3 Real Questions) with B2B/audience inference, source URL requests, and a 3+3+3+3 forced split on Query 3 (definitional, comparison, operational, problem-framed). Previously: vague "include primary, long-tail, related" wording, asked Perplexity for "estimated search intent and competition level" (data Perplexity does not have — would be invented), allowed 8-12 questions (downstream uses exactly 5).

3. **Restructured main LLM prompt** — adds an upfront CRITICAL RULE section explicitly forbidding LLM training-data invention of keywords, with one defined exception (entity-name-prefixed long-tail constructions). Adds a section 7 CITATION rule that requires per-keyword provenance tags (Q1/Q2/Q3/analysis) for audit. Reinforces the FAQ rule to pick exactly 5 from Query 3's 12 verbatim, with a documented FAQ shortage warning if fewer are answerable.

4. **Added `keyword_sources` to the output schema** — alongside `target_keywords`, the LLM now records which query (Q1/Q2/Q3) each keyword came from. This lets us audit drift over time: if a keyword is tagged "analysis" or untagged, the LLM is falling back to its training data.

5. **Expanded warnings list** — added explicit categories: meta length problems, keyword gaps, FAQ shortage, research absence.

6. **Manifest metadata updates** — description now mentions Perplexity grounding; reference_docs description demotes `keyword-summary.md` to "fallback when keyword_research disabled" rather than primary input.

7. **Agnosticism polish (post-CTO review)** — four additional refinements before commit:
   - `keyword_sources` schema uses `Q<n> | analysis` notation (n = 1-based query number) rather than hardcoded Q1/Q2/Q3, so templates with non-default query counts (1-5 queries supported) audit correctly.
   - `usage_notes` cost claim shows range (defaults ~$0.025 to max ~$0.25/entity), not a single number that misleads operators choosing expensive Sonar tiers.
   - Exception clause for entity-specific long-tail keyword construction now includes consumer/comparison/podcast/news examples alongside B2B, so the rule reads as audience-agnostic rather than B2B-only.
   - **New explicit fallback instruction in the INPUTS section** — when `{keyword_research}` arrives empty (Perplexity failed, timed out, or was disabled), the LLM is now instructed to emit a HIGH-PRIORITY warning to the output, tag all keywords as `analysis` in `keyword_sources`, and NOT silently produce a plan as if research succeeded. This makes silent Perplexity failures loud and operator-visible. Confirmed needed by the Pronet Gaming + Wazdan v2.0.0 baseline run (2026-06-07 run aa81daa2) which fell through to the empty-research fallback without any clear signal to operators that research had not actually fired.

### v2.0.0: Keyword Research Pre-Step via Perplexity Sonar

v2.0.0 adds a web research step that runs **before** the SEO planning LLM call. Instead of relying on general LLM knowledge to select keywords, the module now:

1. Runs 1–5 configurable search queries via the Perplexity Sonar API
2. Synthesizes the results into a structured keyword research block
3. Injects that block into the planning prompt as `{keyword_research}`

This replaces manually uploaded `keyword-summary.md` reference docs and eliminates the need for expensive tools like Ahrefs. The planning LLM now works from actual search data rather than guessing.

The three default queries cover: primary search demand, top-ranking competitor articles, and People Also Ask signals. All queries support `{entity_name}` and `{entity_context}` placeholders.

**Cost note:** Perplexity Sonar API charges per request (~$0.005 each). Three queries per entity = ~$0.015/entity. At 100 entities, that's $1.50 for keyword research. Toggle `keyword_research: false` to skip for batches where cost matters.

### v1.3.0: Keyword Distribution Only

In v1.3.0, the SEO planner's role was clarified: it produces a **keyword distribution plan** only. It does NOT define article structure - that is fixed in `format_spec.md`. The planner maps which keywords should appear in which predefined sections (overview, categories, tags, credentials, FAQ).

This prevents the problem of two competing structures - an outline from the planner vs a format spec for the writer - which caused the content-writer to produce inconsistent results.

### Why Planning Before Writing Matters

The split between planning and writing exists for three reasons:

1. **Human checkpoint** - An editor can review and adjust keywords and meta tags before the expensive writing step. Changing a keyword costs nothing; regenerating an article costs $0.10+
2. **SEO quality** - Keyword research requires different thinking than prose writing. An LLM given both tasks at once tends to sacrifice one for the other
3. **Reusability** - The same SEO plan can feed different content-writer configurations (different tones, different formats) without re-planning

### Reference Documents for SEO Planning

The doc_selector option is valuable here for keyword packs - CSV or markdown files listing target keywords, search volumes, and competition levels. With a keyword pack, the LLM selects from known high-value terms rather than guessing. Without one, keyword selection is based on the LLM's general SEO knowledge, which is decent but not data-driven.

Other useful reference docs: format_spec.md (defines the fixed section structure), tone_guide.md (voice rules), competitor keyword analyses.

## Strategy & Role

**Why this module exists:** Transform company analysis into an actionable SEO keyword plan. The plan bridges the gap between understanding a company (analysis) and writing about it (content-writer).

**Role in the pipeline:** Second submodule in Step 5's chain. Receives analysis, produces keyword distribution that content-writer follows.

**Relationship to other submodules:**
- **Receives from content-analyzer:** analysis_json with categories, tags, key facts
- **Feeds into content-writer:** seo_plan_json with keywords per section, meta tags, FAQs
- **Does NOT access scraped text** - works purely from the structured analysis. This keeps it cheap and fast
- **Does NOT define article structure** - structure is fixed in format_spec.md

## When to Use

**Always use when:**
- Building SEO-optimized content of any kind
- You want human review of keywords/meta before expensive writing

**Consider settings carefully when:**
- Using keyword packs - ensures the LLM picks from your researched keywords rather than guessing
- FAQ questions matter for schema markup

**Can skip when:**
- Writing non-SEO content (internal reports, emails)
- Content-writer is given a very specific prompt that already includes keyword guidance

**Can use without content-writer for:**
- Generating content briefs for human writers
- Keyword planning for manual content creation
- SEO audits - compare planned vs actual keyword usage

## Configuring per content type

The manifest defaults are pipeline-agnostic. Content-shape decisions (how many FAQs, which sections appear in `keyword_distribution`, what voice the meta description has) are NOT manifest options — they live in the **prompt**, which is itself a configurable option.

### How to change content-shape defaults

Override the `prompt` option at template level. Patterns:

**Change FAQ count.** The default prompt says *"Write exactly 5 FAQ questions..."* For a news article (3 FAQs), comparison piece (8 FAQs), or knowledge-base article (10 FAQs), copy the manifest default into your template's `preset_map.seo-planner.fallback_values.prompt`, edit the count, and save. No manifest change required.

**Change output schema sections.** The default prompt's OUTPUT FORMAT shows `keyword_distribution` with `overview`, `categories`, `tags`, `credentials`, `faq` keys. A news template might replace `credentials` with `sources` and add `timeline`. A podcast template might use `episodes`, `guests` instead of `categories`, `tags`. The LLM follows whatever schema your template's prompt shows it — replace the schema block in the prompt override, and the output structure changes accordingly.

**Change vertical / audience framing.** The default prompt says nothing about iGaming, B2B, OnlyiGaming, or any other vertical (per the May 22 architectural commitment). To target consumer reviews, B2B operators, job seekers, podcast listeners, etc., specify that context in the template's prompt override. The OnlyiGaming-specific framing for the `30 april` template (company profile generation) lives in that template's `preset_map.seo-planner.fallback_values.prompt`, NOT here.

**Change number of research queries.** The `research_queries` option supports 1-5 queries (per execute.js warning at line 264-266). Template authors edit the `research_queries` value to add/remove query slots; the main prompt's `keyword_sources` schema uses `Q<n>` notation so it adapts to any query count.

### Why this pattern?

Per modules-v2 CLAUDE.md (Rule 12 + Architectural Commitments): *"Content type variation is handled via configuration (cards, prompts, reference docs) of a small number of flexible generic modules. Specialized modules per content type are an anti-pattern."* Adding `faq_count`, `output_schema_sections`, or similar manifest options for every content-shape knob would multiply the option surface; using template prompt overrides keeps the manifest small and the configuration flexible.

### Cross-submodule schema coupling

When changing seo-planner's OUTPUT FORMAT schema in a template prompt override, the downstream submodules may depend on specific field names. Verified consumers of `seo_plan_json` (as of 2026-06-07):

| Consumer | Fields read |
|----------|-------------|
| content-writer | Whole blob via `JSON.stringify` — additive schema changes safe; removing fields it iterates may break |
| tone-seo-editor | `target_keywords.{primary, secondary, long_tail}` by name |
| meta-compliance-checker | `target_keywords.{primary, secondary, head_terms, keywords}` |
| keyword-sufficiency-checker | `target_keywords.*` + `keyword_distribution` (iterates by name) |
| meta-output, schema-org-injector (Step 8) | `target_keywords`, `meta`, `faqs` |
| json-output (Step 8) | Whole blob |
| hallucination-detector, citation-coverage-checker | Don't read seo_plan_json |

**Before changing the schema in a template prompt override**, grep these consumers for the field names you intend to remove or restructure. If a consumer iterates a field you remove, you'll need to either (a) keep the field but document it as empty for the new content type, OR (b) configure the consumer's prompt override (or skip the consumer entirely in the template) to match.

**Additive fields are safe.** `seo_plan_json.keyword_metrics[]` (v2.3.0) is an additive audit-trail field present **only** when the keyword-data layer is active. It does not touch the backbone fields above, so it is safe for every consumer (content-writer/json-output read the whole blob and simply carry it; the by-name consumers don't read it).

## Options Guide

| Option | Default | When to Change | Impact |
|--------|---------|----------------|--------|
| `keyword_research` | true | Set false to skip web research and reduce cost/latency | When true, runs Perplexity Sonar queries before the planning LLM call |
| `search_provider` | perplexity | Only `perplexity` supported in v2.0.0 | Controls which search API is used for keyword research |
| `research_queries` | (3 default queries) | Customize for specific industries, pipelines, or entity types | One query per line. Supports `{entity_name}` and `{entity_context}` placeholders. ≤5 queries recommended |
| `prompt` | (SEO planning template) | Customize when you need different keyword strategies or industry-specific SEO patterns | The full LLM instruction. Uses `{entity_content}` for analysis JSON, `{keyword_research}` for research results, `{keyword_metrics}` for the quantitative keyword-data table (v2.3.0, opt-in), and `{doc:filename}` for reference docs |
| `reference_docs` | (none) | Upload format spec, tone guide, or supplemental keyword data | Selected docs injected into prompt at `{doc:filename}` placeholders |
| `ai_model` | haiku *(recommended floor: sonnet — inferred/UNVERIFIED)* | Recommended minimum sonnet by analogy to content-analyzer's tested doc-non-compliance finding (not yet tested on seo-planner). haiku for quick iterations only | Planning is structured, but the doc-following risk that broke content-analyzer on haiku plausibly applies here — see MODEL FLOOR |
| `ai_provider` | anthropic | Switch for model comparison | Which API to call |
| `max_tokens` | 16,384 *(haiku-era; override to 32,768 when running sonnet)* | Set 32,768 whenever the module runs sonnet. The 16,384 default was sized for haiku (no thinking overhead); sonnet's adaptive thinking consumes the budget invisibly and 16,384 can truncate, which the skeleton fail-closed guard turns into a run failure | Max LLM response length. Covers visible JSON + (on a Claude-5 model) invisible thinking tokens (v2.3.1, was 8,192) |
| `keyword_data_providers` | `[]` | Add real search-volume/difficulty/rank data (v2.3.0). Empty = layer off, no cost | Array of provider configs. See [Keyword Data Providers](#keyword-data-providers-v230) |
| `max_seed_keywords` | 25 | Lower to trim cost; raise for broad entities | Cap on seed keywords per entity (cost guard; only when the layer is active) |
| `max_metric_lookups_per_entity` | 100 | Lower to trim cost | Hard cap on keyword→metrics lookups per entity (cost guard) |
| `per_run_budget_usd` | 1.0 | Raise to allow more paid lookups; 0 = free providers only | Refuses paid lookups past the cap, warns, continues with free providers |
| `metrics_required` | false | Set true when a template depends on real numbers | If nothing is produced, adds a **loud** warning (never silent) |

## Keyword Data Providers (v2.3.0)

The `keyword_data_providers` option is a JSON array of provider config objects. Empty (the default) means the layer is **off** — no API calls, no cost, output unchanged. Each provider names a `kind` that selects a small generic handler; everything else is config. There are two roles: **expansion** (widen the seed set) and **metrics** (score keywords with real numbers). Expansion runs first, then metrics on the widened set. Results are normalized and attached to `seo_plan_json.keyword_metrics`.

**Built-in kinds**

| `kind` | Role | Cost | Env var(s) | Produces |
|--------|------|------|------------|----------|
| `gsc` | metrics | **free** | `GSC_SERVICE_ACCOUNT_KEY_PATH` (path to a service-account JSON key) | `current_rank`, `impressions`, `clicks` for the queries your **own verified property** already ranks for |
| `dataforseo` | metrics | **paid** | `DATAFORSEO_LOGIN` + `DATAFORSEO_PASSWORD` (Basic auth) | `search_volume`, `cpc`, `competition` (Google-Ads **live** endpoint) |
| `autocomplete` | expansion | **free** | none | seed-expansion suggestion strings |

**Config schema** (per provider object)

| Field | Applies to | Notes |
|-------|-----------|-------|
| `id` | all | Short identifier; also the `source` tag on each metric row and the `keyword_sources` provenance id. |
| `kind` | all | One of `gsc` \| `dataforseo` \| `autocomplete`. |
| `est_cost_per_lookup` | all | Per-keyword cost estimate for the budget guard. **Leave 0 (or unset) for free providers** (`gsc`, `autocomplete`); setting it makes them budget-guarded and possibly skipped. |
| `auth.env_var` | `gsc` | Env var holding the service-account key **file path** (default `GSC_SERVICE_ACCOUNT_KEY_PATH`). |
| `site_url` | `gsc` | GSC property, e.g. `sc-domain:example.com` or `https://example.com/`. Required. |
| `scope` | `gsc` | OAuth scope (default `https://www.googleapis.com/auth/webmasters.readonly`). |
| `date_range_days`, `row_limit` | `gsc` | Look-back window (default 90) and max rows (default 100, cap 25000). |
| `auth.login_env` / `auth.password_env` | `dataforseo` | Env vars for Basic auth (default `DATAFORSEO_LOGIN` / `DATAFORSEO_PASSWORD`). |
| `location_code`, `language_code` | `dataforseo` | Google-Ads locale (default `2840` = US, `en`). |
| `endpoint` | `dataforseo` | Override the live endpoint if needed. **Live endpoints only** — the standard queue's 1–3h latency would blow the 30-min module timeout. |
| `hl`, `max_seeds` | `autocomplete` | Suggestion language (default `en`) and per-provider seed cap. |

**Example** (company-profile style — GSC free tier + optional paid volume, `{env:VAR}` values come from the environment):
```json
[
  { "id": "gsc", "kind": "gsc", "site_url": "sc-domain:example.com",
    "auth": { "env_var": "GSC_SERVICE_ACCOUNT_KEY_PATH" }, "est_cost_per_lookup": 0 },
  { "id": "autocomplete", "kind": "autocomplete", "est_cost_per_lookup": 0 },
  { "id": "dataforseo", "kind": "dataforseo", "location_code": 2840, "language_code": "en",
    "est_cost_per_lookup": 0.05 }
]
```
Then add a `{keyword_metrics}` placeholder to the template's `prompt` override to feed the numbers into the planning LLM (e.g. "prefer high-volume/low-difficulty targets, and terms you already rank 5–20 for").

**Cost model note:** the budget guard sums `est_cost_per_lookup × keyword_count`. DataForSEO's live search-volume endpoint bills **per request** (all keywords in one task), so the guard is intentionally conservative — it may skip a provider that would actually be within budget rather than overspend. Set `est_cost_per_lookup` to the per-request price divided by your expected keyword count, or raise `per_run_budget_usd`, if you see over-eager skips.

**Failure behavior:** a provider whose credentials are missing is **inert** (a warning is added, the provider is skipped, no HTTP call is made) — the module never fails because a provider is unconfigured. A provider that errors mid-call is likewise skipped with a warning. With `metrics_required: true`, producing zero metrics adds a loud warning to `warnings[]` (it is never silent). GSC returns data only for properties the service account is added to as a user; a new/small property returns empty with a warning.

## Recipes

### Standard SEO Plan
Web-researched keywords + AI planning (sonnet is the recommended floor — see MODEL FLOOR):
```
keyword_research: true
search_provider: perplexity
ai_model: sonnet
max_tokens: 32768
reference_docs: [tone_guide.md, format_spec.md]
```
Keyword packs (`keyword-summary.md`) are no longer needed — Perplexity replaces them.

### High-Quality Plan
More capable model + web research:
```
keyword_research: true
ai_model: sonnet
reference_docs: [tone_guide.md, format_spec.md]
```

### Fast/Cheap Plan (no web research)
Skip Perplexity for batch processing where cost matters. **⚠ haiku is below the recommended (inferred/UNVERIFIED) sonnet floor — validate the plans follow your `format_spec.md` before trusting them.**
```
keyword_research: false
ai_model: haiku
reference_docs: [keyword-summary.md, format_spec.md]
```
Upload a `keyword-summary.md` to compensate when `keyword_research` is off.

### Custom Research Queries
For review article pipelines (category-level research):
```
keyword_research: true
research_queries:
  What do iGaming operators search when comparing {entity_name} providers?
  What keywords do top-ranking {entity_context} comparison articles target?
  People Also Ask questions for '{entity_name}' in iGaming?
```

## Expected Output

**Healthy result:**
- One SEO plan per entity
- Primary keyword + 2-4 secondary + 3-5 long-tail keywords per entity
- Keyword distribution mapping keywords to predefined sections (overview, categories, tags, credentials, FAQ)
- Meta title <=60 characters, meta description 150-160 characters
- 5 FAQ questions that reflect buyer intent

**Output fields per entity:**
- `entity_name` - company name
- `status` - `planned` or `error`
- `primary_keyword` - the top target keyword
- `keyword_plan_preview` - summary of keyword distribution (e.g., "3 categories, 4 tags, 12 unique keywords")
- `meta_title` - proposed meta title
- `faq_count` - number of FAQs generated
- `seo_plan_json` - the full structured SEO plan (carried to pool for content-writer). When the keyword-data layer is active it additionally carries `keyword_metrics[]` (v2.3.0): `{ keyword, search_volume, difficulty, cpc, competition, current_rank, impressions, clicks, source }`, with `null` where a provider lacks a field.

**Detail view sections:** target keywords (text), keyword distribution (prose), meta tags (text), FAQs (prose), tone notes (text), warnings (text)

**The seo_plan_json structure:**
```json
{
  "target_keywords": {
    "primary": "geolocation verification for iGaming",
    "secondary": ["GPS spoofing detection", "clone app fraud prevention", "GLI certified geolocation"],
    "long_tail": ["geolocation compliance for sports betting operators", "GLI certified location verification solutions"]
  },
  "keyword_distribution": {
    "overview": {
      "headline_keywords": ["geolocation verification for iGaming"],
      "body_keywords": ["iGaming geolocation provider", "location intelligence"]
    },
    "categories": [
      {
        "category_slug": "fraud-prevention",
        "category_tier": "primary",
        "heading_keywords": ["fraud prevention solutions"],
        "body_keywords": ["clone app fraud prevention", "GPS spoofing detection"]
      },
      {
        "category_slug": "kyc-services",
        "category_tier": "secondary",
        "heading_keywords": ["KYC services"],
        "body_keywords": ["geolocation KYC compliance"]
      }
    ],
    "tags": [
      {
        "tag_slug": "gli-certified",
        "keywords": ["GLI certified geolocation", "GLI control assessment"]
      }
    ],
    "credentials": {
      "keywords": ["GLI certified", "independently validated"]
    },
    "faq": {
      "keywords": ["geolocation compliance for sports betting operators"]
    }
  },
  "meta": {
    "title": "Bespot: GLI-Certified Geolocation & Fraud Prevention",
    "title_chars": 52,
    "description": "Athens-based geolocation provider offering GLI-certified verification, clone app detection, and GPS spoofing prevention for iGaming operators.",
    "description_chars": 148
  },
  "faqs": [
    {
      "question": "What is GLI certification and why does it matter for geolocation verification?",
      "answer_brief": "Explain GLI assessment, what it validates, why operators need it for licensing",
      "target_keyword": "GLI certified geolocation"
    },
    {
      "question": "How does Bespot detect clone app fraud in iGaming?",
      "answer_brief": "Cover Gatekeeper's detection methods: app signatures, device fingerprinting, behavioral analysis",
      "target_keyword": "clone app fraud prevention"
    }
  ],
  "tone_notes": "Authoritative B2B tone for compliance professionals. Emphasize technical capabilities and regulatory validation. Avoid marketing hype.",
  "warnings": []
}
```

**Key points about the keyword distribution:**
- Maps keywords to predefined sections from format_spec.md
- Does NOT define article structure or headings
- `category_slug` and `category_tier` link back to the analyzer's classification
- Primary categories appear first, then secondary
- Each FAQ includes a `target_keyword` for long-tail SEO

**Validation warnings (non-fatal):**
- Meta title > 60 characters - will be truncated in search results. Flagged in output but doesn't fail
- Meta description outside 150-160 range - suboptimal for SERP display. Flagged but doesn't fail
- These warnings appear in the detail view's Warnings section so the operator can adjust before approving

**Red flags to watch for:**
- Generic keywords (e.g., "online gaming") - LLM didn't have enough specificity from analysis
- FAQ questions that are too broad - may not capture buyer intent. Keyword pack helps here
- Missing keyword distribution for important categories - planner may have skipped them

## Limitations & Edge Cases

- **No search volume data (default mode)** - Perplexity Sonar returns qualitative keyword research (PAA questions, competitor coverage) but not numeric search volume or competition scores. For real numbers, enable the v2.3.0 [keyword-data providers](#keyword-data-providers-v230) (`dataforseo` for volume/difficulty; `gsc` for own-site rank) instead of relying on a static reference doc
- **GSC live-verify deferred (v2.3.0)** - The `gsc` provider is unit-tested with a real RS256 JWT signing path (throwaway keypair, no network), but a live run against the real Google Search Console API was not performed because the service-account key (`GSC_SERVICE_ACCOUNT_KEY_PATH`) was not resolvable in the build shell. Before relying on `gsc` in production, do a one-off free live test: confirm the Search Console API is enabled, the scope is `webmasters.readonly`, and the service account is added as a user on the property
- **GSC returns own-property data only** - Google Search Console reports rank/impressions/clicks only for properties the service account is verified on. It surfaces queries you *already* rank for — it is not a general keyword-volume tool (that's `dataforseo`)
- **Autocomplete is unofficial** - The `autocomplete` kind uses Google's undocumented suggest endpoint; it may rate-limit (429 → warning, skipped) or change without notice. Treat it as best-effort free seed expansion, never a hard dependency
- **Research query failures don't fail the module** - Individual query failures are caught and logged. If all queries fail, the module falls back to `keyword-summary.md` (if uploaded) or proceeds with no keyword data. Check logs if results look generic
- **≤5 queries recommended** - More queries are allowed but multiply cost linearly. The module logs a warning if >5 queries are configured
- **Meta length validation is soft** - The module warns about meta title/description lengths but doesn't force compliance. Some LLMs consistently produce titles slightly over 60 characters
- **Language-specific SEO** - Default prompt assumes English SEO conventions. Other languages have different title length norms, keyword patterns, and FAQ structures
- **No duplicate keyword detection** - If multiple companies in the same run target the same keywords, the planner doesn't coordinate. Each entity is planned independently

## What Happens Next

After the user reviews and approves the SEO plan, items enter the working pool with `source_submodule: "seo-planner"`. The pool now contains both content-analyzer items and seo-planner items for each entity.

**Content-writer** picks up both, plus the original scraped source content. The analysis provides facts, the SEO plan provides keywords, and the source content provides raw material for detailed prose. Content-writer places the specified keywords in the specified sections, writes to the format spec, and answers the FAQs.

The user can re-run seo-planner with different settings (different keyword pack) without re-running the analyzer. This is the cheapest step in the chain, so iteration here costs very little.

## Technical Reference

- **Step:** 5 (Generation)
- **Category:** planning
- **Cost:** expensive (30 min timeout — includes Perplexity research calls + planning LLM call per entity)
- **Data operation:** add (➕) - chains from working pool, finds content-analyzer items by source_submodule
- **Requires:** `entity_name` in input items; `analysis_json` from content-analyzer
- **Input:** Content-analyzer output from working pool (found via `source_submodule === 'content-analyzer'`)
- **Output:** `results[]` grouped by `entity_name`, one item per entity containing flattened display fields + `seo_plan_json` object
- **Display type:** cards (not table) - one card per entity with expandable detail modal
- **Selectable:** true - operators approve/reject entire entity SEO plan
- **Detail view:** `detail_schema` with header (entity_name, status as badge, primary_keyword, faq_count) and sections (keywords_text, keyword_distribution_text as prose, meta_text, faqs_text as prose, tone_notes, warnings, error)
- **Error handling:** Missing analysis input, LLM failures, JSON parse errors handled per-entity. Entities without content-analyzer items get clear error: "No content-analyzer output found. Run content-analyzer first."
- **Dependencies:** `tools.ai` (LLM calls + Perplexity Sonar for keyword research), `tools.logger`, `tools.progress`
- **Files:** `manifest.json`, `execute.js`
