# Submodule Brief: url-heuristics (Heuristic URL Validator) (revised)

**Step:** 2 — URL processing (validation)
**Revised:** 2026-07-03 — pipeline-agnostic redesign (Rule 13). Original archived in `_originals-2026-07-03/`.
**Original goal (unchanged):** Score discovered URLs with cheap rule-based heuristics to reject list pages, pagination, and web cruft before committing to expensive scraping/LLM steps.
**Build status:** not built
**Design verdict:** new generic module `url-heuristics` (filename kept as `step2-learned-validator.md`; module concept renamed — V1 is rule-based, nothing "learned" ships, so the name would be a lie)

## Goal

Cut the cost of Steps 3–5 by rejecting obvious non-content URLs (pagination, category/tag archives, auth pages, search results) using zero-cost deterministic heuristics. Sits BETWEEN the existing structural cleaners and the expensive judges:

```
url-canonicalizer → url-dedup → url-filter → [url-heuristics] → url-relevance (LLM) → scrapers
```

**Why this is not just config of an existing module** (Rule-13 hierarchy applied):
- `url-filter` (Step 2, remove): binary operator-authored regex. No scoring, no three-way decision, no reasons, no shadow mode.
- `url-relevance` (Step 2, remove): LLM classification — semantic but costs tokens per item.
- `url-heuristics` is genuinely different behavior: a weighted scoring engine producing `allow | allow_hint | reject` with reasons and a shadow mode, at zero marginal cost. It exists to shrink the item set url-relevance has to pay for. New module justified per hierarchy step (3).

## Design (agnostic)

V1 is **rules only**, and every rule set is a manifest option (config-driven). Nothing in code knows any vertical.

Signals, all configurable:
1. **Path/URL patterns → reject** — regex list matched against the full URL. Generic web-cruft defaults ARE pipeline-agnostic (pagination `/page/\d+`, `/category/`, `/tag/`, `/author/`, `/search`, `?s=`, `/login`, `/register`, `/cart`, `/checkout`, `/privacy`, `/terms`, `/cookie-policy`, `/wp-admin`, `/feed`, `.xml$`) and ship as defaults. Anything domain-flavored is template config.
2. **Hint patterns → allow_hint** — patterns for "list-like but possibly a useful overview" (e.g. `/news/?$`, `/blog/?$` section roots). Kept in the pool, flagged for the operator / downstream LLM.
3. **Structural scoring** — path depth beyond `max_depth`, query-param count beyond `max_query_params`, fragment-only URLs. Each violation subtracts from the score.
4. **Title/snippet signals** (only when Step 1 provided `title`/`snippet`) — regex list for list-page tells ("Page \d+ of", "Browse all", "Archive", "Access denied", "404").
5. **Render flag** — domains listed in `needs_render_domains` get `needs_render: true` (a hint for browser-scraper ordering in Step 3). Default empty; purely template config. (Original called this `needs_playwright` — renamed: the pipeline's renderer is browser-scraper, and the flag should name the need, not a library.)

Decision derivation: any reject-pattern match → `reject` (score 0.1); otherwise score starts at 1.0, structural/title penalties subtract; `score < reject_threshold` → `reject`, `< hint_threshold` → `allow_hint`, else `allow`. Every decision carries `reasons` (pre-joined string — ContentRenderer requires strings, not arrays) and `validator_version`.

**Shadow vs enforce** (`mode` option, default `shadow`): in shadow mode ALL items are kept — annotated with decision/score/reasons so the operator can audit false rejects in the UI (`flagged_when: { decision: ["reject"] }`, string values per renderer contract). In enforce mode, `reject` items are dropped. Shadow default = safe, runnable default (not a trip-wire); promote to enforce per template once rejects look trustworthy.

**Rule 13 test applied:** rule lists, thresholds, mode, render domains — all expressible as template-uploaded configuration. Code contains only the generic engine (regex matching, scoring arithmetic, decision mapping). Zero content-type assumptions in code or defaults.

**V2 (future, one paragraph only):** a learned mode — logistic regression or small classifier over path tokens/DOM signals trained from operator accept/reject labels, promoted per-domain only when precision(reject) ≥ 0.95 and false-reject ≤ 2%, shadow-first. Out of scope for this brief; requires labeled data infrastructure that does not exist yet. Nothing in the V1 contract blocks it (add `mode: "learned"` later).

## Module contract

- **item_key:** `url`
- **data_operation_default:** `remove` + `requires_items` — the module's purpose is filtering; `remove` keeps only items whose key matches a returned item and merges enriched fields (decision/score/reasons) into kept items. In shadow mode it returns ALL items (annotated) → behaves as a pure tagger; in enforce mode it returns only `allow`/`allow_hint` items. A `transform` contract was rejected: it cannot drop items, and no downstream module filters on arbitrary item fields, so tagging-only would never realize the cost savings.
- **pool_precondition:** `requires_items`
- **cost:** `cheap` (pure CPU, no network, no LLM)
- **requires_columns:** `["url"]` (`title`, `snippet` used opportunistically if present)
- **_partialItems:** no network/LLM I/O so Rule 10 doesn't strictly bind, but push annotated items per entity anyway (repo precedent: keyword-sufficiency-checker pushes in a no-I/O checker; cheap insurance).
- **sort_order:** after url-filter, before url-relevance.

## Options (manifest sketch)

| Option | Type | Default | Notes |
|---|---|---|---|
| `mode` | select `shadow\|enforce` | `shadow` | shadow annotates only; enforce drops rejects |
| `reject_url_patterns` | textarea (one regex/line) | generic web-cruft list above | `presets_enabled: true` |
| `hint_url_patterns` | textarea | `/news/?$`, `/blog/?$` | `presets_enabled: true` |
| `title_reject_patterns` | textarea | "Page \d+ of", "Browse all", "Archive" | applied only if title/snippet present |
| `max_depth` | number | `6` (0 = off) | path segments before penalty |
| `max_query_params` | number | `3` (0 = off) | params before penalty |
| `reject_threshold` | number | `0.3` | score below → reject |
| `hint_threshold` | number | `0.6` | score below → allow_hint |
| `needs_render_domains` | textarea | empty | domains flagged `needs_render: true` |

`output_schema`: table; `url`, `decision`, `score`, `reasons` (string), `needs_render`, `validator_version`, `entity_name`; `flagged_when: { decision: ["reject"] }`.

## Providers (researched 2026-07-03)

None. This module has zero external dependencies — no APIs, no credentials, no paid services. That is the point of it.

## Example template configurations

**Company profiles (iGaming, OnlyiGaming)** — template preset adds domain rules on top of the generic defaults:
- extra `reject_url_patterns`: `/casinos/page/`, `/bonuses/?$`, `/free-spins/`, `/affiliates/?$`, `/operators/?$` (directory/listing hubs on iGaming news sites)
- `hint_url_patterns` += `/games/?$` (vendor game-catalog roots — sometimes useful overviews)
- `needs_render_domains`: known JS-heavy iGaming press sites
- `mode: enforce` once shadow audit on 2–3 reference entities shows no false rejects

**Job search** — second content type proving agnosticism:
- extra `reject_url_patterns`: `/jobs/page/`, `/salaries/`, `/company-reviews/`, `/cv-tips/`
- `title_reject_patterns` += `"\d+ open positions"`, `"Jobs in "`
- `mode: shadow` (job boards' URL shapes vary too much to enforce blind)

## Credentials & testing

- **Env vars:** none. **This module is fully testable and deployable with zero credentials** — pure deterministic function of (items, options).
- **Unit tests (mocked `tools`):** table-driven cases per signal — each default reject pattern fires; hint patterns produce `allow_hint`; depth/query penalties compound; thresholds boundary-tested; shadow returns all items annotated; enforce drops exactly the rejects; missing title/snippet skips signal 4 without error; malformed regex line in options → logged warning, line skipped (never throw); `reasons` emitted as a joined string.
- **Cheapest live test:** any existing project pool after Step 1 — run in shadow mode, eyeball the flagged rejects in the UI. Costs nothing.
- **E2E note:** measure the value claim — count items entering url-relevance with vs without url-heuristics enforced on one reference entity; the delta is the LLM spend saved.

## Edge cases & failure modes

- **Over-aggressive rules → false rejects.** Primary mitigation is shadow-by-default + UI flagging; enforce is an explicit per-template promotion.
- **New/unknown domain shapes** → default allow (score only penalizes on positive signals; absence of signal never rejects).
- **List page that is actually a useful overview** → `allow_hint`, kept in pool either mode.
- **Item with no `url`** → skip with warning, pass through unchanged (never throw).
- **Invalid regex in template config** → skip that line, log which line, continue (config error must not kill the run).
- **URL casing/encoding** — match against the canonicalized URL (module runs after url-canonicalizer; do not re-implement canonicalization).
- **Enforce mode emptying a pool** — if every item is rejected for an entity, downstream `requires_items` modules will mark that entity `skipped_no_input` (existing skeleton semantics); the summary must say "all N items rejected" loudly so the operator sees why.

## Open questions

1. Should `allow_hint` items be excluded from url-relevance's LLM batch by default (trust the hint) or included with the hint as prompt metadata (url-relevance already supports `metadata_fields`)? Leaning: include with metadata — cheap and preserves recall.
2. Threshold/weight tuning: fixed penalty weights in code (simpler, v1) vs a `signal_weights` JSON option (more Rule-13-pure, more foot-gun surface). V1 ships fixed weights; revisit if a template genuinely needs different weights.
3. Where do operator accept/reject labels live for the future V2 learned mode? (Needs a skeleton-side decision — out of module scope.)
