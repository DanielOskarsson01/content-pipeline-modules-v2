# Rule 13 Rollout Brief — agnostic manifests across all submodules

**Created:** 2026-06-09
**For:** Any session (or 2nd project) executing the Rule-13-rollout work across the remaining submodules.
**Status of work covered by this brief:** seo-planner v2.2.0 and content-writer v1.6.0 are DONE. Everything else needs the same treatment.

This document captures what we learned today shipping the pilot work, the exact pattern that worked, the gotchas to avoid, and the suggested order to attack the remaining submodules. Read all of it before starting.

---

## The rule (CLAUDE.md Rule 13)

> If a change cannot be made by editing a template in the UI (prompt, model, reference docs, or any `preset_map` field), then it lives in code (submodule `execute.js`, manifest defaults, or skeleton routes), and code MUST be 100% pipeline-agnostic. Submodule code and manifest defaults must not be optimized for whichever pipeline is in production today.

**Operational test:** *Can this be expressed as configuration a template uploads via the UI?*

- YES → put it there (template `preset_map` overrides, stored in Supabase, editable via UI)
- NO → it lives in code, and code must work equally well for every current and future content type (company profiles today; cover letters, news articles, podcasts, marketplace, etc. tomorrow)

---

## Current state inventory (Step 5 + Step 6)

| Submodule | Version | Manifest default agnostic? | `requires_prompt_override` option? | Status |
|---|---|---|---|---|
| **content-writer** | v1.6.0 | ✓ YES | ✓ YES | DONE 2026-06-09 |
| **seo-planner** | v2.2.0 | ✓ YES | ✓ YES | DONE 2026-06-08 |
| content-analyzer | v1.4.0 | ✗ NO — opens with "You are an iGaming industry analyst" | ✗ NO | **TODO** |
| tone-seo-editor | v1.2.0 | partial (prompt OK; `TONE_STYLES` dict hardcoded in execute.js) | ✗ NO | **TODO** — BACKLOG Item 20 has the migration plan |
| citation-coverage-checker | v1.0.0 | no LLM prompt default (code-based checker) | n/a | likely no work needed |
| hallucination-detector | v1.0.0 | has 1,542-char prompt — needs audit | ✗ NO | **AUDIT** |
| keyword-sufficiency-checker | v1.0.0 | no LLM prompt default | n/a | likely no work needed |
| meta-compliance-checker | v1.0.0 | no LLM prompt default | n/a | likely no work needed |
| qa-structural | v1.0.0 | no LLM prompt default | n/a | likely no work needed |

Step 1-4 submodules have not been audited against Rule 13 in detail. Quick scan recommended.

---

## The pattern that worked — per-submodule checklist

Apply these steps in order for each submodule that needs the refactor:

1. **Read the existing manifest.json.** Identify what's pipeline-specific in `options_defaults.prompt` and `options[name=prompt].default`.

2. **Rewrite the prompt default as agnostic.** Strip company-profile / iGaming / B2B vocabulary. The default should be runnable for any content type — a generic content writer / analyst / editor — but produce sensible output even without a template override.

3. **Add `requires_prompt_override` boolean manifest option, default `false`.** Per-template fail-loud flag. Description should explain templates flip it to `true` when they depend on pipeline-specific output shape.

4. **Keep `options[name=prompt].default` and `options_defaults.prompt` byte-identical.** This is **load-bearing**. The refusal check uses strict equality (`options.prompt === MANIFEST_DEFAULT_PROMPT`). If the two copies drift, the refusal fails silently.

5. **Load the manifest at module init in execute.js:**
   ```js
   const MANIFEST = require('./manifest.json');
   const MANIFEST_DEFAULT_PROMPT = MANIFEST.options_defaults.prompt;
   ```

6. **Add the refusal block at `execute()` entry, BEFORE the per-entity loop:**
   ```js
   if (requires_prompt_override === true && promptTemplate === MANIFEST_DEFAULT_PROMPT) {
     const errMsg = "Template requires a <submodule-name> prompt override but none is configured. Upload a prompt override in this template's <submodule-name> settings, or unset requires_prompt_override on this template.";
     logger.error(`<submodule-name> refused run: ${errMsg}`);
     for (const entity of entities) {
       errors.push(`${entity.name}: ${errMsg}`);
       results.push({ entity_name: entity.name, items: [buildErrorItem(entity.name, errMsg)], meta: { status: 'error' } });
     }
     if (tools._partialItems) { tools._partialItems.length = 0; tools._partialItems.push(...results.flatMap(r => r.items)); }
     return {
       results,
       summary: {
         total_entities: entities.length,
         total_items: 0,
         description: `0/${entities.length} items processed — refused: template requires prompt override`,
         errors,
       },
     };
   }
   ```

7. **Destructure `requires_prompt_override` from options** in the execute signature.

8. **Write a 4-scenario refusal matrix unit test.** Mirror `seo-planner/test-refusal.js`:
   - A: flag=true + default prompt → MUST refuse, 0 items, error message names cause, refusal logged, fires BEFORE any LLM call
   - B: flag=true + custom override → proceeds
   - C: flag=false + default → proceeds (agnostic default is legitimate run path)
   - D: flag missing (undefined) + default → proceeds (handles strict `=== true`)

9. **Write manifest-sanity assertions.** Assert version bumped, both prompt copies byte-identical, forbidden vocabulary absent (OnlyiGaming, iGaming, B2B, company-profile-specific words for the pipeline you're refactoring out of).

10. **Bump manifest version.** Minor bump (e.g. 1.4.0 → 1.5.0). Major only if downstream consumers break — which they shouldn't, since the agnostic default still produces valid output.

11. **PATCH the Supabase template for each existing pipeline.** For company-profile template (`6c4b2311-be72-4a8c-b0d0-1e7bdaf3db30` — "7th june 17.15"): add `requires_prompt_override: true` to `preset_map.<sub>.fallback_values`. If a prompt override doesn't already exist there, add one matching what was the old hardcoded default. Same for any other live pipeline (e.g. job-search if applicable to this submodule).

12. **Update repo snapshot file** if one exists in `modules/step-<N>-<step-name>/pipeline-<type>/<sub>_prompt.md`. Note in the header that it's a snapshot of Supabase canonical state, with the sync date.

13. **Run code-review per project Rule 9.** Spawn the code-review agent.

14. **Write a decision_log entry in Supabase.** (Required by the pre-commit hook within 15 minutes of commit.)

15. **Commit + push.** CI auto-deploys (the workflow is fixed as of 2026-06-09 commit `d45e20f` — it now mirrors `deploy.sh`'s `pm2 delete all && pm2 start ecosystem.config.cjs && pm2 save` pattern).

16. **Verify on production.** Read the file on Hetzner, check PM2 uptime, run the unit test on prod.

---

## Lessons learned — gotchas, painful iterations, things that bit us

### 1. Don't write per-content-type extraction logic in execute.js

When content-writer needed to anchor the model against narrative drift, the first attempt was a function called `extractAllowedSlugs(analyzerItem)` that knew about `categories.primary[].slug`, `tags.existing[].slug`, etc. — fields that are specific to the company-profile content-analyzer output shape. User called this out as a Rule 13 violation. Reverted.

The agnostic replacement was a generic `walkSlugPath(obj, path)` function that takes a dot-notation path, plus a per-template `<Label>=<path>` textarea config in the manifest. Templates declare what to extract and what labels to use. The submodule code knows nothing about "category" or "tag" or "company-profile" as specific concepts.

**Rule for the 2nd project:** Before writing extraction logic that reads specific JSON paths, ask: "Can this be expressed as a textarea config string that a template uploads?" If yes, that's the right shape. If no, the implementation must work equally well for every current and future content type — i.e. generic walker + per-template path config.

### 2. Manifest defaults must be RUNNABLE, not deliberate trip-wires

The brutal-critic agent initially proposed making manifest defaults "deliberate trip-wires" — i.e. set `requires_prompt_override: true` in `options_defaults` so the submodule refuses to run unless a template explicitly provides an override. We rejected this. The pattern we shipped is: agnostic default that's runnable + opt-in fail-loud flag per template.

**Why:** A pipeline that doesn't configure an override (intentional or by neglect) should still be able to run the agnostic default and produce sensible output. Templates that depend on specific shape opt INTO failure mode.

### 3. The byte-identical prompt rule is easy to miss

Two places hold the same prompt value: `options[name=prompt].default` (inside the `options` array) AND `options_defaults.prompt`. If they drift, the refusal check fails silently because strict equality `options.prompt === MANIFEST_DEFAULT_PROMPT` will be false. Unit tests must assert equality explicitly. No commit hook catches it.

### 4. Sonnet ignores prompt-only constraints under narrative pressure

content-writer's first slug-fidelity attempt was a prompt rule pointing at `analysis.categories.primary[].slug` — asking the model to walk the JSON and use the slug character-for-character. Sonnet ignored it. Production output included `[Primary Category: platform-provider]` instead of `casino-platforms`. Diagnosis: 60K characters of scraped source content repeatedly saying "platform provider" drowned the structural rule.

**Solution:** Precompute the closed-vocabulary block in code (`renderAllowedSlugsBlock`), prepend it to entity_content **above** the narrative source pages, and have the prompt rule **reference the block as authoritative**. The pattern is: closed-vocabulary block + prompt rule referencing the block. Prompt rule alone is not enough.

### 5. Downstream consumer schema tolerance audit BEFORE changing output shape

content-writer reads `seo_plan_json.meta.title` (single field). meta-compliance-checker handles 4 shapes (`head_terms[]`, `target_keywords.primary`, `target_keywords.secondary[]`, `keywords[]`). keyword-sufficiency-checker handles 3 shapes. tone-seo-editor handles 2.

Before changing a submodule's output shape, grep for all downstream consumers. Confirm their tolerance covers the new shape. Otherwise the chain breaks silently.

### 6. The pre-commit hook needs a decision_log entry within 15 minutes

Every commit on either repo (skeleton and modules-v2) is gated on a recent decision_log entry in Supabase (project `zgfvgghfkkbrbiunsgry`, table `decision_log`). Easy to forget. Write the entry BEFORE attempting commit. Use the `SUPABASE_ANON_KEY` env var.

### 7. The skeleton's `tools.ai.complete` does NOT pass `response_format` through

For any provider. We confirmed this in the seo-planner v2.2.0 work. Provider-conditional JSON enforcement (e.g. OpenAI's `response_format: { type: "json_object" }`) is currently not supported. Prompt-level enforcement + defensive parser is the only line of defense. Don't assume `response_format` works.

### 8. The 5-iteration churn (process gap)

content-writer's fix went through 5 iterations: haiku → sonnet+prompt → sonnet+JSON-paths → hardcoded extraction (REVERTED) → agnostic allowed_slug_paths. Iteration 4 was a clear Rule 13 violation that the user had to intervene to catch.

**CTO's recommended workflow rule (carry into the 2nd project):** Before writing fix code, name the architectural rule it could violate. Cite CLAUDE.md sections by line. Failure to cite blocks the edit. This single check would have collapsed iterations 3-4 into iteration 5 directly.

---

## Bugs already fixed in today's session — do NOT re-introduce

### 1. The reopen-handler `run_submodule_config` delete (skeleton)

`server/routes/runs.js:810` (was) deleted `run_submodule_config` rows for the affected step range on every reopen-step call. This silently stripped template-level prompt overrides + model choices + reference-doc selections + per-run UI edits. We removed the delete (commit `5a78b93`). If anyone touches the reopen handler in the future, do NOT re-introduce this pattern. Settings (configuration) must survive reopen; only execution data (results, pools, runs) gets wiped.

### 2. The Perplexity URL bug (skeleton)

`server/workers/stageWorker.js` was hitting `https://api.perplexity.ai/v1/chat/completions` — Perplexity returns 404 on that path. The correct URL has no `/v1/` prefix: `https://api.perplexity.ai/chat/completions`. Fix shipped in commit `1347281`. If the 2nd project adds a new search provider with a similar pattern, double-check the base URL.

### 3. The `parseResearchQueries` splitting bug (seo-planner)

`execute.js` was splitting `research_queries` on every newline instead of on `Query N —` markers. This turned a 3-query template into 26 single-line queries. Fix shipped 2026-06-07 commit `ae1ec4f`. The current implementation handles both marker-based and per-line formats with a shared preamble.

### 4. The CI deploy workflow PM2 race (modules-v2)

`pm2 restart stage-worker pipeline-api` raced with manual `deploy.sh` runs and reported "Process 1 not found." The CI workflow now mirrors `deploy.sh` exactly: `pm2 delete all && pm2 start /opt/content-pipeline-v2/ecosystem.config.cjs && pm2 save`. If the 2nd project adds a new repo with auto-deploy, mirror this pattern.

### 5. `research_queries.maxLength` was arbitrary (seo-planner)

The textarea cap was 3,000 chars — the company-profile template hit it mid-Q4. Raised to 8,000. The 2nd project should audit other manifest fields with arbitrary `maxLength` values. Round numbers that don't relate to real constraints are suspect.

---

## Suggested order for the 2nd project

| # | Target | Why this order |
|---|---|---|
| 1 | **content-analyzer** | Biggest active Rule 13 violation. 3,550-char default prompt opens with "You are an iGaming industry analyst" and bakes in B2B / company-profile assumptions. High value, well-understood scope. A cleaner version was drafted in the 2026-06-09 session (relies on `{doc:master_categories.md}` only, drops the inline 83-slug list). Apply the v2.2.0 / v1.6.0 pattern. |
| 2 | **tone-seo-editor** (BACKLOG Item 20) | `TONE_STYLES` dict in `execute.js:16-46` + a `select` dropdown is a clear Rule 13 violation. Migration plan is in BACKLOG Item 20 — drop the dropdown, drop the dict, drop the `{tone_instructions}` placeholder, tone lives 100% in reference_docs + prompt textarea. Affected templates need their stored prompt amended before the option is removed. |
| 3 | **hallucination-detector** | 1,542-char prompt default exists. Audit it for pipeline-specific framing. If it has any, refactor the same way. |
| 4 | **Step 1-4 audit** | Discovery / scraping / filter modules have less LLM exposure but may have hardcoded pipeline assumptions (URL patterns, content-type-specific rules, scraping heuristics tuned for one vertical). Quick scan, low expected hit rate. |

---

## Reference files for the 2nd project

Read these in order before starting:

| File | Why |
|---|---|
| `content-pipeline-modules-v2/CLAUDE.md` Rules 1-13 | The architectural rules, especially Rule 13 (UI-editability test) added 2026-06-09 |
| `modules/step-5-generation/seo-planner/manifest.json` + `execute.js` | Canonical reference for the agnostic-manifest + refusal-flag pattern |
| `modules/step-5-generation/content-writer/manifest.json` + `execute.js` | Second reference, including the `allowed_slug_paths` agnostic config-driven extraction pattern |
| `modules/step-5-generation/seo-planner/test-refusal.js` | Test template for the 4-scenario refusal matrix |
| `modules/step-5-generation/content-writer/test-allowed-slugs.js` | Test template for agnostic-mechanism proofs |
| `modules/step-5-generation/pipeline-company-profiles/content_writer_prompt.md` | Reference for the snapshot-file pattern (Supabase canonical, repo file as dated snapshot) |
| `BACKLOG.md` Items 2, 20 | Item 2 = Step 5 content-type flexibility (partial). Item 20 = tone-seo-editor work (fully specified) |

---

## Decision log + git history pointers

For the 2nd project to understand WHY decisions were made:

| Commit / Decision log entry | What it documents |
|---|---|
| `03b3a91 feat(seo-planner): v2.2.0` | seo-planner agnostic + refusal pattern, first instance |
| `927a6cd feat(content-writer): v1.5.0` | content-writer `allowed_slug_paths` agnostic extraction config |
| `25fb8e5 feat(content-writer): v1.6.0` | content-writer agnostic manifest default + refusal flag — closes the brutal-critic gap |
| `5a78b93 fix(reopen): preserve run_submodule_config` | Skeleton reopen-handler fix |
| `d45e20f ci(deploy): mirror deploy.sh PM2 lifecycle` | CI workflow fix (PM2 race) |
| `3f209d9 docs(backlog): reframe Item 20 against Rule 13` | BACKLOG Item 20 updated to reflect Rule 13 codification |
| Decision log entries 2026-06-09 in `content-pipeline-modules-v2` project | Per-commit reasoning, alternatives rejected, full context |

---

## What success looks like for the 2nd project

After the rollout is complete:

- Every Step 5 submodule has an agnostic manifest default + `requires_prompt_override` option
- Every Step 5 submodule has a 4-scenario refusal test matrix passing
- The company-profile template has `requires_prompt_override: true` on every relevant submodule (fail-loud if any override is removed)
- The same set of submodules can be configured for a future content type (news, podcast, cover letters, marketplace) entirely via template UI edits — no code changes
- CLAUDE.md Rule 13 has zero known violations in Step 5 submodules
- BACKLOG Items 2 and 20 are closed
