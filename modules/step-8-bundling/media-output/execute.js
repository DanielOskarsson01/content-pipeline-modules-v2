/**
 * Media Output — Step 8 Bundling submodule
 *
 * Extracts, validates, and inventories media URLs from analysis_json
 * source citations and content_markdown image references.
 * Attempts to find company logos and OG image candidates.
 *
 * Concurrency: max 5 concurrent HEAD requests, 5-second per-URL timeout.
 * Non-2xx URLs are marked broken, not treated as entity-level failures.
 *
 * Data-shape routing: finds input by field presence, never by source_submodule.
 */

const LOGO_PATTERNS = [
  /\/logo/i,
  /\/brand/i,
  /logo\.(png|jpg|jpeg|svg|webp)/i,
  /brand\.(png|jpg|jpeg|svg|webp)/i,
  /favicon/i,
];

const IMAGE_EXTENSIONS = /\.(png|jpg|jpeg|gif|svg|webp|avif|ico)(\?.*)?$/i;

const OG_IMAGE_PATTERNS = [
  /\/og[-_]?image/i,
  /\/social/i,
  /\/share/i,
  /\/preview/i,
  /\/thumbnail/i,
  /\/featured/i,
  /\/hero/i,
  /\/cover/i,
];

/**
 * Extract all URLs from source citations.
 */
function extractCitationUrls(analysisJson) {
  const urls = [];
  if (!analysisJson || !analysisJson.source_citations) return urls;

  for (const citation of analysisJson.source_citations) {
    if (citation.url) {
      urls.push({ url: citation.url, source: 'citation', title: citation.title || '' });
    }
  }
  return urls;
}

/**
 * Extract image URLs from markdown content.
 * Matches: ![alt](url) and plain URLs with image extensions.
 */
function extractMarkdownMediaUrls(markdown) {
  const urls = [];
  if (!markdown) return urls;

  // Markdown image syntax: ![alt](url)
  const imgRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let match;
  while ((match = imgRegex.exec(markdown)) !== null) {
    urls.push({ url: match[2], source: 'markdown_image', title: match[1] || '' });
  }

  // Plain URLs with image extensions (not already captured)
  const urlRegex = /https?:\/\/[^\s<>"')\]]+/g;
  const seenUrls = new Set(urls.map(u => u.url));
  while ((match = urlRegex.exec(markdown)) !== null) {
    if (IMAGE_EXTENSIONS.test(match[0]) && !seenUrls.has(match[0])) {
      urls.push({ url: match[0], source: 'markdown_url', title: '' });
      seenUrls.add(match[0]);
    }
  }

  return urls;
}

/**
 * Check if a URL matches logo patterns.
 */
function isLikelyLogo(url) {
  return LOGO_PATTERNS.some(pattern => pattern.test(url));
}

/**
 * Check if a URL is a likely OG image candidate.
 */
function isLikelyOgImage(url) {
  return OG_IMAGE_PATTERNS.some(pattern => pattern.test(url))
    || IMAGE_EXTENSIONS.test(url);
}

/**
 * Validate a single URL via HEAD request.
 * Returns validation result with headers info.
 */
async function validateUrl(url, httpTool) {
  try {
    const res = await httpTool.head(url, { timeout: 5000 });
    return {
      url,
      status: res.status,
      broken: res.status < 200 || res.status >= 300,
      content_type: res.headers['content-type'] || null,
      content_length: res.headers['content-length'] ? parseInt(res.headers['content-length'], 10) : null,
    };
  } catch (err) {
    return {
      url,
      status: 0,
      broken: true,
      content_type: null,
      content_length: null,
      error: err.message,
    };
  }
}

/**
 * Process URLs in batches with max concurrency.
 */
async function validateUrlsBatched(urls, httpTool, concurrency) {
  const results = [];
  for (let start = 0; start < urls.length; start += concurrency) {
    const batch = urls.slice(start, start + concurrency);
    const batchResults = await Promise.all(
      batch.map(urlInfo => validateUrl(urlInfo.url, httpTool))
    );
    results.push(...batchResults);
  }
  return results;
}

async function execute(input, options, tools) {
  const { entities } = input;
  const {
    validate_urls = true,
    find_logo = true,
    find_og_image = true,
    max_urls_per_entity = 50,
  } = options;
  const { logger, http, progress } = tools;

  const CONCURRENCY = 5;
  const results = [];

  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i];
    progress.update(i + 1, entities.length, `Processing ${entity.name}`);

    // Data-shape routing
    const analysisItems = (entity.items || []).filter(item => item.analysis_json);
    const markdownItems = (entity.items || []).filter(item => item.content_markdown);

    if (!analysisItems.length && !markdownItems.length) {
      logger.warn(`${entity.name}: no items with analysis_json or content_markdown`);
      results.push({
        entity_name: entity.name,
        items: [{
          entity_name: entity.name,
          logo_found: false,
          og_image_found: false,
          total_media_urls: 0,
          validated_count: 0,
          broken_count: 0,
          status: 'no_media',
          media_manifest: JSON.stringify({ urls: [], logo_url: null, og_image_candidates: [] }),
        }],
        meta: { status: 'no_media' },
      });
      continue;
    }

    try {
      // Collect all media-relevant URLs
      let allUrls = [];

      for (const item of analysisItems) {
        allUrls.push(...extractCitationUrls(item.analysis_json));
      }
      for (const item of markdownItems) {
        allUrls.push(...extractMarkdownMediaUrls(item.content_markdown));
      }

      // Deduplicate by URL
      const seen = new Set();
      allUrls = allUrls.filter(u => {
        if (seen.has(u.url)) return false;
        seen.add(u.url);
        return true;
      });

      // Cap at max_urls_per_entity
      if (allUrls.length > max_urls_per_entity) {
        logger.info(`${entity.name}: capping ${allUrls.length} URLs to ${max_urls_per_entity}`);
        allUrls = allUrls.slice(0, max_urls_per_entity);
      }

      // Validate URLs via HEAD requests
      let validationResults = [];
      let validatedCount = 0;
      let brokenCount = 0;

      if (validate_urls && allUrls.length > 0) {
        validationResults = await validateUrlsBatched(allUrls, http, CONCURRENCY);
        validatedCount = validationResults.filter(r => !r.broken).length;
        brokenCount = validationResults.filter(r => r.broken).length;
      }

      // Build media manifest
      const manifest = {
        urls: allUrls.map(u => {
          const validation = validationResults.find(v => v.url === u.url);
          return {
            url: u.url,
            source: u.source,
            title: u.title,
            is_logo_candidate: find_logo && isLikelyLogo(u.url),
            is_og_candidate: find_og_image && isLikelyOgImage(u.url),
            ...(validation ? {
              status: validation.status,
              broken: validation.broken,
              content_type: validation.content_type,
              content_length: validation.content_length,
            } : {}),
          };
        }),
        logo_url: null,
        og_image_candidates: [],
      };

      // Find logo
      let logoFound = false;
      if (find_logo) {
        const logoCandidates = manifest.urls.filter(u => u.is_logo_candidate && !u.broken);
        if (logoCandidates.length > 0) {
          manifest.logo_url = logoCandidates[0].url;
          logoFound = true;
        }
      }

      // Find OG image candidates
      let ogImageFound = false;
      if (find_og_image) {
        manifest.og_image_candidates = manifest.urls
          .filter(u => u.is_og_candidate && !u.broken)
          .map(u => u.url);
        ogImageFound = manifest.og_image_candidates.length > 0;
      }

      const status = allUrls.length === 0 ? 'no_media' : (brokenCount > 0 ? 'has_broken' : 'ok');

      results.push({
        entity_name: entity.name,
        items: [{
          entity_name: entity.name,
          logo_found: logoFound,
          og_image_found: ogImageFound,
          total_media_urls: allUrls.length,
          validated_count: validatedCount,
          broken_count: brokenCount,
          status,
          media_manifest: JSON.stringify(manifest, null, 2),
        }],
        meta: {
          total_urls: allUrls.length,
          validated: validatedCount,
          broken: brokenCount,
          logo_found: logoFound,
          og_image_found: ogImageFound,
        },
      });

      logger.info(`${entity.name}: ${allUrls.length} URLs, ${validatedCount} valid, ${brokenCount} broken, logo=${logoFound}, og=${ogImageFound}`);
    } catch (err) {
      logger.error(`${entity.name}: ${err.message}`);
      results.push({
        entity_name: entity.name,
        items: [],
        error: err.message,
        meta: { errors: 1 },
      });
    }
  }

  const totalItems = results.reduce((sum, r) => sum + r.items.length, 0);
  const errors = results.filter(r => r.error).map(r => `${r.entity_name}: ${r.error}`);

  return {
    results,
    summary: {
      total_entities: entities.length,
      total_items: totalItems,
      description: `${totalItems} media manifests from ${entities.length} entities${errors.length ? ` (${errors.length} failed)` : ''}`,
      errors,
    },
  };
}

module.exports = execute;
