# Submodule Research Brief: YouTube & Podcast Discovery

**Step:** 1 — Discovery
**One-line purpose:** Find a company's YouTube channel, video URLs, and podcast appearances via search and API lookups.

---

### What goes in?

Entity with name (required). Optional: website, category.

### What comes out?

YouTube channel URLs, individual video URLs, and podcast episode URLs/feeds. Items: url, media_type (youtube_channel|youtube_video|podcast_feed|podcast_episode), title, description_snippet, pub_date.

### Approach

**YouTube:**
1. Google search: `site:youtube.com "{company_name}" igaming` → find channel
2. If channel found: YouTube Data API → list recent videos (configurable: last N videos or last N months)
3. Extract: video URL, title, description snippet, publish date, view count

**Podcasts:**
1. Google search: `"{company_name}" podcast igaming` → find podcast appearances
2. Search podcast directories: Apple Podcasts search API (free), Spotify (if API available)
3. For podcast feeds found: extract episode URLs via RSS parsing

### External Dependencies

- Google Custom Search API (for initial search)
- YouTube Data API v3 (free tier: 10,000 units/day, list videos = 1 unit per call)
- Apple Podcasts Search API (free, no auth)
- API keys: YOUTUBE_API_KEY

### Edge Cases and Failure Modes

- Company has no YouTube/podcast presence → return empty, normal for many B2B companies
- YouTube channel has 500+ videos → cap at max_videos option (default 20)
- Podcast search returns irrelevant results → LLM classification of results (cheap Haiku call) to filter

### Example Output

```javascript
{
  entity_name: "Betsson",
  items: [
    { url: "https://youtube.com/c/BetssonGroup", media_type: "youtube_channel", title: "Betsson Group", description_snippet: "Official channel" },
    { url: "https://youtube.com/watch?v=abc123", media_type: "youtube_video", title: "Betsson Q3 2025 Presentation", pub_date: "2025-10-20" },
    { url: "https://igamingdaily.com/podcast/betsson-ceo-interview", media_type: "podcast_episode", title: "Betsson CEO Interview", pub_date: "2025-11-01" },
  ],
  meta: { youtube_channel_found: true, videos_found: 12, podcast_episodes_found: 3, errors: 0 }
}
```
