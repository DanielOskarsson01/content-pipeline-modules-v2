/**
 * URL Canonicalizer — Step 2 Validation submodule
 *
 * Resolves redirects by sending HEAD requests and replacing URLs
 * with their final destination. Catches www/non-www, HTTP→HTTPS,
 * path rewrites, and vanity URL redirects.
 *
 * Data operation: TRANSFORM (＝) — URLs are updated in place.
 * Items flagged as "redirected" show the change for user review.
 */

async function execute(input, options, tools) {
  const { entities } = input;
  const { logger, http, progress } = tools;
  const { request_timeout = 5000, concurrency = 20 } = options;

  // Flatten all items across entities
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

  logger.info(`Canonicalizing ${allItems.length} URLs (concurrency: ${concurrency}, timeout: ${request_timeout}ms)`);

  const results = [];
  let redirectCount = 0;
  let unchangedCount = 0;
  let checked = 0;

  // Process in batches
  for (let i = 0; i < allItems.length; i += concurrency) {
    const batch = allItems.slice(i, i + concurrency);

    const batchResults = await Promise.allSettled(
      batch.map(async (item) => {
        try {
          const res = await http.head(item.url, { timeout: request_timeout });
          const finalUrl = res.url || item.url;

          // Normalize for comparison: strip trailing slash differences
          const originalNorm = item.url.replace(/\/+$/, '');
          const finalNorm = finalUrl.replace(/\/+$/, '');

          if (finalNorm !== originalNorm) {
            return {
              item,
              status: 'redirected',
              finalUrl,
              detail: `${item.url} → ${finalUrl}`,
            };
          }
          return { item, status: 'unchanged', finalUrl: item.url, detail: null };
        } catch (err) {
          // Request failed — keep original URL, let url-filter handle liveness
          return { item, status: 'unchanged', finalUrl: item.url, detail: `Error: ${err.message}` };
        }
      })
    );

    for (const settled of batchResults) {
      const { item, status, finalUrl, detail } = settled.value;

      if (status === 'redirected') {
        logger.info(`Redirect: ${detail}`);
        redirectCount++;
        results.push({
          url: finalUrl,
          original_url: item.url,
          status: 'redirected',
          redirect_detail: detail,
          entity_name: item.entity_name,
        });
      } else {
        unchangedCount++;
        results.push({
          url: item.url,
          original_url: item.url,
          status: 'unchanged',
          redirect_detail: detail || null,
          entity_name: item.entity_name,
        });
      }
    }

    checked += batch.length;
    progress.update(checked, allItems.length, `Checked ${checked}/${allItems.length}`);
  }

  logger.info(`Canonicalization complete: ${redirectCount} redirected, ${unchangedCount} unchanged`);

  // Deduplicate by final URL — multiple discovery URLs can resolve to same canonical
  const seenUrls = new Map();
  const dedupedResults = [];
  let dedupCount = 0;
  for (const result of results) {
    const normUrl = result.url.replace(/\/+$/, '').toLowerCase();
    if (seenUrls.has(normUrl)) {
      const existing = seenUrls.get(normUrl);
      logger.info(`Dedup: ${result.original_url} resolves to same canonical as ${existing.original_url} → ${result.url}`);
      dedupCount++;
    } else {
      seenUrls.set(normUrl, result);
      dedupedResults.push(result);
    }
  }
  if (dedupCount > 0) {
    logger.info(`Deduplication: ${dedupCount} duplicate canonical URLs removed`);
  }

  // Group results by entity
  const byEntity = new Map();
  for (const result of dedupedResults) {
    if (!byEntity.has(result.entity_name)) {
      byEntity.set(result.entity_name, []);
    }
    byEntity.get(result.entity_name).push(result);
  }

  const entityResults = [];
  for (const [entityName, items] of byEntity) {
    const redirected = items.filter((i) => i.status === 'redirected').length;
    entityResults.push({
      entity_name: entityName,
      items,
      meta: {
        total: items.length,
        redirected,
        unchanged: items.length - redirected,
        errors: 0,
      },
    });
  }

  const parts = [];
  if (redirectCount > 0) parts.push(`${redirectCount} redirected`);
  if (dedupCount > 0) parts.push(`${dedupCount} deduped`);
  parts.push(`${unchangedCount} unchanged`);
  const description = `${parts.join(', ')} of ${allItems.length} total → ${dedupedResults.length} output`;

  return {
    results: entityResults,
    summary: {
      total_entities: entities.length,
      total_items: allItems.length,
      output_items: dedupedResults.length,
      redirected: redirectCount,
      deduplicated: dedupCount,
      unchanged: unchangedCount,
      description,
      errors: [],
    },
  };
}

module.exports = execute;
