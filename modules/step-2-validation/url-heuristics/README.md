# URL Heuristics

**Step 2 — Validation** · `remove` · `requires_items` · cost: `cheap` · v1.0.0

Zero-cost rule-based URL scoring. Rejects obvious non-content URLs (pagination, category/tag archives, auth pages, legal pages, feeds) BEFORE the pool reaches expensive scraping and LLM steps. Its whole purpose is to shrink the item set that url-relevance has to pay tokens for.

```
url-canonicalizer → url-dedup → url-filter → [url-heuristics] → url-relevance (LLM) → scrapers
```

## How it differs from its neighbors

| Module | Mechanism | Cost | Decision |
|---|---|---|---|
| url-filter | operator-authored regex, binary keep/drop | free | binary |
| **url-heuristics** | **weighted scoring engine, three-way decision + reasons + shadow mode** | **free** | **allow / allow_hint / reject** |
| url-relevance | LLM classification | tokens per item | KEEP / MAYBE / DROP |

## Decision logic

1. Any `reject_url_patterns` match → `reject` (score 0.1).
2. Otherwise score starts at **1.0** and penalties subtract:
   - title/snippet matches a `title_reject_patterns` line → **-0.5** (applied once, first matching pattern)
   - path depth > `max_depth` → **-0.25**
   - query params > `max_query_params` → **-0.25**
   - URL has a `#fragment` → **-0.25**
3. Final: score < `reject_threshold` (0.3) → `reject`; hint-pattern match OR score < `hint_threshold` (0.6) → `allow_hint`; else `allow`.

Every scored item gets `decision`, `score`, `reasons` (joined string), `needs_render`, `validator_version`. Original item fields are preserved.

## Shadow vs enforce (`mode` option)

- **shadow (default):** ALL items returned, annotated. Nothing is dropped. Rejects are flagged in the UI (`flagged_when: decision=reject`) so the operator can audit false rejects. Safe, runnable default.
- **enforce:** `reject` items are dropped. `allow_hint` items are ALWAYS kept in both modes. Promote a template to enforce only after a shadow audit looks trustworthy.

If enforce rejects every item for an entity, the summary says so loudly (`all N items rejected`) — downstream `requires_items` modules will then mark that entity `skipped_no_input`.

## Options

| Option | Default | Notes |
|---|---|---|
| `mode` | `shadow` | `shadow` \| `enforce` |
| `reject_url_patterns` | generic web-cruft list | one case-insensitive regex per line, matched against the full URL; `#` lines are comments; presets enabled |
| `hint_url_patterns` | `/news/?$`, `/blog/?$` | section roots — list-like but possibly useful overviews; presets enabled |
| `title_reject_patterns` | "Page \d+ of", "Browse all", "Archive", "Access denied", "404", "Search results" | applied only when the item has `title`/`snippet` |
| `max_depth` | 6 | 0 disables |
| `max_query_params` | 3 | 0 disables |
| `reject_threshold` | 0.3 | |
| `hint_threshold` | 0.6 | |
| `needs_render_domains` | empty | matching items get `needs_render: true` (Step-3 browser-scraper ordering hint); subdomains match |

**Rule 13:** all rule lists are template-configurable; the defaults are generic web cruft only. Anything domain-flavored (e.g. `/casinos/page/`, `/jobs/page/`) belongs in template presets, never in this module's defaults.

## Edge cases

- **Item with no `url`** → warned, passed through unchanged (both modes), never annotated, never dropped.
- **Invalid regex line in config** → warned with the offending line, skipped; the run continues.
- **Unparseable URL** → regex/title signals still apply; structural signals skipped; reason `unparseable_url` recorded.
- **Absence of signals never rejects** — unknown domains default to `allow` (score only moves on positive signals).
- Runs after url-canonicalizer; does not re-canonicalize.

## Testing

`node modules/step-2-validation/url-heuristics/test-url-heuristics.js` — 47 assertions, no network, no credentials. This module is fully testable and deployable with zero external dependencies; that is the point of it.

## Changelog

- **1.0.0** (2026-07-03) — initial version per the revised brief (`docs/submodule-briefs-rev-2026-07-03/step2-learned-validator.md`). V1 is rules-only; a future learned mode (V2) would add `mode: "learned"` without changing this contract. Pre-commit code review tightened the default reject patterns with `([/?]|$)` anchors so article slugs that merely start with a cruft token (`/privacy-regulations-…`, `/sitemap-best-practices-…`) are not falsely rejected.
