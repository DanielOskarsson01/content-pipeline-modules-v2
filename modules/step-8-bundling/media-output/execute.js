/**
 * Media Output — Step 8 Bundling submodule
 *
 * Finds company logos and OG images by fetching the homepage HTML and
 * extracting from meta tags, link tags, and img elements.
 * Also inventories media URLs from analysis citations and markdown.
 *
 * Concurrency: max 5 concurrent requests, 5-second per-URL timeout.
 *
 * Data-shape routing: finds input by field presence, never by source_submodule.
 */

const IMAGE_EXTENSIONS = /\.(png|jpg|jpeg|gif|svg|webp|avif|ico)(\?.*)?$/i;

/**
 * Derive the homepage URL from source citations or entity data.
 * Takes the most common domain from citation URLs.
 */
function deriveHomepageUrl(analysisJson, entity) {
  // Try entity.website first (available if data_operation is =)
  if (entity.website) {
    const url = entity.website.startsWith('http') ? entity.website : `https://${entity.website}`;
    return url;
  }

  // Fall back to most common domain from source citations
  if (analysisJson && analysisJson.source_citations) {
    const domainCounts = {};
    for (const c of analysisJson.source_citations) {
      if (!c.url) continue;
      try {
        const host = new URL(c.url).origin;
        domainCounts[host] = (domainCounts[host] || 0) + 1;
      } catch { /* skip invalid */ }
    }
    const sorted = Object.entries(domainCounts).sort((a, b) => b[1] - a[1]);
    if (sorted.length > 0) return sorted[0][0];
  }

  return null;
}

/**
 * Resolve a potentially relative URL against a base URL.
 */
function resolveUrl(href, baseUrl) {
  if (!href || !baseUrl) return null;
  try {
    if (href.startsWith('http://') || href.startsWith('https://')) return href;
    if (href.startsWith('//')) return `https:${href}`;
    const base = new URL(baseUrl);
    if (href.startsWith('/')) return `${base.protocol}//${base.host}${href}`;
    return new URL(href, baseUrl).href;
  } catch {
    return null;
  }
}

/**
 * Fetch a page and extract logo URL, OG image, and favicon from HTML.
 * Uses regex parsing — no DOM library needed.
 */
async function fetchHomepageMedia(homepageUrl, httpTool, logger) {
  const result = { logo_url: null, og_image_url: null, favicon_url: null, all_images: [] };

  try {
    const res = await httpTool.get(homepageUrl, { timeout: 10000 });
    if (res.status < 200 || res.status >= 300) {
      logger.warn(`Homepage fetch ${res.status}: ${homepageUrl}`);
      return result;
    }
    const html = typeof res.body === 'string' ? res.body : String(res.body);

    // 1. OG image: <meta property="og:image" content="...">
    const ogMatch = html.match(/<meta[^>]*property\s*=\s*["']og:image["'][^>]*content\s*=\s*["']([^"']+)["']/i)
      || html.match(/<meta[^>]*content\s*=\s*["']([^"']+)["'][^>]*property\s*=\s*["']og:image["']/i);
    if (ogMatch) {
      result.og_image_url = resolveUrl(ogMatch[1], homepageUrl);
    }

    // 2. Favicon: <link rel="icon" href="..."> or <link rel="shortcut icon" href="...">
    const iconMatch = html.match(/<link[^>]*rel\s*=\s*["'](?:shortcut )?icon["'][^>]*href\s*=\s*["']([^"']+)["']/i)
      || html.match(/<link[^>]*href\s*=\s*["']([^"']+)["'][^>]*rel\s*=\s*["'](?:shortcut )?icon["']/i);
    if (iconMatch) {
      result.favicon_url = resolveUrl(iconMatch[1], homepageUrl);
    }

    // 3. Apple touch icon (often higher res than favicon)
    const appleMatch = html.match(/<link[^>]*rel\s*=\s*["']apple-touch-icon["'][^>]*href\s*=\s*["']([^"']+)["']/i)
      || html.match(/<link[^>]*href\s*=\s*["']([^"']+)["'][^>]*rel\s*=\s*["']apple-touch-icon["']/i);
    const appleTouchUrl = appleMatch ? resolveUrl(appleMatch[1], homepageUrl) : null;

    // 4. Logo from <img> tags — look for logo/brand in src, alt, class, or id
    const imgRegex = /<img[^>]*>/gi;
    let imgMatch;
    while ((imgMatch = imgRegex.exec(html)) !== null) {
      const tag = imgMatch[0];
      const srcMatch = tag.match(/src\s*=\s*["']([^"']+)["']/i);
      if (!srcMatch) continue;

      const src = resolveUrl(srcMatch[1], homepageUrl);
      if (!src) continue;

      const tagLower = tag.toLowerCase();
      if (/logo|brand|site-icon/i.test(tagLower)) {
        if (!result.logo_url) {
          result.logo_url = src;
        }
      }

      // Collect all image URLs
      if (IMAGE_EXTENSIONS.test(src) && result.all_images.length < 20) {
        result.all_images.push(src);
      }
    }

    // 5. If no logo found from <img>, try apple-touch-icon, then favicon
    if (!result.logo_url && appleTouchUrl) {
      result.logo_url = appleTouchUrl;
    }
    if (!result.logo_url && result.favicon_url) {
      result.logo_url = result.favicon_url;
    }

    // 6. Last resort: try /favicon.ico
    if (!result.favicon_url) {
      try {
        const base = new URL(homepageUrl);
        result.favicon_url = `${base.protocol}//${base.host}/favicon.ico`;
      } catch { /* skip */ }
    }

  } catch (err) {
    logger.warn(`Homepage media extraction failed: ${err.message}`);
  }

  return result;
}

/**
 * Extract image URLs from markdown content.
 */
function extractMarkdownMediaUrls(markdown) {
  const urls = [];
  if (!markdown) return urls;

  const imgRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let match;
  while ((match = imgRegex.exec(markdown)) !== null) {
    urls.push({ url: match[2], source: 'markdown_image', title: match[1] || '' });
  }
  return urls;
}

/**
 * Validate a single URL via HEAD request.
 */
async function validateUrl(url, httpTool) {
  try {
    const res = await httpTool.head(url, { timeout: 5000 });
    return {
      url,
      status: res.status,
      broken: res.status < 200 || res.status >= 300,
      content_type: res.headers['content-type'] || null,
    };
  } catch (err) {
    return { url, status: 0, broken: true, content_type: null, error: err.message };
  }
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

  const results = [];

  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i];
    progress.update(i + 1, entities.length, `Processing ${entity.name}`);

    const analysisItems = (entity.items || []).filter(item => item.analysis_json);
    const markdownItems = (entity.items || []).filter(item => item.content_markdown);
    const analysis = analysisItems.length > 0 ? analysisItems[0].analysis_json : null;

    try {
      // Step 1: Fetch homepage and extract media from HTML
      const homepageUrl = deriveHomepageUrl(analysis, entity);
      let homepageMedia = { logo_url: null, og_image_url: null, favicon_url: null, all_images: [] };

      if (homepageUrl) {
        logger.info(`${entity.name}: fetching homepage ${homepageUrl}`);
        homepageMedia = await fetchHomepageMedia(homepageUrl, http, logger);
      } else {
        logger.warn(`${entity.name}: no homepage URL available`);
      }

      // Step 2: Collect additional media from markdown
      const markdownUrls = [];
      for (const item of markdownItems) {
        markdownUrls.push(...extractMarkdownMediaUrls(item.content_markdown));
      }

      // Step 3: Build combined media list
      const allMediaUrls = new Set();
      const mediaItems = [];

      // Add homepage-discovered media
      if (homepageMedia.logo_url) allMediaUrls.add(homepageMedia.logo_url);
      if (homepageMedia.og_image_url) allMediaUrls.add(homepageMedia.og_image_url);
      if (homepageMedia.favicon_url) allMediaUrls.add(homepageMedia.favicon_url);
      for (const img of homepageMedia.all_images) allMediaUrls.add(img);

      // Add markdown images
      for (const mu of markdownUrls) {
        if (!allMediaUrls.has(mu.url)) {
          allMediaUrls.add(mu.url);
          mediaItems.push(mu);
        }
      }

      // Validate key URLs
      let logoValid = false;
      let ogValid = false;

      if (validate_urls) {
        const urlsToValidate = [
          homepageMedia.logo_url,
          homepageMedia.og_image_url,
          homepageMedia.favicon_url,
        ].filter(Boolean);

        const validations = await Promise.all(
          urlsToValidate.map(url => validateUrl(url, http))
        );

        for (const v of validations) {
          if (v.url === homepageMedia.logo_url) logoValid = !v.broken;
          if (v.url === homepageMedia.og_image_url) ogValid = !v.broken;
        }
      } else {
        logoValid = !!homepageMedia.logo_url;
        ogValid = !!homepageMedia.og_image_url;
      }

      const logoFound = find_logo && logoValid;
      const ogImageFound = find_og_image && ogValid;
      const totalUrls = allMediaUrls.size;

      const manifest = {
        homepage: homepageUrl,
        logo_url: logoFound ? homepageMedia.logo_url : null,
        og_image_url: ogImageFound ? homepageMedia.og_image_url : null,
        favicon_url: homepageMedia.favicon_url,
        image_count: homepageMedia.all_images.length,
        markdown_images: markdownUrls.length,
      };

      const status = (logoFound || ogImageFound) ? 'ok' : (totalUrls > 0 ? 'no_logo' : 'no_media');

      results.push({
        entity_name: entity.name,
        items: [{
          entity_name: entity.name,
          logo_found: logoFound,
          logo_url: manifest.logo_url || '',
          og_image_found: ogImageFound,
          og_image_url: manifest.og_image_url || '',
          total_media_urls: totalUrls,
          validated_count: logoFound + ogImageFound,
          broken_count: 0,
          status,
          media_manifest: JSON.stringify(manifest, null, 2),
        }],
        meta: {
          total_urls: totalUrls,
          logo_found: logoFound,
          og_image_found: ogImageFound,
        },
      });

      logger.info(`${entity.name}: logo=${logoFound ? manifest.logo_url : 'none'}, og=${ogImageFound ? manifest.og_image_url : 'none'}, ${totalUrls} total media`);
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
