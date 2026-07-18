# Content Delivery (Step 9 — Distribution)

Delivers each entity's bundled artifact to a configured endpoint.

The code is **pipeline-agnostic (Rule 13)**: it knows HTTP verbs, payload
assembly, header interpolation, and error capture — nothing about any specific
destination. "Webhook", "CMS", "Google Doc" are not concepts in the code; they
are provider config a template supplies. The module branches only on a
provider's **`type`** field (the transport verb), never on its `id` or `name`.

Built for **Unit 5.5 / U1-A** (`UNIT_5_5_STEP9_10_DELIVERY_DESIGN.md`, §1–§2).

## What it does

For each entity:
1. Selects the deliverable pool item **by field shape** — the latest item
   carrying `final_json` (written by `json-output` at Step 8), never by
   `source_submodule`.
2. For each active provider, assembles a body and POSTs it.
3. Captures the outcome as an **item** (`delivered` / `failed` / `skipped`).
   A failed or errored delivery never throws — one bad delivery cannot lose the
   others. Items are pushed to `_partialItems` (Rule 10) so a timeout preserves
   progress.

An entity with **no `final_json` item** is reported as `skipped` (loudly, in the
summary and logs) — never a silent empty success.

## Options

| Option | Type | Default | Meaning |
|--------|------|---------|---------|
| `providers` | `json` | `[]` | Array of provider configs (schema below). Empty = nothing delivered, loud message. |

## Provider config schema

```jsonc
{
  "id": "u1-webhook",              // required; identity/log label only (code never branches on it)
  "name": "U1 delivery webhook",   // optional human label
  "type": "json_post",             // transport verb; v1 supports json_post only
  "endpoint": "{env:DELIVERY_WEBHOOK_URL}", // URL, or {env:VAR}; unset {env:VAR} → provider skipped
  "method": "POST",
  "headers": { "X-Delivery-Secret": "{env:DELIVERY_WEBHOOK_SECRET}" }, // optional; {env:VAR} interpolated
  "source_field": "final_json",    // optional; which pool-item field is the payload (default final_json)
  "envelope": true                 // optional; wrap the payload with provenance (below)
}
```

- **`type`** — only `json_post` (assemble a JSON body, POST it) in v1. Any other
  `type` is skipped with a warning (the verb set is a fixed code branch, so
  `file_upload` / `row_upsert` can slot in later without a config mini-language).
- **`endpoint`** — the target URL. Supports `{env:VAR}` interpolation. (This is
  the design's `endpoint` field, not `url`.)
- **`headers`** — a static header map; each value is interpolated for `{env:VAR}`
  tokens. `auth: none` = simply omit `headers`.
- A provider whose `endpoint` or `headers` reference an **unset** `{env:VAR}`, or
  that has **no `endpoint`**, an **unsupported `type`**, or **no `id`**, is
  **skipped up-front with a warning** — the module never POSTs to an empty URL or
  sends an empty auth header, and a config mistake surfaces once, loudly, not as
  one confusing failure per entity.

### Body shapes

- **Envelope** (`envelope: true`, recommended) — adds provenance without touching
  content:
  ```json
  { "entity_name": "Acme", "run_id": "…", "delivered_at": "2026-07-18T…Z", "payload": { …parsed final_json… } }
  ```
- **Pass-through** (`envelope` omitted/false) — the parsed `final_json` object as
  the raw body.

The module does not reshape content — content shape is `json-output`'s concern
(its `output_format` option). `final_json` is parsed from its JSON string so it
embeds as an object, not a string blob.

## Example — the U1 webhook provider

```json
[
  {
    "id": "u1-webhook",
    "name": "U1 delivery webhook",
    "type": "json_post",
    "endpoint": "{env:DELIVERY_WEBHOOK_URL}",
    "method": "POST",
    "source_field": "final_json",
    "envelope": true
  }
]
```

Set `DELIVERY_WEBHOOK_URL` in the skeleton `.env` (a test endpoint —
webhook.site, or a local handler). Use a **distinct** var from the skeleton's own
`WEBHOOK_URL` (consumed by the event notifier) so content and event traffic stay
separable. For a shared-secret endpoint, add
`"headers": { "X-Delivery-Secret": "{env:DELIVERY_WEBHOOK_SECRET}" }` — config
only, no code change.

## Output

Per-entity items:

| Field | Values |
|-------|--------|
| `delivery_status` | `delivered` \| `failed` \| `skipped` |
| `http_status` | the response status (delivered/failed), or `null` on a network/timeout error |
| `provider_id` | which provider handled it |
| `error` | on failure: `HTTP <status>` or the network error message |
| `reason` | on skip: why (e.g. no deliverable item) |

Summary `description` reports counts: `N delivered, N failed, N skipped across N entities`.

## Secrets

Resolved env-var values (auth tokens, capability URLs) **never** appear in logs,
error items, or stored output. The module logs the provider `id` only, never the
resolved `endpoint` or `headers`. Enforced by a test
(`test-content-delivery.js`, Test 6).

## Design deviation from UNIT_5_5 (recorded)

The design (`UNIT_5_5_STEP9_10_DELIVERY_DESIGN.md` §1.3/§2.3) proposed
`auth: { type: "custom_header", header, env_var }`. This module instead mirrors
**api-search's proven headers-map pattern** (v1.1.0, live-verified 2026-07-07):
an optional `headers` map with `{env:VAR}` interpolation, and `auth: none` = no
`headers` entry. One auth dialect across modules, not two. Decided in the
planning chat; recorded here and in the decision_log.

## Not built in v1 (deferred)

- **`file_upload` / `row_upsert` verbs** — designed, not built (`doc-exporter`,
  `sheet-logger`). A webhook needs only POST.
- **URL field-templating** (`{field}` from pool-item fields into `endpoint`) —
  listed as a code capability in §1.3 but unused by U1; deferred (see the
  `ponytail:` note in `execute.js`). `{env:VAR}` in the endpoint IS supported.
- **Retry loop** — single pass in v1.

## Tests

`node modules/step-9-distribution/content-delivery/test-content-delivery.js`
(mocked, offline, no credentials) — happy path/envelope, no-providers no-op,
missing-`final_json` skip, delivery failures (HTTP + network), missing-env skip,
secret non-leak, field-shape selection, missing-`endpoint` skip, `$`-safe
interpolation. 33 assertions.
