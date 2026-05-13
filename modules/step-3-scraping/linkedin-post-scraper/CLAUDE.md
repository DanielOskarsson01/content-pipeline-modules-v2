When modifying this submodule — fixing bugs, changing logic, adjusting options, altering output schema — update README.md to reflect the changes. The README is the contract operators and downstream modules rely on. Stale docs are worse than no docs.

## Module-Specific Notes

- **Three modes**: `posts` (default, Voyager, personal profiles), `post_engagers` (Voyager + DOM comments), `feed_posts` (DOM scraping for company pages, groups, and personal feeds).
- **Profile API delegation**: All modes call the LinkedIn Profile API at `localhost:3847` (managed by PM2 as `profile-api`). The profile-api handles CDP connection, session management, Chrome auto-recovery, Voyager API calls, and DOM scraping. This submodule is a thin HTTP client.
- **Profile API endpoints used**:
  - `GET /api/posts/:slug` — fetch recent posts for a personal profile via Voyager (posts, post_engagers modes)
  - `GET /api/feed-posts/:type/:slug` — fetch posts from company/group/profile feeds via DOM scraping (feed_posts mode)
  - `GET /api/post-comments/:activityId` — fetch commenters for a post (post_engagers mode only)
  - `GET /api/post-reactions/:activityId` — not called by this module (removed May 2026). Reaction counts come from Voyager feed response instead.
  - `GET /api/health` — session check (all modes)
  - All require `x-api-key` header.
- **feed_posts mode**: Uses DOM scraping, not Voyager. Works for company pages and groups where Voyager returns 403. Each feed costs 1 API call but takes 30-120s (Chrome navigates, scrolls to load posts, scrapes DOM). Supports up to 200 posts per feed. Entity `linkedin`/`linkedin_url` fields can contain `/company/`, `/groups/`, or `/in/` URLs — the module auto-detects the feed type.
- **Rate limiting**: `requests_per_hour` option (default 20) — controls pacing between API calls. In `post_engagers` mode each post costs 1 extra API call (comments). In `feed_posts` mode each feed costs 1 call but takes much longer. The profile-api has its own rate limit (30/min per key) but the submodule rate is the LinkedIn-safe throttle.
- **post_engagers output**: Each post item gets an `engagers` object containing `commenters[]`, `reactors[]`, `resharers[]` (always empty — no Voyager endpoint exists), and `completeness` metadata comparing returned counts to aggregate counts from the posts feed.
- **post_engagers sorting**: Posts are sorted by `engagement_total` descending before fan-out, so the most-engaged posts get processed first within the `posts_per_profile` cap.
- **Backward compatibility**: Running with `mode: posts` (default) produces identical output to pre-v1.1.0. The `engagers` field is only present in `post_engagers` mode.
- **Circuit breaker**: 3 consecutive API failures aborts remaining work. Applies at both profile level (posts fetch) and post level (engager fetch).
- **Environment vars**: `LINKEDIN_API_URL` (Profile API base URL, default `http://localhost:3847`), `LINKEDIN_API_KEY` (API key, default `oig-pipeline-2026`).
- **Endpoint rotation**: If the Voyager endpoints stop working (LinkedIn rotates queryIds), run `scripts/discover-engagers-endpoint.js` on the profile-api server to capture current endpoints, then update `server.js`.
