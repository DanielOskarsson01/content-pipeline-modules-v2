/**
 * URL Deduplicator — Step 2 Validation submodule
 * 
 * Takes URLs from Step 1 working pool (attached as entity.items),
 * normalizes them, removes duplicates across all entities, and
 * returns the deduplicated set.
 * 
 * Data operation: REMOVE (➖) — items marked "duplicate" are removed
 * from the working pool; "unique" items remain.
 */

async function execute(input, options, tools) {
  const { entities } = input;
  const { logger } = tools;
  const {
    normalize_www,
    normalize_trailing_slash,
    strip_query_params,
    strip_fragments,
    case_insensitive
  } = options;

  // Flatten all items across entities, keeping entity association.
  // Supports two input formats:
  //   1. Grouped: [{ name, items: [{ url, ... }] }]  — from previous step re-grouping
  //   2. Flat:    [{ url, ... }]                       — from CSV upload or direct input
  const allItems = [];
  const byEntity = new Map();

  for (const entity of entities) {
    if (entity.items && entity.items.length > 0) {
      // Grouped format: entity has name + items array
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
      // Flat format: entity IS the item (from CSV upload or flat pool)
      allItems.push({
        ...entity,
        entity_name: entity.entity_name || entity.name || 'unknown'
      });
    } else {
      logger.warn(`Skipping entity: no items array and no url field. Keys: ${Object.keys(entity).join(', ')}`);
    }
  }

  logger.info(`Processing ${allItems.length} URLs for deduplication`);

  // Normalize and deduplicate
  const seen = new Map(); // normalized → index into allItems of first occurrence
  const results = [];
  let duplicateCount = 0;

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
      // This is a duplicate — reference the first occurrence
      const firstItem = allItems[seen.get(normalized)];
      results.push({
        url: item.url,
        original_url: item.url,
        duplicate_of: firstItem.url,
        status: "duplicate",
        entity_name: item.entity_name
      });
      duplicateCount++;
    } else {
      // First occurrence — unique
      seen.set(normalized, i);
      results.push({
        url: item.url,
        original_url: item.url,
        duplicate_of: null,
        status: "unique",
        entity_name: item.entity_name
      });
    }
  }

  const uniqueCount = allItems.length - duplicateCount;
  logger.info(`Dedup complete: ${uniqueCount} unique, ${duplicateCount} duplicates`);

  // Sort results: duplicates first, then unique — so they're immediately visible
  results.sort((a, b) => {
    if (a.status === "duplicate" && b.status !== "duplicate") return -1;
    if (a.status !== "duplicate" && b.status === "duplicate") return 1;
    return 0;
  });

  // Group results by entity for the expected output format
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
    ? `Found ${duplicateCount} duplicates. ${uniqueCount} unique of ${allItems.length} total`
    : `${allItems.length} URLs — no duplicates found`;

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
 * Normalize a URL for comparison based on options
 */
function normalizeUrl(url, opts) {
  try {
    let parsed = new URL(url.startsWith("http") ? url : `https://${url}`);

    // Strip fragments
    if (opts.strip_fragments) {
      parsed.hash = "";
    }

    // Strip query params
    if (opts.strip_query_params) {
      parsed.search = "";
    }

    let result = parsed.toString();

    // Normalize www
    if (opts.normalize_www) {
      result = result.replace("://www.", "://");
    }

    // Normalize trailing slash
    if (opts.normalize_trailing_slash) {
      result = result.replace(/\/+$/, "");
    }

    // Case insensitive
    if (opts.case_insensitive) {
      result = result.toLowerCase();
    }

    return result;
  } catch {
    // If URL parsing fails, just do basic string normalization
    let result = url;
    if (opts.case_insensitive) result = result.toLowerCase();
    if (opts.normalize_trailing_slash) result = result.replace(/\/+$/, "");
    return result;
  }
}

module.exports = execute;
