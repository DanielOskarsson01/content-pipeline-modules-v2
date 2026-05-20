# SEO Planner Enhancement Brief: Keyword Research via Perplexity Search API

## Scope

This brief ONLY covers adding Perplexity-powered keyword research to the seo-planner submodule (Step 5).

It does NOT cover:
- The humanizer submodule (planned as separate new submodule - uses Gemini for voice polish)
- The hallucination-detector in Step 6 QA (separate enhancement - uses Gemini for fact-checking)
- Those are separate briefs.

## What Needs to Change

The SEO planner (v1.3.0) selects keywords based on the LLM's general knowledge. Its own limitations section says: "The LLM selects keywords based on general SEO knowledge, not actual search volume data."

Add a Perplexity Search API pre-step that researches actual keywords from the web before the LLM creates the keyword distribution plan.

## Why

1. Keyword selection is the weakest link - it guesses instead of researching
2. Serves two pipelines: company profiles (existing) AND review articles (SEO/guides/reviews/)
3. Perplexity's Search API is purpose-built for this - returns actual search results with URLs, better than general-purpose LLMs at search synthesis
4. Replaces the need for manually uploaded keyword packs AND eliminates the need for Ahrefs ($129/month)

## Cost

Perplexity Search API: $5 per 1,000 requests. $50 minimum buy covers both pipelines for months:
- 73 category keyword research for review articles = ~500 queries
- Ongoing company profile SEO planning = hundreds more over time

## Two Modes

### Mode 1: Company Keyword Research (existing pipeline)
Input: entity_name, analysis_json (from content-analyzer)
Research queries to Perplexity:
- "What do iGaming operators search for when looking for [company's primary category]?"
- "What keywords does [competitor article] rank for?"
- "What are People Also Ask questions for [category]?"
Output: researched keyword data that replaces manual keyword-summary.md

### Mode 2: Category Keyword Research (review articles pipeline)
Input: category_slug, category_description (from master_categories.md)
Research queries to Perplexity:
- "What do iGaming operators search for when comparing [category] providers?"
- "What are the top ranking comparison articles for [category] and what do they cover?"
- "What audience segments buy [category] products in iGaming?"
- "[vendor A] vs [vendor B] [category]" - check which pairings have search demand
Output: keyword map for entire category cluster (pillar + satellite opportunities)

## Integration with Existing Submodule

- New manifest option: `keyword_research: true/false` (default: true)
- New manifest option: `search_provider: "perplexity" | "gemini"` (default: perplexity, fallback: gemini)
- When enabled, runs Perplexity research BEFORE the main SEO planning LLM prompt
- Research output auto-generates the equivalent of keyword-summary.md
- Existing prompt structure and output schema stay the same
- The content-writer still receives seo_plan_json in the same format

## API Configuration

- Perplexity API key: stored in pipeline environment config (not hardcoded)
- Model: sonar (base, cheapest - $5/1K requests for Search API)
- Docs: https://docs.perplexity.ai/

## Reference Files

- Existing submodule: content-pipeline-modules-v2/modules/step-5-generation/seo-planner/
- Review article strategy: SEO/guides/reviews/SEO_CONTENT_STRATEGY_FINAL.md (Step 2-3)
- Category descriptions: tags/master_categories.md
