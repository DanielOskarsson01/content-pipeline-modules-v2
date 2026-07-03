# Submodule Brief: transcript-fetcher (Generic Media Transcript Fetcher) (revised)

**Step:** 3 — Scraping (media → text)
**Revised:** 2026-07-03 — pipeline-agnostic redesign (Rule 13). Original archived in `_originals-2026-07-03/`.
**Original goal (unchanged):** Turn media URLs discovered in Step 1 (YouTube videos, podcast episodes) into transcript text the pipeline can analyze and write from.
**Build status:** not built
**Design verdict:** new generic module `transcript-fetcher` with two provider classes as config — native-transcript providers (fetch existing captions/transcripts) and STT providers (paid audio transcription). Filename kept; module concept broadened from "fetch existing transcripts only" to "transcript acquisition with cost-guarded STT fallback".

## Goal

For each pool item that is a media URL, produce `transcript_text` + provenance (`transcript_source`), so downstream Steps 4–5 treat talks, interviews, and episodes as first-class content. Free sources are exhausted before any paid provider runs; STT spend is capped by explicit budget options.

**Why not config of an existing module:** no existing module converts media to text. `page-scraper`/`browser-scraper` extract page HTML (show notes at best); `api-fetcher` (sibling brief) fetches structured records, not time-based media. Provider-chain-with-budget is genuinely new behavior → new module, following the api-search provider-config precedent (new provider = JSON config, not code).

**Key research finding that reshapes the original:** the "free official path" the original assumed does not exist — YouTube Data API `captions.download` requires OAuth as the video OWNER ("permission to edit the video"; third-party videos → 403). Unofficial transcript libraries (youtube-transcript-api et al.) are blocked from datacenter IPs (Hetzner included) in 2025–2026 without rotating *residential* proxies, and remain flaky even then (PoToken era). The pragmatic server-side path for third-party YouTube videos is a **hosted transcript API** (~$1.50–$5/1,000 videos). Podcasts keep a genuinely free path: the Podcasting 2.0 `<podcast:transcript>` RSS tag — present on only a minority of feeds, so STT fallback matters. The original's "no audio-to-text in V1" is REVISED: STT is now cheap (Groq whisper-large-v3-turbo $0.04/audio-hour) and included behind a default-off budget. Deviation justified: without STT the module returns nothing for the majority of podcast episodes.

## Design (agnostic)

Code contains only the generic engine: provider chain iteration, URL/media-type matching, transcript normalization (SRT/VTT/JSON → plain paragraphs, timestamps stripped), duration + budget accounting, language tagging, rate limiting — via `tools.http`. **Providers are JSON configs**, two classes:

```json
{ "id": "podcast-transcript-tag", "class": "native", "matches": { "item_field": "media_type", "equals": "podcast_episode" },
  "method": "rss_transcript_tag", "feed_field": "feed_url", "formats_preferred": ["text/vtt", "application/srt", "application/json"] }

{ "id": "supadata", "class": "native", "matches": { "url_pattern": "youtube\\.com|youtu\\.be" },
  "method": "http_json", "url": "https://api.supadata.ai/v1/youtube/transcript", "params": { "url": "{item_url}" },
  "results_path": "content", "auth": { "type": "header", "key": "x-api-key", "env_var": "SUPADATA_API_KEY" } }

{ "id": "gemini-youtube", "class": "native", "matches": { "url_pattern": "youtube\\.com|youtu\\.be" },
  "method": "http_json", "url": "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
  "body_template": { "contents": [{ "parts": [{ "file_data": { "file_uri": "{item_url}" } }, { "text": "Transcribe the spoken audio verbatim." }] }] },
  "results_path": "candidates.0.content.parts.0.text",
  "auth": { "type": "query_param", "key": "key", "env_var": "GOOGLE_AI_API_KEY" } }

{ "id": "openai-transcribe", "class": "stt", "matches": { "item_field": "audio_url", "exists": true },
  "model": "gpt-4o-mini-transcribe", "endpoint": "https://api.openai.com/v1/audio/transcriptions",
  "auth": { "type": "bearer", "env_var": "OPENAI_API_KEY" }, "est_cost_per_hour_usd": 0.18 }
```

- **Chain order = config order, but `native` providers always run before any `stt` provider** for a given item (code-enforced invariant — free before paid). First provider producing a transcript wins; failures fall through with reasons.
- `matches` routes items to providers generically (URL regex or item-field predicates) — no media platform named in code.
- STT providers need an audio file URL (`audio_url` — for podcasts, the RSS enclosure URL set by Step-1 discovery or by the rss_transcript_tag provider's feed parse). **YouTube audio extraction for STT is explicitly out of scope** (ToS + yt-dlp infrastructure); YouTube items rely on native providers — the Gemini video-understanding provider takes the YouTube URL directly (existing `GOOGLE_AI_API_KEY`), hosted transcript APIs are the purpose-built alternative.
- Three `method` handlers in code, all agnostic infrastructure: `rss_transcript_tag` (parse feed, GET the transcript URL), `http_json` (GET/POST with `body_template` + `results_path` — covers hosted transcript APIs, the Gemini generateContent call above, and Deepgram's URL-based STT), `stt_openai_compatible` (download audio, multipart upload — covers OpenAI and Groq with config-only differences). Everything else — endpoints, params, matching, preference order, cost rates — is template-space config.
- **Output item fields:** `url`, `title`, `transcript_text`, `transcript_source` (provider id + class, e.g. `"native:supadata"`, `"stt:groq-whisper"`, `"fallback:description"`), `duration_seconds`, `language`, `word_count`, `status`, `est_cost_usd`. Description/show-notes fallback (from existing item fields) fires only when every configured provider fails, flagged `status: "no_transcript"`.

**Rule 13 test:** which platforms, which APIs, which order, what budget — all uploadable template configuration. Code knows "provider chain with a spend meter".

## Module contract

- **item_key:** `url`
- **data_operation_default:** `add` — produces new content-bearing fields; upsert by `(itemKey, source_submodule)` preserves other scrapers' items for the same URL. (`transform` rejected: transcript acquisition is content production, the Step-3 concern, and `add` is the Step-3 scraper convention.)
- **pool_precondition:** `requires_items` (media URLs must exist in the pool — standard Step-3 enrichment)
- **cost:** `expensive` (network + possible per-minute STT; 30-min class per Rule 11)
- **requires_columns:** `["url"]` (`media_type`, `audio_url`, `feed_url`, `title` used when present)
- **_partialItems:** push after EVERY completed transcript (Rule 10 — network/paid I/O; one STT result lost to a timeout is real money).

## Options (manifest sketch)

| Option | Type | Default | Notes |
|---|---|---|---|
| `providers` | json | `[{podcast-transcript-tag}]` (the only zero-auth, zero-cost provider) | `presets_enabled: true`; runnable default, no keys needed |
| `max_items` | number | `20` | per entity per run — cost guard |
| `max_duration_minutes` | number | `90` | items longer than this are skipped for STT (still eligible for native) |
| `stt_budget_minutes` | number | `0` | **hard cap on total STT audio-minutes per run; 0 = STT disabled.** Safe default: no surprise spend; native providers still work |
| `min_transcript_words` | number | `50` | below → treat as failed, fall through to next provider |
| `language_hint` | text | `""` | passed to STT providers that accept it |
| `requests_per_minute` | number | `30` | global token bucket |

`output_schema`: table; `url`, `title`, `transcript_source`, `word_count`, `duration_seconds`, `language`, `status`, `est_cost_usd`; `flagged_when: { status: ["no_transcript", "error", "skipped_budget"] }`; `downloadable_fields`: `transcript_text` (.txt).

## Providers (researched 2026-07-03)

| Provider | Env var | Free tier | Pricing | Notes |
|---|---|---|---|---|
| Podcasting 2.0 `<podcast:transcript>` tag | none | Free (public RSS + GET the transcript URL) | Free | **Always first for podcasts.** Adoption is a minority of feeds (vendor claims range <1% of episodes to "millions" — precise fraction unverified); major hosts (Buzzsprout, Transistor, Captivate, RSS.com) auto-populate it. [podcasting2.org/docs/podcast-namespace/tags/transcript](https://podcasting2.org/docs/podcast-namespace/tags/transcript) |
| Gemini video understanding (YouTube URL) | `GOOGLE_AI_API_KEY` — **key EXISTS today, live-testable now** | YouTube-URL ingestion is a preview feature, "no charge" per current docs | Preview — pricing "likely to change"; caps: public videos only, 8 video-hours/day, 10 videos/request (2.5+) | **Primary for YouTube (existing key).** Transcribes from the URL directly — no audio download. [ai.google.dev/gemini-api/docs/video-understanding](https://ai.google.dev/gemini-api/docs/video-understanding) |
| OpenAI gpt-4o-mini-transcribe | `OPENAI_API_KEY` — **key EXISTS today, live-testable now** | none | **$0.003/min (≈$0.18/hr)**; gpt-4o-transcribe $0.006/min | **Primary STT (existing key).** [developers.openai.com/api/docs/pricing](https://developers.openai.com/api/docs/pricing) |
| Gemini 2.5 Flash audio input | `GOOGLE_AI_API_KEY` — **key EXISTS today** | Gemini free tier (rate-limited) | ~25 audio tokens/sec at $1.00/1M ≈ **$0.09/audio-hr** input + output tokens | Alternative STT on the existing key; needs inline/File-API audio upload. [ai.google.dev/gemini-api/docs/pricing](https://ai.google.dev/gemini-api/docs/pricing) |
| Supadata.ai | `SUPADATA_API_KEY` (new) | 100 credits/mo, no card | $5/300cr … $47/30,000cr; 1 transcript = 1 credit | Purpose-built YouTube scale option (~$0.017/video), stable billing vs the Gemini preview. [supadata.ai/pricing](https://supadata.ai/pricing) |
| SearchApi.io YouTube Transcripts | `SEARCHAPI_API_KEY` (new) | 100 free requests | $4/1k (Dev $40/mo), ~$1–2/1k at volume, pay-per-success | Alternative to Supadata. [searchapi.io/docs/youtube-transcripts](https://www.searchapi.io/docs/youtube-transcripts) |
| Apify transcript actors | `APIFY_TOKEN` (new) | $5/mo platform credit | $0.50–$3/1k (varies by actor) | Cheapest; third-party actor reliability varies. [apify.com/supreme_coder/youtube-transcript-scraper](https://apify.com/supreme_coder/youtube-transcript-scraper) |
| Groq (whisper-large-v3-turbo) | `GROQ_API_KEY` (new) | Free rate-limited API tier (limits unverified) | **$0.04/audio-hour** (v3 full: $0.111/hr) | Cheapest STT (4.5x under OpenAI mini) — cost optimization once volume justifies a new key; OpenAI-compatible endpoint. [groq.com/pricing](https://groq.com/pricing) |
| Deepgram nova-3 | `DEEPGRAM_API_KEY` (new) | **$200 credit, no card** (~430+ hrs) | $0.0043/min prerecorded EN | Biggest free-credit pool if a no-cost STT trial is wanted. [deepgram.com/pricing](https://deepgram.com/pricing) |
| AssemblyAI | `ASSEMBLYAI_API_KEY` (new) | $50 one-time credit | $0.15/hr batch (+10% in-region from 2026-07-01 unless `model_region:"global"`) | Diarization etc. [assemblyai.com/pricing](https://www.assemblyai.com/pricing) |
| ~~YouTube Data API captions.download~~ | — | — | — | **Not viable for third-party videos** — OAuth as video owner required; 403 otherwise (verified on live docs, unchanged 2026). [developers.google.com/youtube/v3/docs/captions/download](https://developers.google.com/youtube/v3/docs/captions/download) |
| ~~Self-hosted youtube-transcript-api / youtubei.js~~ | — | — | free + residential-proxy cost | **Not recommended server-side** — datacenter IPs (incl. Hetzner) blocked; requires rotating residential proxies and still flaky (PoToken). [github.com/jdepoix/youtube-transcript-api#issues 511/593](https://github.com/jdepoix/youtube-transcript-api/issues/593) |

## Example template configurations

**Company profiles (iGaming, OnlyiGaming):** providers = `[podcast-transcript-tag, gemini-youtube, openai-transcribe]`, `stt_budget_minutes: 120`, `max_duration_minutes: 90` — **runs entirely on keys that exist today.** Earnings-call videos and CEO interviews (YouTube) → Gemini video understanding; industry-podcast appearances → transcript tag first, OpenAI STT on the RSS enclosure otherwise (60-min episode ≈ $0.18). At scale, swap in Supadata (~$0.017/video, stable billing) and Groq ($0.04/hr) as new-key cost optimizations. Transcript text flows to content-analyzer/content-writer as quotable primary-source material.

**Job search (second content type, proving agnosticism):** providers = `[podcast-transcript-tag, gemini-youtube]`, `stt_budget_minutes: 0`. Employer engineering-culture talks and founder interviews transcribed for interview prep; paid STT off. Identical module, different JSON.

## Credentials & testing

- **Keys that EXIST today (skeleton .env, reuse approved):** `OPENAI_API_KEY` (gpt-4o-mini-transcribe STT — live-testable now) and `GOOGLE_AI_API_KEY` (Gemini: YouTube-URL transcription + audio STT ≈$0.09/hr). **The recommended default chain needs zero new provisioning.**
- **New provisioning (optional cost/scale optimizations):** `SUPADATA_API_KEY` / `SEARCHAPI_API_KEY` (purpose-built YouTube transcript APIs with stable billing), `GROQ_API_KEY` (cheapest STT), `DEEPGRAM_API_KEY` ($200 free credit). Existing `SCRAPFLY_KEY` is page-scraping transport, not a transcript source — unused here; the Bright Data Web Unlocker key is the wrong product class — unused here.
- **Credential-free test path (explicit):** (1) full unit suite with mocked `tools.http`; (2) LIVE: the `podcast-transcript-tag` provider against a real Podcasting-2.0 feed (e.g. any Buzzsprout-hosted show) — real HTTP, zero keys, zero cost.
- **Unit tests (mocked tools):** provider matching/routing; native-before-stt invariant; SRT/VTT/JSON normalization fixtures (timestamps stripped, paragraphs joined); `stt_budget_minutes` accounting across items (stops mid-run, remaining items `skipped_budget`); `max_duration_minutes` skip; `min_transcript_words` fall-through; description fallback; `_partialItems` after each transcript; per-item error isolation.
- **Cheapest keyed live test (today, no new keys):** one YouTube video via Gemini (`GOOGLE_AI_API_KEY`; preview — currently no charge per docs) + one short podcast episode via OpenAI STT (≈$0.03 for 10 min).
- **E2E note:** one entity with 2 YouTube + 2 podcast items through Steps 3→5; verify content-writer cites transcript items and Step-8 bundles render `transcript_source` provenance.

## Edge cases & failure modes

- **No captions/transcript anywhere** → description/show-notes fallback, `status: "no_transcript"`, flagged — never silently empty.
- **Budget exhausted mid-run** → remaining STT-only items `status: "skipped_budget"` (distinct from failure; visible in summary); native providers unaffected.
- **Unknown duration before STT** (no `duration_seconds` on item) → HEAD the audio URL for Content-Length estimate; if still unknown, count the provider-reported duration AFTER transcription against the budget and log the estimate gap — conservative option: treat unknown-duration items as `max_duration_minutes` for budgeting.
- **Non-English media** → keep transcript, tag detected `language`; never drop.
- **Auto-generated caption quality** (hosted APIs return YouTube ASR) → record `transcript_source` so Step-6 QA/operators can weight accordingly.
- **Huge transcripts** (3-hr episodes) → normalize then truncate at a `raw_text`-style char cap with a truncation note; word_count reflects pre-truncation length.
- **Hosted-API "transcript disabled/blocked" errors** → item error with provider message; fall through to next matching provider.
- **Enclosure URL redirects/tracking prefixes** (podtrac etc.) → follow redirects via `tools.http`; STT providers fetch by URL where supported, else stream-upload (size cap ~100 MB guard).
- **Renderer contract** — all list-ish fields pre-joined to strings; `flagged_when` values are strings.

## Open questions

1. Gemini YouTube-URL ingestion is a **preview** feature ("no charge" per current docs, public videos only, 8 video-hours/day; pricing and limits "likely to change") — confirm billing status before making it the production default at scale; Supadata is the stable-billing fallback. Related: does the 8-hr/day cap bind for planned batch sizes?
2. Should STT audio download go through `tools.http` into memory or need a skeleton-side temp-file/streaming facility for large files? Skeleton capability question — surface before build (multipart upload of ~50–100 MB is beyond current `tools.http` usage patterns).
3. Whisper hallucination on music/silence segments — worth a cheap post-check (repetition detector) in v1, or defer to Step-6 QA?
4. Timestamped transcripts (retain `[mm:ss]` markers as an option for citation precision in Step 5) — v1 strips them; revisit if content-writer wants time-anchored quotes.
