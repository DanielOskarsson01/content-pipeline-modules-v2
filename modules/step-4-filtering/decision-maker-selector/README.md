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

Two further, **independently diagnosable** drops refine precision on large
companies (rejections are captured with a `rejected_by` reason):

- **Company anchor.** When a matched title *names an organisation* — `Founder of
  SR Collection`, `Head of QA **at** RokkerX`, `VP, …, **The LEGO Group**` — that
  org must be the target company or a known alias, else the record is rejected.
  Aliases are **derived from the roster's own** `current_company_name` /
  `current_company_company_id` values (never hardcoded), so `ARRISE powering
  Pragmatic Play` survives alongside `Pragmatic Play`, and `@Vegangster` /
  `at Vegangster` survive for Vegangster. It **never down-weights Founder**: a
  bare `Founder`, or `Founder of <target>`, always survives. (`rejected_by:
  company_anchor`)
- **Creative-title filter.** A creative role that matches `Director of X` but is
  not an executive — `Director of Photography`, `Cinematographer` — is rejected.
  (`rejected_by: creative_title`)

## Options

| Option | Default | Notes |
|--------|---------|-------|
| `roles` | built-in list | Textarea `Role \| phrase1, phrase2` per line, **or** a structured array. Fully configurable — no vertical is hardcoded. |
| `title_field` | `title` | Which pool-item field holds the job title (`api-fetcher` maps LinkedIn `position` → `title`). |

## Proof (measured, live Bright Data Search `gd_l1viktl72bvl7bjuj0`, 2026-08-10)

| Company | Records | Selected | Precision | Recall | Notes |
|---------|--------:|---------:|-----------|--------|-------|
| **Vegangster** (startup) | 76 | 7 | **1.00** | **1.00** | 4 of 7 name `@Vegangster`/`at Vegangster` in-title — anchor keeps them via the derived alias. |
| **Pragmatic Play** (large) | 39 | 29→**22** | **0.76 → 1.00** | **1.00** | Anchor dropped 6 wrong-company titles (SR Collection, pingwit.pl, BitElectric, Vanciu Artworks, LEGO Group, RokkerX); creative filter dropped 1 (Director of Photography). `ARRISE powering Pragmatic Play` alias employees all survive. |
| **Relax Gaming** (mid, unseen) | 17 | 10→**9** | **~0.9–1.0** | **1.00** | Anchor generalised to an unseen company: dropped `Head of Mathematics **at Quickspin**` (a different studio). |

- Vegangster still catches the three the earlier narrow-token probe **missed**
  (Head of Content / Frontend / Technical Support) and rejects the
  `"Director at Vegangsters"` (`dire`**`cto`**`r`) substring trap.
- Cost is `records × $2.50 CPM` (the snapshot `cost` field is wrong — do not use).

```
node modules/step-4-filtering/decision-maker-selector/test-decision-maker-selector.js
# => 66 passed, 0 failed
```

## Programmatic use

```js
const { selectDecisionMakers, DEFAULT_ROLES } = require('./execute.js');
const dms = selectDecisionMakers(records, { roles: DEFAULT_ROLES, titleField: 'position' });
// each dm: { ...record, matched_role, matched_pattern }
```
