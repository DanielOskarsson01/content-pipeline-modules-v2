# Submodule Research Brief: SEO Keyword Researcher

**Step:** 5 — Generation
**One-line purpose:** Fetch real keyword data (search volume, difficulty, ranking positions) from SEO tools and search APIs to replace LLM-guessed keywords with actual market data.

---

### What goes in?

Entity with name, category, and optionally items from content-analyzer (analysis_json with category assignments). The analyzer tells us WHAT the company does; this submodule finds what people SEARCH FOR related to that.

### What comes out?

Real keyword data per entity. Items: entity_name, keywords[] with { keyword, search_volume, difficulty, current_rank (if ranking), intent (informational|commercial|transactional), source_tool }.

### Approach

**Data sources (in priority order):**

1. **Google Search Console API** (free, if entity's site is verified): actual impressions, clicks, CTR, position for the entity's domain. Gold standard — real data for pages we're writing about.

2. **SERPApi / DataForSEO**: search `"{company_name}" + category terms`, analyze SERP features, extract "People Also Ask" questions, related searches. ~$0.005/query.

3. **Ahrefs API** (if available, $99+/mo): keyword explorer for category terms, competitor keyword gaps, content gap analysis.

4. **Google Autocomplete**: free, no auth. `"{company_name} "` → see what Google suggests. Captures real user search behavior.

5. **Fallback**: If no paid tools available, use Google search "People Also Ask" + autocomplete only. Free but less data.

### How This Connects to Other Step 5 Submodules

- **Runs before seo-planner.** The keyword researcher provides REAL data; the seo-planner uses it to build the content plan.
- Replaces the current flow where seo-planner uses LLM-guessed keywords from category keyword packs.
- The content-writer then uses the seo-planner's output (now backed by real data) to write SEO-optimized content.

### External Dependencies

- Google Search Console API (free, OAuth2 setup)
- SERPApi ($50/mo) or DataForSEO ($0.005/query)
- Optional: Ahrefs API ($99+/mo)
- Google Autocomplete (free, no auth, rate-limited)

### Edge Cases and Failure Modes

- New/small company with no Search Console data → fall back to SERPApi + autocomplete
- No paid SEO tools configured → autocomplete-only mode (less data but still real)
- API rate limits → queue and retry, cap queries per entity
- Category not assigned yet (content-analyzer hasn't run) → use entity name + "igaming" as seed terms

### Example Output

```javascript
{
  entity_name: "Evolution Gaming",
  items: [{
    entity_name: "Evolution Gaming",
    keywords: [
      { keyword: "evolution gaming live casino", search_volume: 12100, difficulty: 45, current_rank: null, intent: "commercial", source_tool: "serpapi" },
      { keyword: "evolution gaming stock", search_volume: 8100, difficulty: 30, current_rank: null, intent: "informational", source_tool: "serpapi" },
      { keyword: "evolution gaming careers", search_volume: 2400, difficulty: 15, current_rank: 3, intent: "navigational", source_tool: "search_console" },
    ],
    people_also_ask: [
      "Is Evolution Gaming publicly traded?",
      "What games does Evolution Gaming make?",
      "Where is Evolution Gaming headquartered?",
    ],
    related_searches: ["evolution gaming competitors", "evolution gaming revenue"],
  }],
  meta: { keywords_found: 45, sources_used: ["serpapi", "autocomplete"], search_console_available: false }
}
```
