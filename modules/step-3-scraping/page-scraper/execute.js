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
    skip_non_html = true,
    extract_meta = true,
  } = options;

  logger.info(
    `Scraper config: timeout=${request_timeout}ms, max_content=${max_content_length}, delay=${delay_between_requests}ms, skip_non_html=${skip_non_html}, extract_meta=${extract_meta}`
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

  logger.info(`Processing ${allItems.length} URLs for scraping`);

  const results = [];
  let successCount = 0;
  let errorCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < allItems.length; i++) {
    const item = allItems[i];

    progress.update(i + 1, allItems.length, `Scraping ${i + 1} of ${allItems.length}: ${truncateUrl(item.url)}`);

    // Delay between requests (skip for first request)
    if (i > 0 && delay_between_requests > 0) {
      await sleep(delay_between_requests);
    }

    let res;
    try {
      res = await http.get(item.url, { timeout: request_timeout });
    } catch (err) {
      results.push(buildErrorItem(item, `Fetch failed: ${err.message}`));
      errorCount++;
      continue;
    }

    // Check HTTP status
    if (res.status >= 400) {
      results.push(buildErrorItem(item, `HTTP ${res.status}`));
      errorCount++;
      continue;
    }

    // Check content type
    const contentType = res.headers['content-type'] || '';
    const isHtml = contentType.includes('text/html') || contentType.includes('application/xhtml');

    if (!isHtml) {
      if (skip_non_html) {
        results.push({
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
        });
        skippedCount++;
        continue;
      } else {
        results.push(buildErrorItem(item, `Non-HTML content: ${contentType.split(';')[0].trim()}`));
        errorCount++;
        continue;
      }
    }

    // Extract content from HTML using Readability (Firefox Reader Mode algorithm)
    const html = res.body;
    const title = extractTitle(html);
    const metaDescription = extract_meta ? extractMetaDescription(html) : null;
    let textContent = extractTextReadability(html, item.url);

    // Truncate extracted text to max_content_length
    if (textContent.length > max_content_length) {
      textContent = textContent.substring(0, max_content_length);
      logger.info(`Truncated text for ${item.url} from ${textContent.length} to ${max_content_length} chars`);
    }

    const wordCount = textContent.split(/\s+/).filter((w) => w.length > 0).length;

    // Detect redirect (compare response URL if available, otherwise same as input)
    const finalUrl = detectFinalUrl(res, item.url);

    // First 150 chars of extracted text — visible in results table for quick review
    const textPreview = textContent.length > 150
      ? textContent.substring(0, 150) + '...'
      : textContent;

    results.push({
      url: item.url,
      final_url: finalUrl,
      title,
      word_count: wordCount,
      content_type: contentType.split(';')[0].trim(),
      status: 'success',
      error: null,
      text_preview: textPreview,
      meta_description: metaDescription,
      text_content: textContent,
      entity_name: item.entity_name,
    });
    successCount++;
  }

  // Sort: errors and skipped first so they appear at top of results
  results.sort((a, b) => {
    const order = { error: 0, skipped: 1, success: 2 };
    return (order[a.status] ?? 2) - (order[b.status] ?? 2);
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
    const errors = items.filter((i) => i.status === 'error').length;
    const skipped = items.filter((i) => i.status === 'skipped').length;
    const totalWords = items.reduce((sum, i) => sum + i.word_count, 0);
    entityResults.push({
      entity_name: entityName,
      items,
      meta: {
        total: items.length,
        success,
        errors,
        skipped,
        total_words: totalWords,
      },
    });
  }

  const problemCount = errorCount + skippedCount;
  const parts = [];
  if (errorCount > 0) parts.push(`${errorCount} errors`);
  if (skippedCount > 0) parts.push(`${skippedCount} skipped`);

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
      errors: errorCount,
      skipped: skippedCount,
      description,
    },
  };
}

// --- Helper functions ---

function buildErrorItem(item, errorMessage) {
  return {
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
 * Fallback regex-based text extraction.
 * Used when Readability can't parse the page (e.g. non-article pages).
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
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch) {
      content = bodyMatch[1];
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
