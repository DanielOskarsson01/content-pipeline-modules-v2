# Submodule Research Brief: Learned URL Validator

**Step:** 2 — Validation
**One-line purpose:** Score discovered URLs using rule-based heuristics and learned patterns to identify list pages, teasers, non-content, and duplicates before committing to expensive scraping.

---

### What goes in?

Entity with items (URLs from Step 1). Each item has: url, found_via, title (if available), snippet (if available).

### What comes out?

Same URLs with validation scores and decisions. Items: url, decision (allow|allow_hint|reject), score (0-1), reasons[], validator_version, needs_playwright (boolean).

### Approach

Start with rules, evolve toward ML:

**V1 (rules only — build now):**
1. Path pattern rules: /page/, /category/, /tag/, ?s=, /search/, /privacy/, /terms/, /login/ → reject
2. Known non-content patterns: pagination (/page/2/), author archives, search results
3. URL structure scoring: depth, query params, fragment indicators
4. If title/snippet available: check for list-page indicators ("Page 2 of", "Browse all", "Archive")
5. Consent/JS detection: flag needs_playwright=true for known JS-heavy domains

**V2 (learned — build later):**
6. Train from labeled data (Appendix A in master doc): logistic regression on path tokens, DOM signals, text length
7. Shadow mode first: log decisions but allow all URLs through
8. Promote to enforce per-domain when precision(reject) ≥ 0.95 and false reject rate ≤ 2%

### External Dependencies

None for V1 (pure rule-based). V2 needs labeled training data (manual effort, not API cost).

### Edge Cases and Failure Modes

- New domain with unknown patterns → default to allow (shadow mode)
- Overly aggressive rules → false rejects on legitimate content pages. Mitigation: shadow mode logs everything, promote carefully.
- URL looks like a list page but is actually a useful overview → allow_hint, let user decide

### Example Output

```javascript
{
  entity_name: "Betsson",
  items: [
    { url: "https://igamingbusiness.com/betsson-q3", decision: "allow", score: 0.95, reasons: [], validator_version: "v0.1" },
    { url: "https://igamingbusiness.com/category/operators", decision: "reject", score: 0.15, reasons: ["path_rule: /category/"], validator_version: "v0.1" },
    { url: "https://betsson.com/about", decision: "allow_hint", score: 0.8, reasons: [], needs_playwright: false, validator_version: "v0.1" },
  ],
  meta: { total_urls: 45, allowed: 38, rejected: 5, hints: 2, validator_version: "v0.1" }
}
```
