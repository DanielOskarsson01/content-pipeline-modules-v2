# Bright Data — LinkedIn People — provider config

**Status:** BUILD-READY (Search route). Measured live 2026-08-10 against dataset `gd_l1viktl72bvl7bjuj0`
(LinkedIn people profiles) with a Datasets API key (`BRIGHTDATA_API_KEY`).

> ## ✅ UPDATE 2026-08-10 — use the synchronous **Search** endpoint (no poll needed)
>
> The 2026-08-09 probe only tried `POST /datasets/filter` (async) and concluded a poll primitive was
> required. **That is now moot.** Bright Data documents a **synchronous Search endpoint** that supports
> exactly three datasets today — this one included — and it works:
>
> - **`POST https://api.brightdata.com/datasets/search/gd_l1viktl72bvl7bjuj0`**
> - Auth: `Authorization: Bearer $BRIGHTDATA_API_KEY`
> - Body: `{ "filter": {…}, "size": 100 }` (also `sort`, `search_after` for paging)
> - **Records return INLINE**, synchronously, in `{ "hits": [...], "total_hits": N, "took": ms }`.
>   **No `snapshot_id`, no polling, no download hop.**
> - Measured: HTTP **200** in **~3.0s** wall (**1.0s** server `took`), 76 Vegangster records inline.
> - Cost: **$2.50 CPM** (per 1,000 records returned) — same as Filter.
>
> **Consequence:** this is now **a pure api-fetcher config** — the poll primitive / `dataset-fetcher`
> (BACKLOG #56) is **not needed** for this route. Role selection that `includes` cannot do cleanly is
> handled by the companion Step-4 module **`decision-maker-selector`** (word-boundary regex).
>
> ### Provider config (Search — build-ready)
>
> ```json
> {
>   "id": "brightdata-linkedin-people",
>   "name": "Bright Data — LinkedIn People (Datasets Search API, synchronous)",
>   "response_format": "json",
>   "auth": { "type": "bearer", "env_var": "BRIGHTDATA_API_KEY" },
>   "identifier_source": { "entity_field": "company_name", "item_field": "current_company_name" },
>   "empty_is_error": true,
>   "endpoints": [
>     {
>       "id": "search",
>       "method": "POST",
>       "url": "https://api.brightdata.com/datasets/search/gd_l1viktl72bvl7bjuj0",
>       "body": {
>         "size": 100,
>         "filter": {
>           "operator": "and",
>           "filters": [
>             { "name": "current_company_name", "operator": "includes", "value": "{identifier}" },
>             { "operator": "or", "filters": [
>               { "name": "position", "operator": "includes", "value": "Head" },
>               { "name": "position", "operator": "includes", "value": "Chief" },
>               { "name": "position", "operator": "includes", "value": "Founder" },
>               { "name": "position", "operator": "includes", "value": "Director" }
>             ] }
>           ]
>         }
>       },
>       "results_path": "hits",
>       "field_map": {
>         "name": "name", "title": "position", "company": "current_company_name",
>         "company_id": "current_company_company_id", "url": "url", "location": "location"
>       }
>     }
>   ]
> }
> ```
>
> `empty_is_error: true` is correct: a valid company that surfaces zero decision-makers is a failure to
> surface, not a legitimate empty. The api-fetcher engine already honours it (execute.js v1.1.2, line 493).
> The engine substitutes `{identifier}` into the body's string leaves, POSTs the object as JSON, reads
> `results_path: "hits"`, and maps each hit — no engine change required.
>
> ### B4 — server-side filter (max recall within the rule limits)
>
> Constraints (validation-only, free): **≤4 rules per group**, **nesting depth ≤3**, a group with
> `combine_nested_fields` cannot hold sub-groups. Design: an outer **AND** (2 rules) of a company rule
> and an inner **OR** (4 rules), depth 2 — inside every limit.
>
> | Rule | Why |
> |------|-----|
> | `current_company_name includes {company}` | Anchors to the company. `includes` (substring) tolerates name variants ("Vegangster"/"Vegangsters"), higher recall than `=` on `company_id` (which drops null-id rows). |
> | `position includes "Head"` | Catches **all** `Head of X` (the probe's narrow tokens missed Head of Content/Frontend/Technical Support). Substring is fine server-side — the client selector re-checks with word boundaries. |
> | `position includes "Chief"` | Spelled-out C-suite: Chief Executive/Technology/Marketing/Product Officer. |
> | `position includes "Founder"` | Founder / Co-Founder. (Precision caveat below.) |
> | `position includes "Director"` | Director-level. Broadest 4th spelled-out token; "Director of X" refined client-side. |
>
> **Acronyms are deliberately excluded server-side** (the whole reason for the client selector): `includes`
> is unanchored, so `CTO` would match "dire**cto**r"/"fa**cto**ry". **Known recall gap:** an acronym-only
> C-suite title (e.g. a bare "CEO" with no "Chief"/"Founder") is missed server-side — acceptable because
> Search is cheap; a full-roster fetch (no role OR-group) catches them at ~5–10× the records.
>
> **Measured precision caveat at scale:** on a large company (Pragmatic Play, 39 role-filtered records →
> 29 matched) the leaks are `"Founder of <side-company>"` (employees who founded something on the side)
> and `"Director of Photography"` — both real title matches, not company decision-makers. For large
> established companies, down-weight `Founder`/`Director` or add a company-anchor. On a startup
> (Vegangster) `Founder` is high-value — it caught the actual "CEO and Co-Founder".

---

## (Historical) 2026-08-09 Filter-API probe — async route, superseded by Search above

## What the probe established

- **The Filter/Search endpoint is ASYNCHRONOUS, not synchronous.** `POST /datasets/filter` returns a
  `snapshot_id` immediately; records are retrieved later via a separate snapshot-download call after the
  job finishes `building`. There is no inline-records mode. This is trigger → **poll** → download.
- **It works and it beats Apify.** For `Vegangster` (iGaming platform, ~88 staff) the role-filtered query
  returned real named decision-makers (CEO/Co-Founder, Head of Marketing) where the Apify baseline
  (`_salvage-linkedin-2026-08-08/session-scratchpad/vg-employees.json`) returned `[]` — zero people.
- **Company filtering is reliable. Title filtering with `includes` is not.** `includes` is a
  case-insensitive **substring** match with no word boundaries: the token `CTO` matches "dire**cto**r"
  and "fa**cto**ry", so an Oatly role query returned 50 Directors/Factory-managers, not C-suite.
- **Cost so far: `$0.00`** per Bright Data's own `cost` field on every snapshot (BETA/free tier or within
  allowance; the key cannot read `/customer/balance` to independently confirm — 403, lacks that scope).
  Price list is $2.50 CPM (per 1,000 records returned); no charge on zero matches.

## Measured endpoint flow

| # | Call | Notes |
|---|------|-------|
| 1 | `POST https://api.brightdata.com/datasets/filter` | body = `{dataset_id, records_limit, filter}` → returns `{"snapshot_id": "..."}` |
| 2 | `GET https://api.brightdata.com/datasets/snapshots/{snapshot_id}` | poll until `status:"ready"`; gives `cost`, `dataset_size`. **`status:"failed"` + `dataset_size:0` == zero matches (no charge)**, not an error |
| 3 | `GET https://api.brightdata.com/datasets/snapshots/{snapshot_id}/download?format=json` | JSON array of profile records. `400 "Snapshot not ready"` until step 2 is `ready` |

Auth on every call: `Authorization: Bearer $BRIGHTDATA_API_KEY`.

Filter constraints learned the hard way (all validation-only, free): max **4 rules per logical group**;
max nesting **depth 3**; a group with `combine_nested_fields` **cannot** contain sub-groups (it is only
for arrays-of-objects like `experience[]`; `position` and `current_company_name` are top-level scalars,
so `combine_nested_fields` is unnecessary here).

## ⚠️ Blocking caveat — this is NOT a pure api-fetcher config

api-fetcher (v1.1.2) supports `bearer` auth, `POST` + `body`, endpoint chaining via `{endpoint.field}`,
and `empty_is_error` — everything **except step 2**. `execute.js:438` is explicit:
`// ponytail: single POST per endpoint, no async poll — Bright-Data-Datasets-style trigger/poll needs a separate primitive`.
Chaining `filter → download` with no poll fires the download mid-`building` → `400 Snapshot not ready`.
So **LinkedIn is not "a config change" — it needs the `dataset-fetcher` poll-until-ready primitive (BACKLOG #56)**,
or a `poll` hop added to api-fetcher. The config below is written in that target shape.

## Provider config (draft — target: `dataset-fetcher` / api-fetcher + poll)

```json
{
  "id": "brightdata-linkedin-people",
  "name": "Bright Data — LinkedIn People (Dataset Filter API)",
  "response_format": "json",
  "auth": { "type": "bearer", "env_var": "BRIGHTDATA_API_KEY" },
  "identifier_source": { "entity_field": "company_name", "item_field": "current_company_name" },
  "empty_is_error": true,
  "endpoints": [
    {
      "id": "filter",
      "method": "POST",
      "url": "https://api.brightdata.com/datasets/filter",
      "body": {
        "dataset_id": "gd_l1viktl72bvl7bjuj0",
        "records_limit": 50,
        "filter": {
          "operator": "and",
          "filters": [
            { "name": "current_company_name", "operator": "includes", "value": "{identifier}" },
            { "operator": "or", "filters": [
              { "name": "position", "operator": "includes", "value": "Founder" },
              { "name": "position", "operator": "includes", "value": "Chief" },
              { "name": "position", "operator": "includes", "value": "Head of" },
              { "name": "position", "operator": "includes", "value": "President" }
            ]}
          ]
        }
      },
      "results_path": "snapshot_id"
    },
    {
      "id": "await",
      "method": "GET",
      "url": "https://api.brightdata.com/datasets/snapshots/{filter.snapshot_id}",
      "poll": { "status_path": "status", "ready": "ready", "fail": ["failed", "empty"],
                "interval_ms": 20000, "timeout_ms": 900000 }
    },
    {
      "id": "download",
      "method": "GET",
      "url": "https://api.brightdata.com/datasets/snapshots/{filter.snapshot_id}/download?format=json",
      "results_path": "$",
      "field_map": {
        "name": "name",
        "title": "position",
        "company": "current_company_name",
        "company_id": "current_company_company_id",
        "profile_url": "url",
        "location": "location"
      }
    }
  ]
}
```

`empty_is_error: true` is correct here: a valid company returning zero decision-makers is a failure to
surface, not a legitimate empty. Note this couples with the API's own behaviour — a zero-match snapshot
reports `status:"failed"`, so the poll's `fail` list and `empty_is_error` are two guards on the same event.

## S4 — title matching: what works, what it misses

`includes` has **no word boundaries**, so it cannot safely use short acronyms:

| Token | Verdict |
|-------|---------|
| `Founder`, `Chief`, `Head of`, `President` | usable — spelled-out, low false-positive |
| `CTO`, `CMO`, `CPO`, `CEO` | **dangerous** — `CTO`→"director"/"factory", etc. Flooded Oatly with 50 non-execs |
| `=` (exact) | precise but useless on free-form titles (misses 90%) |
| `in` (exact list) | same problem — titles are too varied to enumerate |

**Recommendation:** server-side `includes` on spelled-out tokens above to cut volume, then a **client-side
word-boundary regex** in the module to select the actual target roles (and drop the `director`→CTO noise).
Server-side alone cannot do clean title selection.

**What it will still miss regardless:** acronym-only titles with no spelled-out form; non-English titles
(the dataset is multilingual — e.g. "Doradca Klienta…", "Creative director **på** Oatly"); and people who
put a tagline or emoji in `position` instead of a title (seen: "🦘", "Goals are dreams with deadlines",
and `null`).

## S5 — company by name vs by id

- `current_company_company_id` is a **slug** (`vegangster-team`) — identical to Apify's `universalName`.
  Obtain it from any returned record, from the company page URL, or from the Step-3 company scrape.
- **Name (`includes`) = higher recall, entity-mixing risk.** It pulled 3 name variants in one query
  (`Vegangster`, `Vegangsters`, `Vegangster (formerly TheWhyKingz)`); the `Vegangsters` rows carry a
  **null** company_id — a different/unlinked company page.
- **Id (`=`) = higher precision, recall gap.** It excludes rows whose company_id is null (2/50 in the
  Vegangster roster) even though their `current_company_name` clearly reads Vegangster.
- **Neither current-company filter finds people whose Vegangster tenure is only in `experience[]`**
  (past employees, or current-primary-listing-elsewhere). That needs an `experience`-array filter with
  `combine_nested_fields`, or the company employee endpoint.

For a distinctive name, `includes` on the name is the pragmatic default; add an id filter when a common
company name would collide.
