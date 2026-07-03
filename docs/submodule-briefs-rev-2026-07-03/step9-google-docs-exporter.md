# Submodule Brief: doc-exporter (revised)

**Step:** 9 — Distribution setup
**Revised:** 2026-07-03 — pipeline-agnostic redesign (Rule 13). Original archived in `_originals-2026-07-03/`.
**Original goal (unchanged):** Deliver produced documents (one per entity) to a shared workspace for editorial pickup.
**Build status:** not built
**Design verdict:** new generic module `doc-exporter` — replaces the Google-Docs-specific concept; Google Drive/Docs becomes one provider config among several file-delivery targets.

## Goal

Stage (and, on Step-10 approval, execute) delivery of per-entity documents — converted from Step-8 outputs — to a configured storage target: Google Drive (as native Google Docs), WebDAV, S3-compatible object storage, or a generic multipart-POST endpoint. Output per entity: delivered file URL/ref + status.

## Design (agnostic)

**One verb: convert content into a document/file and upload it.** Considered making this a provider of `cms-publisher` (hierarchy step 2) — rejected: cms-publisher maps fields into a JSON entry body; this module constructs a FILE (content conversion, filename/versioning, multipart encoding) and returns a file URL, not an entry id. Different payload construction, different idempotency (filename/folder vs id_lookup), different output contract → sibling module in the same Step-9 "delivery family," sharing the family's provider-config, stage/execute, and flagged-entity patterns (see step9-strapi-publisher.md for the family rationale).

**Input by field shape:** items carrying `content_markdown` (+ optional `analysis_json`/`seo_plan_json` for the header block) or `html` — whatever the provider's `source_field` names. Never selected by `source_submodule`.

**Stage vs execute (`mode`, default `stage`):** stage builds the full document body per entity — optional `header_template` (generic `{field}` placeholders: entity name, date, QA fields — content lives in template config, not code) prepended to the converted content — and stores `staged_document` (string), `filename`, `target`, `staged_status`. Execute uploads only items with `staged_document` present + `staged_status=ready`. Actual send happens post-Step-10 approval.

**Flagged entities (BACKLOG #8/#9):** same `flag_conditions`/`flagged_policy` contract as cms-publisher; default `hold` — a flagged entity's document is staged as `held_flagged` and never uploaded unless a template explicitly sets `flagged_policy=include`. `stage_with_warning` embeds a review banner via `header_template` and marks `needs_review: "true"`.

**Rule 13 test:** code knows markdown→target-format conversion, multipart/JWT/SigV4 mechanics, filename templating. Folder IDs, bucket names, title templates, header text = provider/template config uploadable via the UI. Manifest defaults carry no Google/OnlyiGaming assumptions (`providers: []`).

**Skeleton constraint (verified 2026-07-03):** `tools.http` = get/head/post only, string bodies. Google Drive multipart upload is POST with a string-buildable `multipart/related` body (text content) → **works today**. WebDAV and S3 PutObject require PUT with raw bodies → **blocked** until skeleton adds `put` (open question); S3 presigned-POST form upload is a POST-compatible workaround (HMAC via node:crypto) but adds signing complexity.

## Module contract

- `item_key`: `entity_name` · `data_operation_default`: `add` · `pool_precondition`: `requires_items`
- `cost`: `medium` (execute uploads over network)
- `requires_columns`: `[]`
- `_partialItems` (Rule 10): push each entity's staged/uploaded item immediately after completion.
- ContentRenderer: arrays pre-joined to strings; `flagged_when` string values: `{"staged_status": ["held_flagged", "invalid"], "export_status": ["failed"]}`.

## Options (manifest sketch)

| Option | Type | Default | Notes |
|---|---|---|---|
| `mode` | select | `stage` | `stage` \| `execute` |
| `providers` | json (presets_enabled) | `[]` | provider configs, schema below |
| `source_field` | text | `content_markdown` | which item field is the document body |
| `title_template` | text | `{entity_name} — {date}` | filename/doc title, `{field}` placeholders |
| `header_template` | textarea | `""` (empty) | optional prepended block; template supplies content |
| `flagged_policy` | select | `hold` | `hold` \| `stage_with_warning` \| `include` |
| `flag_conditions` | json | `["terminal_state=flagged","qa_pass=false","needs_review=true"]` | field checks |
| `on_existing` | select | `version` | `version` (date/N suffix) \| `overwrite` \| `skip` |
| `requests_per_minute` | number | `30` | execute-mode rate limit |

Provider config: `{ id, name, type: "google_drive"|"webdav"|"s3"|"multipart_post", auth: {env_var(s)}, target: {folder_id | dav_url | bucket+endpoint | post_url_env}, convert_to (e.g. "google_doc"), extra_params }`. Env vars hold secrets; configs hold names only.

## Providers (researched 2026-07-03)

| Provider | Env vars | Credential status | Free tier / quota | Notes |
|---|---|---|---|---|
| google-drive | `GSC_SERVICE_ACCOUNT_KEY_PATH` (existing) | **Service account EXISTS** (live GSC ingest job) — but see constraint → | Drive API free; 1M quota units/min/project (2026 model); overage billing "planned later in 2026" ([limits](https://developers.google.com/workspace/drive/api/guides/limits)) | Markdown→Google Doc is native: `files.create` multipart, media `text/markdown` + metadata `mimeType: application/vnd.google-apps.document` (shipped Jul 2024, all account types). **CONSTRAINT: the share-a-My-Drive-folder-with-the-SA pattern is BROKEN** — SAs have no storage quota and cannot own files → `403 storageQuotaExceeded`; uploads must go to a **Workspace Shared Drive** (SA added as member, `supportsAllDrives=true`) or use user-delegated OAuth ([error docs](https://developers.google.com/workspace/drive/api/guides/handle-errors)). Auth: SA JWT (RS256 via node:crypto, no deps) → token POST. So: key exists, Drive API enablement is ~10 min, but live-testability depends on a Workspace Shared Drive existing (open question 2). |
| multipart-post | `WEBHOOK_URL` (existing) or new `DOC_DELIVERY_URL` | **EXISTS today — live-testable now** | n/a (your endpoint) | POST document as `multipart/form-data` (string-buildable for text) to any receiver; webhook.site (free, 100 req/URL, 7-day retention) or a local Express handler. Zero-dependency test path. |
| s3-compatible (Cloudflare R2) | `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | new provisioning (R2 signup) | R2 free: 10 GB storage, 1M Class A + 10M Class B ops/mo, zero egress; then $0.015/GB-mo ([pricing](https://developers.cloudflare.com/r2/pricing/)) | PutObject = PUT + SigV4 → blocked on skeleton PUT; presigned-POST form upload is the POST-era workaround. MinIO works as a frozen local docker test image but is end-of-life (CE gutted 2025, repo archived 2026) — do NOT depend on it long-term ([source](https://www.blocksandfiles.com/ai-ml/2025/06/19/minio-users-complain-after-admin-ui-removed-from-community-edition/1610856)). |
| webdav (Nextcloud etc.) | `WEBDAV_URL`, `WEBDAV_USER`, `WEBDAV_PASSWORD` | new provisioning | Nextcloud self-hosted free (AGPL) | Raw-body PUT to `/remote.php/dav/files/USER/path` with Basic auth ([docs](https://docs.nextcloud.com/server/latest/developer_manual/client_apis/WebDAV/basic.html)) — **blocked on skeleton PUT**; document as deferred provider. |

Note: the user's local Google Docs MCP + rclone gdrive remote are LOCAL-machine tools — irrelevant to this server-side module; the module authenticates itself with the service account.

## Example template configurations

**OnlyiGaming company profiles → Google Docs:** provider `google_drive`, `convert_to: "google_doc"`, `target.folder_id` = a Shared Drive folder, `title_template: "{entity_name} — Company Profile — {date}"`, `header_template` carrying the editorial banner (QA status, version, review instructions) — all in the template's preset_map; module code knows none of it.

**Job-search pipeline → R2:** provider `s3`, bucket `applications`, `source_field: content_markdown`, `title_template: "{entity_name}-cover-letter-{date}.md"` — same module, no Google anywhere.

## Credentials & testing

- **Existing, approved for reuse:** the GSC service account (`GSC_SERVICE_ACCOUNT_KEY_PATH`) — reuse = enable Drive API on its GCP project (user action, minutes) + grant the SA membership on the target Shared Drive. **Honest caveat:** if no Google Workspace Shared Drive exists (consumer Drive only), the google-drive provider is NOT live-testable regardless of the key — see constraint above. `WEBHOOK_URL` exists → multipart-post provider live-testable immediately.
- **New provisioning:** R2 keys, WebDAV account — only if those providers are wanted.
- **Unit tests (always):** mocked `tools` — markdown body assembly + header templating, multipart/related body construction (boundary correctness), SA JWT construction (fixed clock), flag-condition gating, `on_existing` versioning logic, error-as-item.
- **Cheapest live tests, in order:** (1) multipart-post → existing `WEBHOOK_URL` or webhook.site — zero credentials; (2) google-drive with the existing SA against a Shared Drive folder IF one exists; (3) local docker WebDAV/MinIO (frozen image) once PUT lands.
- **E2E note:** stage → approve → execute against webhook.site proves the full gate without any Google dependency.

## Edge cases & failure modes

- Google 403 `storageQuotaExceeded` → almost always the My-Drive-folder trap; error message on the item must say "target must be a Shared Drive" (don't let users chase phantom quota).
- Token exchange failure / expired key → per-item `export_status: failed` in execute; loud `staged_status: invalid` in stage when `verify_connectivity` is on.
- `source_field` missing on all items for an entity → `staged_status: invalid`, named field in reason (this is data-shape routing failing loudly, not silently).
- Markdown that breaks Google's importer (rare) → Doc created with degraded formatting; record `conversion: "lossy_ok"`, do not fail.
- Existing file with same title → `on_existing` policy; `version` default prevents silent overwrite of editor-annotated docs.
- Very large documents → multipart POST body limits; record `payload_bytes`; Drive multipart cap 5 MB → resumable upload is a follow-up if profiles ever exceed it.
- Re-run stage → composite-key upsert replaces own staged items; re-run execute skips entities already showing `export_status: created` with a live `doc_url` (HEAD check optional).

## Open questions

1. **Step-10 → execute trigger:** same skeleton capability question as cms-publisher (flagged there, not re-invented).
2. **Does a Google Workspace / Shared Drive exist for OnlyiGaming?** The SA-upload path requires one (consumer folder-sharing broken as of mid-2026). If not: choose OAuth-delegated upload (new pattern, more moving parts) or a non-Google provider as primary.
3. **`tools.http.put` + raw/binary bodies:** needed for WebDAV and clean S3; also unlocks Drive resumable uploads. Skeleton change, small and generic.
4. Should media/image delivery (logos, generated images — binary) live here too? Binary bodies are blocked today (string-only POST); defer, note as the same skeleton gap.
5. Sharing/permissions on created Docs (comment-only for editors, from the original brief) = one extra Drive `permissions.create` POST per file — include in v1 or defer? Config-expressible either way.
