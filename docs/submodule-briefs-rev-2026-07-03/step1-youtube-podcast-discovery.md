# Submodule Brief: YouTube & Podcast Discovery (revised) — provider configs of `api-search` (+ `rss-feeds`)

**Step:** 1 — Discovery
**Revised:** 2026-07-03 — pipeline-agnostic redesign (Rule 13). Original archived in `_originals-2026-07-03/`.
**Original goal (unchanged):** Find an entity's YouTube channel, video URLs, and podcast appearances via search and API lookups.
**Build status:** not built (no new module — ships as api-search provider configs + rss-feeds wiring; one small generic api-search enhancement required, see Design)
**Design verdict:** provider configs of the BUILT `api-search` module (YouTube Data API v3 search + iTunes Search API), composed with the BUILT `rss-feeds` module for channel/episode enumeration. No new module.

## Goal

Discover media presence per entity: YouTube channels/videos and podcast feeds/episodes. Verdict rationale: both target APIs are plain keyword→JSON search APIs — exactly api-search's contract (search mode, `results_path`, `field_map`, query-param auth). That's hierarchy step 1 (existing module) — stronger than making them providers of the not-yet-built `search-discovery`, which is reserved for SERP-shaped engines. Deviation from the consolidation directive's "(b) search-discovery provider" suggestion is deliberate: api-search exists today and fits exactly.

## Design (agnostic)

**Search (api-search, `search_input: entity_names`):**
- **YouTube provider config:** `GET https://www.googleapis.com/youtube/v3/search?part=snippet&q={keyword}&type=video|channel&maxResults=N&key=...` — `results_path: "items"`, query-param auth (supported today).
- **iTunes podcast provider config:** `GET https://itunes.apple.com/search?term={keyword}&media=podcast&limit=N` — `results_path: "results"`, no auth. Returns `feedUrl` per podcast — feed that into rss-feeds.

**Required generic api-search enhancement (small, Rule 13-clean):** YouTube responses carry IDs, not URLs (`id.videoId`). api-search's `field_map` needs a template form: `"url": {"template": "https://www.youtube.com/watch?v={id.videoId}"}` — a generic field_map capability (any ID-based API benefits), not YouTube-specific code. Without it these APIs violate api-search's "every item MUST have url" contract.

**Enumeration (rss-feeds, built — free, no quota):**
- YouTube channels publish RSS: `https://www.youtube.com/feeds/videos.xml?channel_id={id}` (recent ~15 videos, no API key). Once a channel is discovered, enumeration belongs to rss-feeds, NOT to repeated 100-unit YouTube searches.
- Podcast episodes: the `feedUrl` from iTunes results is a standard RSS feed — rss-feeds parses episodes directly.

**What stays out:** LLM relevance-filtering of podcast results (original's Haiku idea) → step-2 url-relevance, already built. "Company has a channel?" heuristics → step-2. No media_type enum in module code — provider id (`source`) plus template-level `entity_name_template`/preset naming carries provenance.

## Module contract

Inherited from api-search: item_key `url` · `add` · `empty_ok` · cost `cheap` (manifest today; NOTE: with YouTube's 100-unit search cost and multi-entity runs, recommend running with conservative `requests_per_minute` — quota, not time, is the binding constraint) · requires_columns `["name"]` · `_partialItems` after each keyword (already implemented).

## Options (manifest sketch)

No new options. Uses api-search's existing `providers`, `search_input: entity_names`, `max_results`, `provider_params` (e.g. `{"youtube": {"type": "channel"}}`), `requests_per_minute`. The `field_map` template form is the only manifest-schema addition (documented in api-search README when built).

## Providers (researched 2026-07-03)

| Provider | Env var | Free tier | Pricing | Notes |
|---|---|---|---|---|
| YouTube Data API v3 (search.list) | `YOUTUBE_DATA_API_KEY` — new; **possible reuse:** existing `GOOGLE_AI_API_KEY` or the GSC service account's GCP project could have YouTube Data API v3 enabled (needs enablement check — unverified) | 10,000 units/day default, no billing | Free; search.list = **100 units/call → ~100 searches/day** | The hard constraint. Budget: ≤1 search/entity/run; enumerate via RSS after. playlistItems.list = 1 unit if API-side enumeration is ever needed. https://developers.google.com/youtube/v3/determine_quota_cost |
| iTunes Search API | none — **no auth, live-testable now** | Unlimited (rate-limited) | Free; ~20 calls/min/IP | Returns `feedUrl` for RSS handoff. https://performance-partners.apple.com/search-api |
| PodcastIndex API | `PODCASTINDEX_API_KEY` + `_SECRET` (new, free signup) | Free | Free | Requires hashed auth **headers** — blocked on api-search's query-param-only auth; treat as v2 provider unless header auth ships. https://podcastindex-org.github.io/docs-api/ |
| Listen Notes | `LISTENNOTES_API_KEY` (new) | Free tier (limits unverified) | PRO $20/mo per 100k requests | Only if iTunes+PodcastIndex coverage proves insufficient. https://www.listennotes.com/api/pricing/ |
| YouTube channel RSS | none | Free, no auth | Free | Enumeration path via rss-feeds (built). |

## Example template configurations

**Company-profiles template (iGaming flavor lives HERE) — api-search preset:**
```json
{
  "search_input": "entity_names",
  "max_results": 5,
  "providers": [
    {
      "id": "youtube", "name": "YouTube Data API", "mode": "search",
      "url": "https://www.googleapis.com/youtube/v3/search",
      "keyword_param": "q", "limit_param": "maxResults", "results_path": "items",
      "field_map": {
        "url": {"template": "https://www.youtube.com/watch?v={id.videoId}"},
        "title": "snippet.title", "company": "snippet.channelTitle",
        "snippet": "snippet.description", "postedAt": "snippet.publishedAt", "externalId": "id.videoId"
      },
      "auth": {"type": "query_param", "key": "key", "env_var": "YOUTUBE_DATA_API_KEY"}
    },
    {
      "id": "itunes-podcasts", "name": "Apple Podcasts Search", "mode": "search",
      "url": "https://itunes.apple.com/search", "keyword_param": "term", "limit_param": "limit",
      "results_path": "results",
      "field_map": {"url": ["feedUrl", "collectionViewUrl"], "title": "collectionName",
        "company": "artistName", "snippet": null, "postedAt": "releaseDate", "externalId": "collectionId"},
      "auth": null
    }
  ],
  "provider_params": {"itunes-podcasts": {"media": "podcast"}, "youtube": {"part": "snippet", "type": "video"}}
}
```
Qualifier terms ("{entity} igaming podcast") belong in template keyword config when `search_input: keywords` is used instead — never in provider configs.

**Job-search template:** same providers, keywords like `"engineering culture {entity_name}"` — demonstrates the config is content-type-free.

## Credentials & testing

- **Live-testable today, zero credentials:** iTunes Search API (no auth). This is the free test path for the whole design.
- **Existing-key reuse (unverified):** `GOOGLE_AI_API_KEY` and the GSC service-account GCP project are both candidate homes for YouTube Data API v3 enablement — verify in Google Cloud console before minting `YOUTUBE_DATA_API_KEY`.
- Unit tests: mocked `tools.http` with canned YouTube/iTunes JSON; assert `field_map` template rendering (`{id.videoId}`), feedUrl fallback array, no-auth provider path, quota-friendly rate limiting.
- E2E: api-search preset + rss-feeds wiring in a template, attended session.

## Edge cases & failure modes

- YouTube quota exhausted mid-run (100 searches/day!) → per-keyword error already caught by api-search; partial results preserved via `_partialItems`; meta must surface "quota" distinctly so operators don't misread it as "no presence".
- Entity with no media presence → empty results, normal.
- iTunes 429 (20/min/IP) → respect `requests_per_minute` ≤ 15 for iTunes-heavy runs.
- Channel discovery returning fan/reupload channels → step-2 url-relevance with entity context (template prompt), not code heuristics.

## Open questions

1. Does the `field_map` template enhancement land in api-search v1.x before this config ships? It's the only code dependency.
2. Channel-id extraction for the RSS handoff (video URL → channel_id needs either `snippet.channelId` captured as an extra field or a `type: "channel"` search variant) — settle the exact wiring when building the template.
3. PodcastIndex header-auth: worth a generic `auth.type: "header"`/HMAC extension to api-search, or leave to search-discovery-era work?
