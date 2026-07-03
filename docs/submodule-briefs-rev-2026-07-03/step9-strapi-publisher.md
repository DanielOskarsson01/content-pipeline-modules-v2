# Submodule Brief: cms-publisher (revised)

**Step:** 9 — Distribution setup
**Revised:** 2026-07-03 — pipeline-agnostic redesign (Rule 13). Original archived in `_originals-2026-07-03/`.
**Original goal (unchanged):** Push approved content to a CMS via REST API, creating or updating entries with mapped fields.
**Build status:** not built
**Design verdict:** new generic module `cms-publisher` — replaces the Strapi-specific concept; Strapi becomes one provider config among several (api-search precedent: new target = JSON config, not code).

## Goal

Stage (and, on Step-10 approval, execute) publication of per-entity structured content to any REST-based CMS or webhook endpoint. One module, provider configs for Strapi/WordPress/Ghost/Directus/Contentful/generic-webhook. Closes the BACKLOG #9 gap: this module IS the distribution gate — flagged entities are held, never silently published.

## Design (agnostic)

**One verb: create/update a remote ENTRY from a JSON field map.** This module never converts files or uploads binaries (that is `doc-exporter`'s verb) and never upserts tabular rows (`sheet-logger`'s verb). The three Step-9 modules form one "delivery family" sharing the same provider-config, stage/execute, and flagged-entity patterns — but they stay separate modules because the verbs differ in payload construction, idempotency semantics, and output contract. A single mega-"delivery" module was considered and rejected: its provider schema would have to union three verbs into a mini-language, violating "small generic modules."

**Input selection by field shape, never by source_submodule** (Step-8 discipline): the module reads entity pool items carrying `final_json` (json-output), `content_markdown`, `seo_plan_json`, `analysis_json` — whatever the template's `field_map` references. json-output's "strapi" format is one convenient upstream shape, not a dependency.

**Stage vs execute (`mode` option, default `stage`):**
- `stage`: build the payload per entity from `field_map`, validate against `required_fields`, resolve the target descriptor (URL template, no secrets), store on the item: `staged_payload` (JSON string), `target`, `staged_status` (`ready` | `held_flagged` | `invalid`), `validation`. Zero write-side network I/O. Optional `verify_connectivity` does an auth-scoped GET only.
- `execute`: select the entity's items BY FIELD SHAPE (`staged_payload` present + `staged_status=ready`), then fire create/update calls. Runs only after Step-10 approval. Entities without a `ready` staged payload are skipped and reported.

**Flagged entities (BACKLOG #8/#9):** `flag_conditions` (template-configurable field checks, default `["terminal_state=flagged", "qa_pass=false", "needs_review=true"]`) are evaluated against the entity's pool items at stage time. Matching entities get `staged_status=held_flagged` per `flagged_policy` (default `hold`). Execute mode NEVER sends `held_flagged` items; `flagged_policy=include` is the only override and must be set explicitly by a template. Default = fail closed.

**Rule 13 test:** code knows HTTP verbs, auth schemes (bearer/basic/ghost-jwt/none), URL templating, field-map resolution, upsert flow. It knows nothing about companies, collections, or iGaming. Collection names, field maps, draft defaults, endpoint paths = provider config a template uploads via the UI. Manifest default `providers: []` — no providers, no staging, loud message.

**Upsert:** provider config declares `id_lookup` (search endpoint template + `results_path` + `id_path`). Found → update; not found → create. **Skeleton constraint (verified 2026-07-03):** `tools.http` exposes only `get/head/post`. Strapi/Ghost/Contentful updates need PUT — v1 is create-or-skip for those providers; WordPress updates work today (POST `/wp/v2/posts/:id`). PUT/PATCH support is an open skeleton question, flagged below.

## Module contract

- `item_key`: `entity_name` · `data_operation_default`: `add` (re-stage upserts own prior items via composite key, preserving other modules' items) · `pool_precondition`: `requires_items`
- `cost`: `medium` (execute does network I/O; stage is cheap but cost must cover worst case)
- `requires_columns`: `[]`
- `_partialItems` (Rule 10): push each entity's staged/published item immediately after it is built/sent, so a timeout keeps prior entities' results.
- ContentRenderer: all arrays pre-joined to strings (e.g. `validation: "missing: title, slug"`); `flagged_when` uses string values: `{"staged_status": ["held_flagged", "invalid"], "publish_status": ["failed"]}`.

## Options (manifest sketch)

| Option | Type | Default | Notes |
|---|---|---|---|
| `mode` | select | `stage` | `stage` \| `execute` |
| `providers` | json (presets_enabled) | `[]` | array of provider configs, schema below |
| `flagged_policy` | select | `hold` | `hold` \| `stage_with_warning` \| `include` |
| `flag_conditions` | json (presets_enabled) | `["terminal_state=flagged","qa_pass=false","needs_review=true"]` | `field=value` checks against pool items |
| `verify_connectivity` | boolean | `false` | stage-mode auth-scoped GET, no writes |
| `requests_per_minute` | number | `30` | execute-mode global rate limit |
| `draft_mode` | boolean | `true` | create as draft where the provider supports it |

Provider config shape (mirrors api-search): `{ id, name, base_url_env, auth: {type: "bearer"|"basic"|"ghost_jwt"|"none", env_var}, create_endpoint, update_endpoint, method_update, collection, field_map, id_lookup: {endpoint, results_path, id_path}, draft_param, extra_headers }`. `field_map` values are dot-notation paths into pool-item fields (fallback arrays supported). Env vars hold values; configs hold only env var NAMES.

## Providers (researched 2026-07-03)

| Provider | Env vars | Credential status | Free tier / pricing | Notes |
|---|---|---|---|---|
| generic-webhook | `WEBHOOK_URL` | **EXISTS today — live-testable now** | n/a (your endpoint) | POST staged payload to configured URL; zero-dependency test + integration path. webhook.site free: 100 req/URL, 7-day retention, no signup ([docs.webhook.site](https://docs.webhook.site/index.html)) |
| Strapi v5 | `STRAPI_BASE_URL`, `STRAPI_API_TOKEN` | **None exists — new provisioning** (no live Strapi anywhere today) | Self-hosted free (MIT). Cloud: free 2,500 req/mo; Essential ~$18/mo (approx) | Bearer token; v5 uses string `documentId` + `status=draft\|published` param (v4 `publicationState` gone). POST `/api/:pluralApiId`; update = PUT (blocked on skeleton PUT). [docs.strapi.io/cms/api/rest](https://docs.strapi.io/cms/api/rest) |
| WordPress | `WP_BASE_URL`, `WP_APP_PASSWORD` (`user:pass`) | new provisioning | Self-hosted free (GPL); no core rate limits | Application Passwords (core since 5.6), Basic auth over HTTPS. POST `/wp-json/wp/v2/posts`, `status: draft\|publish`; updates also POST — **full upsert works with today's tools.http**. [developer.wordpress.org/rest-api](https://developer.wordpress.org/rest-api/using-the-rest-api/authentication/) |
| Ghost | `GHOST_BASE_URL`, `GHOST_ADMIN_KEY` (`id:secret`) | new provisioning | Self-hosted free (MIT); Ghost(Pro) Starter $15/mo annual | Short-lived HS256 JWT signed with hex-decoded secret (node:crypto, no deps), `Authorization: Ghost <jwt>`. POST `/ghost/api/admin/posts/?source=html`. [docs.ghost.org/admin-api](https://docs.ghost.org/admin-api) |
| Directus | `DIRECTUS_BASE_URL`, `DIRECTUS_TOKEN` | new provisioning | Self-hosted free under $5M revenue AND <50 employees (v12 MSCL, May 2026; BSL before); Cloud entry ~$99/mo (Starter tier retired Dec 2025) | Bearer static token; generic `POST /items/:collection`; draft = ordinary status field. [directus.io/docs](https://directus.io/docs/getting-started/use-the-api) |
| Contentful | `CONTENTFUL_SPACE_ID`, `CONTENTFUL_CMA_TOKEN` | new provisioning | Free: 1 space, ~10,000 records (official; 25k cited elsewhere — discrepancy), ~100k API calls/mo since Apr 2025 change; Lite ~$300/mo. CMA ~7 req/s/token (plan-dependent) | Two-step create-then-publish, both PUT + `X-Contentful-Version` — **blocked on skeleton PUT**; document as deferred provider. [contentful.com CMA docs](https://www.contentful.com/developers/docs/references/content-management-api/) |

Optional demo provider: Telegram sendMessage (`TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` **exist today**) fits the generic-webhook shape (plain POST JSON) — a cheap live "delivery happened" signal, not a real CMS target.

## Example template configurations

**OnlyiGaming company profiles → Strapi:** provider `strapi`, `collection: "companies"`, `field_map: { title: "final_json.name", content: "final_json.content", slug: "final_json.primary_category_slug", seo.metaTitle: "seo_plan_json.meta.title" }`, `id_lookup: { endpoint: "/api/companies?filters[slug][$eq]={slug}", results_path: "data", id_path: "documentId" }`, `draft_mode: true`. All of this lives in the template's preset_map — zero OnlyiGaming knowledge in module code.

**Job-search pipeline → generic-webhook:** provider `generic-webhook` posting `{ entity: "{entity_name}", cv_ref, fit_score: "analysis_json.fit_score" }` to `WEBHOOK_URL` — delivery notification to an existing endpoint, same module, different template config.

## Credentials & testing

- **Existing, approved for reuse:** `WEBHOOK_URL` (generic-webhook — live-testable immediately), `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` (optional demo). **No Strapi instance or token exists anywhere today** — do not assume one.
- **New provisioning per CMS provider:** env vars named above, values added to skeleton `.env` by the user.
- **Unit tests (always):** mocked `tools.http` — stage-mode payload construction/validation, flag-condition evaluation (held_flagged never reaches execute), upsert branch logic, auth header construction incl. Ghost JWT, error-as-item behavior.
- **Cheapest live tests, in order:** (1) generic-webhook → existing `WEBHOOK_URL`, zero new credentials; (2) webhook.site URL (free, no signup, 100 req); (3) local docker Strapi (`docker run strapi/strapi` equivalent, free) for real create/draft semantics; (4) WordPress on any throwaway host.
- **E2E note:** full Step-8 → stage → (simulated approval) → execute run against docker Strapi validates the gate before any production CMS exists.

## Edge cases & failure modes

- CMS down / 5xx → error recorded on item (`publish_status: failed`, http_status), never thrown; other entities proceed; 429 respects rate limiter.
- Missing auth env var → stage: warn + `staged_status=invalid`; execute: loud per-item failure (NOT the api-search silent-skip — a publish gate must not half-publish silently).
- `field_map` path resolves empty for a `required_fields` entry → `staged_status=invalid` with named fields (joined string).
- `id_lookup` returns >1 match → fail that entity (ambiguous target), do not guess.
- Payload > provider size limits → record `payload_bytes`, fail with clear reason.
- Re-run stage → composite-key upsert replaces this module's own prior staged items (safe re-stage).
- Partial execute crash → `_partialItems` preserves already-published results; re-run skips entities whose staged item already shows `publish_status: created|updated` (idempotency check via `id_lookup`).

## Open questions

1. **How does Step-10 approval trigger execute mode?** Skeleton capability, not module scope: needs either a Step-10 → re-enqueue-with-`mode=execute` hook or a second Step-9 pass post-approval. Flagged, not invented here.
2. **`tools.http` lacks PUT/PATCH** — blocks Strapi/Ghost/Contentful updates and Contentful publish. Add `put`/`patch` to skeleton `buildTools()` (small, generic), or ship v1 create-only for those providers?
3. **Where do modules see `terminal_state`?** It lives in `entity_run_meta`, which modules can't read (no DB access). Options: BACKLOG #8 propagation onto Step-8 items (then `flag_conditions` just works), or skeleton injects entity meta into execute input. Until one lands, `flag_conditions` sees only pool-item fields (`qa_pass` etc.).
4. Media upload (original brief's logo/images step) is `doc-exporter`'s verb (file upload) — should a combined template chain doc-exporter (media) → cms-publisher (entry referencing uploaded media)? Deferred.
5. Secrets hygiene: `target` descriptors stored on items must never embed tokens — enforce in code review + unit test.
