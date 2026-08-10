# Decision-Maker Selector (Step 4 — Filtering)

Keeps only decision-makers from people records fetched upstream (typically the
Bright Data **LinkedIn People (Datasets Search API)** provider run through
Step-3 `api-fetcher`). Emits fewer items than it receives (`data_operation: select`).

## Why this exists

Bright Data's `filter`/`search` `includes` operator is an **unanchored,
case-insensitive substring match with no word boundaries**. So a server-side
title token like `CTO` matches `dire`**`cto`**`r` and `fa`**`cto`**`ry`, and an
acronym query floods the result with non-executives. Server-side filtering can
cut *volume* but cannot *select roles cleanly*. This module does the clean
selection client-side, with word-boundary regexes.

## What it does

- Matches each item's `title` against a **configurable** role list.
- Uses `\bphrase\b` (word boundary, case-insensitive): `CTO` matches `"CTO"` and
  `"Our CTO"` but **never** `"director"`.
- Matches **acronym and spelled-out** forms: `CEO`/`Chief Executive`,
  `CTO`/`Chief Technology`, `CMO`/`Chief Marketing`, `CPO`/`Chief Product`, plus
  `Founder`/`Co-Founder`, `Head of X`, `VP X`, `Director of X`.
- **Drops** records whose title is `null`, empty, an emoji, or a slogan (they
  match no pattern, so they are never selected).
- Annotates each kept item with `matched_role` and `matched_pattern` so a
  misfire is diagnosable.

## Options

| Option | Default | Notes |
|--------|---------|-------|
| `roles` | built-in list | Textarea `Role \| phrase1, phrase2` per line, **or** a structured array. Fully configurable — no vertical is hardcoded. |
| `title_field` | `title` | Which pool-item field holds the job title (`api-fetcher` maps LinkedIn `position` → `title`). |

## Proof (measured)

Run against the live 76-record Vegangster roster (Bright Data Search,
`gd_l1viktl72bvl7bjuj0`, 2026-08-10):

- **7 of 76** kept — CEO/Co-Founder + 6 `Head of X`.
- **precision 1.000, recall 1.000** (0 false positives, 0 misses).
- Catches the three the earlier narrow-token probe **missed**: Head of Content,
  Head of Frontend, Head of Technical Support.
- Rejects the `"Director at Vegangsters"` (`dire`**`cto`**`r`) substring trap.

```
node modules/step-4-filtering/decision-maker-selector/test-decision-maker-selector.js
# => 41 passed, 0 failed
```

## Programmatic use

```js
const { selectDecisionMakers, DEFAULT_ROLES } = require('./execute.js');
const dms = selectDecisionMakers(records, { roles: DEFAULT_ROLES, titleField: 'position' });
// each dm: { ...record, matched_role, matched_pattern }
```
