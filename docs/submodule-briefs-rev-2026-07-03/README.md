# Submodule briefs — 2026-07-03 pipeline-agnostic revision (snapshot)

**This is a durability snapshot, not the canonical location.**

- **Canonical:** `Dropbox/Projects/OnlyiGaming/Content-Pipeline/specs/submodule-briefs/` — which is NOT under version control (untracked inside the `/Projects` mega-repo; see BACKLOG #41). This snapshot exists so the revision survives Dropbox mishaps and parallel-window contention (BACKLOG #42).
- **Contents:** the 20 briefs for not-yet-built submodules, rewritten 2026-07-03 to be pipeline-agnostic (Rule 13) with researched 2026-07 provider landscapes. `originals/` holds the pre-revision versions verbatim.
- **If canonical and snapshot diverge:** canonical (Dropbox) wins for ongoing edits; this snapshot documents the 2026-07-03 state. When BACKLOG #41 (specs into a dedicated sub-repo) is executed, that sub-repo supersedes both.

## What changed in the revision

20 briefs consolidated to **10 new generic modules** + 1 extension + 1 card + configs of built modules:

| New module | Covers briefs | Notes |
|---|---|---|
| `search-discovery` | google-pse-directories (canonical), google-pse-news, curated-list-import, social-media-discovery, linkedin-discovery, image-logo-search (partly) | provider-pluggable web search; Google CSE + Bing are dead — pluggability is load-bearing |
| `ai-discovery-scout` | ai-discovery-scout | LLM proposes URLs + HTTP liveness gate |
| `url-heuristics` | learned-validator | renamed; rule-based V1 only; zero credentials |
| `api-fetcher` | api-data-fetcher | identifier-driven structured-API enrichment |
| `dataset-fetcher` | linkedin-company-scraper | generic trigger/poll/snapshot; LinkedIn company = one provider config |
| `transcript-fetcher` | media-transcript-fetcher | native-transcript + cost-guarded STT provider classes |
| `media-generator` | audio-tts-generator, image-generator, video-generator | ONE module, three modes; per-slot provider configs |
| `cms-publisher`, `doc-exporter`, `sheet-logger` | strapi-publisher, google-docs-exporter, google-sheets-logger | Step-9 delivery family; stage/execute split; fail-closed flagged handling |

No new module: seo-keyword-researcher → **extension of `seo-planner`** (keyword_data_providers layer); human-rewriter → **card of `tone-seo-editor`**; youtube-podcast-discovery → **provider configs of built `api-search`** (+ rss-feeds).

## Skeleton gaps surfaced (filed as BACKLOG #45–48)

1. **#45** `tools.http` — no PUT/PATCH, binary-unsafe, no multipart.
2. **#46** — no asset persistence (`tools.storage`); generated-media URLs expire.
3. **#47** — no Step-10-approval → Step-9 execute trigger; `terminal_state` unreadable by modules (extends #8/#9).
4. **#48** — api-search lacks custom-header auth (Pexels, PodcastIndex).
