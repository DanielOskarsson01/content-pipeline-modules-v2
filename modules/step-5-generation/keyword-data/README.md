# keyword-data — Keyword Data Fetcher (Step 5)

Fetches **real search-market metrics** — search volume, keyword difficulty, CPC, related terms — for an entity's candidate head terms, **before seo-planner runs**. Replaces guesswork (the planner's chat-model "research" leg) with measured data from a configurable keyword-metrics provider (default: DataForSEO Labs).

- **Version:** 1.0.0 · **Step:** 5 · `item_key: entity_name` · `data_operation_default: add` · `pool_precondition: empty_ok` · `cost: medium`
- **Position:** place in the template's `submodules_per_step[5]` **before** `seo-planner` (execution order within a step is template-defined; there is no manifest ordering).

## What it emits

One item per entity carrying the enriched field:

```json
{
  "entity_name": "ELK Studios",
  "status": "success",
  "derivation": "analysis_json",
  "keyword_data": {
    "terms": [
      { "term": "ELK Studios", "volume": 5400, "difficulty": 38, "cpc": 0.4,
        "competition": 0.12, "related": ["elk studios slots", "best slot providers uk"] }
    ],
    "market": "United Kingdom",
    "language_code": "en",
    "provider": "dataforseo_labs",
    "fetched_at": "2026-09-10T14:00:00.000Z",
    "gsc_terms": []
  }
}
```

`keyword_data` is declared in `downloadable_fields`, so it persists to `submodule_run_item_data` and rehydrates into any downstream module that names it in `requires_columns` (§7b). `gsc_terms` stays an **empty placeholder** here: the skeleton's GSC hydration (spec: specs repo `template-v3/keyword-data/KEYWORD_DATA.md` §6) fills it with the site's own Search Console queries — modules never touch the DB (Rule 2).

## Candidate term derivation

1. **`analysis_json` present** (latest pool item carrying the field — field shape, not `source_submodule`): harvests generic conventional fields only — strings `primary_category, category, industry, vertical, sector`; arrays `categories, tags, keywords, topics` (array entries may be strings or objects with `name|slug|term|title`).
2. **Fallback — seed fields**: the same harvest applied to the entity record itself (Step 0 seed: `category`, `categories`, `tags`, …).
3. The entity name is always prepended (brand head term). Case-insensitive dedup, capped at `max_terms`.

The emitted `derivation` field says which path ran (`analysis_json` | `seed_fields`).

## Provider calls (per entity)

1. **One bulk `overview` call per market** — all candidate terms in one request (volume/difficulty/CPC/competition). Observed price: $0.01 + ~$0.0011/keyword.
2. **`related` call for the top-N terms by measured volume** (`related_terms_for`, primary market only). Observed: ~$0.0128/call. Seed-echo entries are filtered from `related`.

Default per-entity cost ≈ **$0.04–0.06** (12 terms + 2 related). Per-call cost is read from the provider response (`tasks[].cost`) — not estimated — and lands on `meta.api_usage.calls[]` + `total_cost_usd`.

## Failure discipline (loud, never silent)

| Condition | Behavior |
|---|---|
| Credentials env vars unset | Every entity → `status: error` item, `meta.status: 'error'`; zero network calls |
| Provider task error (auth 401/402, quota, daily money cap `40203`) | Entity `status: error` with provider code + message |
| HTTP non-2xx / network / parse failure | Entity `status: error` |
| `cost_cap_usd` tripped | Stop remaining calls, entity `status: error`, **partial `keyword_data` preserved** |
| Zero candidate terms / zero metrics | Soft success with empty `terms` by default; loud error when `empty_is_error: true` |

Errors are surfaced via `flagged_when: {status: ["error"]}` and the summary's `errors[]`. This is deliberate: a quota failure must never report as an approved-looking empty result.

## Options

| Option | Default | Notes |
|---|---|---|
| `provider` | DataForSEO Labs block | `base_url`, `auth: {type: basic_env, login_env, password_env}`, `endpoints.overview`, `endpoints.related`. All provider knowledge is config (Rule 13). |
| `markets` | `["United Kingdom"]` | Provider `location_name` strings. First = primary (fills `keyword_data.terms`/`market`, gets `related`); rest land in `other_markets`. Default chosen from GSC click evidence (UK = most clicks) + Periscope's UK-primary precedent. |
| `language_code` | `en` | |
| `max_terms` | 12 | Bulk overview cap |
| `related_terms_for` | 2 | Top-N by measured volume; `0` disables |
| `related_limit` | 10 | |
| `cost_cap_usd` | 0.15 | Hard per-entity cap against provider-reported costs |
| `empty_is_error` | false | |

**Credentials:** `DATAFORSEO_LOGIN` + `DATAFORSEO_PASSWORD` in the skeleton `.env` (Basic auth pair, same account Periscope uses — mind the account's daily money limit; a `40203` here is the shared cap, not a code failure).

## Tests

```
node modules/step-5-generation/keyword-data/test-keyword-data.js   # 50 assertions, fully mocked
node modules/test-manifests-loadable.js                            # repo-wide loader contract
```

## Relationship to seo-planner's built-in keyword layer

seo-planner v2.3+ carries an inert `keyword_data_providers` option (google_ads search-volume only, prompt-side `{keyword_metrics}`). This module supersedes it as the canonical fetch: it runs as its own step-5 card, adds difficulty + related terms, persists `keyword_data` for any consumer, and is the landing point for GSC hydration. The planner-side layer is untouched (defaults keep it inert); consolidation is a planning-chat decision (see specs `template-v3/keyword-data/DECISIONS_KEYWORD.md`).
