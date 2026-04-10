/**
 * Deep Link Crawler — Step 1 Discovery submodule
 *
 * Reads URLs from the working pool (entity.items from sibling submodules),
 * selects pages matching crawl patterns, fetches them, and extracts links
 * one level deeper. Depends on working pool enrichment (Part A) so that
 * sibling submodule results are available.
 */

async function execute(input, options, tools) {
  const { entities } = input;
  const {
    max_pages_per_entity,
    max_urls_per_page,
    crawl_patterns,
    same_domain_only,
    exclude_already_discovered
  } = options;
  const { logger, http, progress } = tools;

  // Parse crawl patterns (one per line)
  const patterns = (crawl_patterns || '')
    .split('\n')
    .map((p) => p.trim())
    .filter(Boolean);

  const results = [];
  let totalItems = 0;
  const errors = [];

  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i];
    progress.update(i + 1, entities.length, `Processing ${entity.name || 'entity'}`);

    if (!entity.website) {
      logger.warn(`Skipping ${entity.name}: no website field`);
      results.push({
        entity_name: entity.name,
        items: [],
        error: 'No website field',
        meta: { total_found: 0, pages_crawled: 0, errors: 1 }
      });
      errors.push(`${entity.name}: No website field`);
      continue;
    }

    try {
      const baseUrl = entity.website.startsWith('http')
        ? entity.website
        : `https://${entity.website}`;
      const baseDomain = extractDomain(baseUrl);

      // Get existing pool items for this entity
      const existingItems = entity.items || [];
      const existingUrlSet = new Set(existingItems.map((item) => item.url));

      if (existingItems.length === 0) {
        logger.info(`${entity.name}: no items in working pool — skipping`);
        results.push({
          entity_name: entity.name,
          items: [],
          meta: { total_found: 0, pages_crawled: 0, skipped_reason: 'no pool items', errors: 0 }
        });
        continue;
      }

      // Select pages to crawl: filter by crawl_patterns
      const pagesToCrawl = selectPages(existingItems, patterns, max_pages_per_entity);
      logger.info(`${entity.name}: ${existingItems.length} pool items, ${pagesToCrawl.length} match crawl patterns`);

      const discoveredLinks = [];
      let pagesCrawled = 0;

      for (const page of pagesToCrawl) {
        try {
          const response = await http.get(page.url, { timeout: 15000 });

          if (response.status < 200 || response.status >= 300) {
            logger.warn(`${entity.name}: HTTP ${response.status} for ${page.url}`);
            continue;
          }

          const html = typeof response.body === 'string' ? response.body : String(response.body);
          const links = extractLinks(html, page.url);
          pagesCrawled++;

          let pageLinks = 0;
          for (const link of links) {
            if (pageLinks >= max_urls_per_page) break;
            if (same_domain_only && extractDomain(link.url) !== baseDomain) continue;
            if (exclude_already_discovered && existingUrlSet.has(link.url)) continue;

            discoveredLinks.push({
              url: link.url,
              found_on: page.url,
              link_text: link.link_text
            });
            pageLinks++;
          }

          // Progressive save: push discovered links so far, so timeout preserves partial results
          if (tools._partialItems) {
            tools._partialItems.length = 0;
            tools._partialItems.push(...discoveredLinks);
          }
        } catch (err) {
          logger.warn(`${entity.name}: failed to crawl ${page.url} — ${err.message}`);
        }
      }

      // Deduplicate by URL (keep first occurrence)
      const seen = new Set();
      const unique = [];
      for (const link of discoveredLinks) {
        if (!seen.has(link.url)) {
          seen.add(link.url);
          unique.push(link);
        }
      }

      results.push({
        entity_name: entity.name,
        items: unique,
        meta: {
          pool_items: existingItems.length,
          pages_crawled: pagesCrawled,
          total_found: discoveredLinks.length,
          unique: unique.length,
          errors: 0
        }
      });

      totalItems += unique.length;
      logger.info(`${entity.name}: crawled ${pagesCrawled} pages, found ${unique.length} new links`);
    } catch (err) {
      logger.error(`${entity.name}: ${err.message}`);
      results.push({
        entity_name: entity.name,
        items: [],
        error: err.message,
        meta: { total_found: 0, pages_crawled: 0, errors: 1 }
      });
      errors.push(`${entity.name}: ${err.message}`);
    }
  }

  const successCount = entities.length - errors.length;
  const description = errors.length > 0
    ? `${totalItems} deep links from ${successCount} of ${entities.length} entities (${errors.length} failed)`
    : `${totalItems} deep links from ${entities.length} entities`;

  return {
    results,
    summary: {
      total_entities: entities.length,
      total_items: totalItems,
      description,
      errors
    }
  };
}

/**
 * Select pages from pool items that match crawl patterns.
 * Returns up to maxPages items whose URL path contains any pattern.
 */
function selectPages(items, patterns, maxPages) {
  if (patterns.length === 0) {
    // No patterns — take first N items
    return items.slice(0, maxPages);
  }

  const matching = items.filter((item) => {
    try {
      const path = new URL(item.url).pathname.toLowerCase();
      return patterns.some((p) => path.includes(p.toLowerCase()));
    } catch {
      return false;
    }
  });

  return matching.slice(0, maxPages);
}

/**
 * Extract all <a href="..."> links from an HTML string.
 * Resolves relative URLs against the page URL.
 */
function extractLinks(html, pageUrl) {
  const linkRegex = /<a\s[^>]*href\s*=\s*["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const links = [];
  let match;

  while ((match = linkRegex.exec(html)) !== null) {
    const rawHref = match[1].trim();
    const rawText = match[2].replace(/<[^>]*>/g, '').trim();

    if (/^(mailto:|javascript:|tel:|ftp:|data:)/i.test(rawHref)) continue;

    const resolved = resolveUrl(rawHref, pageUrl);
    if (!resolved) continue;

    links.push({
      url: resolved,
      link_text: rawText.slice(0, 200) || ''
    });
  }

  return links;
}

/**
 * Resolve a potentially relative URL against a base URL.
 */
function resolveUrl(href, baseUrl) {
  try {
    if (href.startsWith('http://') || href.startsWith('https://')) {
      return href.split('#')[0].split('?')[0];
    }
    const base = new URL(baseUrl);
    if (href.startsWith('/')) {
      return `${base.protocol}//${base.host}${href}`.split('#')[0].split('?')[0];
    }
    const basePath = base.pathname.replace(/\/[^/]*$/, '/');
    return `${base.protocol}//${base.host}${basePath}${href}`.split('#')[0].split('?')[0];
  } catch {
    return null;
  }
}

/**
 * Extract domain from a URL string for same-domain comparison.
 */
function extractDomain(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

module.exports = execute;
