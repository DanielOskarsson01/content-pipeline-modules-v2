/**
 * URL Pattern Filter — Step 2 Validation submodule
 *
 * Takes URLs from Step 1 working pool, filters by:
 *   1. Exclude patterns (regex, one per line)
 *   2. Include patterns (regex, one per line — if set, only matching URLs kept)
 *   3. Optional HTTP status code check (GET request, mark non-200 as dead_link)
 *
 * Data operation: REMOVE (➖) — excluded/dead items are removed from pool.
 * Selectable: true — user picks which items to keep during approval.
 */

async function execute(input, options, tools) {
  const { entities } = input;
  const { logger, http, progress } = tools;
  const {
    exclude_patterns = '',
    include_patterns = '',
    check_status_codes = false,
  } = options;

  // Parse regex patterns (one per line, skip empty lines)
  const excludeRegexes = parsePatterns(exclude_patterns, logger);
  const includeRegexes = parsePatterns(include_patterns, logger);

  logger.info(
    `Filter config: ${excludeRegexes.length} exclude patterns, ${includeRegexes.length} include patterns, status check: ${check_status_codes}`
  );

  // Flatten all items across entities, keeping entity association.
  // Supports two input formats:
  //   1. Grouped: [{ name, items: [{ url, ... }] }]  — from previous step re-grouping
  //   2. Flat:    [{ url, ... }]                       — from CSV upload or direct input
  const allItems = [];

  for (const entity of entities) {
    if (entity.items && entity.items.length > 0) {
      for (const item of entity.items) {
        if (!item.url) {
          logger.warn(`Skipping item in ${entity.name}: no url field`);
          continue;
        }
        allItems.push({
          ...item,
          entity_name: entity.name || item.entity_name || 'unknown',
        });
      }
    } else if (entity.url) {
      allItems.push({
        ...entity,
        entity_name: entity.entity_name || entity.name || 'unknown',
      });
    } else {
      logger.warn(
        `Skipping entity: no items array and no url field. Keys: ${Object.keys(entity).join(', ')}`
      );
    }
  }

  logger.info(`Processing ${allItems.length} URLs for filtering`);

  const results = [];
  let keptCount = 0;
  let excludedCount = 0;
  let deadLinkCount = 0;
  const errors = [];

  for (let i = 0; i < allItems.length; i++) {
    const item = allItems[i];

    if (i % 50 === 0 || i === allItems.length - 1) {
      progress.update(i + 1, allItems.length, `Filtering URL ${i + 1} of ${allItems.length}`);
    }

    // Check exclude patterns
    const excludeMatch = matchesAnyPattern(item.url, excludeRegexes);
    if (excludeMatch) {
      results.push({
        url: item.url,
        status: 'excluded',
        matched_pattern: excludeMatch,
        entity_name: item.entity_name,
      });
      excludedCount++;
      continue;
    }

    // Check include patterns (if set, URL must match at least one)
    if (includeRegexes.length > 0) {
      const includeMatch = matchesAnyPattern(item.url, includeRegexes);
      if (!includeMatch) {
        results.push({
          url: item.url,
          status: 'excluded',
          matched_pattern: 'no include match',
          entity_name: item.entity_name,
        });
        excludedCount++;
        continue;
      }
    }

    // Check HTTP status code (uses GET — tools.http has no HEAD method)
    if (check_status_codes) {
      try {
        const res = await http.get(item.url, { timeout: 5000 });
        if (res.status < 200 || res.status >= 400) {
          results.push({
            url: item.url,
            status: 'dead_link',
            matched_pattern: `HTTP ${res.status}`,
            entity_name: item.entity_name,
          });
          deadLinkCount++;
          continue;
        }
      } catch (err) {
        results.push({
          url: item.url,
          status: 'dead_link',
          matched_pattern: `Error: ${err.message}`,
          entity_name: item.entity_name,
        });
        deadLinkCount++;
        continue;
      }
    }

    // URL passed all checks
    results.push({
      url: item.url,
      status: 'kept',
      matched_pattern: null,
      entity_name: item.entity_name,
    });
    keptCount++;
  }

  // Group results by entity for the expected output format
  const byEntity = new Map();
  for (const result of results) {
    if (!byEntity.has(result.entity_name)) {
      byEntity.set(result.entity_name, []);
    }
    byEntity.get(result.entity_name).push(result);
  }

  const entityResults = [];
  for (const [entityName, items] of byEntity) {
    const kept = items.filter((i) => i.status === 'kept').length;
    const excluded = items.filter((i) => i.status === 'excluded').length;
    const dead = items.filter((i) => i.status === 'dead_link').length;
    entityResults.push({
      entity_name: entityName,
      items,
      meta: {
        total: items.length,
        kept,
        excluded,
        dead_links: dead,
        errors: 0,
      },
    });
  }

  const removedCount = excludedCount + deadLinkCount;
  const parts = [];
  if (excludedCount > 0) parts.push(`${excludedCount} excluded by pattern`);
  if (deadLinkCount > 0) parts.push(`${deadLinkCount} dead links`);

  const description =
    removedCount > 0
      ? `${keptCount} kept, ${removedCount} removed (${parts.join(', ')}) of ${allItems.length} total`
      : `${allItems.length} URLs — all passed filters`;

  return {
    results: entityResults,
    summary: {
      total_entities: entities.length,
      total_items: allItems.length,
      kept: keptCount,
      excluded: excludedCount,
      dead_links: deadLinkCount,
      description,
      errors,
    },
  };
}

/**
 * Parse multiline textarea patterns into RegExp array.
 * Skips empty lines and invalid patterns (logs warning).
 */
function parsePatterns(text, logger) {
  if (!text || typeof text !== 'string') return [];

  const regexes = [];
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);

  for (const line of lines) {
    try {
      regexes.push({ regex: new RegExp(line, 'i'), source: line });
    } catch (e) {
      logger.warn(`Invalid regex pattern: "${line}" — ${e.message}. Skipping.`);
    }
  }

  return regexes;
}

/**
 * Check if a URL matches any pattern in the array.
 * Returns the matching pattern string or null.
 */
function matchesAnyPattern(url, patterns) {
  for (const { regex, source } of patterns) {
    if (regex.test(url)) {
      return source;
    }
  }
  return null;
}

module.exports = execute;
