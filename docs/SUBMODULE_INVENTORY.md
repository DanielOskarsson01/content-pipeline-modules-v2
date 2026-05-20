# Submodule Inventory

39 built, 18 planned. Each submodule is a pure function with a defined contract (`input.entities[]` in, `{ results[], summary }` out) containing `manifest.json` and `execute.js`.

Last updated: 2026-05-20

---

## Step 1 -- Discovery (9)

| Module ID | Path | Description | Cost |
|-----------|------|-------------|------|
| `api-search` | `modules/step-1-discovery/api-search/` | Generic REST API search. Supports keyword-search APIs and feed APIs via provider config | cheap |
| `browser-crawler` | `modules/step-1-discovery/browser-crawler/` | Extract URLs using a headless browser (Playwright). Fallback for Cloudflare-protected sites | expensive |
| `csv-discovery` | `modules/step-1-discovery/csv-discovery/` | Import items from CSV files in a local directory. Reads all unprocessed CSVs, maps columns | cheap |
| `deep-links` | `modules/step-1-discovery/deep-links/` | Second-pass link extraction from the working pool. Reads URLs discovered by sibling modules | expensive |
| `page-links` | `modules/step-1-discovery/page-links/` | Extract URLs from homepage HTML by parsing navigation, header, footer, and optional sections | cheap |
| `rss-feeds` | `modules/step-1-discovery/rss-feeds/` | Discover RSS and Atom feed URLs by probing common paths (/feed, /rss, /atom.xml, etc.) | cheap |
| `seed-url-builder` | `modules/step-1-discovery/seed-url-builder/` | Generate candidate URLs from known high-value paths (/about, /press, /careers, etc.) | cheap |
| `sitemap-parser` | `modules/step-1-discovery/sitemap-parser/` | Discover URLs from XML sitemaps. Fetches sitemap.xml and nested sitemap indexes | medium |
| `test-dummy` | `modules/step-1-discovery/test-dummy/` | Returns fake data after a short delay -- for testing the execution pipeline | cheap |

## Step 2 -- Validation (4)

| Module ID | Path | Description | Cost |
|-----------|------|-------------|------|
| `url-canonicalizer` | `modules/step-2-validation/url-canonicalizer/` | Resolves redirects to canonical URLs. Sends HEAD requests and replaces with final destination | cheap |
| `url-dedup` | `modules/step-2-validation/url-dedup/` | Remove duplicate URLs across all entities in a single pass. Supports URL normalization | cheap |
| `url-filter` | `modules/step-2-validation/url-filter/` | Filter URLs using regex include/exclude patterns and optional HTTP status code validation | medium |
| `url-relevance` | `modules/step-2-validation/url-relevance/` | LLM-based URL relevance classification. Sends URL slugs, link text, and source labels | medium |

## Step 3 -- Scraping (5)

| Module ID | Path | Description | Cost |
|-----------|------|-------------|------|
| `api-scraper` | `modules/step-3-scraping/api-scraper/` | Paid API fallback for pages that failed both page-scraper and browser-scraper | expensive |
| `browser-scraper` | `modules/step-3-scraping/browser-scraper/` | Re-scrape pages that failed text extraction using Playwright Chromium with CMS-aware extraction | expensive |
| `linkedin-post-scraper` | `modules/step-3-scraping/linkedin-post-scraper/` | Fetch recent LinkedIn posts via the Profile API. Modes: posts (default, Voyager) | medium |
| `linkedin-profile-scraper` | `modules/step-3-scraping/linkedin-profile-scraper/` | Scrape LinkedIn profiles (experience, education, skills) or job descriptions via API | expensive |
| `page-scraper` | `modules/step-3-scraping/page-scraper/` | Fetch HTML pages and extract text content using Readability with CMS-aware fallbacks | expensive |

## Step 4 -- Filtering (3)

| Module ID | Path | Description | Cost |
|-----------|------|-------------|------|
| `boilerplate-stripper` | `modules/step-4-filtering/boilerplate-stripper/` | Remove navigation menus, cookie banners, footer disclaimers, and repeated boilerplate text | cheap |
| `content-filter` | `modules/step-4-filtering/content-filter/` | Safety-net filter for low-quality pages. Most checks overlap with Step 2 validation | cheap |
| `intent-tagger` | `modules/step-4-filtering/intent-tagger/` | Classify each scraped page by content type using LLM classification against user-defined intents | medium |

## Step 5 -- Generation (7)

| Module ID | Path | Description | Cost |
|-----------|------|-------------|------|
| `content-analyzer` | `modules/step-5-generation/content-analyzer/` | Structural fact extraction from scraped content. Classifies into categories (fixed schema) | expensive |
| `content-writer` | `modules/step-5-generation/content-writer/` | AI-powered long-form content generation. Writes content using analysis (required) and SEO plan | expensive |
| `cv-generator` | `modules/step-5-generation/cv-generator/` | Generates a tailored CV DOCX from analysis results and pre-approved CV content | cheap |
| `job-analyzer` | `modules/step-5-generation/job-analyzer/` | 5-layer analysis of a job ad against CV content. Produces fit score, variant selection | expensive |
| `seo-planner` | `modules/step-5-generation/seo-planner/` | Keyword distribution planner. Maps target keywords to predefined article sections | medium |
| `tone-seo-editor` | `modules/step-5-generation/tone-seo-editor/` | Post-writing editing pass that refines content for B2B tone and SEO keyword integration | medium |

## Step 6 -- QA (5)

| Module ID | Path | Description | Cost |
|-----------|------|-------------|------|
| `citation-coverage-checker` | `modules/step-6-qa/citation-coverage-checker/` | Verify that every factual claim in the generated content is backed by a citation | cheap |
| `hallucination-detector` | `modules/step-6-qa/hallucination-detector/` | Compare generated content claims against original source material to flag statements not in sources | medium |
| `keyword-sufficiency-checker` | `modules/step-6-qa/keyword-sufficiency-checker/` | Validate that generated content includes target SEO keywords at the right density | cheap |
| `meta-compliance-checker` | `modules/step-6-qa/meta-compliance-checker/` | Validate meta titles and descriptions against SEO constraints: title max length, description range | cheap |
| `qa-structural` | `modules/step-6-qa/qa-structural/` | Check format spec adherence: heading hierarchy, section count, FAQ presence, word counts | cheap |

## Step 7 -- Routing (1)

| Module ID | Path | Description | Cost |
|-----------|------|-------------|------|
| `loop-router` | `modules/step-7-routing/loop-router/` | Read QA verdicts from Step 6 and route failed entities back to the appropriate earlier step | cheap |

## Step 8 -- Bundling (6)

| Module ID | Path | Description | Cost |
|-----------|------|-------------|------|
| `company-media` | `modules/step-8-bundling/company-media/` | Discover company visual assets by fetching key pages (homepage, /about, /team, /press) | medium |
| `html-output` | `modules/step-8-bundling/html-output/` | Convert content-writer Markdown to HTML. Supports schema.org Organization JSON-LD injection | cheap |
| `json-output` | `modules/step-8-bundling/json-output/` | Assemble structured JSON per entity from all pipeline data (content-analyzer, SEO, QA, etc.) | cheap |
| `markdown-output` | `modules/step-8-bundling/markdown-output/` | Produce clean publishable Markdown from content-writer output. Strips internal markers | cheap |
| `meta-output` | `modules/step-8-bundling/meta-output/` | Assemble validated SEO metadata from seo-planner output: meta title and description | cheap |
| `schema-org-injector` | `modules/step-8-bundling/schema-org-injector/` | Generate Schema.org structured data (JSON-LD) for company profiles -- Organization, Product, FAQPage | cheap |

---

# Planned Submodules (18 briefs -- not yet built)

Research briefs at `Content-Pipeline/specs/submodule-briefs/` -- each contains: input/output contract, approach, external dependencies, edge cases, cost estimate, and example output.

**Key corrections from original plan:**
- PSE Directories: one submodule with configurable directory list, not one per directory
- Curated List Import: separate from PSE -- imports pre-built Google Sheets lists
- AI Discovery Scout runs first -- generates leads that downstream discovery submodules follow up
- Image & Logo Search: added to Step 1 (was missing)
- SEO Keyword Researcher: uses real tools (Ahrefs, SERPApi, GSC), not LLM-guessed keywords
- Media Transcript Fetcher: moved from Step 5 to Step 3 (scraping is where it belongs)
- Step 5 media enrichment: split into three (Image Generator, Video Generator, Audio/TTS Generator)

## Step 1 -- Discovery (8 planned)

| Brief | Description | Key dependencies |
|-------|-------------|-----------------|
| ai-discovery-scout | LLM generates multi-query search strategies, classifies by lead type | tools.ai, SERPApi |
| google-pse-news | Curated iGaming news whitelist via Google Custom Search | Google CSE API |
| google-pse-directories | Configurable directory list (AskGamblers, ThePogg, etc.) -- one submodule, not per-directory | Google CSE API |
| linkedin-discovery | Find LinkedIn company page via Google search, extract metadata from snippet | SERPApi |
| youtube-podcast-discovery | Find channels, videos, podcast episodes via search + YouTube Data API | YouTube Data API |
| social-media-discovery | Find Twitter/X, Telegram, Instagram, Facebook profiles | SERPApi |
| curated-list-import | Import known-source Google Sheets lists, search for entity mentions | Google Sheets API |
| image-logo-search | Find logos via Clearbit API, Google Images, website scraping | Clearbit, SERPApi |

## Step 2 -- Validation (1 planned)

| Brief | Description | Key dependencies |
|-------|-------------|-----------------|
| learned-validator | Rule-based URL scorer with shadow mode, evolves toward ML | tools.ai (shadow) |

## Step 3 -- Scraping (2 planned)

| Brief | Description | Key dependencies |
|-------|-------------|-----------------|
| media-transcript-fetcher | YouTube CC/ASR transcripts, podcast show notes | YouTube Data API |
| api-data-fetcher | Structured data from YouTube Data API, podcast RSS, future Crunchbase | APIs |

## Step 5 -- Generation (4 planned)

| Brief | Description | Key dependencies |
|-------|-------------|-----------------|
| seo-keyword-researcher | Real keyword data from Ahrefs/SERPApi/GSC/autocomplete | Ahrefs API, SERPApi |
| image-generator | Stable Diffusion/DALL-E for branded visuals | Image gen API |
| video-generator | Runway/Pika for short explainers (high cost, default OFF) | Video gen API |
| audio-tts-generator | ElevenLabs/Play.ht for narrated profiles | TTS API |

## Step 9 -- Distribution (3 planned)

| Brief | Description | Key dependencies |
|-------|-------------|-----------------|
| strapi-publisher | Push profiles to Strapi CMS via REST API | Strapi API |
| google-docs-exporter | Create editorial review documents | Google Docs API |
| google-sheets-logger | Control panel row upserts with status, QA metrics, links | Google Sheets API |
