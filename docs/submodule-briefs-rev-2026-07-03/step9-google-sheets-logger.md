# Submodule Brief: sheet-logger (revised)

**Step:** 9 — Distribution setup
**Revised:** 2026-07-03 — pipeline-agnostic redesign (Rule 13). Original archived in `_originals-2026-07-03/`.
**Original goal (unchanged):** Upsert a control-panel row per entity (status, QA metrics, links, editorial fields) into a shared tabular store.
**Build status:** not built
**Design verdict:** new generic module `sheet-logger` — replaces the Google-Sheets-specific concept; Google Sheets becomes one provider config among several row-store targets.

## Goal

Stage (and, on approval, execute) one upserted row per entity in a configured tabular store — Google Sheets, Airtable, Baserow/NocoDB, or a zero-credential CSV-to-pool fallback — keyed by a match column, writing only the columns this module manages and preserving reviewer-edited columns.

## Design (agnostic)

**One verb: upsert a ROW keyed by entity.** Third sibling in the Step-9 "delivery family" (rationale in step9-strapi-publisher.md): row-matching + column-scoped read-modify-write is a different idempotency model than cms-publisher's entry create/update or doc-exporter's file upload — merging the three into one module would turn the provider config into a mini-language. Family patterns shared verbatim: provider configs (env var NAMES only), `mode: stage|execute`, `flag_conditions`, `_partialItems`.

**Column mapping is template config:** `field_map` maps column names → dot-notation paths into the entity's pool items (`{"Status": "terminal_state", "Keyword score": "keyword_score", "Doc": "doc_url", "Notes": null}`). `null` = reviewer-owned column, never written after row creation. The module writes ONLY mapped non-null columns — the preserve-manual-edits guarantee is structural, not best-effort. `match_column` (default `entity_name`) identifies the row. No column set, no status vocabulary, nothing content-type-specific in code (Rule 13: every column, label, and link field is uploadable template configuration).

**Stage vs execute:** stage builds `staged_row` (JSON string of column→value) + `target` per entity, zero write I/O. Execute reads items by field shape (`staged_row` + `staged_status=ready`), fetches current rows, matches on `match_column`, updates matched cells or appends a new row.

**Flagged entities — deliberate family deviation:** default `flagged_policy` is **`stage_with_warning`, not `hold`**. Justification: the sheet is the review CONTROL PANEL, not the publication — a flagged entity failing to appear in the panel is precisely how flagged content gets lost (BACKLOG #8/#9). Its row is staged/written WITH its flag status in the mapped status columns and `needs_review: "true"`; what stays held is publication (cms-publisher/doc-exporter), not visibility. `hold` remains available for templates where the sheet itself is external-facing.

**Skeleton constraint (verified 2026-07-03):** `tools.http` = get/head/post only. Google Sheets is fully operable today (`values.get` GET; `values.append` and `values.batchUpdate` are POST). Airtable/Baserow/NocoDB updates need PATCH → those providers are create-only until the skeleton gains `patch` (open question); Airtable's native `performUpsert` is PATCH-based.

## Module contract

- `item_key`: `entity_name` · `data_operation_default`: `add` · `pool_precondition`: `requires_items`
- `cost`: `medium` (execute does read+write network I/O per batch)
- `requires_columns`: `[]`
- `_partialItems` (Rule 10): push each entity's staged/upserted item right after completion; a timeout mid-batch keeps earlier rows' results.
- ContentRenderer: arrays pre-joined to strings; `flagged_when` string values: `{"staged_status": ["invalid"], "upsert_status": ["failed", "ambiguous_match"]}`.

## Options (manifest sketch)

| Option | Type | Default | Notes |
|---|---|---|---|
| `mode` | select | `stage` | `stage` \| `execute` |
| `providers` | json (presets_enabled) | `[]` | provider configs, schema below |
| `field_map` | json (presets_enabled) | `{}` | column name → item field path, `null` = reviewer-owned |
| `match_column` | text | `entity_name` | upsert key column |
| `flagged_policy` | select | `stage_with_warning` | family deviation, see Design |
| `flag_conditions` | json | `["terminal_state=flagged","qa_pass=false","needs_review=true"]` | field checks |
| `requests_per_minute` | number | `30` | Sheets: keep well under 60/min/user write quota |

Provider config: `{ id, name, type: "google_sheets"|"airtable"|"baserow"|"nocodb"|"csv_pool", auth: {env_var(s)}, target: {spreadsheet_id+sheet_name | base_id+table | table_id | (none for csv_pool)} }`.

## Providers (researched 2026-07-03)

| Provider | Env vars | Credential status | Free tier / quota | Notes |
|---|---|---|---|---|
| google-sheets | `GSC_SERVICE_ACCOUNT_KEY_PATH` (existing), `SHEET_LOGGER_SPREADSHEET_ID` | **Service account EXISTS — needs Sheets API enablement + share the spreadsheet with the SA email (user action, ~10 min), then live-testable.** Unlike Drive file CREATION (broken for SAs), editing an existing human-owned spreadsheet shared with the SA works — the SA never owns the file. | API free; 300 read + 300 write req/min/project, 60/min/user each; overage billing "planned later in 2026" ([limits](https://developers.google.com/workspace/sheets/api/limits)) | No native upsert: `values.get` (read block) → match client-side → `values.batchUpdate` (update mapped cells only) or `values.append` (`insertDataOption=INSERT_ROWS`). All GET/POST → **works with today's tools.http**. Auth: SA JWT (node:crypto) → token POST. **Primary provider** — existing credential + verb-compatible. |
| airtable | `AIRTABLE_TOKEN`, `AIRTABLE_BASE_ID` | new provisioning (PAT; legacy API keys dead since Feb 2024) | Free: 1,000 records/base AND **1,000 API calls/month** (then blocked after 30-day grace); Team 100k calls/mo; 5 req/s/base ([rate limits](https://airtable.com/developers/web/api/rate-limits), [call limits](https://support.airtable.com/docs/managing-api-call-limits-in-airtable)) | Native upsert exists (`performUpsert.fieldsToMergeOn`) but is PATCH → blocked on skeleton `patch`; create-only via POST works today. Free-plan API cap makes it a poor primary for recurring batch logging. |
| baserow | `BASEROW_URL`, `BASEROW_TOKEN` | new provisioning | Self-hosted: free, unlimited rows/API (mostly MIT). Hosted free: 3,000 rows/2 GB; Premium $10/user/mo ([pricing](https://baserow.io/pricing)) | `Authorization: Token <t>`; POST create works today, PATCH update blocked (same gap). No native upsert. Good self-hosted docker live-test target. |
| nocodb | `NOCODB_URL`, `NOCODB_TOKEN` | new provisioning | Self-hosted free for internal use — **no longer AGPL: Sustainable Use License since v0.301.0 (Jan 2026)** (fair-code, not OSI); cloud exists ([license](https://github.com/nocodb/nocodb/blob/develop/LICENSE.md)) | `xc-token` header; API v2 "deprecating soon", target v3. POST create today, PATCH update blocked. |
| csv-pool | (none) | **zero credentials — always testable** | n/a | Emits each row as a pool item (`row_json`, `csv_line`, header line) — downloadable CSV assembled from the pool. The credential-free unit/E2E fallback and a legitimate "just give me a CSV" delivery in its own right. |

## Example template configurations

**OnlyiGaming company-profiles control sheet (google-sheets):** `match_column: "Company"`, `field_map: { "Company": "entity_name", "Generated": "run_date", "QA": "qa_pass", "Keyword score": "keyword_score", "Citations": "citation_coverage_score", "Flagged": "terminal_state", "Doc": "doc_url", "CMS": "remote_url", "Decision": null, "Assignee": null, "Notes": null }` — reviewer columns are `null`-mapped so the module can never clobber editorial state. All of it lives in the template preset_map.

**Job-search pipeline (csv-pool or google-sheets):** columns `{ "Role": "title", "Company": "company", "Fit": "fit_score", "CV": "doc_url", "Applied": null }` — same module, different template, zero code change.

## Credentials & testing

- **Existing, approved for reuse:** the GSC service account (`GSC_SERVICE_ACCOUNT_KEY_PATH`). Reuse path: enable Sheets API on its GCP project + share the target spreadsheet (consumer gmail-owned sheets fine) with the SA's email as Editor → live-testable the same day, no new keys.
- **New provisioning:** Airtable PAT / Baserow / NocoDB tokens only if those targets are wanted.
- **Unit tests (always):** mocked `tools.http` — field_map resolution incl. `null` columns, match/append/update branching, mapped-cells-only write ranges (prove reviewer columns untouched), flag-condition → status column population, rate-limit batching, error-as-item.
- **Cheapest live tests, in order:** (1) csv-pool — zero credentials, validates staging + row assembly end-to-end; (2) google-sheets against a throwaway spreadsheet shared with the existing SA; (3) docker Baserow (create-only) once wanted.
- **E2E note:** 2-entity run with one flagged entity must show the flagged row present with `Flagged` populated and `Decision/Notes` untouched across two consecutive runs.

## Edge cases & failure modes

- Duplicate match values in the sheet (>1 row matches `match_column`) → `upsert_status: ambiguous_match`, fail that entity, never guess.
- Sheet/table missing or ID wrong → loud stage-time `invalid` (with `verify_connectivity`) or per-item execute failure naming the target.
- Reviewer renamed/reordered columns → resolve columns by header row at execute time, not fixed indices; unknown mapped column → per-item failure naming the column.
- Quota pressure (Sheets 60 write/min/user): batch all cell updates per run into one `values.batchUpdate` + one `values.append`; ~2-3 calls per run regardless of entity count (500 entities fine).
- Airtable free-plan monthly API cap exhausted → 429/403 recorded per item; module must not retry-storm (respect `requests_per_minute`).
- Concurrent human edit between read and write → last-writer-wins on MANAGED cells only; acceptable because reviewer columns are never written.
- Re-run stage → composite-key upsert replaces own staged items; re-run execute is idempotent (match → update same row).

## Open questions

1. **Does the control panel wait for Step 10?** Family rule says execute fires post-approval, but a review control panel arguably must exist BEFORE humans review (it's the review surface). Options: templates run sheet-logger with `mode=execute` at Step 9 deliberately (status-only rows ≠ publication), or the Step-10 trigger handles it. Product call — flagged, not decided in module code.
2. **Skeleton `patch` verb** — unlocks Airtable native upsert + Baserow/NocoDB updates (same skeleton gap flagged in the sibling briefs).
3. **Where does `terminal_state` come from?** Same BACKLOG #8 dependency as cms-publisher: until quality signals land on pool items (or skeleton injects entity meta), `flag_conditions`/status columns see only pool-item fields.
4. Should `csv-pool` also write an actual file to an output/upload dir (csv-discovery precedent) for rclone-style pickup, or is pool-item + download enough for v1?
5. Link columns (doc_url, remote_url) depend on sibling Step-9 modules having run first — same-step ordering via `sort_order` (sheet-logger last), or accept blank-then-filled on a second run?
