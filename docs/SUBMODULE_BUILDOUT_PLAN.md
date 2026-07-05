# Submodule Build-Out Plan — Discovery → Distribution

**Compiled:** 2026-07-03 · **Repo:** `content-pipeline-modules-v2` · **Branch:** `claude/charming-lamport-4b708c` (not merged to main, nothing deployed)
**Purpose:** Single source of truth for the submodule build-out work — what exists, what is designed, what blocks it, and the recommended order. Written to be dropped into a larger master plan.

---

## 1. One-paragraph summary

The pipeline had 32 research briefs for submodules; 12 were already built, 20 were not. Those 20 briefs were rewritten (2026-07-03) to be pipeline-agnostic and re-based on providers that actually exist in mid-2026 (the originals were anchored on APIs that have since shut down). The rewrite **collapsed 20 briefs into 10 new generic modules + 1 module extension + 1 config card + several configs of already-built modules** — the module catalog grows 37 → 47 rather than 37 → 56. **Two of the 10 are now built, tested, and live-verified.** The remaining eight are fully specified; four of them are partly gated by small skeleton-side capability gaps (filed as BACKLOG #43–46).

---

## 2. Status at a glance

| State | Count | Items |
|---|---|---|
| **Built + live-verified** | 2 | `url-heuristics`, `search-discovery` |
| **Designed, ready to build now** | 3 | `ai-discovery-scout`, `api-fetcher`, human-rewriter card |
| **Designed, gated on a skeleton gap** | 5 | `dataset-fetcher`, `transcript-fetcher`, `media-generator`, Step-9 family (`cms-publisher`, `doc-exporter`, `sheet-logger`), `seo-planner` keyword-data extension |
| **Absorbed as config of existing modules** | — | 6 discovery briefs (see §5) |

All work is committed and pushed on the branch. Nothing has been merged to `main` or deployed to production, so the running pipeline is unchanged.

---

## 3. Built modules (done)

### 3.1 `url-heuristics` — Step 2 (validation) — commit `4b4bf71`
Zero-cost, rule-based URL scorer. Assigns `allow` / `allow_hint` / `reject` with reasons, using configurable pattern rules with generic web-cruft defaults. Sits between `url-filter` and `url-relevance` to drop obvious non-content URLs **before** the expensive LLM relevance pass, shrinking that bill at no API cost.

- **Contract:** `item_key: url` · `data_operation_default: remove` · `pool_precondition: requires_items` · `cost: cheap` · `sort_order: 4` (bumped `url-relevance` 4→5 to seat it).
- **Modes:** shadow (annotate-only, default) vs enforce (drops rejects).
- **Tests:** 60/60, zero credentials required — fully provable offline.
- **Review:** independent `/code-review` (WARN → fixed: six reject regexes were unanchored and would have wrongly rejected real article slugs; fixed TDD-style).

### 3.2 `search-discovery` — Step 1 (discovery) — commits `ed3be01`, `9bf8271`, `a93f395`
Generic, provider-pluggable web-search discovery. **One module replaces five planned "search X for an entity" modules.** Providers are JSON config (new provider = config, not code — the `api-search` precedent).

- **Contract:** `item_key: url` · `data_operation_default: add` · `pool_precondition: empty_ok` · `cost: medium` · `sort_order: 2`. Pushes `_partialItems` per query (timeout-safe).
- **Two modes:** `open` (whole web) and `site_restricted` (curated domain list — fans out one `site:{domain}` query per domain).
- **Two provider kinds:** `serp` (query engines) and `lookup` (deterministic URL templates).
- **Providers live-verified today:**
  - **Perplexity** (`PERPLEXITY_API_KEY`, exists) — verified, ~$0.01/2 calls.
  - **Serper.dev / Google** (`SEARCH_PROVIDER_SERPER_KEY`, added + verified 2026-07-03) — open mode returned real Google results; curated-site mode returned 10 URLs all within the configured domain list. **This is the replacement for the discontinued Google PSE curated-site search.**
- **Tests:** 57/57 mocked + 2 live scripts (Perplexity, Serper).
- **Review:** `/code-review` (WARN → fixed: a 401/403 auth failure now skips the whole provider instead of re-hammering it for every query).

> **Google PSE note (answers a recurring question):** Google's own Programmable Search Engine / Custom Search JSON API is closed to new customers and sunsets 2027-01. Curated-list search over Google's index is **fully preserved** via Serper — either `site_restricted` mode (one `site:` query per domain) or an OR'd `site:` template in `open` mode (whole list in one query, the closest PSE-`cx` equivalent).

---

## 4. The 20 → 10 consolidation (design verdicts)

Every unbuilt brief was given a verdict under the "small generic modules" rule (prefer config of an existing module over a new one). Filenames were kept even where the module concept was renamed/superseded.

### New generic modules (10)

| Module | From brief(s) | Step | One-line |
|---|---|---|---|
| `search-discovery` ✅ built | google-pse-directories (canonical) | 1 | provider-pluggable web search, open + site-restricted |
| `ai-discovery-scout` | ai-discovery-scout | 1 | LLM proposes source URLs → HTTP liveness gate |
| `url-heuristics` ✅ built | learned-validator | 2 | zero-cost rule-based URL scorer |
| `api-fetcher` | api-data-fetcher | 3 | identifier-driven structured-API enrichment |
| `dataset-fetcher` | linkedin-company-scraper | 3 | async trigger/poll/snapshot dataset API; LinkedIn-company = one provider config |
| `transcript-fetcher` | media-transcript-fetcher | 3 | native-caption + cost-guarded STT providers |
| `media-generator` | audio-tts + image + video (3 briefs) | 5 | ONE module, three modes (tts/image/video), per-slot provider configs |
| `cms-publisher` | strapi-publisher | 9 | REST publish; Strapi/WordPress/Ghost/webhook = provider configs |
| `doc-exporter` | google-docs-exporter | 9 | file delivery; Google Drive/multipart/S3 = provider configs |
| `sheet-logger` | google-sheets-logger | 9 | row upserts; Google Sheets/Airtable/CSV = provider configs |

### Not new modules

| Brief | Verdict |
|---|---|
| seo-keyword-researcher | **Extension of `seo-planner`** — new `keyword_data_providers` layer (GSC free tier + DataForSEO); output is additive to existing `seo_plan_json`. |
| human-rewriter | **Card/config of `tone-seo-editor`** — a humanization edit-pass; no new code in the primary path. |
| google-pse-news | Template config of `search-discovery` (site-restricted news whitelist + date filter). |
| curated-list-import | Template config of `search-discovery` (site-restricted over a curated domain list). |
| social-media-discovery | Template config of `search-discovery` + built `page-links` for homepage social links. |
| linkedin-discovery | Template config of `search-discovery` (`site:linkedin.com/company`). |
| image-logo-search | Provider/mode config of `search-discovery` (images vertical + logo `lookup` providers); stock imagery via built `api-search` (Pexels/Unsplash/Pixabay keys exist). |
| youtube-podcast-discovery | Provider configs of built `api-search` (YouTube Data API + iTunes Search) + built `rss-feeds`. |

---

## 5. Credentials — what is live-testable today

Existing keys in the skeleton `.env` are approved for reuse (user decision, 2026-07-03).

| Capability | Key | Status |
|---|---|---|
| Web search (Perplexity) | `PERPLEXITY_API_KEY` | ✅ exists, verified |
| Web search (Google/Serper) | `SEARCH_PROVIDER_SERPER_KEY` | ✅ added + verified (local `.env` only; **not yet on production**) |
| LLM source scout / rewriter | `ANTHROPIC_API_KEY` | ✅ exists (also benefits from deployed #21 prompt caching) |
| TTS / image / video / YT transcription | `GOOGLE_AI_API_KEY` (Gemini) | ✅ exists — Gemini TTS, Imagen, Veo, YouTube transcription |
| Image gen | `LEONARDO_API_KEY`, `OPENAI_API_KEY` | ✅ exist |
| Stock imagery | `PEXELS_API_KEY`, `UNSPLASH_ACCESS_KEY`, `PIXABAY_API_KEY` | ✅ exist |
| Real keyword data | GSC service account (`GSC_SERVICE_ACCOUNT_KEY_PATH`) | ✅ exists — free, onlyigaming.com verified; needs Sheets/Docs API enablement for delivery modules |
| Scraping transport | `SCRAPFLY_KEY`, `BRIGHT_DATA_API_KEY` | ✅ exist (Bright Data Datasets scope unverified — one $0.003 call settles it) |
| Zero-credential paths | — | iTunes Search, podcast RSS + transcripts, Wikidata, webhook targets, `url-heuristics` |

**New keys still to provision (optional, per module chosen):** DataForSEO (keyword volume/difficulty), Brandfetch (logos), Companies House (free), a CMS token + Google Workspace Shared Drive (Step-9 delivery).

---

## 6. Dead providers found (why the rewrite was necessary)

The original briefs were unbuildable as written — these were all confirmed shut down by research:

- **Google Custom Search JSON API (PSE)** — closed to new customers, sunset 2027-01.
- **Bing Search API** — retired 2025-08.
- **Clearbit Logo API** — dead 2025-12.
- **Proxycurl** (LinkedIn data) — killed by LinkedIn injunction, 2025-07.
- **Crunchbase** free Basic API + **OpenCorporates** free keys — eliminated.
- **OpenAI Sora API** — deprecated, shuts 2026-09-24.
- **YouTube `captions.download`** — owner-OAuth-only (unusable for third-party videos).

---

## 7. Skeleton capability gaps (BACKLOG #43–46 — gate parts of the build-out)

These live in the **skeleton repo** (`content-pipeline-v2`), not this modules repo. They block specific modules, noted below.

| # | Gap | Blocks |
|---|---|---|
| **43** | `tools.http` is GET/HEAD/POST-only, binary-unsafe, no multipart | OpenAI TTS (raw binary), Strapi/Ghost/Contentful updates (PUT), Airtable upsert (PATCH), S3/WebDAV, large-audio STT upload |
| **44** | No asset persistence (`tools.storage` doesn't exist); generated-media URLs expire | `media-generator` **video mode** (hard); TTS/image can ship first via non-expiring paths |
| **45** | No Step-10-approval → Step-9 `execute` trigger; modules can't read `terminal_state` for flagged-entity gating (extends #8/#9) | entire Step-9 delivery family |
| **46** | `api-search` supports bearer auth only (no custom headers) | Pexels + PodcastIndex provider configs (small, modules-repo fix) |

---

## 8. Recommended build order

**Wave 1 — build now, zero blockers (highest value, lowest risk):**
1. ✅ `url-heuristics` — done.
2. ✅ `search-discovery` — done (Perplexity + Serper live).
3. `api-fetcher` — iTunes / podcast-RSS / Wikidata are no-auth; live-testable free.
4. human-rewriter card on `tone-seo-editor` — config only, existing keys.
5. `ai-discovery-scout` — Anthropic key exists.

**Wave 2 — after the small `api-search` header-auth fix (#46):**
6. YouTube/podcast/stock-image/logo provider configs (all become live once #46 lands).

**Wave 3 — after skeleton gaps, in this order:**
7. `seo-planner` keyword-data extension — GSC free tier works today; DataForSEO needs a new key.
8. `dataset-fetcher` — verify Bright Data Datasets key scope ($0.003 test) first.
9. `transcript-fetcher` — free podcast/native paths first; STT (paid) behind budget guard; confirm Gemini YouTube-ingestion billing.
10. `media-generator` — TTS + image modes (need binary-safe HTTP #43 for some providers); **video mode last** (needs asset persistence #44).
11. Step-9 family (`cms-publisher`, `doc-exporter`, `sheet-logger`) — needs #45 (execute trigger + flag readability); also closes BACKLOG #9 (distribution gate).

**Principle for every wave:** TDD (mocked `tools`) → independent `/code-review` → live verification where a key exists → commit + push per module. Build on the branch; merge to `main` deploys on push, so that stays a deliberate decision.

---

## 9. Where the source material lives

- **Per-module docs (built):** each module folder has `README.md` (operator contract) + `CLAUDE.md` (maintainer notes) + tests.
- **Full briefs (all 20):** canonical in `Content-Pipeline/specs/submodule-briefs/`; committed snapshot in `docs/submodule-briefs-rev-2026-07-03/` (20 revised + 20 originals + index). Each brief = module contract + provider table w/ pricing + example configs + test plan.
- **Backlog:** `BACKLOG.md` items #43–46.
- **Session log:** `CLAUDE.md` (2026-07-03 entry).
- **Decision log:** Supabase `decision_log`, project `content-pipeline-modules-v2`.

---

## 10. Open verifications (carry into the master plan)

- [ ] Add `SEARCH_PROVIDER_SERPER_KEY` to **production** Hetzner `.env` (deploy excludes `.env`; manual SSH + `pm2 restart`) before search-discovery goes live in production.
- [ ] Bright Data Datasets key-scope check (one $0.003 sync call) — gates `dataset-fetcher`.
- [ ] Gemini YouTube-ingestion billing status (currently preview/no-charge) — gates `transcript-fetcher` default.
- [ ] Google Workspace Shared Drive availability — gates `doc-exporter` Google path (service-account My-Drive pattern is broken as of mid-2026).
- [ ] Decision: merge this branch to `main` + deploy (makes the 2 built modules live), or keep building on-branch first.
