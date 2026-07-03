# Submodule Research Brief: Curated List Import

**Step:** 1 — Discovery
**One-line purpose:** Import pre-built lists of known industry sources (news sites, authority domains, conference sites, regulator pages) from Google Sheets or reference docs, and search them for entity mentions.

---

### What goes in?

Entity with name (required). A curated source list provided via doc_selector option (reference doc) or textarea (URLs, one per line).

### What comes out?

URLs from curated sources that mention the entity. Items: url, title, snippet, source_list_name, domain.

### Approach

This is NOT a general web search. It searches a known, curated list of high-value sources — sites you've manually identified as authoritative for iGaming.

1. Load curated source list from reference doc or options textarea
2. For each source domain + entity name: Google search `"{company_name}" site:{domain}`
3. Or: if source has RSS feed, search feed for entity mentions
4. Collect matching URLs with metadata
5. Tag with found_via: "curated_list"

### Use Cases

- "Search these 20 news sites for mentions of each company"
- "Search regulator websites for licensing mentions"
- "Search conference/event sites for speaker/sponsor mentions"
- "Search these 5 competitor directories for listings"

### External Dependencies

- Google Custom Search API: N queries per entity × M curated sources (capped by option)
- Reference docs system (already built in skeleton)

### Edge Cases and Failure Modes

- Empty curated list → error: "No source list configured"
- Curated domain is dead → skip, log warning
- Too many curated sources × too many entities = API cost explosion → cap with max_sources_per_entity option

### Example Output

```javascript
{
  entity_name: "Pragmatic Play",
  items: [
    { url: "https://calvinayre.com/pragmatic-play-expansion", title: "Pragmatic Play expands...", snippet: "The supplier announced...", source_list_name: "igaming_news_sites", domain: "calvinayre.com" },
    { url: "https://sbcevents.com/speakers/pragmatic-play", title: "SBC Summit speaker", snippet: "Pragmatic Play VP of...", source_list_name: "conference_sites", domain: "sbcevents.com" },
  ],
  meta: { sources_searched: 15, matches_found: 7, errors: 0 }
}
```
