## LinkedIn Post Scraper

> Fetch recent LinkedIn posts for entity-linked profiles via the LinkedIn Profile API's Voyager GraphQL endpoint. Scrapes post text, engagement metrics, hashtags, mentions, and post type.

**Module ID:** `linkedin-post-scraper` | **Step:** 3 (Scraping) | **Category:** linkedin | **Cost:** medium
**Version:** 1.0.0 | **Data Operation:** add (+)

---

## What This Module Does

This module takes LinkedIn profile slugs (from entity fields or prior linkedin-profile-scraper output) and fetches their recent posts. Each post includes the full text, engagement metrics (reactions, comments, reshares), hashtags, mentions, post type, and reshare detection.

The module delegates all LinkedIn interaction to the **LinkedIn Profile API** (`localhost:3847`), the same service used by linkedin-profile-scraper. It calls the `/api/posts/:slug` endpoint which uses LinkedIn's internal Voyager GraphQL API (`voyagerFeedDashProfileUpdates`).

```
Seed CSV with linkedin column / linkedin-profile-scraper output
    |  entity linkedin_url or pool items with linkedin_url
linkedin-post-scraper (this module)
    |  calls Profile API GET /api/posts/:slug?count=N
    |  structured post data with engagement metrics
content-analyzer (Step 4) / content-writer (Step 5)
```

### Architecture

1. Health check via `GET /api/health` -- verifies Profile API is running and LinkedIn session is active
2. Collect profile slugs from entity fields or prior scraper output (deduplicated)
3. For each profile: `GET /api/posts/:slug?count=N` -- returns recent posts with engagement data
4. Filter posts by minimum word count (skip image-only or link-only posts)
5. Rate limit with jitter between API calls to avoid LinkedIn detection
6. Circuit breaker: 3 consecutive failures aborts remaining profiles

### Server Setup Requirements

Same as linkedin-profile-scraper:
1. **Profile API** running as PM2 process (`pm2 show profile-api`) on port 3847
2. **Chrome** running with `--remote-debugging-port=9222`
3. **Active LinkedIn session** -- manual login via noVNC required

### Safety Features

**Health check:** Before scraping, verifies the Profile API is reachable and the LinkedIn session is active. If unhealthy, returns error items for all profiles immediately.

**Circuit breaker:** If 3 consecutive profiles fail, all remaining profiles get error items without making further API calls. Prevents burning rate-limit budget on a dead session.

**Rate limiting:** Enforces minimum interval between requests (default: 3 min at 20/hr) plus random jitter (0-3s) to avoid detection patterns.

**Deduplication:** If multiple entities share the same LinkedIn slug, the profile is only fetched once.

---

## When to Use

**Run when:**
- You have entities with `linkedin` or `linkedin_url` fields pointing to personal profiles
- You need post content for content analysis, topic discovery, or engagement benchmarking
- You want to understand what topics/hashtags a person posts about

**Skip when:**
- Entities don't have LinkedIn profile URLs
- You only need profile data (bio, experience) -- use linkedin-profile-scraper instead
- Profile API is not running on the server

**Tune the settings when:**
- Scraping 50+ profiles -- lower rate to 10-15/hr for safety
- Posts are mostly image-heavy (short captions) -- lower `min_word_count` to 0-5
- You need deep topic analysis -- raise `posts_per_profile` to 20-25

**Note:** This module works with **personal profiles only** (e.g. `/in/danieloskarsson`). Company pages return 403 from the Voyager posts endpoint.

---

## Options Guide

| Option | Default | When to Change | What It Does |
|--------|---------|----------------|--------------|
| `posts_per_profile` | 10 | Raise to 15-25 for deeper analysis; lower to 3-5 for quick sampling | Number of recent posts to fetch per profile. API max is 25 |
| `requests_per_hour` | 20 | Lower to 10-15 for safety; raise to 30-40 for faster throughput (riskier) | Minimum time between API calls. 20/hr = ~3 min between profiles |
| `min_word_count` | 10 | Set to 0 to include image-only posts; raise to 25+ for text-heavy posts only | Skip posts with fewer words (filters link shares, image posts with short captions) |
| `source` | `entity_field` | Switch to `profile_scraper` if entities don't have linkedin fields but linkedin-profile-scraper has already run | Where to find LinkedIn slugs. `entity_field` reads entity.linkedin/linkedin_url. `profile_scraper` reads from pool items |

**Most impactful option:** `posts_per_profile` -- at 10 posts x 20 profiles = 200 items. At 25 posts x 20 profiles = 500 items. More posts = richer data but longer runtime.

---

## Recommended Configurations

### Standard
For a curated list of iGaming executives with linkedin fields:
```
posts_per_profile: 10
requests_per_hour: 20
min_word_count: 10
source: entity_field
```

### Deep Analysis
When you need comprehensive post history for content analysis:
```
posts_per_profile: 25
requests_per_hour: 20
min_word_count: 5
source: entity_field
```

### Quick Sample
When you just need a few recent posts per profile:
```
posts_per_profile: 3
requests_per_hour: 30
min_word_count: 0
source: entity_field
```

### From Profile Scraper Output
When using linkedin-profile-scraper output as the slug source:
```
posts_per_profile: 10
requests_per_hour: 20
min_word_count: 10
source: profile_scraper
```

---

## What Good Output Looks Like

**Healthy result:**
- `status`: `success`
- `word_count`: 20-500 (typical LinkedIn post)
- `engagement_total`: > 0 (reactions + comments + reshares)
- `post_type`: `text`, `article`, `image`, `carousel`, `video`, `poll`
- `hashtags`: populated array for posts that use hashtags

**Output fields:**
- `post_id` -- LinkedIn's internal post ID (unique key)
- `linkedin_slug` -- the profile slug this post belongs to
- `author_name` -- display name from the profile
- `posted_at` -- ISO timestamp extracted from LinkedIn's Snowflake ID
- `post_type` -- `text`, `article`, `image`, `carousel`, `video`, `poll`, `reshare`, `unknown`
- `text` -- full post text content
- `text_preview` -- first 200 characters (for table display)
- `word_count` -- number of words in the post
- `reactions_count` -- likes/celebrates/supports/etc
- `comments_count` -- number of comments
- `reshares_count` -- number of reposts
- `engagement_total` -- reactions + comments + reshares
- `hashtags` -- array of hashtag strings (without #)
- `mentions` -- array of mentioned profile slugs
- `is_reshare` -- whether this is a repost of someone else's content
- `original_author_slug` -- if reshare, the original author's slug
- `status` -- `success` or `error`
- `error` -- error message if status is error, null otherwise

**Warning signs:**
- `voyager_status: "session_expired"` in summary -- re-login via VNC
- All profiles returning errors -- Profile API down or Chrome not running
- Many posts filtered (0 posts with >= N words) -- lower `min_word_count` or profiles post mostly images
- Circuit breaker triggered -- 3+ consecutive failures, likely session issue

---

## Cost

**Free.** Uses the authenticated Chrome session via the Profile API -- no paid API calls. Only cost is compute time (~2-5 seconds per profile for the API call).

**Throughput:**
| Rate | Profiles/Hour | 20 Profiles | 50 Profiles |
|------|---------------|-------------|-------------|
| 10/hr (conservative) | 10 | ~2 hours | ~5 hours |
| 20/hr (default) | 20 | ~1 hour | ~2.5 hours |
| 30/hr (fast) | 30 | ~40 min | ~1.7 hours |

---

## Limitations

- **Personal profiles only** -- company page posts return 403 from LinkedIn's Voyager API
- **No fallback API** -- unlike linkedin-profile-scraper, there is no paid fallback when Voyager fails
- **Rate limited by design** -- sequential, one profile at a time with enforced delays
- **Post count varies** -- LinkedIn may return fewer posts than requested for some profiles
- **Voyager queryId rotation** -- LinkedIn periodically rotates the GraphQL queryId. When posts return 404/400, use the discovery script on Hetzner to find the new queryId (see Profile API README)
- **Reshare text** -- for reshared posts, the `text` field contains the resharer's commentary, not the original post content

---

## What Happens Next

Post data flows into **Step 4 (content-filter / intent-tagger)** which can use post topics and engagement signals to assess entity relevance. In **Step 5 (content-analyzer / content-writer)**, post data provides:

- **Topic discovery** -- hashtags and post text reveal what topics a person is active in
- **Engagement benchmarking** -- reaction/comment counts show which topics resonate with their audience
- **Voice & tone reference** -- actual post text shows how a person communicates, useful for content-writer tone matching
- **Recency signals** -- `posted_at` timestamps show how active someone is on LinkedIn

The `text` field is stored via `downloadable_fields` in `submodule_run_item_data`, so downstream modules that declare `requires_columns: ["text"]` will receive the full post content on demand without it bloating the pool.

---

## Technical Reference

- **Step:** 3 (Scraping)
- **Category:** linkedin
- **Cost:** medium
- **Data operation:** add (+) -- produces new post items
- **Item key:** `post_id`
- **Depends on:** none (reads from entity fields by default)
- **Input:** `input.entities[]` with `linkedin` or `linkedin_url` field
- **Output:** `{ results[], summary }` grouped by entity_name
- **Selectable:** true -- operators can pick which posts to carry forward
- **Detail view:** header (post_id, status badge, author_name, post_type, posted_at, word_count, engagement_total, reactions, comments) + section (Post Content as prose)
- **External dependencies:** `tools.http` (Profile API calls), `tools.logger`, `tools.progress`, `tools._partialItems`
- **Environment variables:** `LINKEDIN_API_URL` (default `http://localhost:3847`), `LINKEDIN_API_KEY` (default `oig-pipeline-2026`)
