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
