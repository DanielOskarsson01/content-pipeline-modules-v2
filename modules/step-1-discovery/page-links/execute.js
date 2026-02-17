/**
 * Page Link Extractor — Step 1 Discovery submodule
 *
 * For each entity with a website field, fetches the homepage HTML
 * and extracts <a href> links. Categorizes links by their location
 * in the page (nav, header, footer, body).
 */

async function execute(input, options, tools) {
  const { entities } = input;
  const { max_urls, include_footer, include_body, same_domain_only } = options;
  const { logger, http, progress } = tools;

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
        meta: { total_found: 0, errors: 1 }
      });
      errors.push(`${entity.name}: No website field`);
      continue;
    }

    try {
      const baseUrl = entity.website.startsWith('http')
        ? entity.website
        : `https://${entity.website}`;
      const normalizedBase = baseUrl.replace(/\/$/, '');

      logger.info(`Fetching homepage for ${entity.name}: ${normalizedBase}`);
      const response = await http.get(normalizedBase, { timeout: 15000 });

      if (response.status < 200 || response.status >= 300) {
        throw new Error(`HTTP ${response.status} fetching ${normalizedBase}`);
      }

      const html = typeof response.body === 'string' ? response.body : String(response.body);
      const baseDomain = extractDomain(normalizedBase);

      // Extract links from different page sections
      const allLinks = extractSectionedLinks(html, normalizedBase);

      // Filter by options
      const filtered = allLinks.filter((link) => {
        if (!include_footer && link.source_location === 'footer') return false;
        if (!include_body && link.source_location === 'body') return false;
        if (same_domain_only && extractDomain(link.url) !== baseDomain) return false;
        return true;
      });

      // Deduplicate by URL (keep first occurrence — higher-signal location wins)
      const seen = new Set();
      const unique = [];
      for (const link of filtered) {
        if (!seen.has(link.url)) {
          seen.add(link.url);
          unique.push(link);
        }
      }

      const limited = unique.slice(0, max_urls);

      results.push({
        entity_name: entity.name,
        items: limited,
        meta: {
          total_found: allLinks.length,
          after_filter: filtered.length,
          unique: unique.length,
          returned: limited.length,
          errors: 0
        }
      });

      totalItems += limited.length;
      logger.info(`${entity.name}: found ${allLinks.length} links, returning ${limited.length}`);
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
    ? `${totalItems} links from ${successCount} of ${entities.length} entities (${errors.length} failed)`
    : `${totalItems} links from ${entities.length} entities`;

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
 * Extract links from HTML, categorized by page section.
 * Uses regex-based section detection (nav/header/footer/body).
 */
function extractSectionedLinks(html, baseUrl) {
  const links = [];

  // Identify section boundaries via common HTML tags
  const navRegex = /<nav[\s>][\s\S]*?<\/nav>/gi;
  const headerRegex = /<header[\s>][\s\S]*?<\/header>/gi;
  const footerRegex = /<footer[\s>][\s\S]*?<\/footer>/gi;

  const navSections = html.match(navRegex) || [];
  const headerSections = html.match(headerRegex) || [];
  const footerSections = html.match(footerRegex) || [];

  // Build a set of links found in structured sections
  const sectionLinks = new Set();

  for (const section of navSections) {
    for (const link of extractLinks(section, baseUrl)) {
      links.push({ ...link, source_location: 'nav' });
      sectionLinks.add(link.url);
    }
  }

  for (const section of headerSections) {
    for (const link of extractLinks(section, baseUrl)) {
      if (!sectionLinks.has(link.url)) {
        links.push({ ...link, source_location: 'header' });
        sectionLinks.add(link.url);
      }
    }
  }

  for (const section of footerSections) {
    for (const link of extractLinks(section, baseUrl)) {
      if (!sectionLinks.has(link.url)) {
        links.push({ ...link, source_location: 'footer' });
        sectionLinks.add(link.url);
      }
    }
  }

  // Everything else is "body"
  for (const link of extractLinks(html, baseUrl)) {
    if (!sectionLinks.has(link.url)) {
      links.push({ ...link, source_location: 'body' });
    }
  }

  return links;
}

/**
 * Extract all <a href="..."> links from an HTML string.
 * Resolves relative URLs against baseUrl.
 */
function extractLinks(html, baseUrl) {
  const linkRegex = /<a\s[^>]*href\s*=\s*["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const links = [];
  let match;

  while ((match = linkRegex.exec(html)) !== null) {
    const rawHref = match[1].trim();
    const rawText = match[2].replace(/<[^>]*>/g, '').trim();

    // Skip non-http protocols (mailto:, javascript:, tel:, etc.)
    if (/^(mailto:|javascript:|tel:|ftp:|data:)/i.test(rawHref)) continue;

    const resolved = resolveUrl(rawHref, baseUrl);
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
    // Relative URL — resolve against base
    const base = new URL(baseUrl);
    if (href.startsWith('/')) {
      return `${base.protocol}//${base.host}${href}`.split('#')[0].split('?')[0];
    }
    // Relative path
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
