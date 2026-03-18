/**
 * Browser Link Crawler — Step 1 Discovery submodule
 *
 * Uses Playwright (tools.browser.fetch) to render pages and extract links.
 * Fallback for Cloudflare-protected or JS-heavy sites where HTTP-based
 * crawlers (page-links, deep-links) return 403 or empty results.
 *
 * If browser fetch fails (403, connection error), falls back to the
 * Wayback Machine (web.archive.org) to get the most recent cached snapshot
 * via plain HTTP — no proxy or stealth needed.
 *
 * Native per-entity module: receives input.entity (single entity),
 * returns { entity_name, items, meta }.
 *
 * Algorithm:
 *   1. Fetch homepage with headless browser
 *   1b. If browser fails → try Wayback Machine latest snapshot
 *   2. Extract sectioned links (nav/header/footer/body)
 *   3. Identify key internal pages (blog, news, about, etc.)
 *   4. Fetch internal pages concurrently, extract more links
 *   5. Deduplicate, filter, limit
 */

const KEY_PAGE_PATTERNS = [
  '/blog', '/news', '/about', '/press', '/partners',
  '/articles', '/insights', '/media', '/resources', '/company'
];

async function execute(input, options, tools) {
  const { entity } = input;
  const { max_urls, max_depth_pages, request_timeout, same_domain_only, concurrency } = options;
  const { logger, browser, progress } = tools;

  if (!browser || !browser.fetch) {
    throw new Error('Browser tools not available. Playwright must be installed on the server.');
  }

  if (!entity.website) {
    return {
      entity_name: entity.name,
      items: [],
      error: 'No website field',
      meta: { total_found: 0, pages_crawled: 0, errors: 1 }
    };
  }

  const baseUrl = entity.website.startsWith('http')
    ? entity.website
    : `https://${entity.website}`;

  logger.info(`Fetching homepage: ${baseUrl}`);
  progress.update(1, 3, `Fetching homepage for ${entity.name}`);

  // 1. Fetch homepage with browser
  let homepageHtml;
  let resolvedBaseUrl;
  let usedWaybackMachine = false;
  try {
    const res = await browser.fetch(baseUrl, {
      timeout: request_timeout,
      waitForNetworkIdle: true,
    });

    if (res.status >= 400) {
      throw new Error(`HTTP ${res.status} fetching ${baseUrl}`);
    }

    homepageHtml = typeof res.body === 'string' ? res.body : String(res.body);
    // Use post-redirect URL as base for all link resolution
    resolvedBaseUrl = res.url || baseUrl;
  } catch (browserErr) {
    // 1b. Fallback: try Wayback Machine latest snapshot via plain HTTP
    logger.warn(`Browser fetch failed (${browserErr.message}) — trying Wayback Machine`);
    try {
      const waybackRes = await tools.http.get(
        `https://web.archive.org/web/${baseUrl}`,
        { timeout: request_timeout }
      );

      if (waybackRes.status >= 400) {
        throw new Error(`Wayback Machine returned HTTP ${waybackRes.status}`);
      }

      homepageHtml = typeof waybackRes.body === 'string' ? waybackRes.body : String(waybackRes.body);
      // Use the original URL as base (not the archive.org URL) so links resolve correctly
      resolvedBaseUrl = baseUrl;
      usedWaybackMachine = true;
      logger.info(`Wayback Machine fallback succeeded for ${baseUrl}`);
    } catch (waybackErr) {
      logger.error(`Both browser and Wayback Machine failed for ${baseUrl}`);
      logger.error(`  Browser: ${browserErr.message}`);
      logger.error(`  Wayback: ${waybackErr.message}`);
      return {
        entity_name: entity.name,
        items: [],
        error: `Browser: ${browserErr.message}; Wayback: ${waybackErr.message}`,
        meta: { total_found: 0, pages_crawled: 0, errors: 1 }
      };
    }
  }

  const baseDomain = extractDomain(resolvedBaseUrl);

  // 2. Extract sectioned links from homepage
  let homepageLinks = extractSectionedLinks(homepageHtml, resolvedBaseUrl);

  // If we used Wayback Machine, links may have archive.org prefixes — strip them
  if (usedWaybackMachine) {
    homepageLinks = homepageLinks
      .map(link => ({ ...link, url: stripWaybackUrl(link.url) }))
      .filter(link => link.url !== null);
  }

  logger.info(`Homepage: ${homepageLinks.length} links extracted${usedWaybackMachine ? ' (via Wayback Machine)' : ''}`);

  // Tag all homepage links with found_on
  for (const link of homepageLinks) {
    link.found_on = resolvedBaseUrl;
  }

  // 3. Identify key internal pages for depth-2 crawling
  const keyPages = [];
  if (max_depth_pages > 0) {
    const seen = new Set();
    for (const link of homepageLinks) {
      if (keyPages.length >= max_depth_pages) break;
      if (seen.has(link.url)) continue;
      if (extractDomain(link.url) !== baseDomain) continue;

      try {
        const path = new URL(link.url).pathname.toLowerCase();
        if (KEY_PAGE_PATTERNS.some(p => path.includes(p))) {
          keyPages.push(link.url);
          seen.add(link.url);
        }
      } catch {
        // skip malformed URLs
      }
    }
  }

  // 4. Fetch key pages concurrently (worker pool pattern)
  const depthLinks = [];
  progress.update(2, 3, `Crawling ${keyPages.length} internal pages`);

  if (keyPages.length > 0) {
    const pageResults = new Array(keyPages.length);
    let nextIndex = 0;

    async function worker() {
      while (true) {
        const idx = nextIndex++;
        if (idx >= keyPages.length) break;
        const pageUrl = keyPages[idx];

        try {
          let html, resolvedPageUrl;

          if (usedWaybackMachine) {
            // Homepage needed Wayback — use it for depth-2 pages too
            logger.info(`Depth-2 (Wayback): fetching ${pageUrl}`);
            const res = await tools.http.get(
              `https://web.archive.org/web/${pageUrl}`,
              { timeout: request_timeout }
            );
            if (res.status >= 400) {
              logger.warn(`Depth-2 (Wayback): HTTP ${res.status} for ${pageUrl}`);
              pageResults[idx] = [];
              continue;
            }
            html = typeof res.body === 'string' ? res.body : String(res.body);
            resolvedPageUrl = pageUrl;
          } else {
            logger.info(`Depth-2: fetching ${pageUrl}`);
            const res = await browser.fetch(pageUrl, {
              timeout: request_timeout,
              waitForNetworkIdle: true,
            });
            if (res.status >= 400) {
              logger.warn(`Depth-2: HTTP ${res.status} for ${pageUrl}`);
              pageResults[idx] = [];
              continue;
            }
            html = typeof res.body === 'string' ? res.body : String(res.body);
            resolvedPageUrl = res.url || pageUrl;
          }

          let links = extractLinks(html, resolvedPageUrl);
          if (usedWaybackMachine) {
            links = links
              .map(l => ({ ...l, url: stripWaybackUrl(l.url) }))
              .filter(l => l.url !== null);
          }

          pageResults[idx] = links.map(l => ({
            ...l,
            source_location: 'body',
            found_on: resolvedPageUrl,
          }));
        } catch (err) {
          logger.warn(`Depth-2: failed ${pageUrl} — ${err.message}`);
          pageResults[idx] = [];
        }
      }
    }

    const workerCount = Math.min(concurrency, keyPages.length);
    const workers = [];
    for (let i = 0; i < workerCount; i++) {
      workers.push(worker());
    }
    await Promise.all(workers);

    for (const links of pageResults) {
      if (links) depthLinks.push(...links);
    }
  }

  logger.info(`Depth-2: ${depthLinks.length} links from ${keyPages.length} pages`);

  // 5. Combine, filter, deduplicate
  const allLinks = [...homepageLinks, ...depthLinks];

  const filtered = allLinks.filter(link => {
    if (same_domain_only && extractDomain(link.url) !== baseDomain) return false;
    return true;
  });

  const seen = new Set();
  const unique = [];
  for (const link of filtered) {
    if (!seen.has(link.url)) {
      seen.add(link.url);
      unique.push(link);
    }
  }

  // 6. Limit
  const limited = unique.slice(0, max_urls);

  progress.update(3, 3, `Done: ${limited.length} URLs`);
  logger.info(`Result: ${allLinks.length} total → ${filtered.length} filtered → ${unique.length} unique → ${limited.length} returned`);

  return {
    entity_name: entity.name,
    items: limited,
    meta: {
      total_found: allLinks.length,
      after_filter: filtered.length,
      unique: unique.length,
      returned: limited.length,
      pages_crawled: 1 + keyPages.length,
      depth_pages: keyPages.length,
      wayback_fallback: usedWaybackMachine,
      errors: 0
    }
  };
}

// ---------------------------------------------------------------------------
// Link extraction helpers (same patterns as page-links)
// ---------------------------------------------------------------------------

/**
 * Extract links from HTML, categorized by page section.
 * Uses regex-based section detection (nav/header/footer/body).
 */
function extractSectionedLinks(html, baseUrl) {
  const links = [];

  const navRegex = /<nav[\s>][\s\S]*?<\/nav>/gi;
  const headerRegex = /<header[\s>][\s\S]*?<\/header>/gi;
  const footerRegex = /<footer[\s>][\s\S]*?<\/footer>/gi;

  const navSections = html.match(navRegex) || [];
  const headerSections = html.match(headerRegex) || [];
  const footerSections = html.match(footerRegex) || [];

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

/**
 * Strip Wayback Machine URL wrapper to get the original URL.
 * Wayback URLs look like: https://web.archive.org/web/20260227123456/https://example.com/page
 * Returns the original URL, or null if it's an archive.org internal link.
 */
function stripWaybackUrl(url) {
  if (!url) return null;
  const waybackMatch = url.match(/^https?:\/\/web\.archive\.org\/web\/\d+\*?\/(https?:\/\/.+)$/);
  if (waybackMatch) return waybackMatch[1].split('#')[0].split('?')[0];
  // Some Wayback links use relative /web/... paths that got resolved against the base
  if (url.includes('web.archive.org')) return null;
  return url;
}

module.exports = execute;
