# Submodule Research Brief: Google PSE Directory Search

**Step:** 1 — Discovery
**One-line purpose:** Search trusted iGaming directories (AskGamblers, ThePogg, Casinomeister, etc.) via Google Custom Search to find entity listings and review pages.

---

### What goes in?

Entity with name (required). The directory list is configurable via a textarea option — user can add/remove directories per run.

### What comes out?

URLs of directory pages about the entity. Items: url, title, snippet, directory_domain, search_query_used.

### Approach

1. User configures target directories in options textarea (one domain per line, defaults provided)
2. For each entity: build query `"{company_name}" site:{directory_domain}` for each directory
3. Execute via Google Custom Search API
4. Collect 5-15 URLs per entity across all directories
5. Tag with found_via: "pse_directory"

### External Dependencies

- Google Custom Search API: same key as PSE News, separate PSE ID for directories
- Cost: ~$2-3 per 100 entities (fewer queries per entity than news)
- Default directory list: AskGamblers, ThePogg, Casinomeister, Casino.org, iGaming Tracker, LCB, CasinoMeister

### Edge Cases and Failure Modes

- Directory changed its URL structure → search still works (Google indexes current URLs)
- Company not listed on any directory → normal for newer companies, return empty
- Multiple listings on same directory (e.g., review + forum thread) → keep both, dedup in Step 2

### Open Questions

1. Should the default directory list be in the manifest options_defaults or in a reference doc?
2. Should results include which specific directory each URL came from as a field?

### Example Output

```javascript
{
  entity_name: "LeoVegas",
  items: [
    { url: "https://askgamblers.com/online-casinos/leovegas", title: "LeoVegas Casino Review", snippet: "Read our full review...", directory_domain: "askgamblers.com", search_query_used: "LeoVegas site:askgamblers.com" },
  ],
  meta: { directories_searched: 7, queries_executed: 7, total_results: 5, errors: 0 }
}
```
