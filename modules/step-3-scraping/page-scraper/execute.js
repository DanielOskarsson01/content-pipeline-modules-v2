/**
 * Page Scraper — Step 3 Scraping submodule
 *
 * Takes validated URLs from Step 2 working pool, fetches HTML content,
 * extracts text and metadata using Mozilla Readability (Firefox Reader Mode algorithm).
 *
 * Data operation: TRANSFORM (＝) — same items enriched with content.
 * Selectable: true — user deselects failed/empty pages.
 */

const { Readability } = require('@mozilla/readability');
const { parseHTML } = require('linkedom');

async function execute(input, options, tools) {
  const { entities } = input;
  const { logger, http, progress } = tools;
  const {
    request_timeout = 10000,
    max_content_length = 50000,
    delay_between_requests = 500,
    concurrency = 8,
    skip_non_html = true,
    extract_meta = true,
  } = options;

  logger.info(
    `Scraper config: timeout=${request_timeout}ms, max_content=${max_content_length}, delay=${delay_between_requests}ms, concurrency=${concurrency}, skip_non_html=${skip_non_html}, extract_meta=${extract_meta}`
  );

  // Flatten all items across entities, keeping entity association.
  // Supports two input formats:
  //   1. Grouped: [{ name, items: [{ url, ... }] }]
  //   2. Flat:    [{ url, ... }]
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

  logger.info(`Processing ${allItems.length} URLs for scraping (concurrency: ${concurrency})`);

  // Scrape a single item — pure function, no shared mutable state
  function scrapeOne(item) {
    return http.get(item.url, { timeout: request_timeout }).then((res) => {
      // Check HTTP status
      if (res.status >= 400) {
        return buildErrorItem(item, `HTTP ${res.status}`);
      }

      // Check content type
      const contentType = res.headers['content-type'] || '';
      const isHtml = contentType.includes('text/html') || contentType.includes('application/xhtml');

      if (!isHtml) {
        if (skip_non_html) {
          return {
            ...item,
            url: item.url,
            final_url: item.url,
            title: null,
            word_count: 0,
            content_type: contentType.split(';')[0].trim(),
            status: 'skipped',
            error: `Non-HTML content: ${contentType.split(';')[0].trim()}`,
            text_preview: '',
            meta_description: null,
            text_content: '',
            entity_name: item.entity_name,
          };
        }
        return buildErrorItem(item, `Non-HTML content: ${contentType.split(';')[0].trim()}`);
      }

      // Extract content from HTML using Readability (Firefox Reader Mode algorithm)
      const html = res.body;
      const title = extractTitle(html);
      const metaDescription = extract_meta ? extractMetaDescription(html) : null;
      const ogDescription = extractOgDescription(html);
      let textContent = extractTextReadability(html, item.url);

      // Truncate extracted text to max_content_length
      if (textContent.length > max_content_length) {
        logger.info(`Truncated text for ${item.url} from ${textContent.length} to ${max_content_length} chars`);
        textContent = textContent.substring(0, max_content_length);
      }

      const wordCount = textContent.split(/\s+/).filter((w) => w.length > 0).length;
      const finalUrl = detectFinalUrl(res, item.url);
      const textPreview = textContent.length > 150
        ? textContent.substring(0, 150) + '...'
        : textContent;

      // Check for Cloudflare / bot-blocker pages that masquerade as real content
      if (isBlockPageText(textContent)) {
        return {
          ...item,
          url: item.url,
          final_url: finalUrl,
          title,
          word_count: wordCount,
          content_type: contentType.split(';')[0].trim(),
          status: 'error',
          error: 'Cloudflare block page detected',
          text_preview: textPreview,
          meta_description: metaDescription,
          text_content: '',
          entity_name: item.entity_name,
        };
      }

      // Truncation detection: if body text is shorter than the og:description
      // summary, the page is JS-rendered and we only got partial SSR content.
      // Mark as low_content so browser-scraper picks it up.
      if (wordCount >= 50 && isLikelyTruncated(textContent, ogDescription)) {
        return {
          ...item,
          url: item.url,
          final_url: finalUrl,
          title,
          word_count: wordCount,
          content_type: contentType.split(';')[0].trim(),
          status: 'low_content',
          error: `Content shorter than og:description — likely truncated (JS-rendered page)`,
          text_preview: textPreview,
          meta_description: metaDescription,
          og_description: ogDescription,
          text_content: textContent,
          entity_name: item.entity_name,
        };
      }

      return {
        ...item,
        url: item.url,
        final_url: finalUrl,
        title,
        word_count: wordCount,
        content_type: contentType.split(';')[0].trim(),
        status: wordCount < 50 ? 'low_content' : 'success',
        error: wordCount < 50 ? `Only ${wordCount} words extracted` : null,
        text_preview: textPreview,
        meta_description: metaDescription,
        og_description: ogDescription,
        text_content: textContent,
        entity_name: item.entity_name,
      };
    }).catch((err) => {
      return buildErrorItem(item, `Fetch failed: ${err.message}`);
    });
  }

  // Concurrent worker pool — N workers share an index counter.
  // Node's single-threaded event loop makes nextIndex++ safe (no race).
  const results = new Array(allItems.length);
  let nextIndex = 0;
  let doneCount = 0;
  const workerDelay = concurrency > 1 ? Math.max(50, Math.round(delay_between_requests / concurrency)) : delay_between_requests;

  async function worker() {
    while (true) {
      const idx = nextIndex++;
      if (idx >= allItems.length) break;

      // Stagger requests across workers to avoid burst
      if (idx > 0 && workerDelay > 0) {
        await sleep(workerDelay);
      }

      results[idx] = await scrapeOne(allItems[idx]);
      doneCount++;

      // Push to _partialItems so the skeleton can save progress on timeout/abort
      if (tools._partialItems) tools._partialItems.push(results[idx]);

      progress.update(doneCount, allItems.length, `Scraped ${doneCount} of ${allItems.length}`);
    }
  }

  const workerCount = Math.min(concurrency, allItems.length);
  const workers = [];
  for (let i = 0; i < workerCount; i++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  // Boilerplate detection: if 3+ pages from the same domain share identical
  // text_content, the scraper likely extracted footer/nav/legal text instead of
  // the real article. Mark those as low_content so the browser-scraper picks them up.
  const domainTexts = new Map(); // domain -> Map<text, count>
  for (const item of results) {
    if (item.status !== 'success' || !item.text_content) continue;
    try {
      const domain = new URL(item.url).hostname;
      if (!domainTexts.has(domain)) domainTexts.set(domain, new Map());
      const textMap = domainTexts.get(domain);
      const text = item.text_content.trim();
      if (text.length > 0) textMap.set(text, (textMap.get(text) || 0) + 1);
    } catch { /* skip invalid URLs */ }
  }

  const boilerplateTexts = new Set();
  for (const [domain, textMap] of domainTexts) {
    for (const [text, count] of textMap) {
      if (count >= 3) {
        boilerplateTexts.add(text);
        logger.info(`Boilerplate detected on ${domain}: ${count} pages share identical ${text.split(/\s+/).length}-word text`);
      }
    }
  }

  if (boilerplateTexts.size > 0) {
    let demotedCount = 0;
    for (const item of results) {
      if (item.status === 'success' && item.text_content && boilerplateTexts.has(item.text_content.trim())) {
        item.status = 'low_content';
        item.error = 'Boilerplate: identical content across multiple pages';
        demotedCount++;
      }
    }
    logger.info(`Demoted ${demotedCount} boilerplate pages from success to low_content`);
  }

  // Count outcomes
  let successCount = 0;
  let lowContentCount = 0;
  let errorCount = 0;
  let skippedCount = 0;
  for (const r of results) {
    if (r.status === 'success') successCount++;
    else if (r.status === 'low_content') lowContentCount++;
    else if (r.status === 'error') errorCount++;
    else if (r.status === 'skipped') skippedCount++;
  }

  // Sort: errors and skipped first, then low_content, then success
  results.sort((a, b) => {
    const order = { error: 0, skipped: 1, low_content: 2, success: 3 };
    return (order[a.status] ?? 3) - (order[b.status] ?? 3);
  });

  // Group results by entity for the expected output format
  const byEntity = new Map();
  for (const result of results) {
    if (!byEntity.has(result.entity_name)) {
      byEntity.set(result.entity_name, []);
    }
    byEntity.get(result.entity_name).push(result);
  }

  const entityResults = [];
  for (const [entityName, items] of byEntity) {
    const success = items.filter((i) => i.status === 'success').length;
    const lowContent = items.filter((i) => i.status === 'low_content').length;
    const errors = items.filter((i) => i.status === 'error').length;
    const skipped = items.filter((i) => i.status === 'skipped').length;
    const totalWords = items.reduce((sum, i) => sum + i.word_count, 0);
    entityResults.push({
      entity_name: entityName,
      items,
      meta: {
        total: items.length,
        success,
        low_content: lowContent,
        errors,
        skipped,
        total_words: totalWords,
      },
    });
  }

  const problemCount = errorCount + skippedCount + lowContentCount;
  const parts = [];
  if (errorCount > 0) parts.push(`${errorCount} errors`);
  if (skippedCount > 0) parts.push(`${skippedCount} skipped`);
  if (lowContentCount > 0) parts.push(`${lowContentCount} low content`);

  const description =
    problemCount > 0
      ? `${successCount} scraped, ${problemCount} issues (${parts.join(', ')}) of ${allItems.length} total`
      : `${allItems.length} URLs — all scraped successfully`;

  return {
    results: entityResults,
    summary: {
      total_entities: entities.length,
      total_items: allItems.length,
      success: successCount,
      low_content: lowContentCount,
      errors: errorCount,
      skipped: skippedCount,
      description,
    },
  };
}

// --- Block page detection ---

/**
 * Check extracted plain text for Cloudflare / bot-blocker page content.
 * Block pages can have 80-100 words and pass the word_count threshold.
 * Requires 2+ markers to avoid false positives.
 */
function isBlockPageText(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  const markers = [
    'why have i been blocked',
    'cloudflare ray id',
    'this website is using a security service',
    'action you just performed triggered the security solution',
    'you can email the site owner to let them know you were blocked',
    'attention required',
  ];
  const matches = markers.filter(m => lower.includes(m));
  return matches.length >= 2;
}

// --- Helper functions ---

function buildErrorItem(item, errorMessage) {
  return {
    ...item,
    url: item.url,
    final_url: item.url,
    title: null,
    word_count: 0,
    content_type: null,
    status: 'error',
    error: errorMessage,
    text_preview: '',
    meta_description: null,
    text_content: '',
    entity_name: item.entity_name,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function truncateUrl(url) {
  return url.length > 60 ? url.substring(0, 57) + '...' : url;
}

/**
 * Detect final URL after redirects.
 * Native fetch follows redirects automatically but doesn't expose the final URL
 * in the response object returned by tools.http.get (which wraps fetch).
 * The tools.http.get returns { status, headers, body } — no url field.
 * We check for common redirect indicators in headers.
 */
function detectFinalUrl(res, originalUrl) {
  // tools.http.get doesn't expose res.url from fetch, so we can't detect
  // transparent redirects. Return original URL. The content is still correct
  // since fetch followed the redirect — we just can't report the final URL.
  return originalUrl;
}

/**
 * Extract page title from HTML.
 * Priority: <title> tag > og:title meta > first <h1>
 */
function extractTitle(html) {
  // <title>
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) {
    return decodeEntities(titleMatch[1].trim());
  }

  // og:title
  const ogMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
  if (ogMatch) {
    return decodeEntities(ogMatch[1].trim());
  }

  // First <h1>
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match) {
    return decodeEntities(stripTags(h1Match[1]).trim());
  }

  return null;
}

/**
 * Extract meta description from HTML.
 */
function extractMetaDescription(html) {
  const match = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
  return match ? decodeEntities(match[1].trim()) : null;
}

/**
 * Extract og:description meta tag from HTML.
 * Always present in static HTML even on JS-rendered pages.
 * Used as a truncation signal: if body text is shorter than this
 * summary, the scrape likely only got the SSR'd partial content.
 */
function extractOgDescription(html) {
  const match = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i);
  return match ? decodeEntities(match[1].trim()) : null;
}

/**
 * Check if extracted text is likely truncated by comparing against
 * the og:description meta tag. If the full body text is shorter than
 * a 100+ char summary, the scraper only got partial SSR content.
 */
function isLikelyTruncated(textContent, ogDescription) {
  if (!ogDescription || ogDescription.length < 100) return false;
  if (!textContent) return true;
  return textContent.length <= ogDescription.length;
}

/**
 * Extract readable text content from HTML using Mozilla Readability.
 * This is the same algorithm used by Firefox Reader Mode — it identifies
 * the main article content and strips navigation, ads, sidebars, etc.
 * Falls back to regex extraction if Readability can't parse the page.
 */
function extractTextReadability(html, url) {
  try {
    const { document } = parseHTML(html);

    // Set the URL so Readability can resolve relative links
    if (url) {
      try { document.baseURI = url; } catch (_) { /* linkedom may not support this */ }
    }

    const reader = new Readability(document);
    const article = reader.parse();

    if (article && article.textContent && article.textContent.trim().length > 50) {
      // Readability succeeded — clean up the text
      return article.textContent
        .replace(/[^\S\n]+/g, ' ')
        .replace(/\n\s*\n/g, '\n\n')
        .replace(/^\s+|\s+$/gm, '')
        .trim();
    }
  } catch (_) {
    // Readability failed — fall through to regex
  }

  // Fallback: regex-based extraction
  return extractTextFallback(html);
}

/**
 * Fallback text extraction with CMS/page-builder awareness.
 * Extraction priority: <main> → <article> → CMS content selectors → <body>
 * Handles Elementor, WordPress, Divi, WPBakery, and other page builders
 * that don't use semantic HTML (<article>/<main> tags).
 */
function extractTextFallback(html) {
  let content = html;

  const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);

  if (mainMatch) {
    content = mainMatch[1];
  } else if (articleMatch) {
    content = articleMatch[1];
  } else {
    // CMS / page-builder content selectors — tried before falling back to <body>
    const cmsPatterns = [
      // WordPress standard
      /<div[^>]+class="[^"]*\bentry-content\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]+class="[^"]*\bpost-content\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]+class="[^"]*\bpage-content\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      // Elementor
      /<div[^>]+class="[^"]*\belementor-widget-text-editor\b[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i,
      /<div[^>]+class="[^"]*\belementor-widget-theme-post-content\b[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i,
      /<div[^>]+data-widget_type="text-editor[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i,
      // ARIA role
      /<[^>]+role=["']main["'][^>]*>([\s\S]*?)<\/[a-z]+>/i,
      // Other common CMS patterns
      /<div[^>]+class="[^"]*\bcontent-area\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]+class="[^"]*\bsite-content\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]+id=["']content["'][^>]*>([\s\S]*?)<\/div>/i,
    ];

    let cmsMatch = null;
    for (const pattern of cmsPatterns) {
      cmsMatch = html.match(pattern);
      if (cmsMatch && cmsMatch[1].length > 100) break;
      cmsMatch = null;
    }

    if (cmsMatch) {
      content = cmsMatch[1];
    } else {
      const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      if (bodyMatch) {
        content = bodyMatch[1];
      }
    }
  }

  content = content
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
    .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '')
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '');

  content = content
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|h[1-6]|li|tr|blockquote|section|article|figcaption)>/gi, '\n\n')
    .replace(/<(?:p|div|h[1-6]|li|tr|blockquote|section|article|figcaption)[^>]*>/gi, '')
    .replace(/<\/(?:ul|ol|table|dl)>/gi, '\n')
    .replace(/<(?:hr)[^>]*\/?>/gi, '\n---\n');

  content = stripTags(content);
  content = decodeEntities(content);

  content = content
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n\s*\n/g, '\n\n')
    .replace(/^\s+|\s+$/gm, '')
    .trim();

  return content;
}

/**
 * Strip HTML tags from a string.
 */
function stripTags(html) {
  return html.replace(/<[^>]+>/g, ' ');
}

/**
 * Decode common HTML entities.
 */
function decodeEntities(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(Number(num)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&nbsp;/g, ' ');
}

module.exports = execute;
