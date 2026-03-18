# Test Dummy

> Return fake data after a configurable delay -- for testing the execution pipeline without real HTTP requests.

**Module ID:** `test-dummy` | **Step:** 1 (Discovery) | **Category:** testing | **Cost:** cheap
**Version:** 1.0.0 | **Data Operation:** transform (=)

---

## Background

### The Content Problem This Solves

When developing or testing the pipeline infrastructure (BullMQ job execution, progress reporting, error handling, entity routing, working pool management), you need a module that behaves like a real Step 1 module but does not make any external HTTP requests or require API keys. The test-dummy fills this role: it accepts entities, simulates work with a configurable delay, generates fake URL data, and optionally simulates failures for specific entities.

### How It Fits the Pipeline Architecture

This is a Step 1 Discovery module that sits alongside real crawlers (sitemap-parser, page-links, browser-crawler) but produces synthetic data. It exercises the full module execution contract: receives `input.entities`, uses `tools.logger` and `tools.progress`, returns the standard `{ results[], summary }` response format with per-entity grouping and error handling.

The module is useful for testing:
- BullMQ job creation and processing
- Progress bar updates during execution
- Error handling when an entity fails
- Working pool population with fake items
- Multi-entity pipeline flow without network dependencies

## Strategy & Role

**Why this module exists:** Enable pipeline development and testing without external dependencies. Verify that the execution infrastructure works correctly before testing with real crawlers.

**Role in the pipeline:** Development/testing only. Never used in production pipeline runs.

**Relationship to other steps:**
- **No dependencies** -- completely self-contained
- **Produces fake data** -- output looks like Step 1 URL data but URLs point to .example.com domains
- **Supports error simulation** -- configure `fail_entity` to test error handling paths

## When to Use

**Always use when:**
- Testing pipeline execution infrastructure (BullMQ, workers, progress reporting)
- Verifying error handling with simulated failures
- Demonstrating pipeline flow to new team members without needing real websites

**Never use when:**
- Running production pipeline flows -- output is entirely fake
- Testing scraping or content extraction -- use real modules for that

## Options Guide

| Option | Default | When to Change | Impact |
|--------|---------|----------------|--------|
| `delay_ms` | 1,000ms | Raise to 5-30s to simulate slow modules; lower to 100ms for fast testing | Pause per entity to simulate work. Useful for testing progress bar updates and timeout handling |
| `items_per_entity` | 3 | Raise to 10-50 to test large working pools; lower to 1 for minimal output | Number of fake URL items generated per entity. Each item gets a unique .example.com URL |
| `fail_entity` | `""` (empty) | Set to a company name substring to test error handling | If an entity name contains this string (case-insensitive), the module simulates a failure for that entity. Leave empty to succeed all |

## Recipes

### Quick Pipeline Test
Fast execution with minimal output:
```
delay_ms: 100
items_per_entity: 3
fail_entity: ""
```

### Slow Module Simulation
Simulate a module that takes a long time per entity:
```
delay_ms: 5000
items_per_entity: 3
fail_entity: ""
```

### Error Handling Test
Simulate a failure for a specific entity:
```
delay_ms: 1000
items_per_entity: 3
fail_entity: "CompanyX"
```

### Large Pool Test
Generate many items to stress-test working pool UI:
```
delay_ms: 500
items_per_entity: 50
fail_entity: ""
```

## Expected Output

**Healthy result:**
- N entities processed (one per input entity)
- `items_per_entity` fake URLs per successful entity
- Empty items array for failed entities

**Output fields per item:**
- `url` -- fake URL in format `https://{entity-name-slugified}.example.com/page-{n}`
- `title` -- `"{Entity Name} -- Page {n}"`
- `score` -- random integer between 0 and 100

**Meta fields per entity:**
- `simulated: true` -- always set to indicate this is test data
- `delay_ms` -- the delay that was applied (on successful entities)

**Summary fields:**
- `total_entities` -- number of entities processed
- `total_items` -- total fake items generated across all entities
- `errors` -- array of error messages for failed entities

## Limitations & Edge Cases

- **Output is entirely synthetic** -- URLs point to .example.com and will not resolve. Do not use output for any real processing
- **No requires_columns** -- accepts any entity shape, even empty objects (entity name defaults to "Entity N")
- **Error simulation is substring-based** -- `fail_entity: "test"` will fail any entity whose name contains "test" (case-insensitive), including "Testing Corp" or "Latest Results"
- **No HTTP requests** -- does not use `tools.http` or `tools.browser`. Cannot test network-related error paths
- **Score is random** -- the `score` field uses `Math.random()` and will produce different values on each run

## What Happens Next

Fake items enter the working pool just like real Step 1 output. They can flow through subsequent pipeline steps (Step 2 validation, Step 3 scraping, etc.) but will fail at any step that tries to fetch the .example.com URLs. The test-dummy is primarily useful for testing Step 1 execution and the skeleton infrastructure, not for end-to-end pipeline testing.

## Technical Reference

- **Step:** 1 (Discovery)
- **Category:** testing
- **Cost:** cheap
- **Data operation:** transform (=) -- generates fake data for each entity
- **Requires columns:** none (accepts any entity)
- **Input:** `input.entities[]` with any fields (uses `entity.name` for output)
- **Output:** `{ results[], summary }` where each result has `entity_name`, `items[]` with `url`, `title`, `score`, and `meta` with `simulated: true`
- **Selectable:** false (standard table output)
- **Error handling:** configurable entity failure via `fail_entity` option. Failed entities return empty items array with error message
- **Dependencies:** none (no external packages, no tools.http)
- **Files:** `manifest.json`, `execute.js`
