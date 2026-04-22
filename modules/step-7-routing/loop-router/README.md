# Loop Router

Read QA verdicts from Step 6 submodules and route failed entities back to the appropriate earlier step for rework. Pure decision logic -- no API calls, no LLM calls.

| Field | Value |
|-------|-------|
| Module ID | `loop-router` |
| Step | 7 -- Routing |
| Category | routing |
| Cost | cheap |
| Data operation | transform (one routing decision per entity) |

---

## What This Module Does

Aggregates QA verdicts from all Step 6 submodules (keyword-sufficiency-checker, meta-compliance-checker, citation-coverage-checker, hallucination-detector) and applies a priority-ordered routing table to produce a single decision per entity:

- **approve** -- all QA checks passed, entity is ready for bundling/distribution
- **loop_discovery** -- route back to Step 1 for better/more source material
- **loop_generation** -- route back to Step 5 (Content Writer) to regenerate meta fields
- **loop_tone** -- route back to Step 5 (Tone/SEO Editor) to improve keyword integration
- **flag_manual** -- too complex for automated routing, needs human review

This submodule produces routing **recommendations**. It does NOT execute the loops -- the skeleton handles backward routing. In Phase 1/2, the operator acts on these decisions manually.

---

## Routing Rules

Rules are evaluated in priority order. First match wins.

| Priority | Condition | Decision | Reason |
|----------|-----------|----------|--------|
| 1 | Entity looped >= `max_loops` times | `flag_manual` | Max loops exceeded -- reworked too many times |
| 2 | 2+ QA checks failed | `flag_manual` | Multiple failures -- too complex for auto-routing |
| 3 | Hallucination check failed | `loop_discovery` | Need better source material to support claims |
| 3a | ...but source pages < `min_source_pages` | `flag_manual` | Can't gather better sources with so few pages |
| 4 | Citation coverage failed | `loop_discovery` | Need more sources to cite |
| 4a | ...but source pages < `min_source_pages` | `flag_manual` | Can't add citations without more sources |
| 5 | Keyword sufficiency failed | `loop_tone` | Rewrite with better keyword integration |
| 6 | Meta compliance failed | `loop_generation` | Regenerate meta title/description |
| 7 | All checks passed | `approve` | Ready for bundling and distribution |
| 8 | No QA results found | configurable | `default_no_qa` option (default: `flag_manual`) |

---

## When to Use

- **Always** after Step 6 QA submodules have run
- Before manual review of entities in the pipeline
- As the decision layer that determines which entities proceed to Step 8 (bundling) vs. which go back for rework

---

## Input Data

This module uses data-shape routing. It finds its input by checking which fields exist on pool items:

- **QA result items**: items with `qa_pass`, `keyword_score`, `citation_score`, `hallucination_score`, or `meta_title_ok`
- **Source page items**: items with `text_content` (counted to determine if discovery loops are viable)
- **Loop count**: read from `entity.loop_count` or `entity.meta.loop_count` (set by the skeleton on rework)

---

## Options Guide

| Option | Type | Default | What It Does | When to Change |
|--------|------|---------|--------------|----------------|
| `default_no_qa` | string | `"flag_manual"` | Action when no QA results exist for an entity. `"approve"` auto-approves, `"flag_manual"` flags for review. | Set to `"approve"` if Step 6 is optional in your workflow. |
| `max_loops` | number | `3` | Maximum rework iterations before flagging for manual review. | Increase for content that needs many revision passes. Decrease to limit costs. |
| `min_source_pages` | number | `8` | Minimum source pages required for discovery loops. Below this, `loop_discovery` becomes `flag_manual`. | Lower for niche entities with few available sources. Raise for high-quality content requirements. |

---

## Example Output

### Approved entity (all QA passed)

```
entity_name: "Bet365"
decision: "approve"
route_reason: "All QA checks passed. Entity is ready for bundling and distribution."
qa_summary: |
  Keyword Sufficiency: PASS
  Meta Compliance: PASS
  Citation Coverage: PASS
  Hallucination Detection: PASS
failed_checks: "none"
loop_count: 0
source_page_count: 24
```

### Looped entity (hallucination failure)

```
entity_name: "NewCasino"
decision: "loop_discovery"
route_reason: "Unsupported claims detected by hallucination checker. Routing back to Step 1 (Discovery) to gather better source material."
qa_summary: |
  Keyword Sufficiency: PASS
  Meta Compliance: PASS
  Citation Coverage: PASS
  Hallucination Detection: FAIL
failed_checks: "hallucination"
loop_count: 0
source_page_count: 15
```

### Flagged entity (multiple failures)

```
entity_name: "SketchyCorp"
decision: "flag_manual"
route_reason: "Multiple QA failures (keyword, hallucination). Too complex for automated routing -- requires manual review."
qa_summary: |
  Keyword Sufficiency: FAIL
  Meta Compliance: PASS
  Citation Coverage: PASS
  Hallucination Detection: FAIL
failed_checks: "keyword_sufficiency, hallucination"
loop_count: 1
source_page_count: 6
```

### Flagged entity (max loops exceeded)

```
entity_name: "LoopedTooMuch"
decision: "flag_manual"
route_reason: "Max loop count exceeded (3/3). Entity has been reworked too many times without passing QA."
qa_summary: |
  Keyword Sufficiency: FAIL
  Meta Compliance: PASS
  Citation Coverage: PASS
  Hallucination Detection: PASS
failed_checks: "keyword_sufficiency"
loop_count: 3
source_page_count: 12
```

### No QA results (Step 6 skipped)

```
entity_name: "SkippedQA"
decision: "flag_manual"
route_reason: "No QA results found (Step 6 was skipped). Flagged for manual review per configuration."
qa_summary: |
  Keyword Sufficiency: NOT RUN
  Meta Compliance: NOT RUN
  Citation Coverage: NOT RUN
  Hallucination Detection: NOT RUN
failed_checks: "none"
loop_count: 0
source_page_count: 18
```

---

## Output Fields

| Field | Type | Description |
|-------|------|-------------|
| `entity_name` | string | Entity this routing decision applies to |
| `decision` | string | One of: `approve`, `loop_discovery`, `loop_generation`, `loop_tone`, `flag_manual` |
| `route_reason` | string | Human-readable explanation of why this route was chosen |
| `qa_summary` | string | Multi-line summary showing pass/fail/not-run for each QA check |
| `failed_checks` | string | Comma-separated list of failed checks, or "none" |
| `loop_count` | number | How many times this entity has been looped previously |
| `source_page_count` | number | Number of source pages (text_content items) available |

---

## Recommended Configurations

### Standard (default)

Flag entities for manual review when QA is missing or routing is ambiguous. Good for production workflows where a human reviews all decisions.

```
default_no_qa: "flag_manual"
max_loops: 3
min_source_pages: 8
```

### Auto-Approve

For pipelines where Step 6 is optional and you want entities to flow through even without QA. Use when speed matters more than quality gates.

```
default_no_qa: "approve"
max_loops: 5
min_source_pages: 4
```

### Strict

For high-quality content production. Lower source threshold means entities with fewer sources get looped rather than flagged, and max loops is tight to avoid wasting resources.

```
default_no_qa: "flag_manual"
max_loops: 2
min_source_pages: 12
```

---

## Edge Cases

- **No QA results (Step 6 was skipped)**: configurable via `default_no_qa`. Default is `flag_manual`.
- **Entity has been looped 3+ times**: always `flag_manual` with "max_loops_exceeded" regardless of QA state. Prevents infinite rework loops.
- **Insufficient sources for discovery loop**: if hallucination or citation fails but `source_page_count < min_source_pages`, routes to `flag_manual` instead of `loop_discovery`. Can't fix source problems without enough sources to work from.
- **Only some QA checks ran**: routes based on whichever checks are present. Missing checks are treated as "not run" and do not count as failures.
- **Single failure with enough sources**: routes to the appropriate loop target (discovery, tone, or generation).
- **All QA checks missing but items exist**: checks for `qa_pass` field presence on items. Items without any QA-related fields are ignored.

---

## Limitations

- **Does not execute loops.** Produces routing recommendations only. The skeleton (or operator) must act on the decisions.
- **Loop count relies on entity metadata.** If the skeleton does not set `loop_count` on reworked entities, max_loops detection will not work.
- **Priority order is fixed.** The routing rules are evaluated in a hardcoded priority order. Custom priority ordering is not supported.
- **Binary QA verdicts.** Routes based on pass/fail from Step 6. Does not consider partial scores (e.g., a keyword_score of 0.59 vs 0.01 gets the same treatment).

---

## What Happens Next

Routing decisions inform the operator (or future automated skeleton logic):

- **approve**: Entity proceeds to Step 8 (bundling) and Step 9 (distribution)
- **loop_discovery**: Entity goes back to Step 1 (Discovery) for more/better sources, then re-runs Steps 2-6
- **loop_generation**: Entity goes back to Step 5 (Content Writer) to regenerate meta fields, then re-runs Step 6
- **loop_tone**: Entity goes back to Step 5 (Tone/SEO Editor) for keyword optimization, then re-runs Step 6
- **flag_manual**: Entity is held for human review. Operator decides the next action.

---

## Technical Reference

- **Spec**: `Content-Pipeline/specs/SUBMODULE_DEVELOPMENT.md`
- **Pattern**: Data-shape routing (field existence on items, never `source_submodule`)
- **Dependencies**: Upstream Step 6 QA submodules (keyword-sufficiency-checker, meta-compliance-checker, citation-coverage-checker, hallucination-detector)
- **No external API calls**: All routing is local decision logic
- **No AI calls**: Purely deterministic rule-based routing
