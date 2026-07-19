# content-delivery — module notes

Step 9 distribution. Generic transport (**Rule 13**): the code branches only on a
provider's `type` field (the transport verb), never on its `id`/`name` or any
destination concept. Implements `UNIT_5_5_STEP9_10_DELIVERY_DESIGN.md` §1–§2 (U1-A).

## Stale-docs rule (Rule 7)

When you change `execute.js` or `manifest.json`, update `README.md` AND
`test-content-delivery.js` in the same commit:
- provider schema (`endpoint`/`headers`/`source_field`/`envelope`/`type`) → README "Provider config schema"
- a new transport verb (`file_upload`/`row_upsert`) → the `type` branch in `execute.js` + README "Not built in v1"
- output item fields (`delivery_status`/`http_status`/`error`/`reason`) → manifest `output_schema` + README "Output"

## Input contract (do not regress)

`requires_columns: ["final_json"]` is **load-bearing**, not cosmetic. json-output
marks `final_json` as a `downloadable_field`, so the skeleton strips it from the
pool item into `submodule_run_item_data`. The skeleton's §7b enrichment
(`content-pipeline-v2/server/workers/stageWorker.js`; enabling gate is a
non-empty `requires_columns`, then it fetches only the declared fields actually
missing) rehydrates it back onto the item, keyed by
`item_key` (`entity_name`), before `execute()` runs — the same path
content-analyzer uses for `text_content`. Empty `requires_columns` disables §7b →
the selector finds no `final_json` → every entity skips (the U1 blocker). Do not
add `entity_name` (it's the item_key, never stripped). Tested (test 10).

## Invariants (tested — do not regress)

- **Secrets**: resolved `endpoint`/`headers` values never logged or emitted (test 6).
- **Field-shape selection**: deliverable is the `final_json` item, never by `source_submodule` (test 7).
- **Error-as-item**: a non-2xx response and a thrown network/timeout error both become failed items; other entities continue (test 4).
- **Loud config validation**: providers with no `id`, an unsupported `type`, no `endpoint`, or an unset `{env:VAR}` are skipped up-front with a warn (tests 5, 8); empty `providers` = loud no-op (test 2).
- **$-safe interpolation**: `{env:VAR}` values containing `$&`/`$$`/`$1` are not corrupted (test 9).
- **Rule 10**: items pushed to `_partialItems` after each entity.

## Deviation from the UNIT_5_5 design

`auth` uses api-search's proven **headers-map** (`{env:VAR}`) pattern, not the
design's `auth:{type,header,env_var}`. One auth dialect across modules. See
README "Design deviation" and the U1-A decision_log entry.
