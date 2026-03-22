/**
 * Seed URL Builder -- Step 1 Discovery submodule
 *
 * For each entity with a website field, generates candidate URLs by
 * appending known high-value paths (/about, /press, /careers, etc.)
 * and validates they exist via HEAD requests (falling back to GET).
 */

/** Default high-value paths grouped by type */
const DEFAULT_PATHS = [
  { path: '/about', type: 'about' },
  { path: '/about-us', type: 'about' },
  { path: '/company', type: 'about' },
  { path: '/who-we-are', type: 'about' },
  { path: '/products', type: 'products' },
  { path: '/solutions', type: 'products' },
  { path: '/platform', type: 'products' },
  { path: '/services', type: 'products' },
  { path: '/press', type: 'press' },
  { path: '/press-releases', type: 'press' },
  { path: '/media', type: 'press' },
  { path: '/newsroom', type: 'press' },
  { path: '/news', type: 'news' },
  { path: '/blog', type: 'news' },
  { path: '/partners', type: 'partners' },
  { path: '/affiliates', type: 'partners' },
  { path: '/careers', type: 'careers' },
  { path: '/jobs', type: 'careers' },
  { path: '/contact', type: 'contact' },
  { path: '/contact-us', type: 'contact' },
  { path: '/investors', type: 'investors' },
  { path: '/investor-relations', type: 'investors' },
  { path: '/resources', type: 'resources' },
  { path: '/case-studies', type: 'resources' },
  { path: '/responsible-gaming', type: 'compliance' },
  { path: '/responsible-gambling', type: 'compliance' },
  { path: '/licenses', type: 'compliance' },
  { path: '/regulatory', type: 'compliance' },
];

/**
 * Parse custom_paths textarea into path entries.
 * Each line is one path. Lines are trimmed; empty lines and comments (#) are ignored.
 * A leading slash is added if missing.
 */
function parseCustomPaths(text) {
  if (!text || typeof text !== 'string') return [];
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('#'))
    .map(line => {
      const path = line.startsWith('/') ? line : `/${line}`;
      return { path, type: 'custom' };
    });
}

/**
 * Normalize a website field into a base URL.
 * Ensures https:// prefix and strips trailing slashes.
 */
function normalizeBaseUrl(website) {
  let url = website.trim();
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`;
  }
  return url.replace(/\/+$/, '');
}

/**
 * Run a batch of async tasks with a concurrency limit.
 * Returns results in the same order as tasks.
 */
async function runWithConcurrency(tasks, limit) {
  const results = new Array(tasks.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < tasks.length) {
      const index = nextIndex++;
      results[index] = await tasks[index]();
    }
  }

  const workers = [];
  for (let i = 0; i < Math.min(limit, tasks.length); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results;
}

async function execute(input, options, tools) {
  const { entities } = input;
  const { max_concurrent, request_timeout, custom_paths, include_redirects } = options;
  const { logger, http, progress } = tools;

  // Build the full path list: defaults + custom
  const customEntries = parseCustomPaths(custom_paths);
  const allPaths = [...DEFAULT_PATHS, ...customEntries];

  if (customEntries.length > 0) {
    logger.info(`${customEntries.length} custom paths added to ${DEFAULT_PATHS.length} defaults`);
  }

  const results = [];
  let totalItems = 0;
  const errors = [];

  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i];
    progress.update(i + 1, entities.length, `Probing ${entity.name}`);

    if (!entity.website) {
      logger.warn(`Skipping ${entity.name}: no website field`);
      results.push({
        entity_name: entity.name,
        items: [],
        error: 'No website field',
        meta: { total_found: 0, paths_checked: 0, errors: 1 },
      });
      errors.push(`${entity.name}: No website field`);
      continue;
    }

    try {
      const baseUrl = normalizeBaseUrl(entity.website);
      logger.info(`${entity.name}: checking ${allPaths.length} paths on ${baseUrl}`);

      // Build tasks for concurrent execution
      const tasks = allPaths.map(({ path, type }) => {
        const candidateUrl = `${baseUrl}${path}`;
        return () => checkUrl(candidateUrl, path, type, baseUrl, { http, logger, request_timeout, include_redirects });
      });

      // Run with concurrency limit
      const checkResults = await runWithConcurrency(tasks, max_concurrent || 5);

      // Filter to successful results
      const validItems = checkResults.filter(r => r !== null);

      results.push({
        entity_name: entity.name,
        items: validItems,
        meta: {
          total_found: validItems.length,
          paths_checked: allPaths.length,
          errors: 0,
        },
      });

      totalItems += validItems.length;
      logger.info(`${entity.name}: ${validItems.length} of ${allPaths.length} paths returned valid pages`);
    } catch (err) {
      logger.error(`${entity.name}: ${err.message}`);
      results.push({
        entity_name: entity.name,
        items: [],
        error: err.message,
        meta: { total_found: 0, paths_checked: allPaths.length, errors: 1 },
      });
      errors.push(`${entity.name}: ${err.message}`);
    }
  }

  const successCount = entities.length - errors.length;
  const description =
    errors.length > 0
      ? `${totalItems} URLs found across ${successCount} of ${entities.length} entities (${errors.length} failed)`
      : `${totalItems} URLs found across ${entities.length} entities`;

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
 * Check a single candidate URL via HEAD request, falling back to GET.
 * Returns an output item if the URL is valid (2xx), or null if not.
 */
async function checkUrl(url, path, type, baseUrl, ctx) {
  const { http, logger, request_timeout, include_redirects } = ctx;
  const timeout = request_timeout || 5000;

  let status = null;
  let method = 'HEAD';
  let finalUrl = url;
  let headers = {};

  // Try HEAD first (fast, cheap)
  try {
    const headRes = await http.head(url, { timeout });
    status = headRes.status;
    headers = headRes.headers || {};
  } catch (err) {
    // HEAD failed entirely (network error, timeout) -- try GET
    method = 'GET';
    try {
      const getRes = await http.get(url, { timeout });
      status = getRes.status;
      headers = getRes.headers || {};
    } catch (getErr) {
      // Both failed -- skip this path silently
      return null;
    }
  }

  // Some servers return non-2xx for HEAD but work with GET
  if (status < 200 || status >= 300) {
    if (method === 'HEAD') {
      // Retry with GET
      method = 'GET (fallback)';
      try {
        const getRes = await http.get(url, { timeout });
        status = getRes.status;
        headers = getRes.headers || {};
      } catch (getErr) {
        return null;
      }
    }
  }

  // Only keep 2xx responses
  if (status < 200 || status >= 300) {
    return null;
  }

  // Handle redirects: if include_redirects is true and there is a Location header,
  // capture the final URL. Node's fetch follows redirects automatically, so by the
  // time we get status 200, it is the final destination. The original URL is what
  // we probed; the fact that it returned 200 means the path exists (possibly via redirect).
  //
  // Redirect-to-homepage detection: if the server redirected our path back to the
  // homepage (baseUrl or baseUrl/), we should skip it. We check the content-location
  // or rely on the fact that fetch followed redirects -- if a location header is
  // present in the final response, it means an additional redirect is suggested.
  // Unfortunately tools.http does not expose the final URL after redirect following.
  // We mitigate this by checking common patterns in response headers.
  if (!include_redirects && headers['location']) {
    // There is still a redirect we have not followed -- skip
    return null;
  }

  return {
    url,
    final_url: finalUrl,
    path_type: type,
    status_code: status,
    found_via: method === 'HEAD' ? 'head' : 'get_fallback',
  };
}

module.exports = execute;
