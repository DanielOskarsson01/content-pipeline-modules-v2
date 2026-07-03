# Submodule Brief: SEO Keyword Researcher (revised)

**Step:** 5 — Generation
**Revised:** 2026-07-03 — pipeline-agnostic redesign (Rule 13). Original archived in `_originals-2026-07-03/`.
**Original goal (unchanged):** Fetch real keyword data (search volume, difficulty, ranking positions) from SEO tools and search APIs to replace LLM-guessed keywords with actual market data.
**Build status:** not built
**Design verdict:** **extension of `seo-planner`** (new provider layer inside the existing module; no new module)

## Goal

Ground seo-planner's keyword plan in **real numbers** — search volume, keyword difficulty, own-site rank/impressions, SERP People-Also-Ask — instead of (or alongside) Perplexity's qualitative research. The goal is still unbuilt: seo-planner v2.2.x explicitly refuses to invent volume numbers ("Do NOT estimate search volume … any numbers would be invented") and its README lists "No search volume data" as a limitation.

## Design (agnostic)

**Hierarchy check:** seo-planner v2.x already owns this exact slot — it has `keyword_research` (boolean), `search_provider` (select, `["perplexity"]`, with a description that says *"More providers (Gemini, Ahrefs, Semrush) can be added later"*), `research_queries`, and a synthesis step injecting `{keyword_research}` into the planning prompt. A separate "seo-keyword-researcher" module would duplicate the research→synthesis→plan flow and split one concern across two modules. **Extend, don't add.** The original brief's "runs before seo-planner" sequencing is preserved *inside* seo-planner: metrics fetch → qualitative research → planning LLM.

**Two orthogonal research layers** (both feed the planning prompt):
1. **Qualitative** (exists): `search_provider: perplexity` — PAA questions, competitor angles, real phrasings. Unchanged.
2. **Quantitative** (new): `keyword_data_providers` (JSON array option, `presets_enabled`) — real metrics per keyword. Empty by default → module behaves exactly as today ($0 change for existing templates).

**Provider = config + thin handler** (api-search precedent, adapted): pure JSON config cannot express OAuth/JWT signing or batch-task semantics, so each provider config names a `kind` that selects a small generic handler; everything else (endpoint, auth env var, params, extraction paths, cost) is config. New provider of an existing kind = config only; new kind = one small handler function.

```jsonc
{ "id": "gsc", "kind": "gsc", "site_url": "sc-domain:example.com",
  "auth": { "env_var": "GSC_SERVICE_ACCOUNT_KEY_PATH" }, "est_cost_per_lookup": 0 }
{ "id": "dataforseo", "kind": "dataforseo_labs",
  "auth": { "login_env": "DATAFORSEO_LOGIN", "password_env": "DATAFORSEO_PASSWORD" },
  "location_code": 2840, "language_code": "en", "est_cost_per_lookup": 0.0001 }
{ "id": "autocomplete", "kind": "autocomplete", "est_cost_per_lookup": 0 }
```

**Flow per entity:** (a) build seed terms generically — entity name + category/tag slugs from `analysis_json` (+ optional template `seed_terms`); (b) expansion providers (autocomplete, DataForSEO `keyword_ideas`, SERP related/PAA) widen the seed set; (c) metrics providers (GSC, DataForSEO volume/difficulty) score it; (d) normalize to `keyword_metrics[]`: `{ keyword, search_volume, difficulty, cpc, competition, current_rank, impressions, clicks, source }` (nulls where a provider lacks a field); (e) inject as a new `{keyword_metrics}` placeholder (rendered as a compact text table) into the planning prompt with an explicit instruction to prefer high-volume/low-difficulty targets and to tag `keyword_sources` with the provider id; (f) LLM plans as today.

**Output contract (unchanged backbone, additive extension):** `seo_plan_json` keeps the exact backbone downstream consumers read — `target_keywords.{primary,secondary,long_tail}`, `meta.*`, `faqs[]` — so `keyword-sufficiency-checker`, `tone-seo-editor`, `meta-compliance-checker`, content-writer and the Step 8 outputs are untouched. New **additive** field `seo_plan_json.keyword_metrics[]` (audit trail: the numbers behind each chosen keyword) + provider ids joining the existing `Q<n> | analysis` vocabulary in `keyword_sources`. Additive fields are documented safe in seo-planner's coupling table.

**Rule 13 test:** manifest defaults stay 100% agnostic — `keyword_data_providers: []`, generic seed derivation, no domain names, no vertical framing. The GSC site URL, DataForSEO location/language, and seed vocabularies are template `preset_map` config. **Step boundary:** pure Step 5 planning input — no deliverable formatting.

## Module contract

Unchanged from seo-planner v2.2.x: `item_key: entity_name` · `data_operation_default: add` · `pool_precondition: requires_items` · `cost: expensive` (30-min timeout absorbs provider calls) · `requires_columns: ["entity_name", "analysis_json"]` · `depends_on: ["content-analyzer"]`. `_partialItems`: existing per-entity push stays; additionally push the entity item immediately after its metrics fetch completes so a timeout mid-batch keeps fetched metrics (Rule 10).

## Options (manifest sketch — additions only)

| Option | Type | Default | Notes |
|---|---|---|---|
| `keyword_data_providers` | json (presets_enabled) | `[]` | Provider configs (see above). Empty = current behavior. |
| `max_seed_keywords` | number | 25 | Cap on seeds sent to expansion/metrics providers per entity. **Cost guard.** |
| `max_metric_lookups_per_entity` | number | 100 | Hard cap on keyword→metrics lookups per entity. **Cost guard.** |
| `per_run_budget_usd` | number | 1.0 | Sums provider `est_cost_per_lookup`; refuses further paid lookups past cap, warns loudly, continues with free providers. **Cost guard.** |
| `metrics_required` | boolean | false | If true and all metrics providers fail/return empty → loud warning in `warnings[]` + `keyword_metrics: []`, never silent (W1.1 discipline). |

Existing options (`keyword_research`, `search_provider`, `research_queries`, `perplexity_model`) unchanged.

## Providers (researched 2026-07-03)

| Provider | Env var(s) | Free tier | Pricing (verified) | Notes |
|---|---|---|---|---|
| **Google Search Console** (kind `gsc`) | `GSC_SERVICE_ACCOUNT_KEY_PATH` — **key EXISTS today; live-testable now** | Free | Free; 25k rows/req | Real clicks/impressions/CTR/position — **own verified properties only**. Flagship free provider. [Docs](https://developers.google.com/webmaster-tools/v1/searchanalytics/query) |
| **Google Autocomplete** (kind `autocomplete`) | none | Free, no auth | Free, undocumented; 429 on abuse — throttle | Suggestion strings only (seed expansion). Unofficial; may vanish. [Spec](https://www.fullstackoptimization.com/a/google-autocomplete-google-suggest-unofficial-full-specification) |
| **DataForSEO** (kinds `dataforseo_volume`, `dataforseo_labs`) | `DATAFORSEO_LOGIN` + `DATAFORSEO_PASSWORD` (Basic auth) — NEW | Trial credit (amount unverified) | Volume: $0.06/task (≤1,000 kw, std queue) / $0.09 live; Labs KD/ideas: $0.012/task + $0.00012/item; **$50 min deposit** | Only pay-as-you-go source of true volume + difficulty + PAA. Primary paid provider. [Pricing](https://dataforseo.com/pricing) |
| **Serper.dev** (kind `serp_json`) | `SERPER_API_KEY` — NEW | 2,500 free credits, no card | $1.00/1k → $0.30/1k prepaid (from $50) | SERP positions, PAA, related searches — **no volume/KD** (confirmed). [Site](https://serper.dev/) |
| SerpAPI (kind `serp_json`) | `SERPAPI_KEY` — NEW | 250 searches/mo | $25/1k … $275/30k per month | Same category as Serper, ~25× entry price; skip unless Legal Shield matters. [Pricing](https://serpapi.com/pricing) |
| Google Ads API / Keyword Planner (kind `google_ads`) | OAuth2 + developer token — NEW, approval-gated | Free | Free (no usage fees); rounded volume buckets, competition only (no KD) | Manager account + token approval process. **Defer** — friction outweighs benefit while DataForSEO exists. [Access levels](https://developers.google.com/google-ads/api/docs/api-policy/access-levels) |
| Ahrefs API v3 | `AHREFS_API_KEY` — NEW | None | Included from **Lite plan** (~$129/mo unverified) — 100k units/mo, ≥50 units/req | 2026 change: no longer Enterprise-only. Subscription-first; only if already paying for Ahrefs. [Official](https://help.ahrefs.com/en/articles/6559232-about-api-v3) |
| Semrush API | `SEMRUSH_API_KEY` — NEW | None | Business plan $499.95/mo + API units (~$50/1M, unverified) | Highest entry cost; not recommended. [Access](https://developer.semrush.com/api/get-started/api-access/) |

## Example template configurations

**Company profiles (OnlyiGaming):** `keyword_data_providers: [gsc(sc-domain:onlyigaming.com), autocomplete, dataforseo(location 2840/en)]`, `seed_terms` from category slugs, `per_run_budget_usd: 2`. GSC reveals which company/category queries onlyigaming.com already ranks for (rank 5–20 = priority targets); DataForSEO adds volume/KD for the profile's category head terms; prompt override tells the planner to prefer "existing rank 5–20 + volume > 100" keywords.

**Job-search pipeline:** `keyword_data_providers: [autocomplete]` only ($0) — expansion of role-title phrasings ("fractional CMO iGaming…") to sharpen api-search keywords; no volume needed, no GSC property involved.

## Credentials & testing

- **Existing, approved for reuse:** `PERPLEXITY_API_KEY` (qualitative layer, unchanged) and the **GSC service account** (`GSC_SERVICE_ACCOUNT_KEY_PATH`, onlyigaming.com verified — already used by a nightly GSC ingest job). GSC provider is **live-testable today** at $0. `GA4_PROPERTY_ID` also exists (see Open questions).
- **New provisioning:** DataForSEO ($50 min deposit — user decision), Serper.dev (free tier, card-free — cheapest paid-tier onboarding).
- **Unit tests (credential-free):** mocked `tools.http` fixtures per kind (GSC response, DataForSEO task response, autocomplete JSON array); assert normalization to `keyword_metrics[]`, budget-cap refusal path, `metrics_required` loud-fail, and that `seo_plan_json` backbone fields are untouched (regression guard for keyword-sufficiency-checker).
- **Cheapest live test:** autocomplete only (free, no auth) → then GSC (free, existing key) → then one DataForSEO Labs task (~$0.02). E2E: one entity through seo-planner→content-writer→keyword-sufficiency-checker on a dev template.

## Edge cases & failure modes

- **New/small entity, zero GSC data** (site not owned or no impressions) → provider returns empty, warn, continue with other providers — mirrors existing "research query failures don't fail the module" behavior, but must not be *silent* when `metrics_required: true`.
- **DataForSEO standard queue latency (1–3h)** → use `live` endpoints only ($0.09/task); never enqueue standard-queue tasks inside a 30-min-timeout module.
- **Autocomplete 429/blocks** → throttle via existing rate-limit patterns; treat as free-tier best-effort, never fail the run on it.
- **Metric bloat in the prompt** — 100 keywords × metrics could swamp the planning prompt; cap the injected table (top N by volume) and note truncation.
- **Rounded/zero volumes** (Google buckets, DataForSEO nulls) → keep nulls as nulls; prompt instruction: absence of a number is not evidence of zero demand.

## Open questions

1. **Already-ingested GSC/GA4 data in Supabase** (nightly ingest jobs) could be a zero-API-call provider — but Rule 2 forbids modules touching the DB directly and `tools` exposes no data-read facility. Needs a skeleton-mediated path (e.g., internal HTTP endpoint or a `tools.data` surface) — skeleton capability audit needed. Until then the GSC provider calls the API directly (free anyway).
2. **Keyword difficulty semantics** differ per source (DataForSEO KD ≠ Ahrefs KD). Normalize to `difficulty` 0–100 with a `difficulty_source` tag, or keep per-source fields? Proposed: single field + source tag.
3. **Should `search_provider` absorb this?** No — proposed as a separate `keyword_data_providers` layer because qualitative and quantitative research are complementary, not alternatives. Confirm at review.
4. **Cross-entity keyword cannibalization** (two entities targeting the same high-volume term) remains out of scope — same limitation as today; a future Step 6 checker could compare plans across entities.
