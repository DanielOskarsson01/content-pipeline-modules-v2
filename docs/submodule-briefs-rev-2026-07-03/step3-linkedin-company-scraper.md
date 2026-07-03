# Submodule Brief: dataset-fetcher (Generic Dataset/Scraper-API Fetcher) (revised)

**Step:** 3 — Scraping (purchased-record enrichment)
**Revised:** 2026-07-03 — pipeline-agnostic redesign (Rule 13). Original archived in `_originals-2026-07-03/`.
**Original goal (unchanged):** Fetch structured company data from LinkedIn company pages (about, size, industries, followers, posts, employees sample) without operating our own LinkedIn scraper.
**Build status:** not built
**Design verdict:** new generic module `dataset-fetcher` — "LinkedIn company" is ONE provider config, not a module (filename kept as `step3-linkedin-company-scraper.md`; the standalone-module concept is superseded)

## Goal

Fetch vendor-collected structured records (LinkedIn company profiles today; any dataset tomorrow) for entities that carry a source URL/identifier, and add them to the pool as structured items. LinkedIn is the motivating case, but Bright Data alone exposes dozens of entity datasets (Crunchbase, Glassdoor, Indeed, Amazon, Google Maps…) behind the SAME trigger/poll/snapshot API — a LinkedIn-only module would be Rule-13 malpractice.

**Why not config of an existing module** (hierarchy applied): `api-fetcher` (sibling brief) covers simple request→response APIs. Dataset/scraper vendors use a different execution pattern: **trigger an async collection job → poll status → download snapshot records**, with per-record billing and nested multi-entity records. That job-orchestration lifecycle is genuinely different behavior → new module. Conversely, sync enrichment vendors (Coresignal, People Data Labs) are plain request→response and belong in `api-fetcher` as provider configs — NOT here. Existing `linkedin-profile-scraper`/`linkedin-post-scraper` modules scrape via the team's own logged-in browser session (the self-hosted profile-api at `LINKEDIN_API_URL`) — different mechanism, personal-profile/post-oriented; this module *buys records* by default. No duplication — but that same profile-api is seriously evaluated below as a zero-new-cost provider option for company pages.

## Design (agnostic)

Code contains only the generic job lifecycle: trigger (sync or async), poll with backoff, snapshot download, record mapping, nested-array expansion, cost accounting, rate limiting — all via `tools.http`. **Everything vendor- and dataset-specific is JSON provider config** (`presets_enabled`).

Provider config shape:

```json
{
  "id": "brightdata-linkedin-company",
  "name": "Bright Data — LinkedIn Company",
  "auth": { "type": "bearer", "env_var": "BRIGHT_DATA_API_KEY" },
  "identifier_source": { "entity_field": "linkedin", "item_field": "linkedin_url" },
  "identifier_pattern": "linkedin\\.com/company/",
  "mode": "async",
  "trigger": { "url": "https://api.brightdata.com/datasets/v3/trigger",
               "params": { "dataset_id": "gd_l1vikfnt1wgvvqz95w", "include_errors": "true" },
               "body_template": [{ "url": "{identifier}" }] },
  "poll":    { "status_url": "https://api.brightdata.com/datasets/v3/progress/{snapshot_id}",
               "ready_when": { "status": "ready" },
               "results_url": "https://api.brightdata.com/datasets/v3/snapshot/{snapshot_id}?format=json",
               "interval_ms": 10000, "max_wait_ms": 900000 },
  "record": {
    "source_type": "company",
    "field_map": { "url": "url", "name": "name", "about": "about", "specialties": "specialties",
                   "company_size": "company_size", "industries": "industries", "founded": "founded",
                   "headquarters": "headquarters", "followers": "followers", "website": "website" },
    "expansions": [
      { "path": "updates",   "source_type": "post",     "max": 10, "field_map": { "url": "post_url", "title": "title", "text": "text", "date": "date" } },
      { "path": "similar",   "source_type": "similar",  "max": 10, "field_map": { "url": "linkedin_url", "name": "name", "industry": "industry" } },
      { "path": "employees", "source_type": "employee", "max": 10, "field_map": { "url": "linkedin_url", "name": "name", "title": "title" } }
    ]
  }
}
```

- `identifier_source` mirrors `api-fetcher`: entity seed field first, then pool-item field. `identifier_pattern` guards against wrong-shape inputs (e.g. `/in/` personal-profile URLs fed to a company dataset) → skip with reason, don't spend.
- `mode: "sync"` supported for small batches (Bright Data `/scrape`, ≤20 URLs) — same config minus `poll`.
- **Expansions** turn nested arrays inside one purchased record into separate pool items with config-declared `source_type` values (the original's `linkedin_post`/`linkedin_similar`/`linkedin_employee` behavior, now fully config-driven — code never knows what a "post" is). `similar` items can feed Step 1 discovery expansion in a later loop pass.
- Every item gets `source_api`, `data_json` (stringified mapped record), `raw_text` (flattened `Key: value` lines for LLM use), `fetch_date`, `status`, plus per-run `records_purchased` / `est_cost_usd` in meta.
- **Batching:** all identifiers for the run go into ONE trigger call where the vendor supports it (Bright Data: up to 5,000 URLs/request) — one poll loop, not N.

- Provider `url` values may reference `{env:VAR}` (resolved server-side) so internal services can be providers without hardcoding hosts.

**Rule 13 test:** dataset IDs, field maps, expansions, source_type vocabulary, URL-shape guards — all template-uploadable JSON. Code knows "async collection job", nothing else.

### Zero-new-cost provider option: the existing self-hosted profile-api (`LINKEDIN_API_URL`)

The project already runs a logged-in Chrome/CDP LinkedIn service (profile-api on the Hetzner box; `LINKEDIN_API_URL` exists in the skeleton .env and is consumed today by linkedin-profile-scraper and linkedin-post-scraper). It currently serves profiles, posts, and job descriptions — **it has no company-page endpoint yet.** If one is added (work in the profile-api service, outside this modules repo), company scraping becomes a sync provider config here: `mode: "sync"`, `trigger.url: "{env:LINKEDIN_API_URL}/api/company"`, `auth: none`, own `field_map`.

Trade-offs vs purchased records:
- **Cost:** $0/record vs $1.50/1,000 — at ~1,200 companies the vendor bill is ~$1.80, so cost alone does NOT justify it; the real draw is no external dependency and unlimited re-scrapes for enrichment loops.
- **Effort/maintenance:** we build and maintain the extraction (LinkedIn markup churn) vs vendor's maintained schema incl. funding/similar/employees, which our own parser would only partially replicate.
- **Throughput:** one logged-in account + one browser vs 5K URLs per async trigger.
- **Risk:** logged-in scraping is exactly the exposure class LinkedIn now wins on (Proxycurl injunction), plus account-ban risk on the team's own account. Small-scale internal use, but the risk sits on our side rather than the vendor's.

**Recommendation:** Bright Data as the primary/bulk provider (first pass over the full database); the profile-api provider is worth building only if per-entity enrichment loops become frequent enough that on-demand, zero-cost re-scrapes matter. Both ship as provider configs — templates pick; the module doesn't care.

## Module contract

- **item_key:** `url` (every record/expansion field_map must produce one)
- **data_operation_default:** `add` (net-new structured items alongside other scrapers' output)
- **pool_precondition:** `empty_ok` — identifiers usually come from entity seed fields (CSV `linkedin` column); must not be skipped on an empty pool (same justified deviation as `api-fetcher`)
- **cost:** `expensive` (async snapshots can take many minutes; 30-min timeout class)
- **requires_columns:** `["name"]`
- **_partialItems:** push after every snapshot download and after mapping each entity's records (Rule 10 — paid network I/O; a timeout must not destroy purchased records).

## Options (manifest sketch)

| Option | Type | Default | Notes |
|---|---|---|---|
| `providers` | json | `[]` | provider configs as above; `presets_enabled: true` |
| `max_records_per_run` | number | `100` | hard spend guard — trigger refuses beyond this count |
| `max_expansion_items` | number | `10` | global cap per expansion path (config `max` can lower it) |
| `poll_interval_ms` / `max_wait_ms` | number | `10000` / `900000` | overridable per provider config |
| `skip_providers_without_auth` | boolean | `true` | missing env var → skip with warning (api-search precedent) |
| `estimated_cost_per_1k_usd` | number | `1.5` | used only for the meta cost estimate shown to operators |

`output_schema`: table; `source_type`, `url`, `name`, `title`, `raw_text` preview, `fetch_date`, `status`; `flagged_when: { status: ["error", "dead_link"] }`; `downloadable_fields`: `data_json` (.json), `raw_text` (.txt). Arrays pre-joined to strings.

## Providers (researched 2026-07-03)

| Provider | Env var | Free tier | Pricing | Notes |
|---|---|---|---|---|
| **Bright Data Web Scraper API** (Datasets umbrella; LinkedIn Company dataset `gd_l1vikfnt1wgvvqz95w`) | `BRIGHT_DATA_API_KEY` — **EXISTS in production .env** (Web Unlocker key, renewed 2026-06-28); Datasets-API acceptance likely but unverified — see credential note | $2 new-user credit; "5K records/mo free" advertised on product page (tier details unverified) | **$1.50/1,000 records PAYG** (verified current); ~$0.75–0.98/1K on subscription | **Primary.** Async `/datasets/v3/trigger` up to 5K URLs/req, snapshot kept 30 days; sync `/scrape` ≤20 URLs. [docs.brightdata.com/datasets/scrapers/linkedin/introduction](https://docs.brightdata.com/datasets/scrapers/linkedin/introduction) · [costbench.com/software/web-scraping/bright-data](https://costbench.com/software/web-scraping/bright-data/) |
| **Self-hosted profile-api** (company endpoint to be built) | `LINKEDIN_API_URL` — **EXISTS** (service live; used by linkedin-profile/post-scraper today) | n/a | $0/record (own infra + own LinkedIn account) | Zero-new-cost option; requires new endpoint work in profile-api + carries logged-in-account risk. See "Zero-new-cost provider option" above. |
| Apify LinkedIn company actors (e.g. `bebity/linkedin-premium-actor`, `harvestapi/*`) | `APIFY_TOKEN` | $5/mo platform credit | from ~$3/1,000 companies (pay-per-result) | Cheap backup; third-party actor reliability varies. Apify's run→dataset-items API fits this module's generic lifecycle — a second provider config, proving genericity. [apify.com/bebity/linkedin-premium-actor](https://apify.com/bebity/linkedin-premium-actor) |
| ScrapIn (now part of Reverse Contact) | `SCRAPIN_API_KEY` | free test tier | ~$49/mo ≈ 1,000 credits (third-party figures, **unverified**) | Real-time LinkedIn scraping = Proxycurl-class legal exposure; acquisition churn is a continuity flag. [scrapin.io](https://www.scrapin.io/) |
| Coresignal / People Data Labs | — | Coresignal: 200-credit trial; PDL: — | Coresignal from $49/mo; PDL Pro $98/mo incl. 1K company lookups | **Sync request→response APIs → belong in `api-fetcher` provider configs, not here.** [coresignal.com/pricing](https://coresignal.com/pricing/) · [peopledatalabs.com](https://www.peopledatalabs.com/company-data/enrichment-api) |
| Proxycurl | — | — | — | **DEAD** — LinkedIn lawsuit, permanent injunction, shut down July 2025. Its "successor" EnrichLayer carries unresolved continuity risk. Do not build on either. [nubela.co/blog/goodbye-proxycurl](https://nubela.co/blog/goodbye-proxycurl/) |

**Credential note (reuse APPROVED — one verification still required):** `BRIGHT_DATA_API_KEY` exists in the production .env (Web Unlocker product key, renewed 2026-06-28) and is approved for reuse. Bright Data docs indicate the Web Scraper/Datasets API authenticates with the same *account-level* Bearer API key — no zone required — so the existing key **likely works as-is, but this is unverified for our specific key**: Bright Data also auto-generates *zone-scoped* keys with Unlocker zones. First build step: one cheap `/datasets/v3/trigger` call with the existing key; if rejected as zone-scoped, generate an account-level key in the same account (no new product purchase). Hygiene: this key was pasted into chat history in June 2026 — rotation was already flagged. Also in the .env: `SCRAPFLY_KEY` — NOT viable here (LinkedIn's auth wall means anti-bot transports return logged-out stub pages, not company data).

**Legal posture (2026, one paragraph):** buying records from a large dataset vendor is materially lower-risk for the purchaser than operating a logged-in scraper — LinkedIn's 2025 Proxycurl win was on contract/fraud grounds against the *collector*; hiQ established that public-page access isn't CFAA "unauthorized access" but contract claims still bite operators. Vendor-purchased records for internal enrichment of hundreds–thousands of companies is the standard, defensible route. Not zero risk; the module design (no LinkedIn credentials, no ToS acceptance on our side) keeps our side clean.

## Example template configurations

**Company profiles (iGaming, OnlyiGaming):** the Bright Data LinkedIn Company provider config above, `identifier_source.entity_field: "linkedin"` (seed CSV column). Full ~1,200-company iGaming database ≈ **$1.80** at PAYG rates. Expansions feed downstream: `post` items → content-analyzer tone/activity; `similar` items → optional Step-1 loop expansion; `employee` items → key-people section. Enrichment loop: entities flagged thin by Step 6 QA can re-enter with a second provider config pointed at Bright Data's LinkedIn *Posts* dataset for deeper post history.

**E-commerce/marketplace content (second content type, proving agnosticism):** same module, provider config for Bright Data's Google Maps business dataset or Glassdoor company dataset — different `dataset_id`, `field_map`, and `expansions` (e.g. `reviews` → `source_type: "review"` items). Zero code changes.

## Credentials & testing

- **Env vars:** `BRIGHT_DATA_API_KEY` **EXISTS** (production .env, reuse approved — verify Datasets-API acceptance with one cheap trigger call, per credential note). `LINKEDIN_API_URL` **EXISTS** (zero-cost provider option once profile-api grows a company endpoint). `APIFY_TOKEN` would be new provisioning (backup provider only).
- **Unit tests (mocked `tools.http`) — no credentials:** trigger-body construction from identifiers; poll loop (pending→ready→download, max_wait abort); record + expansion mapping against a canned Bright Data-shaped JSON fixture; `identifier_pattern` rejection of `/in/` URLs; `max_records_per_run` refusal; dead-page record → `status: "dead_link"`; `_partialItems` after snapshot download.
- **Cheapest live test (today):** a 2-URL sync `/scrape` call with the EXISTING `BRIGHT_DATA_API_KEY` ≈ $0.003 — this single call both smoke-tests the module and settles the key-scope question. Apify $5 monthly credit as an alternative.
- **E2E note:** 3 reference entities through Steps 3→5; confirm content-analyzer consumes `raw_text` from `company` items and that expansion items don't pollute Step 8 bundles (they carry no `content_markdown` — data-shape routing already excludes them).

## Edge cases & failure modes

- **Dead/renamed company page** → vendor returns an error record; item `status: "dead_link"`, continue (original observed `cherry-ab`).
- **Redirected page** → record `url` differs from input; keep the record's canonical `url` as item_key, preserve `original_url`.
- **Snapshot never ready** → abort at `max_wait_ms`, mark entities `status: "error", error: "snapshot_timeout"`; snapshot_id logged (Bright Data keeps it 30 days — recoverable manually).
- **Sparse profiles** (no funding/specialties) → map what exists; missing fields absent, never fabricated.
- **Wrong-shape identifier** (personal profile, malformed URL) → skipped pre-trigger with reason; zero spend.
- **Partial batch failure** → `include_errors` records mapped to error items per entity; healthy entities unaffected.
- **UTF-8** → preserve as-is (vendor returns proper Unicode).
- **Spend runaway** → `max_records_per_run` is a hard gate at trigger time, not a post-hoc report; meta always reports `records_purchased` and `est_cost_usd`.

## Open questions

1. Snapshot polling vs webhook: Bright Data supports a `notify` webhook URL — polling is simpler and fits the worker model; webhook needs skeleton support. V1 polls. Revisit if runs regularly exceed the step timeout.
2. Should `similar`-company expansion items be allowed to trigger Step-1 discovery automatically (loop pass), or stay operator-initiated? Leaning operator-initiated until routing (sub-plan 4) is proven.
3. One combined brief-level question with `api-fetcher`: if a future vendor offers both sync enrichment AND async datasets, which module owns it? Rule: the execution pattern decides — request→response goes to `api-fetcher`, job-lifecycle goes here.
4. Build the profile-api company endpoint or not? Zero per-record cost and unlimited enrichment re-scrapes vs profile-api dev work, markup maintenance, and logged-in-account risk — at ~$1.80 for the full database via Bright Data, this is a strategy call (user/CTO decision), not a cost one. The module design supports both regardless.
