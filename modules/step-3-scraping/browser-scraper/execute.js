/**
 * Browser Scraper — Step 3 Scraping submodule
 *
 * Re-scrapes pages that failed text extraction using Playwright Chromium.
 * Targets pages where HTTP fetch returned success (200 OK) but Readability
 * extracted < min_word_threshold words — typically JS-rendered SPAs.
 *
 * Run page-scraper first, then browser-scraper on the same working pool.
 * Pages that already have sufficient content are passed through unchanged.
 *
 * Data operation: TRANSFORM (＝) — same items enriched with content.
 */

const { Readability } = require('@mozilla/readability');
const { parseHTML } = require('linkedom');

async function execute(input, options, tools) {
  const { entities } = input;
  const { logger, browser, progress } = tools;
  const {
    request_timeout = 20000,
    wait_for_network_idle = true,
    min_word_threshold = 50,
    max_content_length = 50000,
    concurrency = 3,
  } = options;

  if (!browser || !browser.fetch) {
    throw new Error('tools.browser not available — Playwright may not be installed on this server');
  }

  logger.info(
    `Browser scraper config: timeout=${request_timeout}ms, networkIdle=${wait_for_network_idle}, threshold=${min_word_threshold}, concurrency=${concurrency}`
  );

  // Flatten all items across entities
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
    }
  }

  // Partition: needs browser re-scrape vs pass-through
  const needsScrape = [];
  const passThrough = [];

  for (const item of allItems) {
    const wc = item.word_count ?? 0;
    const status = item.status;

    // Re-scrape if: HTTP was successful but content too short
    if (status === 'success' && wc < min_word_threshold) {
      needsScrape.push(item);
    } else {
      passThrough.push(item);
    }
  }

  logger.info(
    `${needsScrape.length} pages need browser re-scrape, ${passThrough.length} passed through (${allItems.length} total)`
  );

  // Pass-through items keep their original data + a scrape_method marker
  const results = passThrough.map((item) => ({
    ...item,
    scrape_method: 'passed_through',
  }));

  // Browser-scrape items that need it
  let doneCount = 0;
  const total = needsScrape.length;

  async function scrapeOne(item) {
    try {
      logger.info(`[browser] Fetching ${item.url}`);

      const res = await browser.fetch(item.url, {
        timeout: request_timeout,
        waitForNetworkIdle: wait_for_network_idle,
      });

      if (res.status >= 400) {
        logger.warn(`[browser] ${item.url}: HTTP ${res.status}`);
        return {
          url: item.url,
          final_url: res.url || item.url,
          title: item.title,
          word_count: 0,
          content_type: 'text/html',
          status: 'error',
          error: `Browser HTTP ${res.status}`,
          text_preview: '',
          meta_description: item.meta_description || null,
          text_content: '',
          entity_name: item.entity_name,
          scrape_method: 'browser',
        };
      }

      // Run Readability on browser-rendered HTML (same as page-scraper)
      const html = res.body;
      const title = extractTitle(html) || item.title;
      const metaDescription = extractMetaDescription(html) || item.meta_description || null;
      let textContent = extractTextReadability(html, item.url);

      if (textContent.length > max_content_length) {
        logger.info(`Truncated text for ${item.url} from ${textContent.length} to ${max_content_length} chars`);
        textContent = textContent.substring(0, max_content_length);
      }

      const wordCount = textContent.split(/\s+/).filter((w) => w.length > 0).length;
      const textPreview = textContent.length > 150
        ? textContent.substring(0, 150) + '...'
        : textContent;

      const improved = wordCount >= min_word_threshold;
      if (improved) {
        logger.info(`[browser] ${item.url}: ${wordCount} words extracted (was ${item.word_count || 0})`);
      } else {
        logger.warn(`[browser] ${item.url}: still only ${wordCount} words after browser render`);
      }

      return {
        url: item.url,
        final_url: res.url || item.url,
        title,
        word_count: wordCount,
        content_type: 'text/html',
        status: 'success',
        error: null,
        text_preview: textPreview,
        meta_description: metaDescription,
        text_content: textContent,
        entity_name: item.entity_name,
        scrape_method: 'browser',
      };
    } catch (err) {
      logger.error(`[browser] ${item.url}: ${err.message}`);
      return {
        url: item.url,
        final_url: item.url,
        title: item.title,
        word_count: 0,
        content_type: null,
        status: 'error',
        error: `Browser fetch failed: ${err.message}`,
        text_preview: '',
        meta_description: item.meta_description || null,
        text_content: '',
        entity_name: item.entity_name,
        scrape_method: 'browser',
      };
    }
  }

  // Concurrent worker pool (same pattern as page-scraper)
  const scrapeResults = new Array(needsScrape.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const idx = nextIndex++;
      if (idx >= needsScrape.length) break;
      scrapeResults[idx] = await scrapeOne(needsScrape[idx]);
      doneCount++;
      progress.update(doneCount, total, `Browser-scraped ${doneCount} of ${total}`);
    }
  }

  if (needsScrape.length > 0) {
    const workerCount = Math.min(concurrency, needsScrape.length);
    const workers = [];
    for (let i = 0; i < workerCount; i++) {
      workers.push(worker());
    }
    await Promise.all(workers);
    results.push(...scrapeResults);
  }

  // Sort: errors first
  results.sort((a, b) => {
    const order = { error: 0, skipped: 1, success: 2, passed_through: 3 };
    return (order[a.status] ?? 3) - (order[b.status] ?? 3);
  });

  // Group results by entity
  const byEntity = new Map();
  for (const result of results) {
    if (!byEntity.has(result.entity_name)) {
      byEntity.set(result.entity_name, []);
    }
    byEntity.get(result.entity_name).push(result);
  }

  const entityResults = [];
  for (const [entityName, items] of byEntity) {
    const browserScraped = items.filter((i) => i.scrape_method === 'browser').length;
    const browserSuccess = items.filter((i) => i.scrape_method === 'browser' && i.status === 'success').length;
    const errors = items.filter((i) => i.status === 'error').length;
    const totalWords = items.reduce((sum, i) => sum + (i.word_count || 0), 0);

    entityResults.push({
      entity_name: entityName,
      items,
      meta: {
        total: items.length,
        browser_scraped: browserScraped,
        browser_success: browserSuccess,
        passed_through: items.length - browserScraped,
        errors,
        total_words: totalWords,
      },
    });
  }

  const browserTotal = needsScrape.length;
  const browserSuccess = scrapeResults ? scrapeResults.filter((r) => r && r.status === 'success').length : 0;
  const browserErrors = browserTotal - browserSuccess;

  const description = browserTotal > 0
    ? `${browserSuccess} of ${browserTotal} pages recovered by browser, ${passThrough.length} passed through${browserErrors > 0 ? `, ${browserErrors} still failed` : ''}`
    : `All ${passThrough.length} pages already had sufficient content — nothing to re-scrape`;

  return {
    results: entityResults,
    summary: {
      total_entities: entities.length,
      total_items: allItems.length,
      browser_attempted: browserTotal,
      browser_success: browserSuccess,
      browser_errors: browserErrors,
      passed_through: passThrough.length,
      description,
    },
  };
}

// --- Readability extraction helpers (same as page-scraper) ---

function extractTextReadability(html, url) {
  try {
    const { document } = parseHTML(html);
    if (url) {
      try { document.baseURI = url; } catch (_) { /* linkedom may not support this */ }
    }
    const reader = new Readability(document);
    const article = reader.parse();

    if (article && article.textContent && article.textContent.trim().length > 50) {
      return article.textContent
        .replace(/[^\S\n]+/g, ' ')
        .replace(/\n\s*\n/g, '\n\n')
        .replace(/^\s+|\s+$/gm, '')
        .trim();
    }
  } catch (_) {
    // Readability failed — fall through to regex
  }
  return extractTextFallback(html);
}

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
    if (bodyMatch) content = bodyMatch[1];
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

function extractTitle(html) {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) return decodeEntities(titleMatch[1].trim());

  const ogMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
  if (ogMatch) return decodeEntities(ogMatch[1].trim());

  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match) return decodeEntities(stripTags(h1Match[1]).trim());

  return null;
}

function extractMetaDescription(html) {
  const match = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
  return match ? decodeEntities(match[1].trim()) : null;
}

function stripTags(html) {
  return html.replace(/<[^>]+>/g, ' ');
}

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
