/**
 * Content Filter — Step 4 Filtering submodule
 *
 * Filters out low-quality scraped pages based on configurable rules:
 * word count, scrape status, language detection, URL patterns, title keywords.
 *
 * Data operation: REMOVE (−) — items that fail filters get filter_status: 'excluded'.
 * Selectable: true — user can override filter decisions before approval.
 */

// Common English stop words for language detection heuristic
const ENGLISH_STOP_WORDS = new Set([
  'the', 'is', 'and', 'of', 'to', 'in', 'for', 'with', 'that', 'this',
  'are', 'was', 'has', 'have', 'been', 'will', 'from', 'not', 'but',
  'they', 'their', 'which', 'about', 'more',
]);

async function execute(input, options, tools) {
  const { entities } = input;
  const { logger, progress } = tools;
  const {
    min_word_count = 50,
    drop_errors = true,
    require_english = true,
    exclude_title_keywords = 'cookie,privacy,terms,login,404,cart,checkout',
    exclude_url_patterns = '/tag/,/author/,/page/,/category/,/wp-admin/',
  } = options;

  // Parse comma-separated string options into arrays
  const titleKeywords = parseList(exclude_title_keywords);
  const urlPatterns = parseList(exclude_url_patterns);

  logger.info(
    `Filter config: min_words=${min_word_count}, drop_errors=${drop_errors}, require_english=${require_english}, title_keywords=[${titleKeywords.join(',')}], url_patterns=[${urlPatterns.join(',')}]`
  );

  // Flatten all items across entities, keeping entity association
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

  logger.info(`Processing ${allItems.length} items for filtering`);

  const results = [];
  let keptCount = 0;
  let excludedCount = 0;

  // Exclusion reason counters for summary
  const reasonCounts = {
    scrape_failed: 0,
    too_short: 0,
    non_english: 0,
    url_pattern: 0,
    title_keyword: 0,
  };

  for (let i = 0; i < allItems.length; i++) {
    const item = allItems[i];

    progress.update(i + 1, allItems.length, `Filtering ${i + 1} of ${allItems.length}`);

    // --- Filter pipeline (cheapest checks first) ---

    // 1. Drop errors/skipped
    if (drop_errors && (item.status === 'error' || item.status === 'skipped')) {
      results.push(buildResult(item, 'excluded', `Scrape failed: ${item.status}`));
      excludedCount++;
      reasonCounts.scrape_failed++;
      continue;
    }

    // 2. Minimum word count
    const wordCount = item.word_count || 0;
    if (wordCount < min_word_count) {
      results.push(buildResult(item, 'excluded', `Too short: ${wordCount} words (min: ${min_word_count})`));
      excludedCount++;
      reasonCounts.too_short++;
      continue;
    }

    // 3. Language check (English stop words in first 200 chars)
    if (require_english) {
      const textSample = (item.text_content || '').substring(0, 200).toLowerCase();
      const words = textSample.split(/\s+/);
      let stopWordHits = 0;
      for (const word of words) {
        if (ENGLISH_STOP_WORDS.has(word)) stopWordHits++;
      }
      if (stopWordHits < 3) {
        results.push(buildResult(item, 'excluded', 'Non-English content detected'));
        excludedCount++;
        reasonCounts.non_english++;
        continue;
      }
    }

    // 4. URL pattern exclusion (safety net — overlaps with Step 2 url-filter)
    const urlLower = item.url.toLowerCase();
    const matchedUrlPattern = urlPatterns.find((pattern) => urlLower.includes(pattern.toLowerCase()));
    if (matchedUrlPattern) {
      results.push(buildResult(item, 'excluded', `URL pattern: ${matchedUrlPattern}`));
      excludedCount++;
      reasonCounts.url_pattern++;
      continue;
    }

    // 5. Title keyword exclusion
    const titleLower = (item.title || '').toLowerCase();
    const matchedKeyword = titleKeywords.find((kw) => titleLower.includes(kw.toLowerCase()));
    if (matchedKeyword) {
      results.push(buildResult(item, 'excluded', `Title keyword: ${matchedKeyword}`));
      excludedCount++;
      reasonCounts.title_keyword++;
      continue;
    }

    // 6. Passed all filters — kept
    results.push(buildResult(item, 'kept', null));
    keptCount++;
  }

  // Sort: excluded items first so they appear at top of results
  results.sort((a, b) => {
    const order = { excluded: 0, kept: 1 };
    return (order[a.filter_status] ?? 1) - (order[b.filter_status] ?? 1);
  });

  // Group results by entity
  const byEntity = new Map();
  for (const result of results) {
    if (!byEntity.has(result.entity_name)) {
      byEntity.set(result.entity_name, []);
    }
    byEntity.get(result.entity_name).push(result);
  }

  const entityResults = [];
  for (const [entityName, items] of byEntity) {
    const kept = items.filter((i) => i.filter_status === 'kept').length;
    const excluded = items.filter((i) => i.filter_status === 'excluded').length;
    entityResults.push({
      entity_name: entityName,
      items,
      meta: {
        total: items.length,
        kept,
        excluded,
      },
    });
  }

  // Build descriptive summary
  const reasonParts = [];
  if (reasonCounts.too_short > 0) reasonParts.push(`${reasonCounts.too_short} too short`);
  if (reasonCounts.scrape_failed > 0) reasonParts.push(`${reasonCounts.scrape_failed} errors`);
  if (reasonCounts.non_english > 0) reasonParts.push(`${reasonCounts.non_english} non-English`);
  if (reasonCounts.title_keyword > 0) reasonParts.push(`${reasonCounts.title_keyword} title keywords`);
  if (reasonCounts.url_pattern > 0) reasonParts.push(`${reasonCounts.url_pattern} URL patterns`);

  const description =
    excludedCount > 0
      ? `${keptCount} kept, ${excludedCount} excluded (${reasonParts.join(', ')}) of ${allItems.length} total`
      : `${allItems.length} pages — all kept`;

  return {
    results: entityResults,
    summary: {
      total_entities: entities.length,
      total_items: allItems.length,
      kept: keptCount,
      excluded: excludedCount,
      errors: [],
      description,
    },
  };
}

// --- Helper functions ---

function buildResult(item, filterStatus, filterReason) {
  // Build a text_preview for the detail modal (first 300 chars of text_content)
  const textContent = item.text_content || '';
  const textPreview = textContent.length > 300
    ? textContent.substring(0, 300) + '...'
    : textContent;

  return {
    url: item.url,
    title: item.title || null,
    word_count: item.word_count || 0,
    filter_status: filterStatus,
    filter_reason: filterReason,
    text_preview: textPreview,
    text_content: textContent,
    entity_name: item.entity_name,
  };
}

/**
 * Parse a comma-separated string into a trimmed, non-empty array.
 */
function parseList(str) {
  if (!str || typeof str !== 'string') return [];
  return str.split(',').map((s) => s.trim()).filter(Boolean);
}

module.exports = execute;
