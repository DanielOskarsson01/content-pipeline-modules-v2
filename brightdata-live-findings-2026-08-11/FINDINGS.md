# Bright Data — live API findings (2026-08-11)

**Untracked deliverable. No commits, no pushes. No provider config / manifest / module was modified.**

Run against the live account whose key (`BRIGHTDATA_API_KEY`) is used by the `decision-maker-selector`
companion provider (`brightdata-linkedin-people`) in this repo — resolved from `.env`, not created.
Every claim below names the exact call and shows the observed response shape. Documentation was used only
to fix parameter names; all answers are from live responses.

- **Datasets:** company = `gd_l1vikfnt1wgvvqz95w`, posts = `gd_lyy3tktm25m4avu764`.
- **Two live routes exercised:**
  1. **Search** (synchronous, inline): `POST https://api.brightdata.com/datasets/search/{dataset_id}` → `{hits, total_hits, took}`.
  2. **Discover** (async): `POST https://api.brightdata.com/datasets/v3/trigger?dataset_id=…&type=discover_new&discover_by=…` → `{snapshot_id}`, then `GET /datasets/v3/progress/{snapshot_id}` until `status:"ready"`, then `GET /datasets/v3/snapshot/{snapshot_id}?format=json`.
- **Cost fuse:** every discover call carried `&limit_per_input=N`. **Proven to bind** (see P3): it is the reliable per-input cap.
- **Raw samples saved** beside this file (one per access mode):
  `sample_1_company_search_vegangster.json`, `sample_2_posts_discover_company_url.json`, `sample_3_posts_discover_profile_url.json`.

---

## Spend vs the $2.00 cap

The **v3 `progress` payload never returns a `cost`/`charge`/`price` field** (checked all 9 progress
responses — none present). This key also cannot read `/customer/balance` (403, documented in the prior
probe). So spend is **estimated from delivered records** at the list price **$2.50 / 1,000 records**.

| Route | Calls | Billable records |
|---|---|---|
| Company Search (P1, P2) | 2 | 2 |
| Posts discover `company_url` (P3: 24 + 5 + 68) | 3 | 97 |
| Posts discover `profile_url` (P4: 16 + 16) | 2 | 32 |
| Error/`dead_page`/`bad_input` rows (zero-result) | 6 | 0 (not billed) |
| **Total** | **13 completed jobs** | **131** |

**Estimated spend = 131 × $0.0025 = ~$0.33 (upper bound at list price).**
Actual may be lower — the prior probe observed Bright Data's own `cost` field reporting `$0.00` (free/beta
allowance), and this run's API surfaced no cost field to confirm either way. **≤ $0.33, well under the $2.00 cap.**
No single call returned >200 records; the 200-record stop rule never triggered.

---

## P1 — Does company-dataset **Search** return the FULL record incl. a populated `updates` array?

**Call:** `POST /datasets/search/gd_l1vikfnt1wgvvqz95w`
body `{"size":5,"filter":{"name":"website","operator":"includes","value":"vegangster.com"}}`
→ **HTTP 200 in ~1.3s**, `{"hits":[…], "total_hits":1, "took":624}`.

**Records:** 1. **Cost:** 1 record (~$0.0025).

**Answer: FULL record — NOT trimmed.** The single hit carries the complete company schema (43 top-level
fields: `about`, `description`, `specialties`, `company_size`, `industries`, `founded`, `headquarters`,
`followers`, `employees` (sample of 6), `similar` (10), `funding`, `logo`, `website`, …) **and a populated
`updates` array of 10 recent posts.** Each `updates[]` element:

```
{ date, time, title, post_id, post_url, likes_count, text, text_html }
```

`updates[0].text` was the full body of a real post (868 chars, dated 2026-08-07), with `post_url`.

**But updates population is per-record, not guaranteed.** The Hero Gaming control (P2) returned the same full
schema with **`updates: [] (length 0)`** despite Hero Gaming being an active poster. So Search delivers recent
company posts inline **when the vendor's cached record happens to contain them**, capped at **10**.

**Decision it gates —** *is the posts dataset needed at company level at all?*
**Partially eliminated, not fully.** For **≤10 most-recent** posts on companies where `updates` is populated,
Search is the cheapest route (they come free inside the 1-record company fetch — no discover job). The posts
dataset (`company_url`, P3) is still required when you need **>10 posts, full/older history, guaranteed
coverage, or the company whose `updates` came back empty**.

**Raw sample:** `sample_1_company_search_vegangster.json`.

---

## P2 — Does website-domain filtering resolve **Vegangster** to exactly one record? + control

Same call shape as P1 (`website includes <domain>`), `size:5`.

| Company | filter value | `total_hits` | hits returned | `company_id` | slug `id` | `updates` |
|---|---|---|---|---|---|---|
| **Vegangster** (hardest case) | `vegangster.com` | **1** | **1** | `89203545` | `vegangster-team` | 10 |
| **Hero Gaming** (control) | `herogaming.com` | **1** | **1** | `9400027` | `hero-gaming` | 0 |

**Records:** 1 + 1. **Cost:** ~$0.005.

**Answer: YES — domain filtering collapses Vegangster to exactly one clean record.** The prior name-matching
pathology (three variants including one with a null company id, e.g. "Vegangsters") does **not** reproduce
under `website includes`: a single hit with a **populated numeric `company_id` (89203545)** and slug
`vegangster-team`. The control resolves 1:1 as well. **Domain filtering is a reliable identity key** — it keys
on the one field that is shared across name variants and is absent from the mis-typed "Vegangsters" rows.

**Raw sample:** same file as P1 (`sample_1_company_search_vegangster.json`).

---

## P3 — Posts dataset, `discover_by=company_url`: record count with no window vs a narrow one (cost model)

Company: `https://www.linkedin.com/company/vegangster-team` (the canonical URL from the P1 record).
All calls: `POST /datasets/v3/trigger?dataset_id=gd_lyy3tktm25m4avu764&type=discover_new&discover_by=company_url&include_errors=true&limit_per_input=N`.

| Variant | body | cap | records | date span | cost |
|---|---|---|---|---|---|
| **Narrow (30d)** | `start_date 2026-07-12 … end_date 2026-08-11` | 25 | **24** | 2026-07-13 → 2026-08-10 (all in-window) | ~$0.06 |
| **Fuse check** | same 30d window | 5 | **5** | most-recent 5 | ~$0.0125 |
| **No window** | `[{"url":…}]` | 201 | **70** (68 good + 2 `bad_input`) | 2026-05-27 → 2026-08-10 | ~$0.175 |

**Records:** 24 + 5 + 68 = 97. **Cost:** ~$0.24.

**Answers:**
- **Narrow window (last 30 days) = 24 records.** The date filter **is honored** — every returned `date_posted`
  fell inside the window.
- **No window = 70 records** (the `limit_per_input=201` fuse did **not** bind), spanning only **~2.5 months**
  (2026-05-27 → 2026-08-10). **`company_url` no-window is NOT unbounded all-time** — it is bounded by how far
  back LinkedIn exposes the public company feed (~10–11 weeks here). This is the reassuring result: even with no
  window, a company yields tens, not thousands, of posts.
- **`limit_per_input` binds** — the fuse-check with cap 5 on the exact 30-day window that otherwise yields 24
  returned **exactly 5** (the 5 most recent). This is the dependable cost control for the async route.
- **Cost model:** ~$2.50 / 1,000 delivered records. Vegangster ≈ 24 posts / 30 days ≈ $0.06 per month-window;
  full available history ≈ 70 posts ≈ $0.175. `bad_input` error rows are not billed.

**Raw sample:** `sample_2_posts_discover_company_url.json` (the "Scroll & Play" post used for P5).

---

## P4 — Posts dataset, `discover_by=profile_url`, ONE person: is volume bounded by the date window?

Person: `https://www.linkedin.com/in/michaeloziransky` (a Vegangster exec; the only employee with a resolvable
profile URL in the P1 company record). An earlier candidate `in/edgars-gadzega` returned `dead_page` and was
dropped.

| Variant | cap | attempts | result |
|---|---|---|---|
| **No window** | 50 | **2/2 success** | **16 records** each, identical set, 2026-03-02 → 2026-08-10 |
| **Windowed (last 90d)** | 50 | **0/3** | **`dead_page`, 0 records** every time |

**Records:** 16 + 16 = 32 (the 4 windowed `dead_page` rows are zero-result, not billed). **Cost:** ~$0.08.

**Answers — two hard findings documentation would not reveal:**

1. **The date window is effectively NON-FUNCTIONAL on `profile_url` mode for this account.** Supplying
   `start_date`/`end_date` produced **`dead_page` (0 records) on 3/3 attempts** (fast-failing at ~11s on the
   last), while the **identical call with no window succeeded 2/2 (16 records).** So you **cannot** rely on the
   date window to bound per-profile volume here — it doesn't narrow the result, it breaks the scrape. (The 90-day
   subset *should* have been 10 records — computed from the no-window dates — but the API never returned it.)

2. **`profile_url` (default) returns the ACTIVITY feed, not the person's authored posts.** Of the 16 records,
   **zero were authored by Michael Oziransky.** Breakdown by author: 6 × **Vegangster (Organization)**, plus 10
   single posts by *other* people/orgs he engaged with (Julia Oziransky, Yaroslav Soloshenko, iGamingBusiness,
   iGaming Insides, Chris Scicluna, …). To isolate a decision-maker's **own** posts you must pass
   **`only_authored_posts: true`** in the input object (documented param; not exercised here to stay in budget).

**What actually bounds `profile_url` volume:** not the date window (broken), but (a) the **natural depth of
public activity** (~5 months → 16 rows here) and (b) **`limit_per_input`** (proven to bind in P3). **For any
batched profile run, cap cost with `limit_per_input`, not the date window.** Also budget for **`dead_page`
flakiness** — the same profile that succeeds can fail on the next call.

**Raw sample:** `sample_3_posts_discover_profile_url.json` (an activity-feed record — note `account_type` and
`user_name` show it is authored by someone other than the queried profile).

---

## P5 — Is `post_text` full body, truncated, or character-masked? (verified vs the live page)

**Call:** the P3 `company_url` records. Field inventory of a clean post record: `url, id, user_id, title,
headline, post_text, post_text_html, original_post_text, date_posted, hashtags, embedded_links, images,
num_likes, num_comments, post_type, account_type, user_name, …`.

**Masking scan:** **0 of 68** clean post bodies contained any `***` masking.

**Field semantics resolved:** `post_text` (1,008 chars in the sample) is the **clean full body**; it ends
naturally on its real hashtags with **no "…more" truncation marker**. `post_text_html` (3,498) and
`original_post_text` (3,402) are the same text with `<a>`/`<br>` HTML markup — they are longer **only because of
markup**, not extra content. So `post_text` is complete.

**Live verification:** fetched the public post
`linkedin.com/posts/vegangster-team_scroll-play-activity-7491040568433721344-KvgT`. The live page body matches
the API `post_text` **verbatim**: same product ("Scroll & Play"), same statistics (**+22% longer sessions,
+40% more time in lobby, ~33% faster first game launch**), same closing line ("It's about making discovery
effortless"), and the **identical hashtag set**.

**Answer: `post_text` is FULL body text, unmasked, and faithful to the live post.** Bright Data's published
"masked sample" does **not** apply to this live dataset/account — the returned bodies are complete plaintext.

---

## P6 — Does discover run synchronously, or fall back to snapshot polling? (observed latency)

**Answer: ASYNC snapshot polling — always.** Every `discover_by` trigger returned `{"snapshot_id":"sd_…"}`
immediately (HTTP 200 in ~0.5–0.8s) with **no inline records**; results required `GET /progress/{id}` polling to
`status:"ready"` then a separate `GET /snapshot/{id}?format=json` download. Never synchronous.

Observed status progression: `starting → running → closing → ready` (terminal set also includes
`failed`/`canceled`). Progress payload fields: `status, snapshot_id, dataset_id, running_time, records, errors,
error_codes, collection_duration, avg_duration_per_input`.

**End-to-end latency (trigger → `ready`) is highly variable, even for the same job:**

| Job | records | latency to ready |
|---|---|---|
| company_url 30d (cap 25) | 24 | ~55 s |
| company_url 30d (cap 5) | 5 | ~49 s |
| company_url no-window (cap 201) | 70 | ~82 s |
| profile_url no-window #1 | 16 | **~39 s** |
| profile_url no-window #2 | 16 | **~196 s** (same job!) |
| profile_url windowed (dead_page) | 0 | ~12–44 s |

Typical successful small job ≈ **40–80 s**; worst observed **~196 s** for an identical 16-record profile job.
**Plan for polling with backoff and a multi-minute ceiling** (the repo's design doc uses `interval_ms:10000,
max_wait_ms:900000` — consistent with what was observed). Contrast: the **Search** route (P1/P2) is truly
synchronous, ~1.2s inline.

---

## What could NOT be established, and why

- **Exact `profile_url` windowed count** — 3/3 windowed profile calls returned `dead_page` (0 records). The
  intended 90-day subset (10 rows, by date arithmetic on the no-window set) was never returned live. Cause
  (transient anti-bot vs the window param specifically) is unproven, but the no-window/windowed success split
  (2/2 vs 0/3) points at the window param.
- **Authoritative dollar cost** — the v3 `progress`/`snapshot` API surfaces **no cost field**, and the key
  lacks `/customer/balance` scope (403). Spend is a record-count estimate (~$0.33 upper bound), not a
  vendor-confirmed figure.
- **`only_authored_posts:true` behavior** — identified as the fix for P4's activity-vs-authored problem, but
  not run live (budget/scope). Worth a follow-up single call.
- **True all-time `company_url` depth** — no-window returned ~2.5 months (70 posts). Whether older history is
  reachable by paging or backward windows was not probed (would cost more and risk the 200-record line).

---

### Appendix — key/route provenance
- Key `BRIGHTDATA_API_KEY` read from `/Users/danieloskarsson/dev/content-pipeline-modules-v2/.env`; auth
  `Authorization: Bearer <key>` on every call. Not created, not rotated, no account setting changed.
- Repo verified before any call: `content-pipeline-modules-v2`, branch `main`, clean working tree.
- Company-Search route matches the repo's `brightdata-linkedin-people` provider doc (extended here to the
  company dataset). Discover route matches the `dataset-fetcher` brief's `trigger → progress → snapshot` shape.

---
---

# Follow-up session (2026-08-11, later) — Gaps A & B closed

**Same untracked deliverable. No commits, no pushes. No provider config / manifest / module modified.** Same
key, same two datasets, same two routes as above. Purpose: close the two questions the first pass left open —
(A) is Search `updates[]` trustworthy or just sparsely populated, and (B) does `only_authored_posts:true`
actually fix the profile leg. Live authenticated calls only; every claim names the call and shows the count.

**Seed list used:** the real OnlyiGaming company list
`OnlyiGaming/video podd scraping/company_urls.csv` (99 iGaming companies with websites). A1 took the **first 18
rows in file order** (unbiased systematic sample, skipping nothing) plus the two prior-session anchors
(**Vegangster**, **Hero Gaming**) so the run reproduces P1/P2 and guarantees Hero Gaming is in the batch for A2.
Domain filter value = the bare registrable domain from that CSV.

**Spend this session — 68 delivered records × $0.0025 = ~$0.17 (upper bound at list price), well under the $1.00 cap.**
Every zero-result call (`dead_page`, no-match, HTTP 429) delivered 0 records and is not billed. Per-phase tally
in the spend table at the bottom. As in the first pass, the API surfaces no cost field, so this is a
record-count estimate, not a vendor-confirmed figure.

**Method fuse that mattered:** the Search endpoint **rate-limits (HTTP 429) after ~12 rapid calls** — the tail
of the 20 came back with no `total_hits` on the first attempt; re-run with ~6 s spacing + 20 s backoff cleared
it. 429s are not billed. Every discover call carried `limit_per_input` (proven to bind again below).

---

## A1 — domain-filtered company Search across 20 companies: 1:1 resolution + `updates[]` distribution

**Call (per company):** `POST /datasets/search/gd_l1vikfnt1wgvvqz95w`
body `{"size":1,"filter":{"name":"website","operator":"includes","value":"<domain>"}}`. `size:1` bills at most
1 record/company while `total_hits` still reveals whether resolution was 1:1.

| # | Company | domain | HTTP | total_hits | 1:1? | `updates[]` | LinkedIn URL (top hit) |
|---|---|---|---|---|---|---|---|
| 1 | Punters Lounge | punterslounge.com | 200 | 1 | ✅ | **0** | /company/punters-lounge |
| 2 | Tipstly | tipstly.com | 200 | 1 | ✅ | **0** | /company/tipstly |
| 3 | Upgaming | upgaming.com | 200 | 14 | ❌ multi | 10 | /company/upgaming |
| 4 | Liveg24 | liveg24.com | 200 | 1 | ✅ | **7** | /company/liveg24 |
| 5 | Play'n GO | playngo.com | 200 | 2 | ❌ multi | 10 | /company/play'n-go |
| 6 | Big Time Gaming | bigtimegaming.com | 200 | 1 | ✅ | **0** | /company/big-time-gaming |
| 7 | Vermantia | vermantia.com | 200 | 1 | ✅ | **10** | /company/vermantia |
| 8 | ZIQNI | ziqni.com | 200 | **0** | ❌ no match | n/a | — |
| 9 | E2 Communications | e-2.at | 200 | 2 | ❌ multi | 0 | /company/e-quadrat-communications |
| 10 | Affilirise | affilirise.com | 200 | 1 | ✅ | **0** | /company/affilirise |
| 11 | PlayPearls | playpearls.com | 200 | 1 | ✅ | **0** | /company/playpearls |
| 12 | First Sport Media | 1sport.media | 200 | 1 | ✅ | **10** | /company/first-sport-media |
| 13 | Habanero | habanerosystems.com | 200 | 1 | ✅ | **10** | /company/habanero-systems-b-v- |
| 14 | FeedConstruct | feedconstruct.com | 200 | **0** | ❌ no match | n/a | — |
| 15 | Sportsbook Select | sportsbookselect.com | 200 | 1 | ✅ | **0** | /company/sportsbook-select |
| 16 | BTCGOSU | btcgosu.com | 200 | 1 | ✅ | **0** | /company/btcgosu |
| 17 | TaDa Gaming | tadagaming.com | 200 | 1 | ✅ | **10** | /company/tada-gaming-ltd |
| 18 | Löwen Play | loewen-play-unternehmen.de | 200 | 1 | ✅ | **0** | /company/löwen-play |
| 19 | Vegangster *(anchor)* | vegangster.com | 200 | 1 | ✅ | **10** | /company/vegangster-team |
| 20 | Hero Gaming *(anchor)* | herogaming.com | 200 | 1 | ✅ | **0** | /company/hero-gaming |

**Records billed: 18** (the two no-match rows billed 0). **Cost ~$0.045.** Raw sample of a full A1 record:
`sample_4_company_search_A1_first.json`. Full machine table: `A1_results.json`.

**Resolution distribution (not an average):**
- **15 / 20 resolved 1:1** (`total_hits == 1`).
- **3 / 20 multi-hit** (`total_hits > 1`): Upgaming (14), Play'n GO (2), E2 Communications (2) — the domain
  fragment matched more than one company record. A top record still came back for each.
- **2 / 20 no match** (`total_hits == 0`): ZIQNI, FeedConstruct — the domain string isn't in Bright Data's
  `website` field for those records (not a scrape failure; a keying miss).

**`updates[]` distribution — the field is BIMODAL, not a smooth gradient.** Counting all 18 companies that
returned a record (15 clean + 3 multi-hit top records):

| `updates[]` length | # companies | which |
|---|---|---|
| **0** | **10** | Punters Lounge, Tipstly, Big Time Gaming, E2 Communications, Affilirise, PlayPearls, Sportsbook Select, BTCGOSU, Löwen Play, Hero Gaming |
| 7 | 1 | Liveg24 |
| **10 (the cap)** | **7** | Upgaming, Play'n GO, Vermantia, First Sport Media, Habanero, TaDa Gaming, Vegangster |

The field is almost binary — **either empty (0) or saturated at the cap (10)**; only Liveg24 sits in between.
That shape is the clue A2 tests: a reliable "recent posts" feed would look like this *only if* the 0-companies
genuinely have no reachable feed. The anchors reproduced the first pass exactly — **Vegangster = 10, Hero
Gaming = 0** — so the method is calibrated against known truth.

---

## A2 — do the `updates[]=0` companies actually have posts the posts-dataset can pull?

**Call (per company):** `POST /datasets/v3/trigger?dataset_id=gd_lyy3tktm25m4avu764&type=discover_new&discover_by=company_url&include_errors=true&limit_per_input=10`,
body `[{"url":"<LinkedIn company URL from A1>"}]`, **no date window**; then poll `progress` → `snapshot`.

The three required zero-update companies (Hero Gaming incl.) each returned **`dead_page` — "Activities are not
found"** in ~6–8 s, 0 records. `dead_page` was proven *flaky* in the first pass (P4), and it is not billed — so
this was **retried 3×** and paired with a **known-good control (Vegangster, `updates[]=10`)** run in the same
batch, plus **3 more `updates[]=0` companies** and **2 more `updates[]=10` companies** to turn "3 points" into
a full 2×2. Result:

| Company | Search `updates[]` | posts `company_url` outcome | attempts | records billed |
|---|---|---|---|---|
| **Vegangster** *(control)* | 10 | **10 posts** (limit bound 10/10) | 1/1 success | 10 |
| **Habanero** | 10 | **10 posts** | 1/1 success | 10 |
| **First Sport Media** | 10 | **10 posts** | 1/1 success | 10 |
| **Hero Gaming** *(required)* | 0 | `dead_page` "Activities are not found" | **0 / 3** | 0 |
| **Big Time Gaming** *(required)* | 0 | `dead_page` "Activities are not found" | **0 / 3** | 0 |
| **Löwen Play** *(required)* | 0 | `dead_page` "Activities are not found" | **0 / 3** | 0 |
| **Punters Lounge** | 0 | `dead_page` "Activities are not found" | **0 / 2** | 0 |
| **Sportsbook Select** | 0 | `dead_page` "Activities are not found" | **0 / 2** | 0 |
| **BTCGOSU** | 0 | `dead_page` "Activities are not found" | **0 / 2** | 0 |

**Records billed: 30** (3 populated × 10; the 6 empty companies delivered 0 across 14 retries). **Cost ~$0.075.**
Raw records saved: a real post record for each populated company
(`sample_A2_{Vegangster_CONTROL,Habanero_POS,First_Sport_Media_POS}_company_url.json`) and the `dead_page`
error row for each empty company (`sample_A2_{Hero_Gaming,Big_Time_Gaming,L_wen_Play}_company_url.json`).
Full per-company: `A2retry_*.json`, `A2retry_summary.json`.

**Answer — `updates[]` is TRUSTWORTHY as a first pass; the posts dataset does NOT rescue the empty ones.**
The correspondence is clean and reproducible: **`updates[]=10` ↔ the posts dataset returns 10 (3/3);
`updates[]=0` ↔ the posts dataset `dead_page`s "Activities are not found" (6/6, across 14 total retries)**,
while the Vegangster control succeeds in the same batch (so this is not a transient outage or a broken route).
Search `updates[]=0` is **not** an unreliable-population artifact that the posts dataset would fix — both routes
independently report the same "no reachable feed" verdict for the same companies.

**One honest caveat on wording:** "genuinely does not post" is too strong for the *company*. Big Time Gaming
demonstrably posts on its public LinkedIn page, yet both routes return empty for it. So the precise claim is
**"no publicly-scrapeable activity feed via Bright Data for this company right now"**, not "this company never
posts." Whatever the cause, the operational consequence is what matters for the architecture: **`updates[]` and
the posts-dataset `company_url` leg agree**, so `updates[]` is a valid free first-pass signal — and there is **no
cheaper-or-more-expensive rescue** for the companies it reports as 0; the posts dataset fails on exactly those.

---

## B — does `only_authored_posts:true` fix the profile leg? (No.)

Person = the first pass's subject, `https://www.linkedin.com/in/michaeloziransky`. All calls
`discover_by=profile_url`, `limit_per_input=10`, **no date window**; authorship judged against the returned
`user_id` / `use_url` / `user_name`, never assumed.

| Call | flag | records | authored by target | foreign authors | errors | elapsed |
|---|---|---|---|---|---|---|
| **B1** Michael | `only_authored_posts:true` | **0** | 0 | 0 | **0 (no dead_page)** | 20 s |
| **B-baseline** Michael | *(none)* | **10** | **0** | **10** | 0 | 25 s |
| **B-control** Yaroslav Soloshenko | `only_authored_posts:true` | **0** | 0 | 0 | 0 (no dead_page) | 44 s |
| **B-baseline** Yaroslav | *(none)* | **10** | **0** | **10** | 0 | 75 s |

Files: `B1_summary.json`/`B1_full.json`, `B_baseline_summary.json`, `B_authorcontrol_yaroslavsoloshenko.json`,
`B_baseline_yaroslav_summary.json`. Records billed: **20** (the two baselines; both `only_authored` calls
delivered 0). **Cost ~$0.05.**

**B2 — does `limit_per_input` bind on `profile_url` the way it binds on `company_url`? YES.** Both baseline
calls **requested 10 and returned exactly 10** (`records_reported:10`, 10 delivered). Same reliable cap as the
company leg. (The `only_authored` calls returned 0, so binding can't be *observed* there — but the mechanism is
the same trigger.)

**B1 — how many records, how many authored by the target? 0 and 0.** `only_authored_posts:true` returned a
**clean empty set**: `records:0`, `errors:0`, **no `dead_page`**, 20 s. It did **not** fast-fail like the P4
date-window (which `dead_page`d at ~11 s); it ran a full scrape and legitimately kept nothing.

**Why 0 — and why the flag does NOT fix the leg.** The baselines explain it. `discover_by=profile_url`
(no flag) does **not** return the person's *own* posts — it returns a **"public_post_feed"** (see the
`trk=public_post_feed-actor-image` actor URLs) of ~10 posts authored by **other** accounts that surface on/near
the profile. For **both** people tested the split was identical: **10 records, 0 authored by the target, 10
foreign** — Michael's feed was Vegangster (org) ×4 + 6 others he engaged with; Yaroslav's was iGaming Express,
Playson, Nare Sujyan ×3, Casino Guru News, etc. So there are **zero self-authored posts in the feed for the flag
to keep**, and `only_authored_posts:true` correctly filters the whole feed down to **0**.

Note the control's force: Yaroslav *authored* a post that appeared inside Michael's baseline feed, yet scraping
**Yaroslav's own** `profile_url` still surfaced 0 of his authored posts (10 foreign). This is a property of the
`profile_url` route, not of one quiet individual — it does not expose a person's authored content for these
iGaming decision-makers.

**B3 — stated plainly:** `only_authored_posts:true` does **NOT** `dead_page`, and it does **NOT** return foreign
authors. It returns a **clean, correct, empty** result. The prior pass hypothesised it as the fix for the
activity-vs-authored problem; **live, it does not fix the profile leg** — it removes the foreign-author leak (a
real correctness win) but yields **0 usable records for 2/2 decision-makers**, because `profile_url` surfaces
others' posts rather than the target's. The people leg, as designed around pulling a decision-maker's *own*
posts through `profile_url`, produced nothing for either subject tested. No retries were spent chasing it into
the budget.

---

## Spend this session vs the $1.00 cap

| Phase | Call | Delivered records | Est. cost |
|---|---|---|---|
| A1 | Company Search ×20 (2 no-match = 0) | 18 | $0.045 |
| A2 | posts `company_url` — 3 populated ×10 | 30 | $0.075 |
| A2 | posts `company_url` — 6 empty × up-to-3 retries (all `dead_page`) | 0 | $0.000 |
| B | posts `profile_url` — 2 baselines ×10 | 20 | $0.050 |
| B | posts `profile_url` — 2× `only_authored_posts` (clean 0) | 0 | $0.000 |
| **Total** | **~26 completed jobs** | **68** | **~$0.17** |

**~$0.17 upper bound at list price — $0.83 of the $1.00 cap unused.** No single call exceeded 10 records
(`limit_per_input` capped everything). Rate-limit (429), no-match, and `dead_page` responses all delivered 0
records and are not billed.

---

## What could NOT be established this session

- **Whether ANY `profile_url` ever surfaces a person's own authored posts.** 2/2 subjects returned 0
  self-authored in the baseline feed, so `only_authored_posts:true` had nothing to keep. Proving the flag
  *can* return >0 would need a subject whose public feed already contains their own posts — none was found among
  the people reachable here. On this evidence `profile_url` looks structurally unsuited to "a decision-maker's
  own posts," but n=2 can't call it universal.
- **Root cause of `dead_page` on the `updates[]=0` companies** — "Activities are not found" is stable per
  company (6/6, 14 retries) and cleanly separates from the working control, but whether it's an
  access/visibility state on Bright Data's side or a true absence of a public feed is not distinguishable from
  the API surface.
- **The 2 no-match Search rows (ZIQNI, FeedConstruct)** — `total_hits:0` on the CSV domain means Bright Data's
  `website` field differs from the seed CSV's; a name-based or alternate-domain filter might resolve them, not
  probed (out of the A1 domain-filter scope).
- **Authoritative dollar cost** — unchanged from the first pass: no cost field in `progress`/`snapshot`, key
  lacks `/customer/balance` (403). $0.17 is a record-count estimate.


---
---

# Session 3 (2026-08-12) — Probe 1: `dead_page` cause · Probe 2: per-author route

**Same untracked deliverable. No commits, no pushes. No tracked file, provider config, manifest or module
modified.** Same key (`BRIGHTDATA_API_KEY` from `.env`), same two datasets (company `gd_l1vikfnt1wgvvqz95w`,
posts `gd_lyy3tktm25m4avu764`), Bearer auth on every call. Live authenticated calls only; every claim names the
call and shows the count. Budget cap **$1.00**; `limit_per_input=10` on every posts call. Runner:
`scratchpad/bd.py` (stdlib urllib; trigger-all → poll-all → download-all). Raw per-job JSON saved beside this
file under `probe1_out/`, `probe2a_out/`, and `P2B_filter_*`.

**Two headline results this session — both revise a prior verdict:**
1. **`dead_page` on the 6 dead companies is a GENUINE absence of feed, not a URL-resolution failure.**
2. **The people leg is NOT dead. There is a working per-author route** — `POST /datasets/filter` by `user_id`
   returns the target's **own** authored posts (4/4 for the control), and it reported **`cost: 0`**.

---

## PROBE 1 — is `dead_page` a URL-resolution failure or a genuine absence of feed?

**Call (every job):** `POST /datasets/v3/trigger?dataset_id=gd_lyy3tktm25m4avu764&type=discover_new&discover_by=company_url&include_errors=true&limit_per_input=10`,
body `[{"url":"<form>"}]`, no date window; then poll `progress` → download `snapshot`. 14 jobs triggered in one
batch (~1.2 s apart). One supporting Search (`loewen-play-unternehmen.de`) confirmed the canonical record:
`url = https://www.linkedin.com/company/l%C3%B6wen-play`, `country_code = DE` — the Search record exposes **no
`de.` subdomain form**, so that variant was tested independently. Seed CSV note: `company_urls.csv` carries only
`Company Name,Website` — **no LinkedIn URL column**, so "the URL exactly as it appears in the seed CSV" does not
exist for `company_url`; the canonical LinkedIn URL is derived from the website via Search. Website-domain form
is therefore not a valid `company_url` input and was not counted as a form.

### 1A — vary ONLY the input URL form (Big Time Gaming, Löwen Play)

| # | URL form tried | company | result | records |
|---|---|---|---|---|
| 1 | `…/company/big-time-gaming` (canonical) | BTG | `dead_page` "Activities are not found" | 0 |
| 2 | `…/company/big-time-gaming/` (trailing slash) | BTG | `dead_page` | 0 |
| 3 | `…/company/big-time-gaming/posts/` (/posts/ suffix) | BTG | `dead_page` | 0 |
| 4 | `https://linkedin.com/company/big-time-gaming` (stripped www) | BTG | `dead_page` | 0 |
| 5 | `…/company/l%C3%B6wen-play` (canonical, %-encoded ö) | Löwen | `dead_page` | 0 |
| 6 | `…/company/löwen-play` (unencoded ö) | Löwen | `dead_page` | 0 |
| 7 | `…/company/l%C3%B6wen-play/` (trailing slash) | Löwen | `dead_page` | 0 |
| 8 | `…/company/l%C3%B6wen-play/posts/` (/posts/ suffix) | Löwen | `dead_page` | 0 |
| 9 | `https://de.linkedin.com/company/löwen-play` (DE subdomain) | Löwen | `dead_page` | 0 |
| 10 | `…/company/loewen-play` (ASCII slug) | Löwen | `dead_page` | 0 |

**10 / 10 URL forms → `dead_page`, 0 records.** No URL form recovers either company — including the exact
canonical form that returns posts for other companies. Files: `probe1_out/P1A_*.json`,
`probe1_out/P1_discover_summary.json`.

### 1B — negative control: deliberately mangle Vegangster (known-good, returns 10)

| URL form | mangle | result | records | authored |
|---|---|---|---|---|
| `…/company/vegangster-team` | — (canonical control) | still **running at >15 min** (never returned; P6 latency pathology — see caveats) | — | — |
| `…/company/Vegangster-Team` | wrong slug **case** | **10 posts** | 10 | **all 10 `user_id=vegangster-team`** |
| `https://linkedin.com/company/vegangster-team` | **stripped www** | **10 posts** | 10 | **all 10 `user_id=vegangster-team`** |
| `…/company/vegangster-team/about/` | **added path segment** | `dead_page` | 0 | — |

**Bright Data NORMALISES cosmetic URL differences.** Wrong-case slug and stripped-`www` both resolved to
**Vegangster's own 10 posts** (`user_id=vegangster-team`, verified) — the feed still comes back. Only adding a
**path segment** (`/about/`) breaks resolution into `dead_page` (this is the "bad-URL" flavour of `dead_page`,
and it also explains why the `/posts/` suffix forms in 1A fail). Files: `probe1_out/P1B_*.json`.

### Probe 1 verdict — plainly

**`dead_page` for the 6 dead companies is a GENUINE absence of a reachable public feed, NOT a URL-resolution
failure.** The discriminator is clean: (a) cosmetically-mangled Vegangster **still returns its posts** on the
same host/slug shapes, so the resolver tolerates form variation; yet (b) BTG and Löwen Play `dead_page` on
**every** form, *including the exact clean canonical form that works for Vegangster and 7 other companies in A1*.
If URL form were the cause, either some form would have recovered BTG/Löwen, or the clean form would fail for
Vegangster too — neither holds. `dead_page` is overloaded (a genuinely malformed URL like `/about/` also yields
it), but the dead companies fail the *good* form, so their `dead_page` is the "no feed" flavour. **The 6 dead
companies are NOT recoverable by fixing the URL** — consistent with Session-2's A2 conclusion and the honest
caveat that "no publicly-scrapeable feed via Bright Data right now" ≠ "this company never posts" (Big Time Gaming
posts on its live page, yet all 4 forms `dead_page`).

**Raw record (BD normalised a mangled URL to the real feed):** `probe1_out/P1B_VG_mangle_case.json[0]` —
`user_id=vegangster-team`, `2026-07-28`, `…/posts/vegangster-team_vegangster-sbcsummit-…-activity-7487809626223108096-25JM`.

---

## PROBE 2 — is there any working per-author route, or is the people leg dead?

### 2A — the untested fourth mode, `discover_by=url`, on the `/recent-activity/all/` path

**Call:** same trigger, `discover_by=url`, `limit_per_input=10`, body `[{"url":"…/in/<slug>/recent-activity/all/"}]`.
Authorship judged against the returned `user_id`, never assumed.

| Subject | recent-activity URL | records | **authored by target** | foreign |
|---|---|---|---|---|
| **Bill Gates** (positive control) | `…/in/williamhgates/recent-activity/all/` | 10 | **6 / 10** (`user_id=williamhgates`) | 4 |
| Yaroslav Soloshenko | `…/in/yaroslavsoloshenko/recent-activity/all/` | 10 | **0 / 10** | 10 |
| Michael Oziransky | `…/in/michaeloziransky/recent-activity/all/` | **did not complete** (still `running` at >15 min) | — | — |

**`discover_by=url` is a real, valid mode and it DOES surface a person's OWN posts** — the Bill Gates control
returned **6 of 10 authored by him** (the other 4 are posts he reshared: Chris Elias, HHMI, Brimstone Energy,
Hello Tractor). So this route is *not* the pure foreign-feed that `profile_url` was. But it pulls the **live
recent-activity feed**, so for a subject who does not recently post it returns their reshares/engagement:
**Yaroslav = 0/10 authored** (Playson, Nare Sujyan ×3, Casino Guru News, iGaming Express, …) — the same shape
Session-2 saw on `profile_url`. The route works; these iGaming decision-makers just don't publicly author.
Files: `probe2a_out/P2A_*.json`.

**Control honesty:** as an automated agent I did not personally load a LinkedIn page weekly. Bill Gates was used
as a *maximal* known-public-author control; his active public authoring is corroborated two ways — dated public
2026 posts found via web search (Aug 4/Aug 10/Jul 30/Jul 26), and the live API itself returning 6 of his own
posts. If the route could *never* return authored content, this control would have exposed it; it did not.

**Raw record (`discover_by=url`, self-authored):** `probe2a_out/P2A_Control_BillGates_recentactivity.json` —
`user_id=williamhgates`, Person, `2026-08-04`, 1,676 likes,
`…/posts/williamhgates_…tempwatch-activity-7490198711457853440-UDMK`, post_text = "Ratul Narain and his team
developed TempWatch, a small, wearable bracelet that helps detect hypothermia in newborns…".

### 2B — can the posts dataset be queried structurally by `user_id`?

**Call (single):** `POST https://api.brightdata.com/datasets/filter`
body `{"dataset_id":"gd_lyy3tktm25m4avu764","records_limit":10,"filter":{"name":"user_id","operator":"=","value":"yaroslavsoloshenko"}}`.

- **HTTP 200**, returns async `{"snapshot_id":"snap_…"}` (note the **`snap_` prefix — a different family** from
  discover's `sd_`). It is **not** a 404 and **not** an error.
- Retrieval is a **different endpoint set** (the v3 `progress`/`snapshot` endpoints 404 for a `snap_` id):
  status via `GET /datasets/snapshots/{id}` (`building`→`ready`), download via
  `GET /datasets/snapshots/{id}/download?format=json`.
- **Result: 4 records, ALL `user_id=yaroslavsoloshenko` (Person) — his OWN authored posts**, spanning
  2023→2026 (real first-person text: "CasinoBeats Malta Recap!", "It was a pleasant surprise to be recognized by
  iGaming Express", "Today was my last day at Evoplay…", "…my first small article related to iGaming").
- **Snapshot metadata reports `cost: 0`** (`dataset_size:4`, `file_size:35217`) — the authoritative cost field
  the prior two sessions could never obtain. The filter runs over Bright Data's **already-collected marketplace
  dataset**, not a fresh scrape, which is why it is free/near-free here.

Files: `P2B_filter_FINAL.json` (the 4 records), `P2B_filter_metadata.json` (the `cost:0` snapshot metadata).

**Raw record (`/datasets/filter`, self-authored):** `P2B_filter_FINAL.json[1]` — `user_id=yaroslavsoloshenko`,
Person, `2026-06-08`, `…/posts/yaroslavsoloshenko_it-was-a-pleasant-surprise-to-be-recognized-activity-7469701234715770880-q3xa`.

### 2C / Probe 2 verdict — plainly

**The people leg is NOT dead.** Two routes surface a decision-maker's own authored posts, where Session-2's
`profile_url` + `only_authored_posts` returned nothing:

1. **`POST /datasets/filter` by `user_id` is the clean per-author route** — 4/4 authored by the target, zero
   foreign, and reported **cost 0**. Caveat: it queries the **existing marketplace cache**, so coverage is
   "whatever Bright Data already collected for that `user_id`" — for Yaroslav that is **sparse and historical
   (4 posts, 2023–2026)**, not a guaranteed complete or fresh pull, and it needs the person's `user_id` slug
   (derivable from the profile URL). It is a *lookup over collected data*, not a *collector*.
2. **`discover_by=url` on `/recent-activity/all/` returns authored posts when the subject actually posts**
   (6/10 for Bill Gates), but returns their reshare/engagement feed (0 authored) for subjects who don't —
   which is why it yielded 0 for Yaroslav and (by Session-2 evidence) the other iGaming people.

So the earlier "people leg is dead" was too strong: it was true for the *routes tested there*, but
**`/datasets/filter` by `user_id` works and returns self-authored content**. What remains genuinely limiting is
not the route but the **subjects** — these iGaming decision-makers author little publicly, so any route yields
few of their own posts.

---

## Spend this session vs the $1.00 cap

| Item | Call | Delivered records | Est. cost |
|---|---|---|---|
| Probe 1 support | Company Search ×1 (Löwen Play) | 1 | $0.0025 |
| Probe 1A | posts `company_url` ×10 forms — all `dead_page` | 0 | $0.000 |
| Probe 1B | posts `company_url` — 2 mangles ×10 (case, no-www) | 20 | $0.050 |
| Probe 1B | posts `company_url` — `/about/` mangle `dead_page` | 0 | $0.000 |
| Probe 2A | posts `discover_by=url` — Yaroslav ×10 + Bill Gates ×10 | 20 | $0.050 |
| Probe 2B | `POST /datasets/filter` — 4 records | 4 | **$0.00 (metadata `cost:0`)** |
| **Total delivered** | | **45** | **~$0.1025** |

**~$0.10 upper bound at list price ($2.50/1,000); Probe 2B was free per its own metadata.** All `dead_page`
rows delivered 0 and are not billed. **Two jobs were still `running` at session end and never delivered**
(Vegangster canonical control in 1B; Michael Oziransky in 2A) — if they ever complete they would add ≤10 records
each, so the absolute worst-case ceiling is **~$0.15**, well under the $1.00 cap. Neither is needed: 1B's
conclusion rests on the two mangles that returned Vegangster's real feed, and 2A's on the Bill Gates control +
Yaroslav.

## What could NOT be established this session

- **Michael Oziransky `discover_by=url` and the Vegangster canonical control never returned** (both stuck
  `running` past ~15 min — the same wild latency pathology documented in Session-1 P6, where one 16-record job
  took 196 s). Their answers are already implied by the completed jobs, so no budget was spent chasing them.
- **Filter-route coverage and cost at scale.** `/datasets/filter` returned only the 4 of Yaroslav's posts
  already in the marketplace cache and reported `cost:0` for that tiny query. Whether it returns a *complete*
  or *current* set for a given person, and whether it stays free for large `records_limit`, was not probed
  (single cheap call, per scope).
- **Root cause of `dead_page` on the dead companies** — unchanged: the API cannot distinguish "Bright Data has
  no collected feed" from "no public feed exists" beyond the `dead_page`/"Activities are not found" string. What
  is now settled is that it is **not** a URL-form problem.
