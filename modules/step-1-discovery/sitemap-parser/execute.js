/**
 * Sitemap Parser — Step 1 Discovery submodule
 * 
 * For each entity with a website field, fetches sitemap.xml,
 * parses it, and returns discovered URLs.
 */

async function execute(input, options, tools) {
  const { entities } = input;
  const { max_urls, include_nested_sitemaps, url_pattern, exclude_patterns } = options;
  const { logger, http, progress, browser } = tools;

  let urlFilter = null;
  if (url_pattern) {
    try {
      urlFilter = new RegExp(url_pattern);
    } catch (e) {
      logger.error(`Invalid URL pattern regex: "${url_pattern}" — ${e.message}. Ignoring filter.`);
    }
  }

  // Parse exclude patterns (one regex per line)
  const excludeRegexes = [];
  if (exclude_patterns && typeof exclude_patterns === 'string') {
    for (const line of exclude_patterns.split('\n').map(l => l.trim()).filter(l => l.length > 0)) {
      try {
        excludeRegexes.push(new RegExp(line, 'i'));
      } catch (e) {
        logger.warn(`Invalid exclude pattern: "${line}" — ${e.message}. Skipping.`);
      }
    }
    if (excludeRegexes.length > 0) {
      logger.info(`Loaded ${excludeRegexes.length} exclude patterns`);
    }
  }
  const results = [];
  let totalItems = 0;
  const errors = [];

  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i];
    progress.update(i + 1, entities.length, `Processing ${entity.name || "entity"}`);

    if (!entity.website) {
      logger.warn(`Skipping ${entity.name}: no website field`);
      results.push({
        entity_name: entity.name,
        items: [],
        error: "No website field",
        meta: { total_found: 0, errors: 1 }
      });
      errors.push(`${entity.name}: No website field`);
      continue;
    }

    try {
      const baseUrl = entity.website.startsWith("http")
        ? entity.website
        : `https://${entity.website}`;

      logger.info(`Fetching sitemap for ${entity.name}: ${baseUrl}`);
      const urls = await fetchSitemap(
        `${baseUrl.replace(/\/$/, "")}/sitemap.xml`,
        { max_urls, include_nested_sitemaps, http, logger, browser }
      );

      // Apply exclude patterns first (cheap regex, removes bulk)
      let afterExclude = urls;
      let excludedCount = 0;
      if (excludeRegexes.length > 0) {
        afterExclude = urls.filter((u) => {
          for (const re of excludeRegexes) {
            if (re.test(u.url)) return false;
          }
          return true;
        });
        excludedCount = urls.length - afterExclude.length;
        if (excludedCount > 0) {
          logger.info(`${entity.name}: excluded ${excludedCount} URLs by pattern`);
        }
      }

      // Apply include filter if set
      const filtered = urlFilter
        ? afterExclude.filter((u) => urlFilter.test(u.url))
        : afterExclude;

      const limited = filtered.slice(0, max_urls);

      results.push({
        entity_name: entity.name,
        items: limited,
        meta: {
          total_found: urls.length,
          excluded: excludedCount,
          filtered: afterExclude.length - filtered.length,
          limited: filtered.length - limited.length,
          returned: limited.length,
          errors: 0
        }
      });

      totalItems += limited.length;
      logger.info(`${entity.name}: found ${urls.length} URLs, excluded ${excludedCount}, returning ${limited.length}`);

    } catch (err) {
      logger.error(`${entity.name}: ${err.message}`);
      results.push({
        entity_name: entity.name,
        items: [],
        error: err.message,
        meta: { total_found: 0, errors: 1 }
      });
      errors.push(`${entity.name}: ${err.message}`);
    }
  }

  const successCount = entities.length - errors.length;
  const description = errors.length > 0
    ? `${totalItems} URLs found across ${successCount} of ${entities.length} entities (${errors.length} failed)`
    : `${totalItems} URLs found across ${entities.length} entities`;

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
 * Fetch and parse a sitemap URL. Handles sitemap index files.
 */
async function fetchSitemap(url, { max_urls, include_nested_sitemaps, http, logger, browser }) {
  let xml;

  // Tiered fetch: HTTP first, browser fallback for 403/429/503
  const response = await http.get(url, { timeout: 15000 });

  if (response.status >= 200 && response.status < 300) {
    xml = typeof response.body === "string" ? response.body : String(response.body);
  } else if ([403, 429, 503].includes(response.status) && browser) {
    logger.info(`HTTP ${response.status} on ${url} — retrying with browser`);
    try {
      const browserRes = await browser.fetch(url, { timeout: 20000, waitForNetworkIdle: true });
      if (browserRes.status >= 200 && browserRes.status < 400 && browserRes.body) {
        xml = typeof browserRes.body === "string" ? browserRes.body : String(browserRes.body);
        logger.info(`Browser fallback succeeded for ${url} (${xml.length} chars)`);
      } else {
        throw new Error(`Browser returned HTTP ${browserRes.status} fetching ${url}`);
      }
    } catch (browserErr) {
      throw new Error(`HTTP ${response.status} fetching ${url} (browser fallback also failed: ${browserErr.message})`);
    }
  } else {
    throw new Error(`HTTP ${response.status} fetching ${url}`);
  }
  const urls = [];

  // Check if this is a sitemap index (contains <sitemapindex>)
  if (xml.includes("<sitemapindex")) {
    if (!include_nested_sitemaps) {
      logger.info("Sitemap index found but nested sitemaps disabled");
      return urls;
    }

    // Extract child sitemap URLs
    const sitemapUrls = extractTags(xml, "loc");
    logger.info(`Sitemap index: ${sitemapUrls.length} child sitemaps`);

    for (const childUrl of sitemapUrls) {
      if (urls.length >= max_urls) break;
      try {
        const childUrls = await fetchSitemap(childUrl, {
          max_urls: max_urls - urls.length,
          include_nested_sitemaps: false, // Don't recurse deeper
          http,
          logger,
          browser
        });
        urls.push(...childUrls);
      } catch (err) {
        logger.warn(`Child sitemap failed: ${childUrl} — ${err.message}`);
      }
    }
  } else {
    // Regular sitemap — extract <url> entries
    const entries = extractUrlEntries(xml);
    urls.push(...entries.slice(0, max_urls));
  }

  return urls;
}

/**
 * Extract all <loc> tag contents from XML string
 */
function extractTags(xml, tagName) {
  const regex = new RegExp(`<${tagName}>\\s*([^<]+)\\s*</${tagName}>`, "gi");
  const matches = [];
  let match;
  while ((match = regex.exec(xml)) !== null) {
    matches.push(match[1].trim());
  }
  return matches;
}

/**
 * Extract URL entries from a standard sitemap XML
 * Returns objects matching output_schema: { url, last_modified, change_frequency, priority }
 */
function extractUrlEntries(xml) {
  const entries = [];

  // Split by <url> blocks
  const urlBlocks = xml.split("<url>").slice(1);

  for (const block of urlBlocks) {
    const loc = extractFirstTag(block, "loc");
    if (!loc) continue;

    entries.push({
      url: loc,
      last_modified: extractFirstTag(block, "lastmod") || null,
      change_frequency: extractFirstTag(block, "changefreq") || null,
      priority: parseFloat(extractFirstTag(block, "priority")) || null
    });
  }

  return entries;
}

/**
 * Extract first occurrence of a tag's content
 */
function extractFirstTag(xml, tagName) {
  const regex = new RegExp(`<${tagName}>\\s*([^<]+)\\s*</${tagName}>`, "i");
  const match = regex.exec(xml);
  return match ? match[1].trim() : null;
}

module.exports = execute;
