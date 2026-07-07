# Image & Logo Search — provider CONFIGS (api-search + search-discovery)

**Step 1 — Discovery** · **provider configs, NOT a module** · v1.0.0

Image/logo discovery per the brief (`docs/submodule-briefs-rev-2026-07-03/step1-image-logo-search.md`) — **config only**, split across the two built discovery modules. No new module (a dedicated `asset-search` module was rejected: it would re-implement provider config/auth/rate-limiting/`_partialItems` for ~40 lines of unique logic).

## What's here

| Preset | Module | Purpose | Status |
|---|---|---|---|
| `providers-stock.json` | `api-search` | Illustrative/stock imagery (Pixabay, Unsplash, **Pexels**) | **built** + **live-verified 2026-07-07** |
| `providers-image-serp.json` | `search-discovery` | Entity-specific image search (logos-in-context, product shots, screenshots) via the `images` SERP vertical (Serper) | **built** + **live-verified 2026-07-07** |

Both presets carry `image_url` on every item for step-8 `company-media` shape-routing. Query flavor (`"{entity}" logo`) and keywords are template config, never in the provider config.

### Stock imagery (`providers-stock.json` → api-search)

- **Pixabay** — `query_param` auth (`key`), env `PIXABAY_API_KEY`.
- **Unsplash** — `query_param` auth (`client_id`), env `UNSPLASH_ACCESS_KEY`.
- **Pexels** — **custom-header auth** (`Authorization: {env:PEXELS_API_KEY}`), **unblocked by api-search v1.1.0** (W2-A). Skipped with a warning if the key is unset.

All three are plain keyword→JSON search APIs — api-search's exact contract, zero module code. Stock imagery is *illustrative*, not entity-specific brand assets.

### Entity image search (`providers-image-serp.json` → search-discovery)

- **Serper `/images`** — `kind: serp`, `result_type: images`, `X-API-KEY` header auth, env `SEARCH_PROVIDER_SERPER_KEY`. `verify_liveness: true` (SERP image URLs rot fast; step-8 company-media re-verifies at bundle time regardless). Brave images is an analogous serp provider (add its block + key the same way).

## ⛔ Logo LOOKUP (Brandfetch / Logo.dev) — NOT here (forces search-discovery code)

The brief's brand-logo **lookup** providers (`kind: lookup`, deterministic `url_template` + HEAD verify — the Clearbit successors, since Clearbit Logo API sunset 2025-12) are **excluded**, because they need capabilities search-discovery does **not** have today (STOP-AND-REPORTED during this config unit — I did not write the code):

1. **`{env:VAR}` interpolation inside `url_template`.** Brandfetch needs the client ID in the URL: `https://cdn.brandfetch.io/{website_domain}?c={env:ASSET_PROVIDER_BRANDFETCH_CLIENT_ID}`. search-discovery's `renderTemplate` interpolates only `{entity_name|alt_names|website_domain|site}` — a `{env:…}` token is left verbatim, so the credential never lands in the URL. **Code.**
2. **A custom `emit` / `image_url` + `image_type` output for lookups.** The brief's `"emit": {"image_url": "$url", "image_type": "logo", …}` isn't a search-discovery feature; its lookup emits a fixed shape with no `image_url`/`image_type`. **Code.**

Both are small, generic, Rule-13-clean search-discovery enhancements (mirroring the api-search header-auth pattern) — but they are **code**, so they belong in their own reviewed unit, not a config. The brief's ready-to-ship Brandfetch/Logo.dev configs apply the moment that ships. Their keys (`ASSET_PROVIDER_BRANDFETCH_CLIENT_ID` / `ASSET_PROVIDER_LOGODEV_KEY`) are new free signups, not yet provisioned.

## Live-verify — DONE (2026-07-07)

All four providers **live-verified with real keys** (Track 2 batched sweep — keys now exported into the environment). Each preset was routed through its **real module** against the live API; the harness lived in `/tmp` and **module code was untouched** (git-verified). Cheap raw pre-flight per provider first (clean 401 detection), then the module-routing run:

- **Stock (`providers-stock.json` → api-search):** Pixabay + Unsplash (query-param) + Pexels (raw-key header, W2-A) — pre-flight **HTTP 200** each; **15/15 items carried `image_url`** (5 per provider). The **Pexels request went out with the raw-key `Authorization` header (no `Bearer`)** — confirms the api-search v1.1.0 custom-header path end-to-end.
- **Image-SERP (`providers-image-serp.json` → search-discovery):** Serper `/images` POST with `X-API-KEY` — pre-flight **HTTP 200**; 4 items for `"Evolution Gaming" logo`, **every item `result_type: images` with `image_url` mapped** (real logo image URLs).

No key (401) or code failures. The mocked structural test (`test-image-search-config.js`, 28 assertions) still runs offline for CI; this section records the one-time real-API confirmation. Re-running requires only the four keys in the environment.

## Testing

- `node modules/step-1-discovery/config-image-search/test-image-search-config.js` — 28 assertions, `tools.http` mocked. Proves both presets are config-only (every `field_map` value is a supported form; no `{template}`/`{env:}`-url_template lookup-blocker) and that each **routes through its real module** — stock through api-search (Pixabay/Unsplash key-in-URL, **Pexels raw-key header via W2-A**, Pexels-skipped-when-unset), image-SERP through search-discovery (Serper `/images` → `image_url`, `X-API-KEY`).

## Inert by default

A config folder with **no `manifest.json` / `execute.js`** — the module loader skips it. `api-search` and `search-discovery` are **git-verified untouched**. Nothing runs until a template points an api-search / search-discovery step at these presets. Zero production effect on merge.
