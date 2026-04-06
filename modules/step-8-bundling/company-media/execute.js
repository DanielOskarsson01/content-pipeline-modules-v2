/**
 * Company Media — Step 8 Bundling submodule
 *
 * Discovers visual assets for each company by fetching key pages:
 * 1. Logo (prefers horizontal/dark variants for light backgrounds)
 * 2. OG image / favicon
 * 3. Team/people photos from /about, /team, /leadership
 * 4. Product screenshots from /products, /solutions, /platform
 * 5. Award badge images
 *
 * All images stored as external URLs (no binary download).
 * Data-shape routing: finds input by field presence on pool items.
 */

// --- URL helpers ---

function resolveUrl(href, baseUrl) {
  if (!href || !baseUrl) return null;
  try {
    href = href.trim();
    if (href.startsWith('data:') || href.startsWith('javascript:')) return null;
    if (href.startsWith('http://') || href.startsWith('https://')) return href.split('#')[0];
    if (href.startsWith('//')) return `https:${href}`.split('#')[0];
    const base = new URL(baseUrl);
    if (href.startsWith('/')) return `${base.protocol}//${base.host}${href}`.split('#')[0];
    return new URL(href, baseUrl).href.split('#')[0];
  } catch {
    return null;
  }
}

function extractDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

function deriveHomepageUrl(analysisJson, entity) {
  if (entity.website) {
    return entity.website.startsWith('http') ? entity.website : `https://${entity.website}`;
  }
  if (analysisJson && analysisJson.source_citations) {
    const counts = {};
    for (const c of analysisJson.source_citations) {
      if (!c.url) continue;
      try {
        const origin = new URL(c.url).origin;
        counts[origin] = (counts[origin] || 0) + 1;
      } catch { /* skip */ }
    }
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    if (sorted.length > 0) return sorted[0][0];
  }
  return null;
}

// --- HTML parsing helpers ---

function extractAllImgTags(html, pageUrl) {
  const results = [];
  const imgRegex = /<img[^>]*>/gi;
  let match;
  while ((match = imgRegex.exec(html)) !== null) {
    const tag = match[0];
    const srcMatch = tag.match(/src\s*=\s*["']([^"']+)["']/i);
    if (!srcMatch) continue;
    const src = resolveUrl(srcMatch[1], pageUrl);
    if (!src) continue;

    const alt = (tag.match(/alt\s*=\s*["']([^"']*?)["']/i) || [])[1] || '';
    const cls = (tag.match(/class\s*=\s*["']([^"']*?)["']/i) || [])[1] || '';
    const id = (tag.match(/id\s*=\s*["']([^"']*?)["']/i) || [])[1] || '';
    const width = parseInt((tag.match(/width\s*=\s*["']?(\d+)/i) || [])[1] || '0', 10);
    const height = parseInt((tag.match(/height\s*=\s*["']?(\d+)/i) || [])[1] || '0', 10);

    results.push({ src, alt, cls, id, width, height, tag: tag.toLowerCase() });
  }
  return results;
}

function extractMetaContent(html, property) {
  const re1 = new RegExp(`<meta[^>]*property\\s*=\\s*["']${property}["'][^>]*content\\s*=\\s*["']([^"']+)["']`, 'i');
  const re2 = new RegExp(`<meta[^>]*content\\s*=\\s*["']([^"']+)["'][^>]*property\\s*=\\s*["']${property}["']`, 'i');
  const m = html.match(re1) || html.match(re2);
  return m ? m[1] : null;
}

function extractLinkHref(html, relPattern) {
  const re1 = new RegExp(`<link[^>]*rel\\s*=\\s*["']${relPattern}["'][^>]*href\\s*=\\s*["']([^"']+)["']`, 'i');
  const re2 = new RegExp(`<link[^>]*href\\s*=\\s*["']([^"']+)["'][^>]*rel\\s*=\\s*["']${relPattern}["']`, 'i');
  const m = html.match(re1) || html.match(re2);
  return m ? m[1] : null;
}

function extractSamedomainLinks(html, pageUrl) {
  const domain = extractDomain(pageUrl);
  const linkRegex = /<a\s[^>]*href\s*=\s*["']([^"'#][^"']*)["']/gi;
  const urls = new Set();
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const resolved = resolveUrl(match[1], pageUrl);
    if (resolved && extractDomain(resolved) === domain) {
      urls.add(resolved);
    }
  }
  return [...urls];
}

// --- Logo scoring ---

function scoreLogo(img) {
  let score = 0;
  const combined = `${img.src} ${img.alt} ${img.cls} ${img.id}`.toLowerCase();

  // Strong logo signals
  if (/logo/i.test(combined)) score += 10;
  if (/brand/i.test(combined)) score += 5;

  // Format preference
  if (/\.svg/i.test(img.src)) score += 5;

  // Light-background friendly (dark/primary variants)
  if (/dark|black|primary|colored/i.test(img.src)) score += 5;
  if (/horizontal|wide|full/i.test(img.src)) score += 3;

  // Penalties for light-background unfriendly
  if (/white|light|reversed|inverted/i.test(img.src)) score -= 5;
  if (/favicon\.ico$/i.test(img.src)) score -= 5;
  if (/icon/i.test(combined) && !/logo/i.test(combined)) score -= 3;

  // Size hints
  if (img.width > 100) score += 2;
  if (img.width > 0 && img.width < 32) score -= 3;

  return score;
}

// --- Page categorization ---

const SUBPAGE_PATTERNS = {
  team: ['/about', '/team', '/leadership', '/people', '/management', '/our-team', '/staff', '/executives', '/founders', '/who-we-are'],
  products: ['/products', '/solutions', '/platform', '/services', '/software', '/features', '/demo', '/tools', '/technology'],
  awards: ['/awards', '/certifications', '/recognition', '/achievements', '/accreditations', '/partners'],
};

function categorizeSubpages(allLinks) {
  const categorized = { team: [], products: [], awards: [] };
  for (const url of allLinks) {
    const path = new URL(url).pathname.toLowerCase();
    for (const [category, patterns] of Object.entries(SUBPAGE_PATTERNS)) {
      if (patterns.some(p => path.includes(p))) {
        categorized[category].push(url);
      }
    }
  }
  // Limit per category
  categorized.team = categorized.team.slice(0, 3);
  categorized.products = categorized.products.slice(0, 3);
  categorized.awards = categorized.awards.slice(0, 2);
  return categorized;
}

// --- Image classification ---

function isPersonPhoto(img) {
  const combined = `${img.alt} ${img.cls} ${img.id}`.toLowerCase();
  // Check for person-related attributes
  if (/team|people|staff|executive|leadership|headshot|avatar|portrait|founder|ceo|cto|director|manager|board/i.test(combined)) return true;
  // Check for person name pattern in alt (two+ capitalized words)
  if (/^[A-Z][a-z]+ [A-Z][a-z]+/.test(img.alt)) return true;
  return false;
}

function isProductScreenshot(img) {
  const combined = `${img.src} ${img.alt} ${img.cls} ${img.id}`.toLowerCase();
  if (/product|platform|dashboard|screenshot|demo|software|interface|solution|feature|tool|game|slot|casino|betting|sportsbook/i.test(combined)) return true;
  // Large images on product pages are likely screenshots
  if (img.width > 400 || (img.width === 0 && !isPersonPhoto(img) && !/logo|icon|badge|arrow|button/i.test(combined))) return true;
  return false;
}

function isAwardImage(img) {
  const combined = `${img.src} ${img.alt} ${img.cls} ${img.id}`.toLowerCase();
  return /award|badge|cert|seal|winner|recognition|trophy|medal|accredit|compliance|licensed/i.test(combined);
}

// --- Fetch a page and extract all images ---

async function fetchPageImages(url, httpTool) {
  try {
    const res = await httpTool.get(url, { timeout: 10000 });
    if (res.status < 200 || res.status >= 300) return { html: '', images: [] };
    const html = typeof res.body === 'string' ? res.body : String(res.body);
    const images = extractAllImgTags(html, url);
    return { html, images };
  } catch {
    return { html: '', images: [] };
  }
}

// --- Validate URLs via HEAD ---

async function validateUrls(urls, httpTool) {
  const valid = [];
  const batches = [];
  for (let i = 0; i < urls.length; i += 5) {
    batches.push(urls.slice(i, i + 5));
  }
  for (const batch of batches) {
    const results = await Promise.allSettled(
      batch.map(async (url) => {
        try {
          const res = await httpTool.head(url, { timeout: 5000 });
          return { url, ok: res.status >= 200 && res.status < 400 };
        } catch {
          return { url, ok: false };
        }
      })
    );
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.ok) valid.push(r.value.url);
    }
  }
  return new Set(valid);
}

// --- Dedup helper ---
function dedupUrls(urls) {
  const seen = new Set();
  return urls.filter(u => {
    if (seen.has(u)) return false;
    seen.add(u);
    return true;
  });
}

// --- Main execute ---

async function execute(input, options, tools) {
  const { entities } = input;
  const {
    find_logo = true,
    find_team_photos = true,
    find_product_screenshots = true,
    find_awards = true,
    validate_urls = true,
    max_pages_per_entity = 8,
  } = options;
  const { logger, http, progress } = tools;

  const results = [];

  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i];
    progress.update(i + 1, entities.length, `Processing ${entity.name}`);

    const analysisItems = (entity.items || []).filter(item => item.analysis_json);
    const analysis = analysisItems.length > 0 ? analysisItems.at(-1).analysis_json : null;

    try {
      const homepageUrl = deriveHomepageUrl(analysis, entity);
      if (!homepageUrl) {
        logger.warn(`${entity.name}: no homepage URL available`);
        results.push({
          entity_name: entity.name,
          items: [buildEmptyItem(entity.name)],
          meta: { status: 'no_media' },
        });
        continue;
      }

      logger.info(`${entity.name}: fetching ${homepageUrl}`);

      // 1. Fetch homepage
      const { html: homeHtml, images: homeImages } = await fetchPageImages(homepageUrl, http);
      if (!homeHtml) {
        logger.warn(`${entity.name}: homepage fetch failed`);
        results.push({
          entity_name: entity.name,
          items: [buildEmptyItem(entity.name)],
          meta: { status: 'no_media' },
        });
        continue;
      }

      // 2. Extract homepage media
      const ogImage = resolveUrl(extractMetaContent(homeHtml, 'og:image'), homepageUrl);
      const favicon = resolveUrl(
        extractLinkHref(homeHtml, '(?:shortcut )?icon') || extractLinkHref(homeHtml, 'apple-touch-icon'),
        homepageUrl
      );

      // 3. Find logo candidates from homepage
      const logoCandidates = homeImages
        .filter(img => /logo|brand|site-icon/i.test(`${img.src} ${img.alt} ${img.cls} ${img.id}`))
        .map(img => ({ url: img.src, score: scoreLogo(img) }))
        .sort((a, b) => b.score - a.score);

      // 4. Discover subpages
      const allLinks = extractSamedomainLinks(homeHtml, homepageUrl);
      const subpages = categorizeSubpages(allLinks);
      let pagesFetched = 1;

      // 5. Fetch subpages (team, products, awards)
      const teamPhotos = [];
      const screenshots = [];
      const awardImages = [];

      const pagesToFetch = [];
      if (find_team_photos) pagesToFetch.push(...subpages.team.map(u => ({ url: u, type: 'team' })));
      if (find_product_screenshots) pagesToFetch.push(...subpages.products.map(u => ({ url: u, type: 'products' })));
      if (find_awards) pagesToFetch.push(...subpages.awards.map(u => ({ url: u, type: 'awards' })));

      // Cap total pages
      const maxSubpages = max_pages_per_entity - 1;
      const toFetch = pagesToFetch.slice(0, maxSubpages);

      for (const page of toFetch) {
        if (pagesFetched >= max_pages_per_entity) break;
        logger.info(`${entity.name}: fetching ${page.type} page ${page.url}`);
        const { images: pageImgs } = await fetchPageImages(page.url, http);
        pagesFetched++;

        for (const img of pageImgs) {
          // Skip tiny icons, spacers, arrows
          if (img.width > 0 && img.width < 40) continue;
          if (/spacer|pixel|arrow|button|icon\./i.test(img.src)) continue;

          if (page.type === 'team' && isPersonPhoto(img) && teamPhotos.length < 10) {
            teamPhotos.push(img.src);
          }
          if (page.type === 'products' && isProductScreenshot(img) && screenshots.length < 10) {
            screenshots.push(img.src);
          }
          if (page.type === 'awards' && isAwardImage(img) && awardImages.length < 5) {
            awardImages.push(img.src);
          }
        }

        // Also check for logo variants on subpages
        if (find_logo) {
          for (const img of pageImgs) {
            if (/logo|brand/i.test(`${img.src} ${img.alt} ${img.cls} ${img.id}`)) {
              logoCandidates.push({ url: img.src, score: scoreLogo(img) });
            }
          }
        }
      }

      // Also scan homepage images for awards (pages sometimes list them on homepage)
      if (find_awards) {
        for (const img of homeImages) {
          if (isAwardImage(img) && awardImages.length < 5) {
            awardImages.push(img.src);
          }
        }
      }

      // 6. Pick best logo
      logoCandidates.sort((a, b) => b.score - a.score);
      const allLogos = dedupUrls(logoCandidates.map(c => c.url)).slice(0, 5);
      let bestLogo = allLogos[0] || null;

      // Fallback: apple-touch-icon > favicon
      if (!bestLogo && favicon) bestLogo = favicon;

      // 7. Validate URLs
      const allImageUrls = dedupUrls([
        bestLogo, ogImage, favicon,
        ...allLogos, ...teamPhotos, ...screenshots, ...awardImages,
      ].filter(Boolean));

      let validSet = new Set(allImageUrls);
      if (validate_urls && allImageUrls.length > 0) {
        validSet = await validateUrls(allImageUrls, http);
        if (bestLogo && !validSet.has(bestLogo)) bestLogo = allLogos.find(u => validSet.has(u)) || null;
      }

      const validTeam = dedupUrls(teamPhotos).filter(u => validSet.has(u));
      const validScreenshots = dedupUrls(screenshots).filter(u => validSet.has(u));
      const validAwards = dedupUrls(awardImages).filter(u => validSet.has(u));
      const validLogos = allLogos.filter(u => validSet.has(u));

      // 8. Build summary
      const summaryParts = [`Fetched ${pagesFetched} pages from ${extractDomain(homepageUrl)}`];
      if (bestLogo) summaryParts.push(`Logo: ${bestLogo}`);
      if (ogImage && validSet.has(ogImage)) summaryParts.push(`OG Image: ${ogImage}`);
      if (validTeam.length) summaryParts.push(`Team photos: ${validTeam.length}`);
      if (validScreenshots.length) summaryParts.push(`Product screenshots: ${validScreenshots.length}`);
      if (validAwards.length) summaryParts.push(`Award images: ${validAwards.length}`);
      if (validLogos.length) summaryParts.push(`Logo variants: ${validLogos.length}`);
      if (subpages.team.length) summaryParts.push(`Team pages found: ${subpages.team.map(u => new URL(u).pathname).join(', ')}`);
      if (subpages.products.length) summaryParts.push(`Product pages found: ${subpages.products.map(u => new URL(u).pathname).join(', ')}`);

      const hasAnything = bestLogo || (ogImage && validSet.has(ogImage)) || validTeam.length || validScreenshots.length || validAwards.length;
      const status = hasAnything ? (bestLogo ? 'ok' : 'partial') : 'no_media';

      results.push({
        entity_name: entity.name,
        items: [{
          entity_name: entity.name,
          logo_url: bestLogo || '',
          og_image_url: (ogImage && validSet.has(ogImage)) ? ogImage : '',
          team_photo_count: validTeam.length,
          screenshot_count: validScreenshots.length,
          award_count: validAwards.length,
          team_photos_json: JSON.stringify(validTeam),
          screenshots_json: JSON.stringify(validScreenshots),
          awards_json: JSON.stringify(validAwards),
          all_logos_json: JSON.stringify(validLogos),
          media_summary: summaryParts.join('\n'),
          status,
        }],
        meta: {
          pages_fetched: pagesFetched,
          logo_found: !!bestLogo,
          og_image_found: !!(ogImage && validSet.has(ogImage)),
          team_photos: validTeam.length,
          screenshots: validScreenshots.length,
          awards: validAwards.length,
        },
      });

      logger.info(`${entity.name}: logo=${bestLogo ? 'yes' : 'no'}, team=${validTeam.length}, screenshots=${validScreenshots.length}, awards=${validAwards.length}`);

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
      description: `${totalItems} media profiles from ${entities.length} entities${errors.length ? ` (${errors.length} failed)` : ''}`,
      errors,
    },
  };
}

function buildEmptyItem(entityName) {
  return {
    entity_name: entityName,
    logo_url: '',
    og_image_url: '',
    team_photo_count: 0,
    screenshot_count: 0,
    award_count: 0,
    team_photos_json: '[]',
    screenshots_json: '[]',
    awards_json: '[]',
    all_logos_json: '[]',
    media_summary: 'No homepage URL available',
    status: 'no_media',
  };
}

module.exports = execute;
