# CLAUDE.md -- Content Creation Tool v2 (Modules Repo)

## ⛔ STOP -- READ THIS ENTIRE FILE BEFORE WRITING ANY CODE

This repo contains pluggable submodules for the Content Creation Tool. Each submodule is self-contained: manifest + execute function + optional React component.

---

## 🚫 Rules

1. **NEVER import skeleton code.** Modules are standalone. No imports from content-pipeline-v2.
2. **NEVER access the database directly.** Use the tools object provided to execute().
3. **NEVER use raw fetch/axios.** Use tools.http for all HTTP requests.
4. **Each module folder is completely self-contained.**
5. **manifest.json is required.** No manifest = module doesn't exist.

---

## 📁 Folder Pattern

```
modules/
├── step-1-discovery/
│   ├── sitemap-parser/
│   │   ├── manifest.json     (required)
│   │   ├── execute.js        (required)
│   │   ├── README.md         (required)
│   │   └── OptionsPanel.jsx  (optional -- custom options UI)
│   └── rss-feeds/
│       ├── manifest.json
│       ├── execute.js
│       └── README.md
└── ...
```

---

## Skills

- **`/submodule-create`** -- Use when creating a new submodule. Contains the full manifest template, execute.js contract, tools reference, return format, and step-by-step workflow.
- **`/submodule-readme`** -- Use when documenting, describing, or explaining a submodule. Generates README files and handles conversational descriptions ("what does X do", "how should I configure X for Y", "compare X and Y").

---

## Step 8 Bundling -- Data-Shape Routing

Step 8 submodules use **data-shape routing**: they find input by checking which FIELDS exist on pool items (`content_markdown`, `analysis_json`, `seo_plan_json`), never by checking `source_submodule`. This allows new upstream producers to be added without modifying Step 8 code.

```javascript
// CORRECT -- find by data shape
const markdownItems = (entity.items || []).filter(item => item.content_markdown);

// WRONG -- never do this in Step 8
const writerItems = entity.items.filter(item => item.source_submodule === 'content-writer');
```

All five Step 8 submodules use `requires_columns: []`, `item_key: "entity_name"`, `data_operation_default: "transform"`.

| Submodule | Category | Cost | Input shapes | Output |
|-----------|----------|------|--------------|--------|
| markdown-output | formatting | cheap | content_markdown + analysis_json | Clean .md with YAML frontmatter |
| html-output | formatting | cheap | content_markdown + analysis_json | HTML with schema.org JSON-LD |
| json-output | data | cheap | all three shapes | Strapi-ready/flat JSON |
| meta-output | seo | cheap | seo_plan_json + analysis_json | Validated SEO metadata |
| media-output | media | medium | analysis_json + content_markdown | Media URL manifest |

**Dependencies:** `marked` (html-output), `js-yaml` (markdown-output) -- added to root package.json.

---

## 🧩 Parallel Submodule Development (decided 2026-03-20)

Submodules are pure functions with a defined contract (`input.entity` in, `{ entity_name, items, meta }` out). They can be built independently by a second Claude Code session, a freelancer, or work in claude.ai. No skeleton changes needed.

**28 research briefs** at `Content-Pipeline/specs/submodule-briefs/` -- each contains: input/output contract, approach, external dependencies, edge cases, cost estimate, and example output.

### Planned Submodule Inventory (28 briefs)

**Step 1 -- Discovery (9)**
| Brief | Description | Key dependencies |
|-------|-------------|-----------------|
| ai-discovery-scout | LLM generates multi-query search strategies, classifies by lead type | tools.ai, SERPApi |
| google-pse-news | Curated iGaming news whitelist via Google Custom Search | Google CSE API |
| google-pse-directories | Configurable directory list (AskGamblers, ThePogg, etc.) -- one submodule, not per-directory | Google CSE API |
| seed-url-builder | Auto-generate /about, /products, /press paths, HEAD-validate | tools.http |
| linkedin-discovery | Find LinkedIn company page via Google search, extract metadata from snippet | SERPApi |
| youtube-podcast-discovery | Find channels, videos, podcast episodes via search + YouTube Data API | YouTube Data API |
| social-media-discovery | Find Twitter/X, Telegram, Instagram, Facebook profiles | SERPApi |
| curated-list-import | Import known-source Google Sheets lists, search for entity mentions | Google Sheets API |
| image-logo-search | Find logos via Clearbit API, Google Images, website scraping | Clearbit, SERPApi |

**Step 2 -- Validation (1)**
| Brief | Description | Key dependencies |
|-------|-------------|-----------------|
| learned-validator | Rule-based URL scorer with shadow mode, evolves toward ML | tools.ai (shadow) |

**Step 3 -- Scraping (2)**
| Brief | Description | Key dependencies |
|-------|-------------|-----------------|
| media-transcript-fetcher | YouTube CC/ASR transcripts, podcast show notes | YouTube Data API |
| api-data-fetcher | Structured data from YouTube Data API, podcast RSS, future Crunchbase | APIs |

**Step 4 -- Filtering (2)**
| Brief | Description | Key dependencies |
|-------|-------------|-----------------|
| boilerplate-stripper | Cross-page fingerprinting to remove shared nav/footer/cookie text | -- |
| intent-tagger | Classify pages as About/Products/Press/Careers/etc. | tools.ai |

**Step 5 -- Generation (5)**
| Brief | Description | Key dependencies |
|-------|-------------|-----------------|
| seo-keyword-researcher | Real keyword data from Ahrefs/SERPApi/GSC/autocomplete | Ahrefs API, SERPApi |
| tone-seo-editor | Separate B2B tone + keyword integration pass after content-writer | tools.ai |
| image-generator | Stable Diffusion/DALL-E for branded visuals | Image gen API |
| video-generator | Runway/Pika for short explainers (high cost, default OFF) | Video gen API |
| audio-tts-generator | ElevenLabs/Play.ht for narrated profiles | TTS API |

**Step 6 -- QA (4)**
| Brief | Description | Key dependencies |
|-------|-------------|-----------------|
| keyword-sufficiency-checker | Validate keyword density and placement against SEO plan | -- |
| meta-compliance-checker | Meta title ≤60 chars, description 150-160 chars | -- |
| citation-coverage-checker | Every factual claim must cite a source | -- |
| hallucination-detector | LLM comparison of claims against source material | tools.ai |

**Step 8 -- Bundling (1)**
| Brief | Description | Key dependencies |
|-------|-------------|-----------------|
| schema-org-injector | JSON-LD structured data (Organization, Product, FAQPage) | -- |

**Step 9 -- Distribution (3)**
| Brief | Description | Key dependencies |
|-------|-------------|-----------------|
| strapi-publisher | Push profiles to Strapi CMS via REST API | Strapi API |
| google-docs-exporter | Create editorial review documents | Google Docs API |
| google-sheets-logger | Control panel row upserts with status, QA metrics, links | Google Sheets API |

**Step 10 -- Review (1)**
| Brief | Description | Key dependencies |
|-------|-------------|-----------------|
| loop-router | Read QA verdicts, recommend routing (loop to discovery/generation/tone, or approve) | tools.ai |

---

## Decision Log

This project uses automated decision logging via a PostToolUse hook.
A shell script fires after every Claude tool call and writes session checkpoints to Supabase every 60 minutes -- zero tokens, fully automatic.

For important decisions, write a detailed entry:

```sql
INSERT INTO decision_log (project_name, entry_type, summary, decision_made, alternatives_rejected, reasoning, source)
VALUES ('content-pipeline-modules-v2', 'decision', 'What was decided', 'The choice made', 'What was rejected', 'Why this choice', 'manual');
```

Entry types: decision | progress | blocker | idea

## Session Log

### Session: 2026-03-21 21:00 - API scraper submodule creation
**Accomplished:**
- Created api-scraper submodule (Step 3.3) with manifest.json, execute.js, README.md
- ScrapFly API integration with ASP (Anti-Scraping Protection) + JS rendering
- Three-layer Cloudflare block detection: raw HTML markers, extracted text markers, duplicate text detection
- Wayback Machine fallback when ScrapFly returns block pages
- Block page detection on incoming items (upstream browser-scraper block pages re-scraped)
- 6 commits: initial creation + 5 iterative bug fixes based on live testing

**Decisions:**
- Separate submodule (not integrated into browser-scraper) -- costs money per API call
- Geo-location defaults to empty (auto-select by ScrapFly)
- Duplicate text detection: 3+ pages with identical text = block page
- Concurrency default: 2 (conservative to avoid rate limits and credit burn)

**Updated by:** session-closer agent

### Session: 2026-03-22 - Rate limiting, docs, skills
**Accomplished:**
- ScrapFly 429 circuit breaker + reduced retry delays
- Global rate limiter (10 req/min) across concurrent workers
- Comprehensive api-scraper README rewrite (230+ lines)
- Created `/submodule-readme` skill for documentation generation + conversational descriptions
- Created `/submodule-create` skill with full manifest template, execute.js contract, tools reference
- Trimmed CLAUDE.md: moved workflow content to skills, kept rules and reference only

**Decisions:**
- Rate limiter is token-bucket, shared across all workers via closure
- Circuit breaker: 3 consecutive 429s = abort remaining URLs
- Skills over CLAUDE.md content: workflows belong in skills, CLAUDE.md stays lean
