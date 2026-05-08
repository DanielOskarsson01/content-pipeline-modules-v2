/**
 * URL Deduplicator — Step 2 Validation submodule
 *
 * Takes URLs from Step 1 working pool (attached as entity.items),
 * normalizes them, removes duplicates across all entities, and
 * returns the deduplicated set.
 *
 * Supports two match strategies:
 *   - url: normalize and compare URLs (default, fast, same-source)
 *   - title_company: fuzzy title + exact company match (cross-source dedup)
 *
 * Data operation: REMOVE (➖) — items marked "duplicate" are removed
 * from the working pool; "unique" items remain.
 */

// ── Fuzzy matching helpers ──────────────────────────────────────────

function diceCoefficient(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;

  const bigramsA = new Set();
  for (let i = 0; i < a.length - 1; i++) bigramsA.add(a.slice(i, i + 2));

  const bigramsB = new Set();
  for (let i = 0; i < b.length - 1; i++) bigramsB.add(b.slice(i, i + 2));

  let intersection = 0;
  for (const bg of bigramsA) {
    if (bigramsB.has(bg)) intersection++;
  }

  return (2 * intersection) / (bigramsA.size + bigramsB.size);
}

function stripSeniorityPrefix(title) {
  return title.replace(/^(senior|junior|lead|principal|staff|chief|head of|director of|vp of|vice president of)\s+/i, '');
}

// ── Main ────────────────────────────────────────────────────────────

async function execute(input, options, tools) {
  const { entities } = input;
  const { logger } = tools;
  const {
    match_strategy = 'url',
    fuzzy_threshold = 0.85,
    normalize_www,
    normalize_trailing_slash,
    strip_query_params,
    strip_fragments,
    case_insensitive
  } = options;

  // Flatten all items across entities, keeping entity association and display fields.
  // Supports two input formats:
  //   1. Grouped: [{ name, items: [{ url, ... }] }]  — from previous step re-grouping
  //   2. Flat:    [{ url, ... }]                       — from CSV upload or direct input
  const allItems = [];
  const byEntity = new Map();

  for (const entity of entities) {
    if (entity.items && entity.items.length > 0) {
      for (const item of entity.items) {
        if (!item.url) {
          logger.warn(`Skipping item in ${entity.name}: no url field`);
          continue;
        }
        allItems.push({
          ...item,
          entity_name: entity.name || item.entity_name || 'unknown'
        });
      }
    } else if (entity.url) {
      allItems.push({
        ...entity,
        entity_name: entity.entity_name || entity.name || 'unknown'
      });
    } else {
      logger.warn(`Skipping entity: no items array and no url field. Keys: ${Object.keys(entity).join(', ')}`);
    }
  }

  logger.info(`Processing ${allItems.length} items for deduplication (strategy: ${match_strategy})`);

  const results = [];
  let duplicateCount = 0;

  if (match_strategy === 'title_company') {
    // ── Fuzzy title + exact company matching ──────────────────────
    const companyMap = new Map(); // company_lower -> [{ title_normalized, index }]

    for (let i = 0; i < allItems.length; i++) {
      const item = allItems[i];
      const company = (item.company || '').toLowerCase().trim();
      const titleRaw = (item.title || '').trim();
      const titleNormalized = stripSeniorityPrefix(titleRaw).toLowerCase();

      let isDuplicate = false;
      let duplicateOfItem = null;

      // Only fuzzy match if both title and company exist
      if (company && titleNormalized) {
        if (companyMap.has(company)) {
          for (const existing of companyMap.get(company)) {
            if (diceCoefficient(titleNormalized, existing.title_normalized) >= fuzzy_threshold) {
              isDuplicate = true;
              duplicateOfItem = allItems[existing.index];
              break;
            }
          }
        }
      }

      if (isDuplicate) {
        results.push(buildResult(item, 'duplicate', duplicateOfItem.url));
        duplicateCount++;
      } else {
        // Register as first occurrence
        if (company && titleNormalized) {
          if (!companyMap.has(company)) companyMap.set(company, []);
          companyMap.get(company).push({ title_normalized: titleNormalized, index: i });
        }
        results.push(buildResult(item, 'unique', null));
      }
    }
  } else {
    // ── URL normalization matching (default) ──────────────────────
    const seen = new Map(); // normalized URL -> index

    for (let i = 0; i < allItems.length; i++) {
      const item = allItems[i];
      const normalized = normalizeUrl(item.url, {
        normalize_www,
        normalize_trailing_slash,
        strip_query_params,
        strip_fragments,
        case_insensitive
      });

      if (seen.has(normalized)) {
        const firstItem = allItems[seen.get(normalized)];
        results.push(buildResult(item, 'duplicate', firstItem.url));
        duplicateCount++;
      } else {
        seen.set(normalized, i);
        results.push(buildResult(item, 'unique', null));
      }
    }
  }

  const uniqueCount = allItems.length - duplicateCount;
  logger.info(`Dedup complete: ${uniqueCount} unique, ${duplicateCount} duplicates`);

  // Sort: duplicates first for visibility
  results.sort((a, b) => {
    if (a.status === "duplicate" && b.status !== "duplicate") return -1;
    if (a.status !== "duplicate" && b.status === "duplicate") return 1;
    return 0;
  });

  // Group results by entity
  for (const result of results) {
    if (!byEntity.has(result.entity_name)) {
      byEntity.set(result.entity_name, []);
    }
    byEntity.get(result.entity_name).push(result);
  }

  const entityResults = [];
  for (const [entityName, items] of byEntity) {
    const dupes = items.filter((i) => i.status === "duplicate").length;
    entityResults.push({
      entity_name: entityName,
      items,
      meta: {
        total_found: items.length,
        duplicates: dupes,
        unique: items.length - dupes,
        errors: 0
      }
    });
  }

  const description = duplicateCount > 0
    ? `Found ${duplicateCount} duplicates. ${uniqueCount} unique of ${allItems.length} total (${match_strategy})`
    : `${allItems.length} items — no duplicates found (${match_strategy})`;

  if (tools._partialItems) tools._partialItems.push(...results);

  return {
    results: entityResults,
    summary: {
      total_entities: entities.length,
      total_items: allItems.length,
      unique: uniqueCount,
      duplicates: duplicateCount,
      description,
      errors: []
    }
  };
}

/**
 * Build a result object, carrying through display fields from the source item
 */
function buildResult(item, status, duplicateOf) {
  return {
    url: item.url,
    original_url: item.url,
    title: item.title || null,
    company: item.company || null,
    location: item.location || null,
    source: item.source || null,
    duplicate_of: duplicateOf,
    status,
    entity_name: item.entity_name
  };
}

/**
 * Normalize a URL for comparison based on options
 */
function normalizeUrl(url, opts) {
  try {
    let parsed = new URL(url.startsWith("http") ? url : `https://${url}`);

    if (opts.strip_fragments) {
      parsed.hash = "";
    }

    if (opts.strip_query_params) {
      parsed.search = "";
    }

    let result = parsed.toString();

    if (opts.normalize_www) {
      result = result.replace("://www.", "://");
    }

    if (opts.normalize_trailing_slash) {
      result = result.replace(/\/+$/, "");
    }

    if (opts.case_insensitive) {
      result = result.toLowerCase();
    }

    return result;
  } catch {
    let result = url;
    if (opts.case_insensitive) result = result.toLowerCase();
    if (opts.normalize_trailing_slash) result = result.replace(/\/+$/, "");
    return result;
  }
}

module.exports = execute;
