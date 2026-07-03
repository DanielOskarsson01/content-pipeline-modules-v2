# Submodule Research Brief: API Data Fetcher

**Step:** 3 — Scraping
**One-line purpose:** Fetch structured data from APIs (YouTube Data API, podcast RSS enrichment, Crunchbase, company registries) for entities that have API-accessible sources.

---

### What goes in?

Entity with items containing API-fetchable URLs or identifiers. Items may have: youtube_channel_id, podcast_feed_url, crunchbase_slug, linkedin_url.

### What comes out?

Structured data per source. Items: source_api, data_json (structured fields), raw_text (flattened for LLM consumption), fetch_date.

### Approach

Modular fetcher with pluggable API handlers. Start with:

1. **YouTube Data API:** Channel info (subscriber count, video count, description), recent video list with descriptions
2. **Podcast RSS:** Parse feed XML, extract episode list with titles, descriptions, dates, guest names
3. **Future handlers:** Crunchbase API (funding, key people), Companies House API (UK registry), OpenCorporates

Each handler: validate credentials → fetch → normalize to common schema → flatten for LLM.

### External Dependencies

- YouTube Data API v3: free tier (10,000 units/day)
- Podcast RSS: free, no auth
- Future: Crunchbase Basic API ($0/limited), OpenCorporates API (free tier)
- API keys via env vars per handler

### Example Output

```javascript
{
  entity_name: "Betsson",
  items: [
    { source_api: "youtube", data_json: { channel_name: "Betsson Group", subscribers: 5400, video_count: 120 }, raw_text: "Betsson Group YouTube: 5400 subscribers, 120 videos...", fetch_date: "2026-03-20" },
    { source_api: "podcast_rss", data_json: { feed_title: "iGaming Daily", episodes_mentioning: 3 }, raw_text: "Featured in iGaming Daily episodes: ...", fetch_date: "2026-03-20" },
  ],
  meta: { apis_queried: 2, successful: 2, errors: 0 }
}
```
