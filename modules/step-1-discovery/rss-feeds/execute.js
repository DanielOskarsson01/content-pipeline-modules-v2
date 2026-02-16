/**
 * RSS Feed Discovery — Step 1 Discovery submodule
 *
 * For each entity with a website field, discovers RSS/Atom feeds by:
 *   1. Probing common feed paths (/feed, /rss, /feed.xml, etc.)
 *   2. Parsing homepage HTML for <link rel="alternate"> feed references
 *
 * Returns discovered feed URLs with metadata (type, title, item count).
 */

const COMMON_FEED_PATHS = [
  '/feed',
  '/rss',
  '/feed.xml',
  '/rss.xml',
  '/atom.xml',
  '/blog/feed',
  '/news/feed',
  '/feed/rss',
  '/feed/atom',
];

async function execute(input, options, tools) {
  const { entities } = input;
  const { max_feeds = 10, check_common_paths = true } = options;
  const { logger, http, progress } = tools;

  const results = [];
  let totalItems = 0;
  const errors = [];

  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i];
    const name = entity.name || `Entity ${i + 1}`;
    progress.update(i + 1, entities.length, `Processing ${name}`);

    if (!entity.website) {
      logger.warn(`${name}: no website field, skipping`);
      results.push({
        entity_name: name,
        items: [],
        error: 'Missing website field',
        meta: { total_found: 0, errors: 1 },
      });
      errors.push(`${name}: Missing website field`);
      continue;
    }

    try {
      const baseUrl = entity.website.startsWith('http')
        ? entity.website.replace(/\/$/, '')
        : `https://${entity.website.replace(/\/$/, '')}`;

      logger.info(`${name}: discovering feeds at ${baseUrl}`);

      const discoveredFeeds = [];

      // Strategy 1: Parse homepage HTML for <link rel="alternate"> feed references
      try {
        const homepageRes = await http.get(baseUrl, { timeout: 10000 });
        if (homepageRes.status >= 200 && homepageRes.status < 300) {
          const htmlFeeds = extractFeedLinksFromHtml(homepageRes.body, baseUrl);
          for (const feed of htmlFeeds) {
            if (!discoveredFeeds.some((f) => f.url === feed.url)) {
              discoveredFeeds.push(feed);
            }
          }
          if (htmlFeeds.length > 0) {
            logger.info(`${name}: found ${htmlFeeds.length} feed(s) in HTML`);
          }
        }
      } catch (err) {
        logger.warn(`${name}: homepage fetch failed — ${err.message}`);
      }

      // Strategy 2: Probe common feed paths
      if (check_common_paths) {
        for (const feedPath of COMMON_FEED_PATHS) {
          if (discoveredFeeds.length >= max_feeds) break;

          const feedUrl = `${baseUrl}${feedPath}`;
          if (discoveredFeeds.some((f) => f.url === feedUrl)) continue;

          try {
            const res = await http.get(feedUrl, { timeout: 8000 });
            if (res.status >= 200 && res.status < 300 && isFeedContent(res.body)) {
              discoveredFeeds.push({
                url: feedUrl,
                feed_type: detectFeedType(res.body),
                title: extractFeedTitle(res.body),
                item_count: countFeedItems(res.body),
              });
              logger.info(`${name}: found feed at ${feedPath}`);
            }
          } catch {
            // Probe failed — expected for most paths, skip silently
          }
        }
      }

      // Fetch metadata for feeds discovered via HTML (if not already fetched)
      for (const feed of discoveredFeeds) {
        if (feed.item_count !== undefined) continue; // Already has metadata
        if (discoveredFeeds.indexOf(feed) >= max_feeds) break;

        try {
          const res = await http.get(feed.url, { timeout: 8000 });
          if (res.status >= 200 && res.status < 300 && isFeedContent(res.body)) {
            feed.feed_type = detectFeedType(res.body);
            feed.title = feed.title || extractFeedTitle(res.body);
            feed.item_count = countFeedItems(res.body);
          } else {
            feed.feed_type = feed.feed_type || 'unknown';
            feed.title = feed.title || null;
            feed.item_count = 0;
          }
        } catch {
          feed.feed_type = feed.feed_type || 'unknown';
          feed.title = feed.title || null;
          feed.item_count = 0;
        }
      }

      const limited = discoveredFeeds.slice(0, max_feeds);

      results.push({
        entity_name: name,
        items: limited.map((f) => ({
          url: f.url,
          feed_type: f.feed_type || 'unknown',
          title: f.title || null,
          item_count: f.item_count || 0,
        })),
        meta: {
          total_found: discoveredFeeds.length,
          returned: limited.length,
          errors: 0,
        },
      });

      totalItems += limited.length;
      logger.info(`${name}: ${limited.length} feed(s) discovered`);
    } catch (err) {
      logger.error(`${name}: ${err.message}`);
      results.push({
        entity_name: name,
        items: [],
        error: err.message,
        meta: { total_found: 0, errors: 1 },
      });
      errors.push(`${name}: ${err.message}`);
    }
  }

  const successCount = entities.length - errors.length;
  const description =
    errors.length > 0
      ? `${totalItems} feeds from ${successCount} of ${entities.length} entities (${errors.length} failed)`
      : `${totalItems} feeds discovered across ${entities.length} entities`;

  return {
    results,
    summary: {
      total_entities: entities.length,
      total_items: totalItems,
      description,
      errors,
    },
  };
}

/**
 * Extract feed URLs from HTML <link rel="alternate"> tags.
 */
function extractFeedLinksFromHtml(html, baseUrl) {
  const feeds = [];
  const linkRegex = /<link[^>]+rel=["']alternate["'][^>]*>/gi;
  let match;

  while ((match = linkRegex.exec(html)) !== null) {
    const tag = match[0];

    // Check type attribute for RSS or Atom
    const typeMatch = tag.match(/type=["']([^"']+)["']/i);
    if (!typeMatch) continue;

    const type = typeMatch[1].toLowerCase();
    if (!type.includes('rss') && !type.includes('atom') && !type.includes('xml')) continue;

    // Extract href
    const hrefMatch = tag.match(/href=["']([^"']+)["']/i);
    if (!hrefMatch) continue;

    let feedUrl = hrefMatch[1];

    // Resolve relative URLs
    if (feedUrl.startsWith('/')) {
      feedUrl = `${baseUrl}${feedUrl}`;
    } else if (!feedUrl.startsWith('http')) {
      feedUrl = `${baseUrl}/${feedUrl}`;
    }

    // Extract title from the link tag
    const titleMatch = tag.match(/title=["']([^"']+)["']/i);

    feeds.push({
      url: feedUrl,
      feed_type: type.includes('atom') ? 'atom' : 'rss',
      title: titleMatch ? titleMatch[1] : null,
      // item_count will be filled later when we fetch the feed
    });
  }

  return feeds;
}

/**
 * Check if response body looks like a feed (RSS or Atom XML).
 */
function isFeedContent(body) {
  if (typeof body !== 'string') return false;
  const start = body.slice(0, 500).toLowerCase();
  return (
    start.includes('<rss') ||
    start.includes('<feed') ||
    start.includes('<rdf:rdf') ||
    (start.includes('<?xml') && (start.includes('<rss') || start.includes('<feed')))
  );
}

/**
 * Detect whether a feed is RSS or Atom.
 */
function detectFeedType(body) {
  const start = body.slice(0, 500).toLowerCase();
  if (start.includes('<feed')) return 'atom';
  if (start.includes('<rdf:rdf')) return 'rdf';
  return 'rss';
}

/**
 * Extract feed title from XML.
 */
function extractFeedTitle(body) {
  // Match first <title> that's a direct child of <channel> or <feed>
  const match = body.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match ? match[1].trim() : null;
}

/**
 * Count <item> (RSS) or <entry> (Atom) elements in the feed.
 */
function countFeedItems(body) {
  const itemMatches = body.match(/<item[\s>]/gi) || [];
  const entryMatches = body.match(/<entry[\s>]/gi) || [];
  return itemMatches.length + entryMatches.length;
}

module.exports = execute;
