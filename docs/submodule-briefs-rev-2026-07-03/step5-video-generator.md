# Submodule Brief: Media Generator — video mode (revised)

**Step:** 5 — Generation
**Revised:** 2026-07-03 — pipeline-agnostic redesign (Rule 13). Original archived in `_originals-2026-07-03/`.
**Original goal (unchanged):** Generate short explainer/highlight videos from generated entity content using AI video generation.
**Build status:** not built
**Design verdict:** **new generic module `media-generator`** (ONE module shared with the audio-tts and image briefs); this file describes its video configuration surface

## Goal

Given entities with generated content, produce short video clips from template-configured prompts (optionally scripted first by the existing LLM chain) and emit them as **media asset references** in the pool — provider job → hosted URL + expiry metadata, duration, prompt/script used, cost. Video is the most expensive and slowest mode; the design leans hard on cost guards and honest persistence handling. No storage writes, no player/embed work here (Step 8/9 concerns).

## Design (agnostic)

**One-vs-three decision (stated identically in the audio-tts, image, and video briefs):** ONE generic `media-generator` module covering TTS, image, and video via per-slot JSON provider configs — not three sibling modules. Rationale: (1) the small-generic-modules commitment and the api-search precedent (one module, execution modes + provider configs; new provider = JSON config, not code); (2) the real variation axis is the provider *request pattern* — sync-JSON-base64 vs async-poll-URL vs raw-binary — and that axis cuts ACROSS media types (a poll-pattern image provider like BFL shares more machinery with every video provider than with a base64 image provider), so three media-type modules would each reimplement the same three request patterns; (3) the wildly different costs/latencies (image cents/seconds vs video dollars/minutes) are handled by per-provider `est_cost_per_item` + per-run budget caps + the `expensive` timeout tier, not by module boundaries; (4) input-shape differences (long script vs short prompt vs prompt+image-ref) are template config — `generation_slots` map pool-item fields into provider params, which is exactly "which fields feed generation = template config, not code." Each of the three briefs keeps its filename but describes the same single module; the content below is the video-specific configuration surface.

**Video-specific notes on the shared design:** every viable video provider is `request_pattern: "poll"` (create job → poll → hosted URL) — the same poll engine BFL images use; nothing video-only in code. **Script generation is NOT this module's job**: the original brief's "LLM condenses profile into a 60–90s narration" is a Step 5 chain concern — a content-writer/tone-seo-editor pass (template-configured prompt) writes `video_script` into the pool; a media-generator slot then reads it via `input_field`. Small generic modules composed, not a script+video hybrid. Base64 is a non-option for video (10–50 MB clips) — video items are **URL-only**, which makes asset persistence (open question) a **hard prerequisite for production** video use, since all verified providers expire or delete their URLs (Veo: files deleted after 2 days; Runway: 24–48 h; Sora: 1 h — and Sora is being shut down anyway).

**Rule 13 test:** clip style, aspect, duration, script voice, "explainer vs highlight-reel" framing — all slot/params/prompt config in templates. Code knows only: submit job, poll, extract URL, record expiry, count dollars. Manifest default `generation_slots: []` → no-op ($0).

**Verified skeleton constraint (2026-07-03):** `tools` = `{logger, http, browser, unlocker, progress, ai}` — no storage; `tools.http` text-decodes bodies. Poll flows are plain JSON (fine); the resulting MP4 can NOT be downloaded through current tools (binary) — another reason persistence must be solved skeleton-side.

## Module contract

Identical to the shared module (full wording in the audio-tts brief): `item_key: "entity_name"` · `add` · `requires_items` · `cost: "expensive"` — note the 30-min ceiling: Veo's official latency is 11 s–6 min per clip, so per-entity slots must be few and `poll.max_wait_ms` conservative · `requires_columns: ["entity_name", "content_markdown", "analysis_json"]` · one item per entity with `media_manifest_json` + display fields (`assets_generated`, `media_types`, `est_cost_usd`, `has_errors` `"true"/"false"`) · `_partialItems` re-pushed after **every** completed slot — a lost video is real dollars (Rule 10).

## Options (manifest sketch)

Shared options (`providers`, `generation_slots`, `max_slots_per_entity`, `max_total_assets_per_run`, `per_run_budget_usd`, `dry_run`) with video-appropriate defaults on the guards: **`max_slots_per_entity: 1`, `max_total_assets_per_run: 5`, `per_run_budget_usd: 5`** (one 8 s Veo 3.1 clip with audio = $3.20 — the budget cap is the primary control, and `dry_run` should be the documented first step for any new video template). Provider config adds `poll: { url_path, status_path, done_value, result_path, interval_ms, max_wait_ms }` and `params_map` carries duration/resolution/audio flags.

## Providers (researched 2026-07-03)

| Provider | Env var | Access | Pricing (per second) | Latency / max clip | URL persistence | Notes |
|---|---|---|---|---|---|---|
| **Google Veo 3.1** (+ Fast, Lite) via Gemini API | `GOOGLE_AI_API_KEY` — **key EXISTS; live-testable today** | GA (plain API key) | w/audio $0.40 (720p/1080p), $0.60 (4K); Fast $0.10–0.30; Lite $0.05–0.08; charged only on success | 11 s–6 min (official); 4/6/8 s clips, extendable ~148 s | file URI **deleted after 2 days** | Flagship. Veo 3.0 already shut down (2026-06-30) — config model ids, expect churn. [Docs](https://ai.google.dev/gemini-api/docs/veo) · [Pricing](https://ai.google.dev/gemini-api/docs/pricing) |
| Runway (Gen-4.5, Gen-4 Turbo; hosts Seedance 2.0, Veo 3.1) | `RUNWAY_API_KEY` — NEW | GA (dev.runwayml.com; credit wallet separate from web app) | Turbo $0.05/s; Gen-4.5 $0.12/s ($0.01/credit) | <1–2 min typical (third-party; unverified); 5 or 10 s | output URLs **expire 24–48 h** | Clean REST + versioned header. [Pricing](https://docs.dev.runwayml.com/guides/pricing/) |
| OpenAI Sora (sora-2 / sora-2-pro) | `OPENAI_API_KEY` — key EXISTS, **but do NOT build on it** | API GA yet **deprecated — shuts down 2026-09-24**, no announced successor | $0.10/s (sora-2 720p); pro $0.30–0.70/s | async, minutes (unverified); 20 s (ext. to 120 s) | download URL valid **1 h** | Sunset notice is first-party. Skip. [Docs](https://developers.openai.com/api/docs/guides/video-generation) |
| Kling 3.0 / O3 (Kuaishou) | AK/SK pair — NEW | Official intl API exists but onboarding clunky (prepaid packages; consumer credits ≠ API) | ≈$0.08–0.17/s (package-derived, **unverified**) | minutes; 5/10 s native | unverified | Auth = self-minted 30-min JWT (HS256) — needs a `kling_jwt` handler kind or an aggregator. [Auth docs](https://kling.ai/document-api/api/get-started/authentication) |
| Luma Dream Machine (ray-2 / ray-flash-2) | `LUMA_API_KEY` — NEW | GA self-serve | ~$0.08/s ray-2 (**unverified** — official rate card JS-only); Replicate ray-flash-2 $0.06/s | minutes (unverified); 5/9 s, extendable | unverified | [API docs](https://docs.lumalabs.ai/docs/video-generation) |
| *(aggregators)* fal.ai / Replicate | `FAL_KEY` / `REPLICATE_API_TOKEN` — NEW | GA | mostly passthrough +0–30% (e.g. Veo 3.1 $0.40/s, Sora-2 pro $0.30–0.50/s on fal) | provider-bound | queue → hosted URL | One key, one queue API, no Kling JWT dance — attractive single-provider-config route to many models. [fal pricing](https://fal.ai/pricing) |

## Example template configurations

**Company profiles (OnlyiGaming), flagship-profile-only:** upstream chain slot writes `video_script` (tone-seo-editor pass: "condense to a 60-second narration, no citations"); media-generator slot `explainer` — provider `veo-3.1-fast`, `input_field: video_script`, params `{ duration: 8, resolution: "720p", audio: true }`, `per_run_budget_usd: 5`, run only on templates for top-N flagship entities. Cost ≈ $0.80–2.40 per clip (Fast tier).
**News pipeline (social teasers):** slot `teaser` — prompt_template from headline + lede, Veo Lite ($0.05–0.08/s), 6 s, `dry_run` review before each batch; Step 8/9 attach the clip URL to the social-distribution manifest within the 2-day window (until persistence exists this is the ONLY workable video flow — publish-fast or lose the asset).

## Credentials & testing

- **Existing key approved for reuse:** `GOOGLE_AI_API_KEY` — Veo 3.1 is live-testable today with a plain Gemini API key. `OPENAI_API_KEY` exists but Sora is sunsetting — do not invest. All others = new provisioning (user decision; fal.ai is the lowest-friction second key).
- **Unit tests (credential-free):** mocked poll sequence (pending → done → URL) incl. slow-poll timeout path, budget-cap refusal BEFORE job submission (never submit a job the budget can't cover), dry_run zero-call, expiry metadata (`asset_url_expires_at` = now + 2 days for Veo config), failed-job error → flagged item.
- **Cheapest live test:** one 4–6 s Veo **Lite** clip ≈ **$0.20–0.48**; verify end-to-end poll + URL emission + UI render. E2E on a dev template with `max_total_assets_per_run: 1`.

## Edge cases & failure modes

- **30-min module timeout vs 6-min-per-clip latency** → at most ~3–4 sequential clips fit worst-case; enforce small `max_slots_per_entity`/`max_total_assets_per_run`; `_partialItems` after every slot; consider per-entity parallelism only after observing real latencies.
- **Paid job submitted, module times out before poll completes** → money spent, asset unrecorded. Mitigate: record `job_id` into the manifest (via `_partialItems`) at submission time so a re-run or manual recovery can poll the job instead of re-buying.
- **URL expiry before human review** (Step 10 may happen days later) → without persistence, reviewers see dead links. The module must stamp `asset_url_expires_at` and the UI/reviewers must treat it as a deadline; production video is gated on Open question 1.
- **Content-policy refusals** (real people, brands, gambling imagery may trip provider filters — relevant to iGaming templates) → per-slot error, entity flagged; template prompts steer abstract/product-focused.
- **Model churn** (Veo 3.0 gone, Sora sunsetting, Runway Gen-3 retiring 2026-07-30) → model ids live in provider config; review quarterly.

## Open questions

1. **Asset persistence is a HARD prerequisite for production video** (unlike audio/image where base64/Leonardo offer workarounds): every provider URL here expires in 1 h–2 days. Skeleton capability audit needed — storage tool vs Step 8 downloader (needs binary-safe HTTP) vs distribution-step download. Decide before enabling video slots on any production template.
2. **Is video worth building now at all?** (Original brief's own question — still fair.) Per-clip quality for B2B profiles is unproven and the persistence prerequisite is unmet. Recommendation: implement the shared `media-generator` engine for TTS+image first; video becomes "just another provider config" once persistence lands — zero extra module work. That sequencing is the concrete payoff of the one-module decision.
3. **Webhook vs poll:** BFL/Runway/Luma/fal support webhooks; the skeleton has no inbound-webhook surface for modules. Poll-only for v1; webhook support is a skeleton feature request if video volume grows.
4. **Thumbnail generation** (original brief) → not in-module (binary frame extraction). A cheap image-mode slot ("poster frame in the style of…") or Step 8 tooling can cover it.
