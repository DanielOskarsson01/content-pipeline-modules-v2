# Planned Submodule Inventory (28 briefs)

Submodules are pure functions with a defined contract (`input.entity` in, `{ entity_name, items, meta }` out). They can be built independently by a second Claude Code session, a freelancer, or work in claude.ai. No skeleton changes needed.

**Research briefs** at `Content-Pipeline/specs/submodule-briefs/` -- each contains: input/output contract, approach, external dependencies, edge cases, cost estimate, and example output.

**Key corrections from original plan:**
- PSE Directories: one submodule with configurable directory list, not one per directory
- Curated List Import: separate from PSE -- imports pre-built Google Sheets lists
- AI Discovery Scout runs first -- generates leads that downstream discovery submodules follow up
- Image & Logo Search: added to Step 1 (was missing)
- SEO Keyword Researcher: uses real tools (Ahrefs, SERPApi, GSC), not LLM-guessed keywords
- Media Transcript Fetcher: moved from Step 5 to Step 3 (scraping is where it belongs)
- Step 5 media enrichment: split into three (Image Generator, Video Generator, Audio/TTS Generator)

---

## Step 1 -- Discovery (9)

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

## Step 2 -- Validation (1)

| Brief | Description | Key dependencies |
|-------|-------------|-----------------|
| learned-validator | Rule-based URL scorer with shadow mode, evolves toward ML | tools.ai (shadow) |

## Step 3 -- Scraping (2)

| Brief | Description | Key dependencies |
|-------|-------------|-----------------|
| media-transcript-fetcher | YouTube CC/ASR transcripts, podcast show notes | YouTube Data API |
| api-data-fetcher | Structured data from YouTube Data API, podcast RSS, future Crunchbase | APIs |

## Step 4 -- Filtering (2)

| Brief | Description | Key dependencies |
|-------|-------------|-----------------|
| boilerplate-stripper | Cross-page fingerprinting to remove shared nav/footer/cookie text | -- |
| intent-tagger | Classify pages as About/Products/Press/Careers/etc. | tools.ai |

## Step 5 -- Generation (5)

| Brief | Description | Key dependencies |
|-------|-------------|-----------------|
| seo-keyword-researcher | Real keyword data from Ahrefs/SERPApi/GSC/autocomplete | Ahrefs API, SERPApi |
| tone-seo-editor | Separate B2B tone + keyword integration pass after content-writer | tools.ai |
| image-generator | Stable Diffusion/DALL-E for branded visuals | Image gen API |
| video-generator | Runway/Pika for short explainers (high cost, default OFF) | Video gen API |
| audio-tts-generator | ElevenLabs/Play.ht for narrated profiles | TTS API |

## Step 6 -- QA (4)

| Brief | Description | Key dependencies |
|-------|-------------|-----------------|
| keyword-sufficiency-checker | Validate keyword density and placement against SEO plan | -- |
| meta-compliance-checker | Meta title ≤60 chars, description 150-160 chars | -- |
| citation-coverage-checker | Every factual claim must cite a source | -- |
| hallucination-detector | LLM comparison of claims against source material | tools.ai |

## Step 8 -- Bundling (1)

| Brief | Description | Key dependencies |
|-------|-------------|-----------------|
| schema-org-injector | JSON-LD structured data (Organization, Product, FAQPage) | -- |

## Step 9 -- Distribution (3)

| Brief | Description | Key dependencies |
|-------|-------------|-----------------|
| strapi-publisher | Push profiles to Strapi CMS via REST API | Strapi API |
| google-docs-exporter | Create editorial review documents | Google Docs API |
| google-sheets-logger | Control panel row upserts with status, QA metrics, links | Google Sheets API |

## Step 10 -- Review (1)

| Brief | Description | Key dependencies |
|-------|-------------|-----------------|
| loop-router | Read QA verdicts, recommend routing (loop to discovery/generation/tone, or approve) | tools.ai |
