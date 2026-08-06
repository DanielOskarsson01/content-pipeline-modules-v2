# URL Relevance Filter

> LLM-based URL relevance classification -- KEEP, MAYBE, or DROP for content type relevance.

**Module ID:** `url-relevance` | **Step:** 2 (Validation) | **Category:** filtering | **Cost:** medium
**Version:** 1.0.1 | **Data Operation:** remove (➖)

---

## Background

### The Content Problem This Solves

After deduplication and pattern filtering, the URL pool still contains many pages that *look* valid but aren't useful for the target content type. A company profile doesn't need individual product pages, seasonal campaigns, or how-to-play guides. A news pipeline doesn't need career listings or privacy policies. These are judgment calls that regex patterns can't make -- you need to understand what the URL *is about* based on its path, anchor text, and context.

The original Content Creation Master envisioned a sophisticated validation system (old Step 4) that would eventually include ML classifiers trained on labeled data: *"Shallow ML classifier (optional): logistic regression or gradient boosting on features including path tokens, DOM hints, text length."* The vision included shadow mode, domain-level policies, and measured rollout with precision/recall thresholds.

This module is the v1 implementation of that vision -- using an LLM instead of a trained classifier. The trade-off: LLMs are more flexible and require no training data, but cost more per URL. By running last in Step 2, the URL count is already reduced, keeping LLM token costs manageable.

### How It Fits the Pipeline Architecture

URL Relevance Filter runs last in the Step 2 validation chain (sort_order 5). It represents the most sophisticated -- and most expensive -- pre-scrape validation available, which is exactly why it goes last:

1. **URL Deduplicator** → removes duplicates (no intelligence needed)
2. **URL Canonicalizer** → normalizes URL forms (rule-based transform)
3. **URL Pattern Filter** → removes structural junk (regex rules)
4. **URL Heuristics** → zero-cost rule-based URL scoring
5. **URL Relevance Filter** (this module) → classifies remaining URLs by content relevance (LLM intelligence)

The Strategic Architecture describes Step 2's intent: *"Save money and time by filtering out worthless URLs before fetching them."* And notes this is *"one of the steps where calibration has the highest financial impact."* Every URL removed here saves an HTTP request in Step 3 (Scraping) and potentially LLM tokens in Step 5 (Analysis & Generation).

### The Classification Approach

Rather than fetching page content (expensive), this module makes classification decisions from URL metadata alone:
- **URL slug** -- the path component plus query string (e.g., `/about/leadership`)
- **Link text** -- the anchor text from discovery (e.g., "Our Leadership Team"), included whenever present
- **Source location** -- where the link was found (nav, header, footer, body), included whenever present
- **Item metadata** (optional) -- extra fields like `title`, `company`, `location` from upstream modules, configured via `metadata_fields`

These signals are sent to an LLM in batches (up to 200 URLs per prompt by default) for classification as KEEP, MAYBE, or DROP. The prompt includes configurable criteria for what constitutes each category, tailored to the content type being produced. The `prompt_context` option controls the framing -- by default it's tuned for company profiles, but can be overridden for job search, news, or any other pipeline type.

### The Calibration Roadmap

The Raw Appendix described a learning progression:
1. **v1 (current):** Human reviews everything. Decisions logged. LLM-based classification with human override
2. **Next:** System analyzes logged decisions and proposes rules ("You've rejected 94% of URLs matching `/tag/*` -- auto-reject these?")
3. **Later:** Approved rules run in shadow mode. Rules matching human decisions 95%+ get promoted to automatic
4. **End-game:** Mature rules run automatically. New edge cases surface for human review

This module implements step 1 -- the LLM classifies, the operator reviews and overrides via the selectable UI, and every decision is part of the working pool's history.

## Strategy & Role

**Why this module exists:** Regex patterns catch structural junk, but content relevance requires understanding what a page is about. An LLM can classify URLs by their path and context -- without fetching the actual page content.

**Role in the pipeline:** Final pre-scrape gate. Uses AI to make judgment calls that rules can't: "Is `/blog/evolution-wins-ega-award` relevant to a company profile?" (Yes -- it's an award.) "Is `/blog/top-10-slot-games-2024` relevant?" (No -- it's editorial content about products, not the company.)

**Relationship to siblings:**
- **Runs after:** the rest of the Step 2 chain -- formally depends on URL Deduplicator and URL Pattern Filter, and sorts after URL Heuristics (works on the already-filtered set)
- **Final gate before Step 3:** URLs that pass this module go directly to scraping
- **All URLs returned:** Unlike dedup and pattern filter which only return flagged items, this module returns ALL URLs with a relevance classification -- the operator sees the full picture

## When to Use

**Always use when:**
- The URL pool still contains hundreds of URLs after dedup and pattern filtering
- You want AI-assisted curation before expensive scraping
- The content type has specific relevance criteria (company profiles need corporate pages, not product pages)

**Skip when:**
- The URL pool is small (< 50 URLs) and you can review manually
- You're scraping everything regardless of relevance (broad content collection)
- Cost is critical and you prefer manual review over LLM tokens

**Consider model selection:** Haiku (default) is cheapest and fast -- classification from URL slugs is a simple task. Switch to a stronger model (e.g. sonnet) only if too many relevant pages are being dropped. The model dropdown is populated from the shared LLM registry, so the available choices depend on the configured provider.

## Options Guide

| Option | Default | When to Change | Impact |
|--------|---------|----------------|--------|
| `ai_model` (select, registry-driven) | `haiku` | Pick a stronger model (e.g. sonnet) when too many relevant pages are being dropped; stay on haiku otherwise -- slug classification is simple | Model quality vs cost trade-off. Values are populated by the skeleton from the shared LLM registry (`registry.models`), scoped to the default provider -- not a hardcoded list |
| `ai_provider` (select, registry-driven) | `anthropic` | Switch provider if you prefer another vendor or have budget constraints | Values come from the shared LLM registry (`registry.providers`): anthropic, openai, perplexity, gemini, openrouter |
| `keep_criteria` (textarea, presets) | `about pages, team, leadership, partnerships, integrations, products overview, services overview, awards, milestones, company news, investors, careers, pricing, contact, press releases, compliance, regulatory, case studies, interviews, expansion, acquisitions, funding, annual reports` | Customize for your content type. News pipelines should keep news/press pages. Profile pipelines should keep corporate pages | Defines what the LLM classifies as KEEP. Comma-separated page types. The more specific, the better the classification |
| `drop_criteria` (textarea, presets) | `seasonal campaigns, single game pages, how-to-play guides, promotional offers, holiday-themed content, affiliate landing pages` | Customize to exclude irrelevant content types. Add patterns specific to your vertical (game pages, bonus offers, tournament pages) | Defines what the LLM classifies as DROP. Helps the LLM make clear decisions on borderline cases |
| `confidence_threshold` (select) | `balanced` | Use `keep_most` when you'd rather scrape unnecessary pages than miss useful ones. Use `aggressive` when scraping budget is tight | Controls how the LLM handles uncertain URLs: keep_most → KEEP, balanced → MAYBE, aggressive → DROP. Unknown values fall back to balanced |
| `max_urls_per_prompt` (number, 10-500) | `200` | Lower to 50-100 for better per-URL accuracy; raise to 300-500 for faster/cheaper processing of large pools | Batch size per LLM call. Larger batches = fewer API calls but potentially less attention per URL |
| `metadata_fields` (json) | `[]` | Set to `["title", "company", "location"]` when items have useful metadata beyond the URL (e.g. from api-search) | Extra item fields included in the LLM prompt. The URL slug plus `link_text` and `source_location` (when present) are always sent; this adds more fields on top. Non-array values are treated as empty |
| `prompt_context` (textarea, presets) | `You are a URL relevance classifier for a company research content pipeline.` `Classify each URL based on its relevance for creating a comprehensive company profile.` (two lines) | Override when classifying for non-company-profile pipelines (job search, news, etc.) | Framing text at the top of the LLM prompt. Tells the model what kind of content is being filtered and what the entity represents. Empty values fall back to the same default |

The provider/model dropdowns are registry-driven: the manifest declares `values_from: registry.providers` / `registry.models`, and the skeleton fills in the actual choices from the shared LLM registry at load time. Adding a provider or model to the registry makes it available here without touching this module.

## Recipes

### Standard Company Profile
Balanced filtering for company profile research (matches the manifest defaults):
```
ai_model: haiku
ai_provider: anthropic
keep_criteria: about pages, team, leadership, partnerships, integrations, products overview, services overview, awards, milestones, company news, investors, careers, pricing, contact, press releases, compliance, regulatory, case studies, interviews, expansion, acquisitions, funding, annual reports
drop_criteria: seasonal campaigns, single game pages, how-to-play guides, promotional offers, holiday-themed content, affiliate landing pages
confidence_threshold: balanced
max_urls_per_prompt: 200
metadata_fields: []
prompt_context: [default]
```

### News Pipeline
Keep news and press content:
```
ai_model: haiku
ai_provider: anthropic
keep_criteria: news articles, press releases, company announcements, industry analysis, interviews, executive quotes, partnership announcements, regulatory updates, financial results, expansion news, acquisition news
drop_criteria: product pages, career listings, privacy policies, terms of service, login pages, contact forms, FAQ pages, documentation, how-to guides
confidence_threshold: keep_most
max_urls_per_prompt: 200
metadata_fields: []
prompt_context: "You are a URL relevance classifier for a news content pipeline.\nClassify each URL based on its relevance for industry news coverage."
```

### High-Accuracy (smaller batches, better model)
When accuracy matters more than speed:
```
ai_model: sonnet
ai_provider: anthropic
keep_criteria: [same as your content type]
drop_criteria: [same as your content type]
confidence_threshold: balanced
max_urls_per_prompt: 100
metadata_fields: []
prompt_context: [same as your content type]
```

### Job Search Pipeline
Classify job postings using item metadata (title, company, location) from api-search:
```
ai_model: haiku
ai_provider: anthropic
metadata_fields: ["title", "company", "location", "_score", "_signal"]
prompt_context: "You are a job relevance classifier for a recruitment pipeline.\nClassify each job posting based on its relevance for a senior marketing/leadership professional seeking iGaming industry roles."
keep_criteria: senior marketing roles, C-level (CMO, CCO, CPO, CGO), VP-level, Director-level, Head of department, iGaming/betting/casino industry, remote positions
drop_criteria: junior roles, intern positions, developer, engineer, sales, account manager, coordinator, designer, analyst, CRM specialist
confidence_threshold: aggressive
max_urls_per_prompt: 200
```

### Budget-Conscious (aggressive filtering)
Minimize scraping costs:
```
ai_model: haiku
ai_provider: anthropic
keep_criteria: [narrow -- only the most essential page types]
drop_criteria: [broad -- include anything borderline]
confidence_threshold: aggressive
max_urls_per_prompt: 300
metadata_fields: []
prompt_context: [same as your content type]
```

## Expected Output

**Healthy result:**
- Company profile pipeline: 40-60% KEEP, 10-20% MAYBE, 20-40% DROP
- News pipeline: 20-40% KEEP (news articles), 60-80% DROP (non-news pages)

**Output fields per URL:**
- `url` -- the URL being classified
- `link_text` -- anchor text from discovery (carried through from Step 1)
- `source_location` -- where the link was found (carried through from Step 1)
- `relevance` -- `KEEP`, `MAYBE`, or `DROP`
- `entity_name` -- which entity this URL belongs to

**Display behavior:** All URLs returned -- KEEP, MAYBE, and DROP. DROP items are flagged (shown in red) and auto-deselected. The operator reviews and can override any classification. The remove (➖) data operation means DROP items are excluded from the pool when approved.

**Red flags to watch for:**
- All MAYBE -- LLM couldn't parse the response, the AI call failed for that entity (check the entity's `error` field and `meta.errors`), or the prompt was ambiguous. Check the model and criteria
- All DROP -- criteria too aggressive, or the company only has pages that don't match your keep criteria. Broaden `keep_criteria` or switch to `keep_most` threshold
- Inconsistent results across batches -- batch size too large. Lower `max_urls_per_prompt`
- KEEP on obviously irrelevant URLs -- model too weak or `drop_criteria` not specific enough

## Limitations & Edge Cases

- **URL-only classification** -- Classifies based on URL path and metadata, not page content. A URL like `/solutions/platform` could be either a product page (DROP) or an overview page (KEEP). The LLM makes its best guess from the slug and link text
- **Batch processing** -- URLs are sent in batches. The LLM sees them as a numbered list, not individually. Very large batches (400+) may reduce per-URL attention
- **Fallback to MAYBE** -- If the LLM response can't be parsed for a URL (missing from response, malformed output), that URL defaults to MAYBE. If the AI call fails entirely for an entity, ALL its URLs default to MAYBE and the error is recorded. This ensures no URLs are lost -- the operator decides
- **Cost varies by model** -- Haiku is orders of magnitude cheaper than the top-tier models per batch. For 1,000 URLs at 200/batch = 5 LLM calls. At Haiku rates this is pennies; at premium-model rates it's dollars
- **No learning yet** -- Current implementation doesn't learn from operator overrides. The calibration roadmap (shadow mode → enforce mode) is future work. Currently, operator decisions are implicit in the working pool state
- **Prompt quality matters** -- The keep/drop criteria directly control classification quality. Generic criteria produce generic results. Industry-specific, content-type-specific criteria produce much better classifications
- **Unparseable URLs still classified** -- Items whose `url` doesn't parse as a URL are sent to the LLM as the raw string instead of a slug, not skipped

## What Happens Next

URLs classified as KEEP (and MAYBE, if the operator keeps them) proceed to **Step 3 (Scraping)** where actual page content is fetched and extracted. The relevance classification is not carried through to Step 3 -- it served its purpose as a pre-scrape gate.

The original Content Creation Master described this validation step as having "the highest financial impact" for calibration: *"If the system learns that URLs matching `/tag/*` from casino news sites are always junk, it can filter them automatically instead of wasting scraping budget."* Every run of this module generates implicit training data -- what the operator approves vs rejects -- that could feed future rule-based optimizations.

## Technical Reference

- **Step:** 2 (Validation), sort_order 5 -- runs last in Step 2
- **Category:** filtering
- **Cost:** medium -- 5-minute timeout tier (LLM calls per batch; run after the cheap filters have shrunk the pool)
- **Data operation:** remove (➖) -- items classified as DROP are removed from the working pool when approved; KEEP and MAYBE items remain
- **Pool precondition:** `requires_items` -- entities with an empty pool are marked `skipped_no_input` (not failed) and the module doesn't execute for them
- **Requires:** `url` field in input items (`requires_columns: ["url"]`)
- **Depends on:** `url-dedup`, `url-filter`
- **Input:** `input.entities[]` with `items[]` from the previous sibling's approved output
- **Output:** `results[]` grouped by `entity_name`, each with `items[]` containing `url`, `link_text`, `source_location`, `relevance`, `entity_name`, plus per-entity `meta` (total_found, kept, maybe, dropped, errors)
- **Selectable:** true -- operators can override any classification in the UI; `flagged_when: relevance = DROP`
- **Error handling:** If the LLM call fails for an entity, all its URLs default to MAYBE (nothing lost), the entity result carries an `error` field, and the run summary lists the error. Unparsed response lines default to MAYBE. Unknown `confidence_threshold` values fall back to balanced; empty `prompt_context` falls back to the default; non-array `metadata_fields` is treated as empty
- **Timeout resilience:** classified items are pushed to `tools._partialItems` per entity (both success and fallback paths), so a timeout doesn't destroy completed entities' results
- **Dependencies:** `tools.ai` (LLM completion), `tools.logger`, `tools.progress`
- **Files:** `manifest.json`, `execute.js`
