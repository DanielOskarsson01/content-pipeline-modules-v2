# Submodule Research Brief: Social Media Discovery

**Step:** 1 — Discovery
**One-line purpose:** Find company social media profiles (Twitter/X, Telegram, Instagram, Facebook) via search.

---

### What goes in?

Entity with name (required). Optional: website.

### What comes out?

Social media profile URLs with platform type. Items: url, platform (twitter|telegram|instagram|facebook), handle, bio_snippet, follower_count (if available from search snippet).

### Approach

1. For each target platform, Google search: `site:{platform_domain} "{company_name}" igaming`
2. Validate results are company pages (not mentions or user posts)
3. Also check: entity's website for social media links in footer/header (tools.http.get homepage → extract social links from HTML)

### External Dependencies

- Google Custom Search API: 1-4 queries per entity per platform
- No platform-specific APIs needed (discovery only, not scraping)

### Edge Cases and Failure Modes

- Social handles don't match company name → low confidence, include but flag
- Company has multiple accounts per platform → return all, let user decide in Step 2
- Telegram channels are hard to find via Google → lower success rate, document honestly

### Example Output

```javascript
{
  entity_name: "LeoVegas",
  items: [
    { url: "https://twitter.com/LeoVegasGroup", platform: "twitter", handle: "@LeoVegasGroup", bio_snippet: "LeoVegas Group - King of Casino" },
    { url: "https://t.me/leovegas_partners", platform: "telegram", handle: "leovegas_partners", bio_snippet: null },
  ],
  meta: { platforms_searched: 4, profiles_found: 3, errors: 0 }
}
```
