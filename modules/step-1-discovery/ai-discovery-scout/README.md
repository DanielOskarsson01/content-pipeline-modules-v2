# AI Discovery Scout

> An LLM proposes likely-authoritative URLs for each entity from its own model knowledge, then every proposed URL is verified live before it enters the pool.

**Module ID:** `ai-discovery-scout` | **Step:** 1 (Discovery) | **Category:** search | **Cost:** expensive
**Version:** 1.0.0 | **Data Operation:** add (+)

---

## What This Module Does

For each entity, an LLM (via `tools.ai`) proposes likely-authoritative URLs from model knowledge -- the entity's key pages and its profile pages on major public platforms. **Every proposed URL is then verified live** (`HEAD`, `GET` fallback via `tools.http`) before it enters the pool. Verification is the anti-hallucination gate and is ON by default -- an LLM will confidently invent plausible-looking URLs (canonical brief: `docs/submodule-briefs-rev-2026-07-03/step1-ai-discovery-scout.md`).

**Division of labor (why this is separate from search-discovery):** the scout *proposes from model knowledge* -- zero search cost, works where search is noisy. `search-discovery` *finds via a search index* -- grounded, but costs per query. Complementary, not overlapping: **the scout runs NO search-API calls.** (The original brief had the scout running Google queries itself; that was deleted to keep the module boundary clean.)

**Rule 13:** code knows only assemble-prompt -> parse-JSON -> verify-live -> emit. Which platforms/directories/registers to prioritize, the model, and the confidence bar all arrive via options/presets. The default prompt carries zero vertical vocabulary.

```
entity (name / website / extra columns)
  -> LLM proposes [{url, lead_type, rationale, confidence}]   (tools.ai)
  -> confidence filter + max cap                              (before HTTP, saves calls)
  -> live verification HEAD/GET                               (tools.http -- the gate)
  -> emit verified leads (+ optional suggested_queries to meta)
```

## When to Use

**Always run when:**
- You want extra lead coverage at zero search-API cost, alongside (or instead of) `search-discovery`
- Entities are established enough that the model plausibly knows their key pages
- Search results for the vertical are noisy and model knowledge is a cleaner first pass

**Skip when:**
- Entities are obscure or newer than the model's knowledge -- the LLM proposes little or generic junk (empty output is normal, not an error, but the LLM call still costs money)
- You need grounded, index-backed results -- that is `search-discovery`'s job
- No `prompt` is configured -- the module is a loud no-op (warns and emits nothing)

**Tune the settings when:**
- Proposals are low quality -- switch `ai_model` to a sonnet/opus-class model
- Too many dead-URL verification drops -- raise `min_confidence` (e.g. `0.6`) to prune before HTTP
- You want to seed `search-discovery` runs -- flip `emit_suggested_queries` on
- Hosts are slow -- raise `verification_timeout`

## Options Guide

| Option | Default | When to Change | What It Does |
|--------|---------|----------------|--------------|
| `prompt` (textarea) | generic (below) | Always, per template preset | The LLM instruction. Placeholders `{entity_name}`, `{entity_website}`, `{entity_context}`, `{max}`. Must ask for strict JSON. ALL vertical flavor lives here. Blank prompt = loud no-op. |
| `ai_model` (select) | `haiku` | sonnet/opus-class for higher-quality proposals in production | Model passed to `tools.ai`. Registry-driven (`values_from: registry.models`) -- see below. |
| `ai_provider` (select) | `anthropic` | Route to another provider from the registry | Provider `tools.ai` routes to. Registry-driven (`values_from: registry.providers`) -- see below. |
| `max_urls_per_entity` (number, 1-50) | `10` | Lower to cut cost; raise for breadth | Caps leads proposed + verified per entity. Also interpolated into the prompt as `{max}`. |
| `min_confidence` (number, 0-1) | `0` | Raise (e.g. `0.6`) to trust only high-confidence leads | Drops low-confidence leads **before** verification (saves HTTP). `0` = keep all. Leads without a numeric confidence are never dropped by this filter. |
| `keep_unverified` (boolean) | `false` | `true` **only** with a Step-2 filter behind it | false = drop dead URLs (the anti-hallucination gate). true = keep them flagged `verified:"false"`. |
| `emit_suggested_queries` (boolean) | `false` | `true` to harvest queries for search-discovery | Adds a prompt section asking for up to 5 search-query strings; they land in `meta.suggested_queries` only, never the pool. |
| `verification_timeout` (number, 1000-30000) | `5000` ms | Raise for slow hosts | Per-URL HEAD/GET timeout during liveness verification. |
| `max_concurrent_verifications` (number, 1-20) | `5` | Lower for politeness; raise for speed | Parallel liveness checks per entity. |

**Registry-driven dropdowns:** `ai_provider` and `ai_model` declare `values_from` (`registry.providers` / `registry.models`) instead of a hardcoded list -- the skeleton populates their values from the shared LLM registry (providers: anthropic, openai, perplexity, gemini, openrouter; models scoped to the default provider). The defaults (`anthropic` / `haiku`) are unchanged.

The most impactful options are `prompt` (the entire vertical strategy lives there) and `keep_unverified` (never flip it true in a template default without a Step-2 filter). Note that the structured entity block (name, website, extra columns) is **always appended** to the prompt, even when a preset doesn't reference the placeholders inline -- the model always sees the raw entity data. Interpolation is `$`-safe: entity values containing `$&`/`$$` sequences are inserted verbatim.

**Default prompt (agnostic):** *"List up to {max} URLs likely to contain authoritative information about the entity below ... Return strict JSON: an array of [{url, lead_type, rationale, confidence}] ... Only include URLs you are confident actually exist."*

## Recommended Configurations

### Standard
For most pipeline runs -- cheap proposals, full verification gate:
```
prompt: (default -- generic; vertical flavor via template preset)
ai_model: haiku
ai_provider: anthropic
max_urls_per_entity: 10
min_confidence: 0
keep_unverified: false
emit_suggested_queries: false
verification_timeout: 5000
max_concurrent_verifications: 5
```

### Production quality
When lead quality matters more than LLM cost:
```
prompt: (template preset with vertical priorities)
ai_model: sonnet
ai_provider: anthropic
max_urls_per_entity: 15
min_confidence: 0.6
keep_unverified: false
emit_suggested_queries: false
verification_timeout: 5000
max_concurrent_verifications: 5
```

### Cost-lean
When running large entity batches and every HTTP call counts:
```
prompt: (default or preset)
ai_model: haiku
ai_provider: anthropic
max_urls_per_entity: 5
min_confidence: 0.7
keep_unverified: false
emit_suggested_queries: false
verification_timeout: 5000
max_concurrent_verifications: 3
```

### Query harvest
When the goal is seeding a `search-discovery` run, not just leads:
```
prompt: (default or preset)
ai_model: haiku
ai_provider: anthropic
max_urls_per_entity: 10
min_confidence: 0
keep_unverified: false
emit_suggested_queries: true
verification_timeout: 5000
max_concurrent_verifications: 5
```

**Preset examples (vertical flavor lives in the `prompt` preset, zero code difference):**

- **Company profiles:** *"List up to {max} URLs likely to contain authoritative information about {entity_name} ({entity_website}), a B2B iGaming supplier. Prioritize their About/Press/Compliance pages, their profiles on major industry directories, regulator license registers, and their LinkedIn company page. Return strict JSON ..."*
- **Job search:** *"List up to {max} URLs useful for researching {entity_name} as a prospective employer: careers page, engineering blog, Glassdoor profile, LinkedIn page, recent press. Return strict JSON ..."*

## What Good Output Looks Like

On the 2026-07-07 live run (haiku-class model, 3 well-known entities), 15 proposed leads yielded 10 verified + 5 dropped by the gate -- a ~30% drop rate is healthy and means the gate is working. For obscure entities, few or zero leads is normal, not an error. Per-entity meta reports `proposed` vs `total_found` vs `dropped` so you can see the gate's effect.

**Output fields** (per item, `url` is the item key):
- `url` -- the verified lead (required)
- `title` -- page `<title>` when the GET verification path ran, else empty (HEAD success yields no title)
- `lead_type` -- free-text label from the LLM (`official`/`profile`/`reference`/...) -- an emergent label for Step-2 filtering, NOT a code enum
- `rationale` -- why the LLM proposed it
- `confidence` -- the LLM's 0-1 confidence (string)
- `verified` -- `"true"`/`"false"`; unverified items are flagged in the UI (`flagged_when: verified:"false"`)
- `status_code` -- HTTP status from verification (`0` = request failed entirely)
- `found_via` -- always `"ai_scout"`
- `source` -- always `"ai-discovery-scout"`
- `entity_name` -- which entity the lead belongs to

`meta.suggested_queries` (newline-joined string) appears when `emit_suggested_queries` is on.

**Warning signs:**
- **Nearly all leads dropped** -- the model is hallucinating URLs for this vertical; raise `min_confidence`, improve the prompt, or switch to a stronger model. Also check `verification_timeout` if the dropped URLs are actually live but slow.
- **`errors` in the summary** ("LLM did not return valid JSON after retry") -- the model ignored the JSON instruction twice; that entity fails loudly (0 items + `error` on its result, `meta.errors: 1`) while other entities proceed. Check the model choice and that the prompt still demands strict JSON.
- **0 proposed across all entities** -- prompt too restrictive, or entities outside model knowledge -- consider `search-discovery` instead.

## Edge Cases

- **Hallucinated URLs** -- the defining risk; the default-on verification gate is the mitigation. Never ship `keep_unverified: true` as a template default without a Step-2 filter behind it.
- **Obscure entities** -- the LLM proposes little or generic junk; low `confidence` + verification prunes it; **empty output is normal**, not an error.
- **Prose instead of JSON** -- one corrective JSON-only retry (seo-planner v2.2.1 precedent) re-asks with the invalid response attached at temperature 0; on a second failure that entity fails loudly, other entities proceed. The parser tolerates code fences, a bare JSON array, an object shape (`{leads, suggested_queries}`), and markdown-laced responses (heading-strip pass).
- **Soft-404s** (200 with "page not found") -- pass verification wrongly; accepted by design -- Step-3 scraping + Step-4 content-filter catch these. The scout does NOT sniff content.
- **Verification statuses** -- 2xx/3xx = verified; everything else (incl. 403/404/5xx) = not verified. `HEAD` first; a definitive 4xx/5xx from HEAD is trusted (no GET); `GET` fallback only on HEAD 405/501 or a HEAD error -- and only the GET path yields a title.
- **Non-http(s) proposals** (`ftp:`, bare domains, empty strings) are silently discarded before verification.
- `_partialItems` pushed after every entity -- a long multi-entity run survives a mid-run timeout (Rule 10).

## Limitations

- Needs the skeleton's `tools.ai` with a configured API key for the selected provider (`ANTHROPIC_API_KEY` for the default `anthropic`) -- and it is inert (proposes nothing) until wired into a template and given a prompt.
- Verification is liveness only (HTTP status), not relevance -- that's Step-2's job (`url-relevance`, `url-filter`).
- Proposals are bounded by model knowledge; it is a *lead generator*, complementary to `search-discovery`'s grounded results.

## What Happens Next

Verified leads land in the Step-1 pool as `url`-keyed items (`add`, so they augment other discovery output). Step-2 (`url-dedup`/`url-filter`/`url-relevance`) filters them; Step-3 scrapes them. `meta.suggested_queries` is operator-facing metadata for manually seeding a `search-discovery` run.

## Testing

- `node modules/step-1-discovery/ai-discovery-scout/test-ai-discovery-scout.js` -- 55 assertions, `tools.ai` + `tools.http` fully mocked, no credentials, no network. Covers the JSON-retry path, the hallucination-drop (dead-URL) gate, confidence pruning, HEAD->GET fallback, suggested-queries, and `$`-replacement-safe prompt interpolation.
- `zsh -c 'source ~/.zprofile; node modules/step-1-discovery/ai-discovery-scout/test-live-ai-discovery-scout.js'` -- **live test, PASSED 2026-07-07** (~a couple cents on a haiku-class model; exits 0 harmlessly when `ANTHROPIC_API_KEY` is absent). Part A: real Haiku proposed 15 leads across 3 real entities (OpenAI/Anthropic/GitHub), all parsed as strict JSON on the first attempt, **10 verified live + 5 dropped by the gate**. Part B: deterministic real-HTTP `verifyUrl` -- live URL kept (200), 404 dropped, DNS-failure dropped.

## Technical Reference

- **Step:** 1 (Discovery)
- **Category:** search
- **Cost tier:** expensive -- LLM call per entity + up to N verification requests per entity; 30-min timeout
- **Data operation:** add (+) -- net-new leads join the pool, upserted by `(url, source_submodule)`
- **Pool precondition:** `empty_ok` -- a discovery/seed module; runs against an empty or populated pool
- **Required input columns:** `["name"]` (`website`/extra columns enrich the prompt when present)
- **Depends on:** nothing (`depends_on: []`)
- **Input format:** `input.entities` -- entity rows with `name` plus any extra columns
- **Output format:** per-entity `{ entity_name, items[], meta: { total_found, proposed, dropped, errors } }` + run summary with per-entity error strings
- **Error handling:** one corrective JSON retry per entity; unrecoverable -> that entity fails loudly (`error` on the result, `meta.errors: 1`), others proceed (no total throw); verification failures drop or flag per `keep_unverified`; `_partialItems` pushed per entity
- **External dependencies:** `tools.ai` (skeleton-managed provider keys, registry-routed), `tools.http`. No SDKs imported (Rule 3).

## Changelog

- **1.0.0** (2026-08-04, manifest-only) -- `ai_model`/`ai_provider` dropdowns became registry-driven (`values_from: registry.models` / `registry.providers`); the skeleton now populates their values from the shared LLM registry instead of a hardcoded list. Defaults unchanged.
- **1.0.0** (2026-07-06) -- initial version per the canonical revised brief. LLM lead proposal + default-on live-verification gate; corrective JSON retry; suggested-queries to meta; fully agnostic default prompt. 55/55 mocked unit tests. **Live-verified 2026-07-07** against real Haiku + real HTTP (haiku-class run: 15 proposed -> 10 verified / 5 dropped across OpenAI/Anthropic/GitHub; deterministic liveness gate keeps 200s, drops 404/DNS-fail).
