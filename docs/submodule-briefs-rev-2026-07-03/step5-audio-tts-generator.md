# Submodule Brief: Media Generator — TTS/audio mode (revised)

**Step:** 5 — Generation
**Revised:** 2026-07-03 — pipeline-agnostic redesign (Rule 13). Original archived in `_originals-2026-07-03/`.
**Original goal (unchanged):** Convert generated text content into narrated audio via text-to-speech, for embedding or podcast-style distribution.
**Build status:** not built
**Design verdict:** **new generic module `media-generator`** (ONE module shared with the image and video briefs); this file describes its TTS configuration surface

## Goal

Given entities whose pool items already carry generated text (`content_markdown` or any template-chosen field), produce narrated audio assets and emit them as **media asset references** in the pool — provider-hosted URL or base64 payload + metadata (duration, voice, mime, cost). No file packaging, no storage-bucket writes in this module (Step 8's concern; cf. existing `company-media` bundler which already emits media URL manifests at Step 8).

## Design (agnostic)

**One-vs-three decision (stated identically in the audio-tts, image, and video briefs):** ONE generic `media-generator` module covering TTS, image, and video via per-slot JSON provider configs — not three sibling modules. Rationale: (1) the small-generic-modules commitment and the api-search precedent (one module, execution modes + provider configs; new provider = JSON config, not code); (2) the real variation axis is the provider *request pattern* — sync-JSON-base64 vs async-poll-URL vs raw-binary — and that axis cuts ACROSS media types (a poll-pattern image provider like BFL shares more machinery with every video provider than with a base64 image provider), so three media-type modules would each reimplement the same three request patterns; (3) the wildly different costs/latencies (image cents/seconds vs video dollars/minutes) are handled by per-provider `est_cost_per_item` + per-run budget caps + the `expensive` timeout tier, not by module boundaries; (4) input-shape differences (long script vs short prompt vs prompt+image-ref) are template config — `generation_slots` map pool-item fields into provider params, which is exactly "which fields feed generation = template config, not code." Each of the three briefs keeps its filename but describes the same single module; the content below is the TTS-specific configuration surface.

**What lives in code (100% agnostic):** the provider engine — auth from named env vars, `sync`/`poll` request patterns, `json_base64`/`url` response extraction, input chunking by `max_input_chars`, generic input transforms (strip markdown, strip regex patterns — e.g. `[#n]` citations, configured per template, not hardcoded), budget/dry-run guards, manifest assembly. **What lives in template config:** which slots to generate, which pool fields feed them, prompts/voices/params, provider choice, budgets. Rule 13 test: every one of those is a `preset_map`-editable JSON/textarea option → none of it goes in code. Manifest default `generation_slots: []` → the module no-ops by default ($0, no surprise spend).

**Verified skeleton constraint (2026-07-03):** `tools` exposes `{logger, http, browser, unlocker, progress, ai}` — **no storage facility**, and `tools.http` text-decodes response bodies (binary-unsafe). Consequences: (a) providers returning **base64-in-JSON work today**; (b) providers returning **raw binary bytes are BLOCKED** until the skeleton adds a binary-safe HTTP option (e.g. `tools.http.post(..., { binary: true })` → base64 string — small generic change); (c) durable asset storage is an open question — the module emits references, it does not persist files.

**Step-boundary note:** Step 5 produces format-agnostic content items including media asset references. Packaging audio into deliverables (podcast RSS, embeds, uploaded files) is Step 8. The original brief's "upload to Supabase Storage" step is dropped from this module for the same reason cv-generator was archived — no invented storage API, no Step 8 work at Step 5.

## Module contract

`item_key: "entity_name"` · `data_operation_default: "add"` (Step 5 keyed by entity_name MUST use add) · `pool_precondition: "requires_items"` · `cost: "expensive"` (paid network I/O; poll patterns) · `requires_columns: ["entity_name", "content_markdown", "analysis_json"]` (superset of common slot inputs; see Open questions on template-driven columns) · one output item per entity carrying `media_manifest_json` (all generated assets) + flat display fields (`assets_generated`, `media_types` pre-joined string, `est_cost_usd`, `has_errors` as string `"true"/"false"` for `flagged_when`). **`_partialItems`:** push each entity's item as soon as its slots finish (and after each completed slot, re-push the updated entity item) so a timeout never loses paid generations (Rule 10).

## Options (manifest sketch)

| Option | Type | Default | Notes |
|---|---|---|---|
| `providers` | json (presets_enabled) | `[]` | `{ id, media_type, endpoint, auth:{type,key,env_var}, request_pattern, response_kind, params_map, result_path, poll:{...}, est_cost_per_item, max_input_chars }` |
| `generation_slots` | json (presets_enabled) | `[]` | `{ slot, provider, input_field \| prompt_template, input_transform:{strip_markdown, strip_patterns[]}, params }`. Empty = no-op. |
| `max_slots_per_entity` | number | 3 | **Cost guard.** |
| `max_total_assets_per_run` | number | 25 | **Cost guard** across entities. |
| `per_run_budget_usd` | number | 5 | **Cost guard** — sums `est_cost_per_item`; past cap: skip remaining paid slots, warn loudly. |
| `dry_run` | boolean | false | Resolve inputs, build requests, emit manifest with `status: "dry_run"` + cost estimate; zero API calls. |

## Providers (researched 2026-07-03)

| Provider | Env var | Free tier | Pricing | Response | Notes |
|---|---|---|---|---|---|
| **Gemini API TTS** (`gemini-3.1-flash-tts-preview`, 2.5 previews) | `GOOGLE_AI_API_KEY` — **key EXISTS; live-testable today** | Yes (rate-limited; TTS quota unverified) | 2.5 Flash TTS $0.50/1M in + $10/1M audio-out tokens (~25 tok/s audio); 3.1: $1/$20 | **json_base64** (inline PCM 24 kHz — module adds WAV header metadata) | Plain API key, no GCP account. **Preview — model ids can churn.** [Docs](https://ai.google.dev/gemini-api/docs/speech-generation) · [Pricing](https://ai.google.dev/gemini-api/docs/pricing) |
| Google Cloud TTS (Chirp 3 HD / Neural2 / Standard) | NEW — GCP service account (or REST API key) | 1M chars/mo (HD classes), 4M (Standard) | $30/1M (Chirp3 HD), $16/1M (Neural2), $4/1M (Standard) | **json_base64** (`audioContent`) | GA and stable; 5,000 **bytes**/request → chunking required. [Pricing](https://cloud.google.com/text-to-speech/pricing) |
| OpenAI TTS (`gpt-4o-mini-tts`, tts-1/-hd) | `OPENAI_API_KEY` — key EXISTS, **but BLOCKED**: returns raw binary | No | ~$0.015/min (mini-tts); tts-1 $15/1M chars, hd $30/1M | **binary** | Usable only after skeleton binary-safe HTTP. 4,096-char limit (tts-1). [Guide](https://developers.openai.com/api/docs/guides/text-to-speech) |
| ElevenLabs (v3 / Flash v2.5) | `ELEVENLABS_API_KEY` — NEW | 10K chars/mo | PAYG $0.10/1K chars (v3/Multilingual), $0.05/1K (Flash) | **binary** (blocked today; timestamps variant returns JSON+base64 — verify) | Best voice quality; 5–40K char limits by model. [API pricing](https://elevenlabs.io/pricing/api) |
| Azure AI Speech | `AZURE_SPEECH_KEY` — NEW | 500K chars/mo (F0) | ~$16/1M neural ($15 in some MS docs — region/date-dependent); HD $22/1M | **binary** | Blocked today. [Docs](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/rest-text-to-speech) |
| Cartesia (Sonic 3.5) | `CARTESIA_API_KEY` — NEW | 20K credits/mo (non-commercial) | Credit plans $5–299/mo; per-char/sec rate **conflicting sources — unverified** | **binary** | Blocked today; latency-focused (voice agents), not batch narration. [Pricing](https://www.cartesia.ai/pricing) |

Original brief's Play.ht dropped (its cited pricing unverified; landscape above supersedes). Cost reality check vs original: a 2,000-word profile ≈ 12K chars ≈ **$0.048** on Google Neural2, ≈ **$1.20** on ElevenLabs v3 — the original's "$3.60 ElevenLabs" is stale (2026 price cuts).

## Example template configurations

**Company profiles (OnlyiGaming):** slot `narration_overview` — `input_field: content_markdown`, `input_transform: { strip_markdown: true, strip_patterns: ["\\[#\\d+\\]", "\\*\\*Meta (Title|Description):\\*\\*.*"] }`, provider `gemini-tts`, params `{ voice: "Kore", style_prompt: "measured, professional narration" }`. One asset/entity; ~3 min audio ≈ $0.05 (2.5 Flash TTS). Vertical flavor (which sections narrate, pronunciation hints for brand names) = template config.
**News pipeline:** slot `episode_audio` per article — `input_field: content_markdown` (lede+body), Flash-tier voice, `max_slots_per_entity: 1`, budget $2/run — a daily "listen to the news" feed; Step 8 bundles the URLs into RSS.

## Credentials & testing

- **Existing keys approved for reuse:** `GOOGLE_AI_API_KEY` (Gemini TTS — the live-testable-now path), `OPENAI_API_KEY` (parked until binary-safe HTTP). New keys only for ElevenLabs/Azure/Cartesia if voice quality demands it — user decision.
- **Unit tests (credential-free):** mocked `tools.http` fixtures per response kind; assert chunking at `max_input_chars`, citation-strip transform, budget-cap refusal, dry_run emits zero HTTP calls, per-slot error → `has_errors: "true"` item (not a throw).
- **Cheapest live test:** one entity, one slot, Gemini 2.5 Flash TTS, 500-char input ≈ **<$0.01**. E2E: company-profile template with one narration slot; verify manifest renders in UI and `_partialItems` survives a forced timeout.

## Edge cases & failure modes

- **Long text > provider limit** → chunk by `max_input_chars`; v1 emits one asset per chunk (`slot: narration_overview.part1..N`) — **no audio concatenation in-module** (binary work; Step 8/skeleton concern).
- **Base64 pool bloat:** 3-min PCM ≈ multi-MB base64 in a jsonb pool item — cap via `max_slots_per_entity`, prefer compressed formats where the provider offers them, and treat persistence hand-off as the real fix (Open questions).
- **Mispronounced entity names** → no automated fix; template `params.style_prompt`/lexicon hints where the provider supports them; Step 10 human gate.
- **Preview-model churn (Gemini TTS)** → model id lives in provider config (template-editable), so a rename is a config edit, not a code change.
- **Provider content-policy refusal / API error** → per-slot error recorded in manifest; entity item flagged, run continues.

## Open questions

1. **Asset persistence — skeleton capability audit needed.** No `tools.storage` exists. Options: (a) skeleton adds a storage tool (Supabase Storage bucket) modules can hand base64/URLs to; (b) a Step 8 bundler downloads+persists (needs binary-safe HTTP there too); (c) distribution step owns it. Decide before production use; until then assets are base64-in-pool or ephemeral URLs.
2. **Binary-safe `tools.http`** (`{ binary: true }` → base64): small generic skeleton change that unlocks OpenAI/ElevenLabs/Azure/Cartesia. Worth doing early?
3. **Template-driven `requires_columns`:** slots reference arbitrary pool fields, but `requires_columns` is static in the manifest. Declare a broad superset, or does the skeleton support dynamic column selection per template? Audit.
4. **Duration metadata:** PCM/base64 duration is computable from bytes; URL-only responses may need a provider-reported field — per-provider `result_duration_path` config if needed.
