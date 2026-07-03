# Submodule Brief: Media Generator — image mode (revised)

**Step:** 5 — Generation
**Revised:** 2026-07-03 — pipeline-agnostic redesign (Rule 13). Original archived in `_originals-2026-07-03/`.
**Original goal (unchanged):** Generate visuals (hero images, illustrations, social cards) from entity content using AI image generation.
**Build status:** not built
**Design verdict:** **new generic module `media-generator`** (ONE module shared with the audio-tts and video briefs); this file describes its image configuration surface

## Goal

Given entities whose pool items carry generated/analyzed content, produce image assets from template-configured prompts and emit them as **media asset references** in the pool — provider-hosted URL (with expiry metadata) or base64 payload + metadata (dimensions, mime, prompt used, cost). No storage-bucket writes and no deliverable packaging here (Step 8's concern; the existing Step 8 `company-media` module already handles *discovered* media URL manifests — generated assets flow into that same bundling stage).

## Design (agnostic)

**One-vs-three decision (stated identically in the audio-tts, image, and video briefs):** ONE generic `media-generator` module covering TTS, image, and video via per-slot JSON provider configs — not three sibling modules. Rationale: (1) the small-generic-modules commitment and the api-search precedent (one module, execution modes + provider configs; new provider = JSON config, not code); (2) the real variation axis is the provider *request pattern* — sync-JSON-base64 vs async-poll-URL vs raw-binary — and that axis cuts ACROSS media types (a poll-pattern image provider like BFL shares more machinery with every video provider than with a base64 image provider), so three media-type modules would each reimplement the same three request patterns; (3) the wildly different costs/latencies (image cents/seconds vs video dollars/minutes) are handled by per-provider `est_cost_per_item` + per-run budget caps + the `expensive` timeout tier, not by module boundaries; (4) input-shape differences (long script vs short prompt vs prompt+image-ref) are template config — `generation_slots` map pool-item fields into provider params, which is exactly "which fields feed generation = template config, not code." Each of the three briefs keeps its filename but describes the same single module; the content below is the image-specific configuration surface.

**What lives in code vs config:** engine (auth from env vars, sync/poll patterns, `json_base64`/`url` extraction with `url_expiry_seconds` metadata, budget/dry-run guards) = code, agnostic. Slots, prompt templates with `{field}` placeholders into pool items (e.g. `{analysis_json.positioning}`), provider choice, dimensions, brand-style prompt fragments = template config. Rule 13 test passes: an `image_type` like "hero" or "social_card" is nothing but a slot name in template JSON — the module never knows those words. Manifest default `generation_slots: []` → no-op by default ($0).

**Verified skeleton constraint (2026-07-03):** `tools` = `{logger, http, browser, unlocker, progress, ai}` — no storage facility; `tools.http` text-decodes bodies (binary-unsafe). Base64-in-JSON providers work today; raw-binary responses are blocked (Stability's binary mode — use its base64 mode instead); **URL-returning providers with short expiry (BFL: 10 min; Ideogram: ~1 h) are effectively unusable until asset persistence exists**, because nothing downstream can download in time. Persistence-friendly picks: Leonardo (CDN URLs that never expire) and base64 providers.

**Generate vs license — cheaper alternative path:** stock-photo keys already exist (`PEXELS_API_KEY`, `UNSPLASH_ACCESS_KEY`, `PIXABAY_API_KEY`). Stock search is a keyword-search JSON API returning **permanent hosted URLs** — that is exactly `api-search`'s provider-config shape and needs **no new module at all**. Templates wanting real photos configure api-search providers today; `media-generator` is only for *generated* imagery. State this in the template docs so nobody builds generation where licensing suffices.

## Module contract

Identical to the shared module (see audio-tts brief for full wording): `item_key: "entity_name"` · `add` · `requires_items` · `cost: "expensive"` · `requires_columns: ["entity_name", "content_markdown", "analysis_json"]` · one item per entity with `media_manifest_json` + flat display fields (`assets_generated`, `media_types`, `est_cost_usd`, `has_errors` as `"true"/"false"` string) · `_partialItems` re-pushed after each completed slot (Rule 10 — each slot is paid money).

## Options (manifest sketch)

Shared with the other modes — `providers`, `generation_slots`, `max_slots_per_entity` (default 3), `max_total_assets_per_run` (default 25), `per_run_budget_usd` (default 5), `dry_run`. Image-relevant provider-config fields: `params_map` carries size/quality/aspect params; `response_kind: "json_base64" | "url"`; `url_expiry_seconds` (null = permanent) so the manifest records `asset_url_expires_at` honestly.

## Providers (researched 2026-07-03)

| Provider | Env var | Free tier | Per-image price | Response / persistence | Notes |
|---|---|---|---|---|---|
| **Leonardo.ai** (Lucid Origin / Phoenix) | `LEONARDO_API_KEY` — **key EXISTS; live-testable today** | $5 non-expiring API credit | API-credit-based; flat USD **unverified** (calculator-priced; "from $0.002" is marketing) | poll → **CDN URL, never expires** (official FAQ) | Best persistence fit of all providers — no download window. [Docs](https://docs.leonardo.ai/docs/getting-started) · [FAQ](https://docs.leonardo.ai/docs/api-faq) |
| **OpenAI gpt-image-2** (also 1.5, mini) | `OPENAI_API_KEY` — **key EXISTS; live-testable today** | None | ≈$0.006 low / $0.053 med / $0.211 high @1024² (token-billed — calculator estimates, not list prices) | **json_base64** (`b64_json`; no URL option) | Works through today's `tools.http`; base64 ⇒ pool-bloat consideration. gpt-image-1 deprecating ~Oct 2026 (reported). [Pricing](https://developers.openai.com/api/docs/pricing) |
| **Gemini image** (Gemini 3 Pro Image "Nano Banana Pro", 3.1 Flash Image) | `GOOGLE_AI_API_KEY` — **key EXISTS; live-testable today** | Flash models have free tier in AI Studio | 2.5 Flash $0.039; 3.1 Flash $0.045–0.151; 3 Pro $0.134–0.24 (by res); Batch −50% | **json_base64** (`inlineData`) | **Imagen 4 is deprecated — shutdown 2026-08-17 — do not build on it**; use Gemini-native image models. [Pricing](https://ai.google.dev/gemini-api/docs/pricing) |
| Stability AI (Stable Image Ultra/Core, SD3.5) | `STABILITY_API_KEY` — NEW | 25 credits on signup (reported) | Core $0.03; SD3.5 Medium $0.035 / Large $0.065; Ultra $0.08 | **json_base64** via `Accept: application/json` (binary mode exists — avoid) | Solid mid-price option. [Pricing](https://platform.stability.ai/pricing) |
| Black Forest Labs FLUX.2 / FLUX1.1 pro | `BFL_API_KEY` — NEW | None documented | FLUX.2 pro from $0.03; FLUX1.1 pro $0.04; Kontext pro $0.04 / max $0.08 | poll → signed URL, **expires in 10 minutes** (official) | **Blocked for this pipeline until asset persistence exists** — 10-min window is not survivable across steps. [Docs](https://docs.bfl.ai/quick_start/generating_images) |
| Ideogram 4.0 | `IDEOGRAM_API_KEY` — NEW | None (API) | $0.03 Turbo / $0.06 Default / $0.10 Quality | URL, **expires** ("limited time"; ~1 h reported) | Same persistence problem as BFL, softer window. Strong text-in-image rendering. [Pricing](https://ideogram.ai/api-pricing/) |
| *(alternative path)* Pexels / Unsplash / Pixabay stock search | `PEXELS_API_KEY` / `UNSPLASH_ACCESS_KEY` / `PIXABAY_API_KEY` — **keys EXIST** | Free (rate-limited) | Free | search JSON → permanent URLs | Not this module — configure as **api-search providers**. Real photos + license terms per site. |

## Example template configurations

**Company profiles (OnlyiGaming):** slots `hero` (provider `gemini-image`, `prompt_template: "Professional editorial illustration for a {analysis_json.categories.primary.0.name} company; abstract, no text, no logos; brand-neutral palette"`), `social_card` (provider `leonardo`, 1200×630, entity name NOT rendered in-image — text overlay is a Step 8 job). `max_slots_per_entity: 2`, budget $3/run. iGaming visual vocabulary lives entirely in the template prompt strings.
**News pipeline:** one `article_hero` slot per story, cheap tier (2.5 Flash $0.039), `dry_run` first to review prompts built from headlines before spending.

## Credentials & testing

- **Existing keys approved for reuse:** `LEONARDO_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_AI_API_KEY` — three first-class providers live-testable now (plus the stock-photo keys on the api-search path). New keys (Stability/BFL/Ideogram) only if quality gaps appear — user decision.
- **Unit tests (credential-free):** mocked `tools.http` fixtures for json_base64 (OpenAI/Gemini shapes) and poll→URL (Leonardo shape); assert prompt-template field interpolation, `asset_url_expires_at` computation from `url_expiry_seconds`, budget-cap refusal, dry_run zero-call behavior, per-slot content-policy error → flagged item.
- **Cheapest live test:** one slot on Gemini 2.5 Flash Image = **$0.039**, or Leonardo against the existing $5 API credit ($0 cash). E2E: 2-entity run on a dev template; confirm manifest renders and a second run upserts (replaces this module's prior items, preserves others).

## Edge cases & failure modes

- **Content-policy refusals** (brand names, people) → per-slot error in manifest, entity flagged, run continues; template prompts should avoid trademarked/person terms by construction.
- **Base64 pool bloat:** high-quality 1024² PNG ≈ 1–3 MB base64 per slot in jsonb — prefer URL-returning Leonardo for multi-image templates until persistence exists; cap slots.
- **Ephemeral-URL providers configured by mistake** → module must WARN loudly when `url_expiry_seconds` < a floor (e.g. 86400) and no persistence hand-off exists — never silently emit URLs that will be dead by Step 10 review.
- **Quality is unjudgeable in-module** → no automated aesthetic QA in v1; Step 10 human gate. (A future Step 6 vision-LLM checker is possible — separate brief.)
- **Brand consistency across images** (original brief's open question) → template-level: shared palette/style fragment in every slot's prompt_template. Not code.

## Open questions

1. **Asset persistence — skeleton capability audit needed** (same as audio brief): no `tools.storage`; decide storage tool vs Step 8 downloader vs distribution-step ownership. Until resolved, restrict templates to base64 providers or Leonardo (non-expiring URLs).
2. **Run-after-QA ordering** (original brief): generating only for Step-6-approved content saves money. Step 5 ordering within the step chain can put media-generator after QA-gated loops via routing — needs a template-level decision, not module code.
3. **Template-driven `requires_columns`** — same audit as audio brief.
4. **Leonardo per-image USD** — derive from the pricing calculator with the chosen model/res before setting `est_cost_per_item`; the flat number is currently unverifiable.
