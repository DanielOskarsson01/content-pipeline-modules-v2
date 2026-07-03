# Submodule Brief: ai-discovery-scout (revised)

**Step:** 1 — Discovery
**Revised:** 2026-07-03 — pipeline-agnostic redesign (Rule 13). Original archived in `_originals-2026-07-03/`.
**Original goal (unchanged):** Use an LLM to generate intelligent, per-entity discovery leads that other discovery submodules and steps follow up on.
**Build status:** not built
**Design verdict:** new generic module `ai-discovery-scout` — LLM-driven source proposal + HTTP liveness verification. Kept separate per the consolidation directive; scoped so it does NOT duplicate `search-discovery`.

## Goal

For each entity, an LLM (via `tools.ai`) proposes likely authoritative URLs — official site sections, profile pages on well-known platforms, canonical reference pages — from the entity's name/website/description. Every proposed URL is then **verified live via `tools.http`** before entering the pool. Optionally, the LLM also emits suggested search queries as operator-facing metadata for feeding `search-discovery`.

**Division of labor (explicit, to keep the catalog small):** the scout *proposes from model knowledge* (zero search cost, works where search is noisy); `search-discovery` *finds via search index* (grounded, but costs per query). Complementary, not overlapping — the scout executes NO search-API calls. The original brief had the scout executing Google queries itself; that behavior is deleted here because it duplicates search-discovery (module-boundary discipline).

## Design (agnostic)

1. Build LLM prompt from a template (option, presets_enabled) with placeholders `{entity_name}`, `{entity_website}`, `{entity_context}` (any extra entity columns, pre-joined). Generic default prompt: *"List up to {max} URLs likely to contain authoritative information about the entity below: its own key pages and its profile pages on major public platforms. Return strict JSON: [{url, lead_type, rationale, confidence}]. Only include URLs you are confident exist."* — no vertical vocabulary in the default (Rule 13).
2. Parse strict-JSON response (corrective retry on malformed JSON — same pattern as seo-planner v2.2.1).
3. **Verify every URL**: HEAD (GET fallback) via `tools.http`; 2xx/3xx → `verified: "true"`, else drop or keep-flagged per option. Verification is the anti-hallucination gate and is ON by default — an LLM will confidently invent plausible-looking URLs.
4. Emit verified items; push to `tools._partialItems` after each entity (LLM + verification are the slow parts).
5. `lead_type` is a free string from the LLM (e.g. `official`, `profile`, `reference`) — an emergent label for step-2 filtering, NOT an enum validated in code (the original's fixed enum `direct|youtube|linkedin|podcast|image|news` baked a content-type worldview into code; deleted).

**What lives where:** code = prompt assembly, JSON parsing, verification, emission. Template config = prompt flavor, model choice, confidence threshold, lead vocabulary. The operational Rule-13 test passes: every vertical behavior above is a UI-editable template field.

## Module contract

- `item_key`: `url` · `data_operation_default`: `add` · `pool_precondition`: `empty_ok`
- `cost`: `expensive` (LLM call/entity + up to N verification requests/entity)
- `requires_columns`: `["name"]` (website/context columns used when present)
- `_partialItems`: push after each entity completes verification
- Output item: `url`, `title` (from verification response `<title>` when cheaply available, else empty), `lead_type`, `rationale`, `confidence` (string, e.g. `"0.9"`), `verified` (string `"true"`/`"false"`), `status_code`, `found_via: "ai_scout"`, `source: "ai-discovery-scout"`. Suggested queries → `meta.suggested_queries` (newline-joined string; ContentRenderer-safe).

## Options (manifest sketch)

| Option | Type | Default (agnostic) | Notes |
|---|---|---|---|
| `prompt` | textarea, presets_enabled | generic prompt above | ALL vertical flavor goes here via template preset |
| `model` | select | cheap default (haiku-class) | testing-phase convention per repo precedent |
| `max_urls_per_entity` | number | `10` | Also interpolated into prompt as `{max}` |
| `min_confidence` | number | `0` | Drop below threshold before verification (saves HTTP calls) |
| `keep_unverified` | boolean | `false` | `true` = keep dead-URL leads flagged `verified: "false"` instead of dropping |
| `emit_suggested_queries` | boolean | `false` | Adds a second prompt section asking for search queries; output to meta only |
| `verification_timeout` | number | `5000` ms | |
| `max_concurrent_verifications` | number | `5` | |

## Providers (researched 2026-07-03)

| Provider | Env var | Free tier | Pricing | Notes |
|---|---|---|---|---|
| Anthropic via `tools.ai` | skeleton-managed `ANTHROPIC_API_KEY` — **key EXISTS today, live-testable now** | — | Haiku-class per-token (see current API pricing at build time) | `tools.ai` already routes here; prompt-caching enabling (#21) is live in the skeleton — a stable prompt prefix benefits automatically |
| OpenAI | `OPENAI_API_KEY` — exists in skeleton .env | — | — | Only relevant if/when `tools.ai` grows multi-provider routing — not this module's concern; modules never call providers directly (Rule 3) |
| Perplexity Sonar (chat) | `PERPLEXITY_API_KEY` — exists | — | Sonar: $5/1k requests + tokens | A *search-grounded* LLM — attractive hybrid, but it blurs the scout/search boundary; noted as an open question, not the design |

No search-API providers by design (see Goal).

## Example template configurations

**Company-profiles template (iGaming flavor lives HERE) — prompt preset:**
> "List up to {max} URLs likely to contain authoritative information about {entity_name} ({entity_website}), a B2B iGaming supplier. Prioritize: their own About/Press/Compliance pages; their profiles on major industry directories (e.g. SBC, EGR, AskGamblers for B2C brands); regulator license registers; LinkedIn company page. Return strict JSON …"

**Job-search template — prompt preset:**
> "List up to {max} URLs useful for researching {entity_name} as a prospective employer: careers page, engineering blog, Glassdoor profile, LinkedIn page, recent press. Return strict JSON …"

Same module, zero code difference.

## Credentials & testing

- **Live-testable today:** `tools.ai` → existing `ANTHROPIC_API_KEY` (approved reuse). One 3-entity live run ≈ a few cents on a haiku-class model.
- **Unit tests (credential-free):** mocked `tools.ai` returning (a) valid JSON, (b) markdown-wrapped JSON (retry path), (c) hallucinated URLs — with mocked `tools.http` 404ing them; assert drop/keep-flagged behavior, confidence filtering, `_partialItems` per entity, meta.suggested_queries joined as string.
- E2E: template prompt preset wiring, attended session.

## Edge cases & failure modes

- **Hallucinated URLs** — the defining risk; mitigated by default-on verification. Never ship with `keep_unverified: true` as a template default without a step-2 filter behind it.
- Obscure entities → LLM proposes little or generic junk; low `confidence` + verification prunes; empty output is normal.
- LLM returns prose instead of JSON → corrective retry once, then fail that entity loudly (seo-planner v2.2.1 precedent).
- Soft-404s (200 with "page not found") → verification passes wrongly; accept — step-3 scraping + step-4 content-filter catch these; do not build content sniffing into the scout.
- Rate/concurrency: verification fan-out capped by `max_concurrent_verifications`; respect per-domain politeness (reuse skeleton http defaults).

## Open questions

1. Multilingual proposals for international entities (original Q) — a prompt-preset concern, not code; note in template docs.
2. Perplexity Sonar as a grounded-scout variant: one call does propose+search. Worth a spike AFTER both this module and search-discovery exist and their costs are measured — not before (it collapses a boundary we're deliberately drawing).
3. Should `meta.suggested_queries` be able to auto-feed a same-run search-discovery card (routing-level composition), or stay operator-mediated? Defer to multi-card work (sub-plan 4 territory).
