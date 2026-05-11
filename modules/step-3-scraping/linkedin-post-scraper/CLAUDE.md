When modifying this submodule — fixing bugs, changing logic, adjusting options, altering output schema — update README.md to reflect the changes. The README is the contract operators and downstream modules rely on. Stale docs are worse than no docs.

## Module-Specific Notes

- **Two modes**: `posts` (default, fetch post text + engagement counts, ADD) and `post_engagers` (fetch posts then fan out to get commenters + reactors per post, ADD).
- **Profile API delegation**: Both modes call the LinkedIn Profile API at `localhost:3847` (managed by PM2 as `profile-api`). The profile-api handles CDP connection, session management, Chrome auto-recovery, and Voyager API calls. This submodule is a thin HTTP client.
- **Profile API endpoints used**:
  - `GET /api/posts/:slug` — fetch recent posts for a profile (both modes)
  - `GET /api/post-comments/:activityId` — fetch commenters for a post (post_engagers mode only)
  - `GET /api/post-reactions/:activityId` — fetch reactors for a post (post_engagers mode only)
  - `GET /api/health` — session check (both modes)
  - All require `x-api-key` header.
- **Rate limiting**: `requests_per_hour` option (default 20) — controls pacing between API calls. In `post_engagers` mode each post costs 2 extra API calls (comments + reactions), so effective throughput is lower. The profile-api has its own rate limit (30/min per key) but the submodule rate is the LinkedIn-safe throttle.
- **post_engagers output**: Each post item gets an `engagers` object containing `commenters[]`, `reactors[]`, `resharers[]` (always empty — no Voyager endpoint exists), and `completeness` metadata comparing returned counts to aggregate counts from the posts feed.
- **post_engagers sorting**: Posts are sorted by `engagement_total` descending before fan-out, so the most-engaged posts get processed first within the `posts_per_profile` cap.
- **Backward compatibility**: Running with `mode: posts` (default) produces identical output to pre-v1.1.0. The `engagers` field is only present in `post_engagers` mode.
- **Circuit breaker**: 3 consecutive API failures aborts remaining work. Applies at both profile level (posts fetch) and post level (engager fetch).
- **Environment vars**: `LINKEDIN_API_URL` (Profile API base URL, default `http://localhost:3847`), `LINKEDIN_API_KEY` (API key, default `oig-pipeline-2026`).
- **Endpoint rotation**: If the Voyager endpoints stop working (LinkedIn rotates queryIds), run `scripts/discover-engagers-endpoint.js` on the profile-api server to capture current endpoints, then update `server.js`.
