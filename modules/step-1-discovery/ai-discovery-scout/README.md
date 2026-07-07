# AI Discovery Scout

**Step 1 — Discovery** · `add` · `empty_ok` · cost: `expensive` · v1.0.0

For each entity, an LLM (via `tools.ai`) proposes likely-authoritative URLs from its own model knowledge — the entity's key pages and its profile pages on major public platforms. **Every proposed URL is then verified live** (`HEAD`, `GET` fallback) before it enters the pool. Verification is the anti-hallucination gate and is ON by default — an LLM will confidently invent plausible-looking URLs (canonical brief: `docs/submodule-briefs-rev-2026-07-03/step1-ai-discovery-scout.md`).

**Division of labor (why this is separate from search-discovery):** the scout *proposes from model knowledge* — zero search cost, works where search is noisy. `search-discovery` *finds via a search index* — grounded, but costs per query. Complementary, not overlapping: **the scout runs NO search-API calls.** (The original brief had the scout running Google queries itself; that was deleted to keep the module boundary clean.)

**Rule 13:** code knows only assemble-prompt → parse-JSON → verify-live → emit. Which platforms/directories/registers to prioritize, the model, and the confidence bar all arrive via options/presets. The default prompt carries zero vertical vocabulary.

## Flow

```
entity (name / website / extra columns)
  -> LLM proposes [{url, lead_type, rationale, confidence}]   (tools.ai)
  -> confidence filter + max cap                              (before HTTP, saves calls)
  -> live verification HEAD/GET                               (tools.http — the gate)
  -> emit verified leads (+ optional suggested_queries to meta)
```

## Options

| Option | Default | When to Change | What It Does |
|---|---|---|---|
| `prompt` | generic (below) | Always, per template | The LLM instruction. Placeholders `{entity_name}`, `{entity_website}`, `{entity_context}`, `{max}`. ALL vertical flavor lives here. Blank prompt = loud no-op. |
| `ai_model` | `haiku` | `sonnet`/`opus` for higher-quality proposals in production | Model passed to `tools.ai`. |
| `ai_provider` | `anthropic` | `openai` if routing there | Provider for `tools.ai`. |
| `max_urls_per_entity` | `10` | Lower to cut cost; raise for breadth | Caps leads proposed + verified. Also `{max}` in the prompt. |
| `min_confidence` | `0` | Raise (e.g. `0.6`) to trust only high-confidence leads | Drops low-confidence leads **before** verification (saves HTTP). |
| `keep_unverified` | `false` | `true` **only** with a Step-2 filter behind it | false = drop dead URLs (the gate). true = keep them flagged `verified:false`. |
| `emit_suggested_queries` | `false` | `true` to harvest queries for search-discovery | Adds a prompt section; queries land in `meta.suggested_queries` only, never the pool. |
| `verification_timeout` | `5000` ms | Raise for slow hosts | Per-URL HEAD/GET timeout. |
| `max_concurrent_verifications` | `5` | Lower for politeness; raise for speed | Parallel liveness checks per entity. |

**Default prompt (agnostic):** *"List up to {max} URLs likely to contain authoritative information about the entity below … Return strict JSON: an array of [{url, lead_type, rationale, confidence}] … Only include URLs you are confident actually exist."*

**Company-profiles preset (vertical flavor lives HERE):** *"List up to {max} URLs likely to contain authoritative information about {entity_name} ({entity_website}), a B2B iGaming supplier. Prioritize their About/Press/Compliance pages, their profiles on major industry directories, regulator license registers, and their LinkedIn company page. Return strict JSON …"*

**Job-search preset:** *"List up to {max} URLs useful for researching {entity_name} as a prospective employer: careers page, engineering blog, Glassdoor profile, LinkedIn page, recent press. Return strict JSON …"* — same module, zero code difference.

## Output

Each emitted item: `url` (key), `title` (from the verification `<title>` when the GET path ran, else empty), `lead_type` (free-text label from the LLM — `official`/`profile`/`reference`/…, an emergent label for Step-2 filtering, NOT a code enum), `rationale`, `confidence` (string), `verified` (`"true"`/`"false"`), `status_code`, `found_via: "ai_scout"`, `source: "ai-discovery-scout"`, `entity_name`. Unverified leads are flagged (`flagged_when: verified:"false"`); with `keep_unverified: false` they're dropped instead. `meta.suggested_queries` (newline-joined string) when enabled.

## Edge cases

- **Hallucinated URLs** — the defining risk; the default-on verification gate is the mitigation. Never ship `keep_unverified: true` as a template default without a Step-2 filter behind it.
- **Obscure entities** — the LLM proposes little or generic junk; low `confidence` + verification prunes it; **empty output is normal**, not an error.
- **Prose instead of JSON** — one corrective JSON-only retry (seo-planner v2.2.1 precedent); on a second failure that entity fails loudly (0 items + `error` in meta), other entities proceed.
- **Soft-404s** (200 with "page not found") — pass verification wrongly; accepted by design — Step-3 scraping + Step-4 content-filter catch these. The scout does NOT sniff content.
- **Verification statuses** — 2xx/3xx = verified; everything else (incl. 403/404/5xx) = not verified. `HEAD` first; `GET` fallback on a 405/501 or a HEAD error (and only the GET path yields a title).
- `_partialItems` pushed after every entity — a long multi-entity run survives a mid-run timeout (Rule 10).

## Limitations

- Needs the skeleton's `tools.ai` (`ANTHROPIC_API_KEY`) to run — it is inert (proposes nothing) until wired into a template and given a prompt.
- Verification is liveness only (HTTP status), not relevance — that's Step-2's job (`url-relevance`, `url-filter`).
- Proposals are bounded by model knowledge; it is a *lead generator*, complementary to `search-discovery`'s grounded results.

## What happens next

Verified leads land in the Step-1 pool as `url`-keyed items (`add`, so they augment other discovery output). Step-2 (`url-dedup`/`url-filter`/`url-relevance`) filters them; Step-3 scrapes them. `meta.suggested_queries` is operator-facing metadata for manually seeding a `search-discovery` run.

## Testing

- `node modules/step-1-discovery/ai-discovery-scout/test-ai-discovery-scout.js` — 55 assertions, `tools.ai` + `tools.http` fully mocked, no credentials, no network. Covers the JSON-retry path, the hallucination-drop (dead-URL) gate, confidence pruning, HEAD→GET fallback, suggested-queries, and `$`-replacement-safe prompt interpolation.
- `zsh -c 'source ~/.zprofile; node modules/step-1-discovery/ai-discovery-scout/test-live-ai-discovery-scout.js'` — **live test, PASSED 2026-07-07** (~a couple cents on a haiku-class model; exits 0 harmlessly when `ANTHROPIC_API_KEY` is absent). Part A: real Haiku proposed 15 leads across 3 real entities (OpenAI/Anthropic/GitHub), all parsed as strict JSON on the first attempt, **10 verified live + 5 dropped by the gate**. Part B: deterministic real-HTTP `verifyUrl` — live URL kept (200), 404 dropped, DNS-failure dropped.

## Technical Reference

- **Step:** 1 (Discovery) · **Category:** search · **Cost:** expensive (LLM call/entity + up to N verification requests/entity; 30-min timeout)
- **Data operation:** `add` (+) — net-new leads · **Pool precondition:** `empty_ok` (a discovery/seed module)
- **Required input columns:** `["name"]` (`website`/extra columns used when present)
- **Error handling:** one corrective JSON retry per entity; unrecoverable → that entity fails loudly, others proceed (no total throw); verification failures drop or flag per `keep_unverified`; `_partialItems` per entity.
- **External dependencies:** `tools.ai` (skeleton-managed `ANTHROPIC_API_KEY`), `tools.http`. No SDKs imported (Rule 3).

## Changelog

- **1.0.0** (2026-07-06) — initial version per the canonical revised brief. LLM lead proposal + default-on live-verification gate; corrective JSON retry; suggested-queries to meta; fully agnostic default prompt. 55/55 mocked unit tests. **Live-verified 2026-07-07** against real Haiku + real HTTP (haiku-class run: 15 proposed → 10 verified / 5 dropped across OpenAI/Anthropic/GitHub; deterministic liveness gate keeps 200s, drops 404/DNS-fail).
