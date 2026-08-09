# Bright Data — LinkedIn People (Dataset Filter API) — provider config draft

**Status:** PROBE RESULT + DRAFT. Measured live 2026-08-09 against dataset `gd_l1viktl72bvl7bjuj0`
(LinkedIn people profiles) with an account-level Datasets API key (`BRIGHTDATA_API_KEY`).
**Not wired into `execute.js`.** See the blocking caveat below — this route needs a poll primitive
api-fetcher does not yet have (BACKLOG #56, `dataset-fetcher`).

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
