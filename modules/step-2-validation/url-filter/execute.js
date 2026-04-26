/**
 * URL Pattern Filter — Step 2 Validation submodule
 *
 * Takes URLs from Step 1 working pool, filters by:
 *   1. Exclude patterns (regex, one per line)
 *   2. Include patterns (regex, one per line — if set, only matching URLs kept)
 *   3. Optional HTTP status code check — tiered: HEAD first, browser retry
 *      for bot-protected sites (403/429/503)
 *
 * Data operation: REMOVE (➖) — excluded/dead items are removed from pool.
 * Selectable: true — user picks which items to keep during approval.
 */

// Known bot-protection / JS challenge page markers.
// If a browser-fetched page body contains any of these, the page is blocked.
// Review periodically — new CDN providers may use different markers.
// TODO (backlog): Automate marker detection for unknown CDN challenge pages.
const CHALLENGE_MARKERS = [
  'cf-browser-verification',
  'Checking your browser',
  'Just a moment...',
  'cf-challenge-running',
  'Attention Required! | Cloudflare',
  '_cf_chl_opt',
];

async function execute(input, options, tools) {
  const { entities } = input;
  const { logger, http, progress, browser } = tools;
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

  // Phase 1: fast regex filtering (no I/O)
  const patternPassed = [];
  for (let i = 0; i < allItems.length; i++) {
    const item = allItems[i];

    const excludeMatch = matchesAnyPattern(item.url, excludeRegexes);
    if (excludeMatch) {
      logger.info(`Excluded: ${item.url} (matched: ${excludeMatch})`);
      excludedCount++;
      continue;
    }

    if (includeRegexes.length > 0) {
      const includeMatch = matchesAnyPattern(item.url, includeRegexes);
      if (!includeMatch) {
        logger.info(`Excluded: ${item.url} (no include match)`);
        excludedCount++;
        continue;
      }
    }

    patternPassed.push(item);
  }

  logger.info(`Pattern filtering: ${patternPassed.length} passed, ${excludedCount} excluded`);

  // Phase 2: HTTP status check (tiered: HEAD first, browser fallback for bot-protection)
  if (check_status_codes && patternPassed.length > 0) {
    const HEAD_BATCH = 20;
    const HEAD_TIMEOUT = 3000;
    const BROWSER_BATCH = 2;
    const BROWSER_TIMEOUT = 15000;
    let checked = 0;

    // 2a: HEAD check all URLs
    const needsBrowserRetry = [];

    for (let i = 0; i < patternPassed.length; i += HEAD_BATCH) {
      const batch = patternPassed.slice(i, i + HEAD_BATCH);

      const batchResults = await Promise.allSettled(
        batch.map(async (item) => {
          try {
            const res = await http.head(item.url, { timeout: HEAD_TIMEOUT });
            return { item, status: res.status, detail: `HTTP ${res.status}` };
          } catch (err) {
            return { item, status: 0, detail: err.message };
          }
        })
      );

      for (const settled of batchResults) {
        const { item, status, detail } = settled.value || settled.reason || {};
        if (status >= 200 && status < 400) {
          results.push({ url: item.url, status: 'kept', matched_pattern: null, entity_name: item.entity_name });
          keptCount++;
        } else if ([403, 429, 503].includes(status)) {
          needsBrowserRetry.push(item);
        } else {
          logger.info(`Dead link: ${item.url} (${detail})`);
          deadLinkCount++;
        }
      }

      checked += batch.length;
      progress.update(checked, patternPassed.length, `HEAD check ${checked}/${patternPassed.length}`);
    }

    // 2b: Browser retry for bot-protected URLs
    if (needsBrowserRetry.length > 0) {
      logger.info(`Browser retry: ${needsBrowserRetry.length} URLs returned 403/429/503 from HEAD`);
      let browserChecked = 0;

      for (let i = 0; i < needsBrowserRetry.length; i += BROWSER_BATCH) {
        const batch = needsBrowserRetry.slice(i, i + BROWSER_BATCH);

        const batchResults = await Promise.allSettled(
          batch.map(async (item) => {
            try {
              const res = await browser.fetch(item.url, {
                timeout: BROWSER_TIMEOUT,
                waitForNetworkIdle: true,
              });
              const body = res.body || '';
              const hasChallenge = CHALLENGE_MARKERS.some(m => body.includes(m));

              let alive;
              if (hasChallenge) {
                // Challenge markers present → blocked regardless of status or body size
                alive = false;
              } else if (res.status >= 200 && res.status < 400) {
                alive = true;
              } else if (body.length > 1000) {
                // Non-2xx but substantial content without challenge markers → passed challenge
                logger.info(`Browser: ${item.url} returned HTTP ${res.status} but has ${body.length} chars without challenge markers — treating as alive`);
                alive = true;
              } else {
                alive = false;
              }

              return { item, alive, detail: `Browser: HTTP ${res.status}, body ${body.length} chars${hasChallenge ? ', CHALLENGE DETECTED' : ''}` };
            } catch (err) {
              // browser.fetch() runtime error (Playwright crash, OOM) — treat as dead, don't retry
              return { item, alive: false, detail: `Browser error: ${err.message}` };
            }
          })
        );

        for (const settled of batchResults) {
          const { item, alive, detail } = settled.value || settled.reason || {};
          if (alive) {
            results.push({ url: item.url, status: 'kept', matched_pattern: null, entity_name: item.entity_name });
            keptCount++;
          } else {
            logger.info(`Dead link (browser confirmed): ${item.url} (${detail})`);
            deadLinkCount++;
          }
        }

        browserChecked += batch.length;
        progress.update(
          patternPassed.length + browserChecked,
          patternPassed.length + needsBrowserRetry.length,
          `Browser retry ${browserChecked}/${needsBrowserRetry.length}`
        );
      }
    }
  } else {
    // No status check — all pattern-passed items are kept
    for (const item of patternPassed) {
      results.push({
        url: item.url,
        status: 'kept',
        matched_pattern: null,
        entity_name: item.entity_name,
      });
      keptCount++;
    }
    progress.update(patternPassed.length, patternPassed.length, `${patternPassed.length} URLs passed`);
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
