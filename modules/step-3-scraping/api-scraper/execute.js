/**
 * API Scraper (ScrapFly) — Step 3 Scraping submodule
 *
 * Paid API fallback for pages that failed both page-scraper and browser-scraper.
 * Uses ScrapFly's Anti-Scraping Protection (ASP) to bypass Cloudflare, Turnstile,
 * and aggressive bot detection.
 *
 * Only processes pages with status 'error' or word_count below threshold —
 * never wastes credits on already-scraped pages.
 *
 * Data operation: TRANSFORM (＝) — same items enriched with content.
 *
 * Requires: SCRAPFLY_KEY environment variable.
 */

const { Readability } = require('@mozilla/readability');
const { parseHTML } = require('linkedom');

// CMS content selectors — same as browser-scraper for consistency
const CMS_SELECTORS = [
  '.entry-content', '.post-content', '.page-content', '.wp-block-post-content',
  '.elementor-widget-text-editor .elementor-widget-container',
  '.elementor-widget-theme-post-content .elementor-widget-container',
  '[data-widget_type^="text-editor"] .elementor-widget-container',
  '.et_pb_text_inner', '.et_pb_post_content', '#et-main-area .et_pb_module',
  '.wpb_text_column .wpb_wrapper',
  'main', 'article', '[role="main"]',
  '#content', '.content-area', '.site-content',
];

const NOISE_SELECTORS = [
  'script', 'style', 'nav', 'footer', 'header', 'aside', 'noscript',
  'iframe', 'svg', 'form',
  '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]',
  '.cookie-banner', '.cookie-notice', '#cookie-consent', '.cc-window',
  '.gdpr-banner', '.gdpr-notice',
  '.newsletter-signup', '.newsletter-form',
  '.social-share', '.share-buttons',
  '.sidebar', '#sidebar',
  '.comments', '#comments',
  '.breadcrumb', '.breadcrumbs',
];

function countWords(text) {
  return text.split(/\s+/).filter(w => w.length > 0).length;
}

function cleanText(text) {
  return text
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .replace(/^\s+|\s+$/gm, '')
    .trim();
}

async function execute(input, options, tools) {
  const { entities } = input;
  const { logger, progress } = tools;
  const {
    min_word_threshold = 50,
    max_content_length = 50000,
    concurrency = 2,
    request_timeout = 45000,
    country = '',
    requests_per_minute = 10,
  } = options;

  const apiKey = process.env.SCRAPFLY_KEY;
  if (!apiKey) {
    throw new Error('SCRAPFLY_KEY environment variable is not set. Add it to your .env file on the server.');
  }

  if (!tools.http || !tools.http.get) {
    throw new Error('tools.http not available');
  }

  logger.info(`API scraper config: threshold=${min_word_threshold}, country=${country}, concurrency=${concurrency}, timeout=${request_timeout}ms`);

  // Flatten all items across entities
  const allItems = [];
  for (const entity of entities) {
    if (entity.items && entity.items.length > 0) {
      for (const item of entity.items) {
        if (!item.url) continue;
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

  // Partition: needs API re-scrape vs pass-through
  const needsScrape = [];
  const passThrough = [];

  for (const item of allItems) {
    const wc = item.word_count ?? 0;
    const status = item.status;

    if (!status) {
      needsScrape.push(item);
    } else if (status === 'error' || status === 'dead_link') {
      needsScrape.push(item);
    } else if (status === 'success' && wc < min_word_threshold) {
      needsScrape.push(item);
    } else if (status === 'success' && isBlockPageText(item.text_content || item.text_preview || '')) {
      logger.info(`Block page detected in input for ${item.url} — will re-scrape`);
      needsScrape.push(item);
    } else {
      passThrough.push(item);
    }
  }

  logger.info(`${needsScrape.length} pages need API scrape, ${passThrough.length} passed through (${allItems.length} total)`);

  if (needsScrape.length === 0) {
    // Nothing to do — all pages already scraped successfully
    const entityResults = groupByEntity(allItems.map(item => ({
      ...item,
      scrape_method: item.scrape_method || 'passed_through',
    })));

    return {
      results: entityResults,
      summary: {
        total_entities: entities.length,
        total_items: allItems.length,
        api_attempted: 0,
        api_success: 0,
        errors: 0,
        passed_through: passThrough.length,
        credits_used: 0,
        description: `All ${passThrough.length} pages already had sufficient content — no API calls needed`,
      },
    };
  }

  // Pass-through items keep their original data
  const results = passThrough.map(item => ({
    ...item,
    scrape_method: item.scrape_method || 'passed_through',
    extraction_method: item.extraction_method || 'original',
  }));

  let doneCount = 0;
  let totalCredits = 0;
  const total = needsScrape.length;

  // Global rate limiter — shared across all workers
  const rateLimiter = createRateLimiter(requests_per_minute);

  async function scrapeOne(item) {
    const url = item.url;
    logger.info(`[scrapfly] Fetching ${url}`);

    let scrapflyFailed = false;
    let scrapflyCredits = 0;

    try {
      // Build ScrapFly API URL
      const params = new URLSearchParams({
        key: apiKey,
        url: url,
        asp: 'true',
        render_js: 'true',
      });
      if (country) params.set('country', country);

      const apiUrl = `https://api.scrapfly.io/scrape?${params.toString()}`;

      let res;
      for (let attempt = 0; attempt < 3; attempt++) {
        await rateLimiter();
        res = await tools.http.get(apiUrl, { timeout: request_timeout });
        if (res.status !== 429) break;
        const waitSecs = (attempt + 1) * 10; // 10s, 20s, 30s
        logger.warn(`[scrapfly] Rate limited on ${url} — waiting ${waitSecs}s (attempt ${attempt + 1}/3)`);
        await new Promise(resolve => setTimeout(resolve, waitSecs * 1000));
      }

      if (res.status === 429) {
        logger.error(`[scrapfly] Rate limited on ${url} after 3 retries`);
        return buildErrorResult(item, 'ScrapFly rate limited (429) after retries — wait and try again later');
      }

      if (res.status === 402) {
        logger.error(`[scrapfly] Out of credits on ${url}`);
        return buildErrorResult(item, 'ScrapFly out of credits (402) — top up your account');
      }

      if (res.status >= 400) {
        logger.error(`[scrapfly] API error ${res.status} for ${url}`);
        return buildErrorResult(item, `ScrapFly API error: HTTP ${res.status}`);
      }

      // Parse ScrapFly JSON response
      let data;
      try {
        data = typeof res.body === 'string' ? JSON.parse(res.body) : res.body;
      } catch (parseErr) {
        logger.error(`[scrapfly] JSON parse error for ${url}: ${parseErr.message}`);
        return buildErrorResult(item, `ScrapFly response not valid JSON`);
      }

      // Track credits
      const creditsUsed = data.context?.asp?.credits || data.result?.cost || 1;
      totalCredits += creditsUsed;

      // Check if ScrapFly itself reports an error
      if (data.result?.error) {
        const errMsg = data.result.error.message || data.result.error;
        logger.warn(`[scrapfly] Target error for ${url}: ${errMsg}`);
        return buildErrorResult(item, `ScrapFly: ${errMsg}`, creditsUsed);
      }

      const html = data.result?.content;
      if (!html || html.length < 100) {
        logger.warn(`[scrapfly] Empty/tiny response for ${url} (${html?.length || 0} bytes)`);
        // Fall through to Wayback Machine
      } else if (isCloudflareBlock(html)) {
        logger.warn(`[scrapfly] ${url}: got Cloudflare block page despite ASP (${creditsUsed} credits) — trying Wayback Machine`);
        // Fall through to Wayback Machine
      } else {
        // Extract content using same chain as browser-scraper
        const extracted = extractFromHtml(html, url, item, max_content_length, logger);

        // Check extracted TEXT for block markers (block pages can pass word threshold)
        if (isBlockPageText(extracted.textContent)) {
          logger.warn(`[scrapfly] ${url}: extracted text is a Cloudflare block page (${creditsUsed} credits) — trying Wayback Machine`);
          // Fall through to Wayback
        } else if (extracted.wordCount >= min_word_threshold) {
          logger.info(`[scrapfly] ${url}: ${extracted.wordCount} words via ${extracted.extractionMethod} (${creditsUsed} credits)`);
          return {
            url: item.url,
            final_url: data.result?.url || item.url,
            title: extracted.title,
            word_count: extracted.wordCount,
            content_type: 'text/html',
            status: 'success',
            error: null,
            text_preview: extracted.textPreview,
            meta_description: extracted.metaDescription,
            text_content: extracted.textContent,
            entity_name: item.entity_name,
            scrape_method: 'scrapfly',
            extraction_method: extracted.extractionMethod,
            scrapfly_credits: creditsUsed,
          };
        } else {
          logger.warn(`[scrapfly] ${url}: only ${extracted.wordCount} words after extraction (${creditsUsed} credits) — trying Wayback Machine`);
        }
      }

      scrapflyCredits = creditsUsed;
      scrapflyFailed = true;
    } catch (err) {
      logger.warn(`[scrapfly] ${url}: ${err.message} — trying Wayback Machine`);
      scrapflyFailed = true;
    }

    // --- Wayback Machine fallback ---
    if (scrapflyFailed) {
      try {
        const waybackUrl = `https://web.archive.org/web/${url}`;
        logger.info(`[wayback] Fetching ${url}`);
        const wbRes = await tools.http.get(waybackUrl, { timeout: request_timeout });

        if (wbRes.status >= 400) {
          throw new Error(`Wayback HTTP ${wbRes.status}`);
        }

        const wbBody = typeof wbRes.body === 'string' ? wbRes.body : String(wbRes.body);

        if (wbBody.includes('Wayback Machine has not archived that URL') ||
            wbBody.includes('The Wayback Machine has not archived that URL') ||
            wbBody.includes('This URL has been excluded from the Wayback Machine')) {
          throw new Error('No Wayback Machine snapshot available');
        }

        const extracted = extractFromHtml(wbBody, url, item, max_content_length, logger);

        if (isBlockPageText(extracted.textContent)) {
          logger.warn(`[wayback] ${url}: Wayback also returned a block page`);
          throw new Error('Wayback snapshot is also a block page');
        }

        if (extracted.wordCount >= min_word_threshold) {
          logger.info(`[wayback] ${url}: ${extracted.wordCount} words via ${extracted.extractionMethod} from Wayback Machine`);
          return {
            url: item.url,
            final_url: item.url,
            title: extracted.title,
            word_count: extracted.wordCount,
            content_type: 'text/html',
            status: 'success',
            error: null,
            text_preview: extracted.textPreview,
            meta_description: extracted.metaDescription,
            text_content: extracted.textContent,
            entity_name: item.entity_name,
            scrape_method: 'wayback_after_api',
            extraction_method: extracted.extractionMethod,
            scrapfly_credits: scrapflyCredits,
          };
        }

        logger.warn(`[wayback] ${url}: only ${extracted.wordCount} words from Wayback`);
      } catch (wbErr) {
        logger.warn(`[wayback] ${url}: ${wbErr.message}`);
      }
    }

    // --- All methods failed ---
    logger.error(`[api-scraper] ${url}: all methods failed (ScrapFly + Wayback)`);
    return buildErrorResult(item, `ScrapFly blocked + Wayback failed`, scrapflyCredits);
  }

  function buildErrorResult(item, error, credits = 0) {
    return {
      url: item.url,
      final_url: item.url,
      title: item.title,
      word_count: 0,
      content_type: null,
      status: 'error',
      error,
      text_preview: '',
      meta_description: item.meta_description || null,
      text_content: '',
      entity_name: item.entity_name,
      scrape_method: 'scrapfly',
      extraction_method: 'none',
      scrapfly_credits: credits,
    };
  }

  // Concurrent worker pool with circuit breaker for sustained rate limiting
  const scrapeResults = new Array(needsScrape.length);
  let nextIndex = 0;
  let consecutive429s = 0;
  let rateLimitAborted = false;

  async function worker() {
    while (true) {
      if (rateLimitAborted) break;
      const idx = nextIndex++;
      if (idx >= needsScrape.length) break;
      const result = await scrapeOne(needsScrape[idx]);
      scrapeResults[idx] = result;

      // Circuit breaker: if 3+ consecutive URLs hit 429, stop all workers
      if (result.error && result.error.includes('429')) {
        consecutive429s++;
        if (consecutive429s >= 3) {
          rateLimitAborted = true;
          logger.error(`[scrapfly] 3 consecutive rate limits — aborting remaining ${needsScrape.length - doneCount - 1} URLs`);
          // Mark remaining as rate-limited without waiting
          for (let i = idx + 1; i < needsScrape.length; i++) {
            if (!scrapeResults[i]) {
              scrapeResults[i] = buildErrorResult(needsScrape[i], 'Skipped — ScrapFly rate limit circuit breaker');
            }
          }
          break;
        }
      } else {
        consecutive429s = 0;
      }

      doneCount++;
      progress.update(doneCount, total, `API-scraped ${doneCount} of ${total} (${totalCredits} credits)`);
    }
  }

  const workerCount = Math.min(concurrency, needsScrape.length);
  const workers = [];
  for (let i = 0; i < workerCount; i++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  // --- Duplicate text detection ---
  // If 3+ scraped pages return identical text_content, it's a block/error page
  // regardless of wording. Demote them from success to error.
  const textCounts = new Map();
  for (const r of scrapeResults) {
    if (r && r.status === 'success' && r.text_content) {
      const text = r.text_content.trim();
      if (text.length > 0) {
        textCounts.set(text, (textCounts.get(text) || 0) + 1);
      }
    }
  }
  const duplicateTexts = new Set();
  for (const [text, count] of textCounts) {
    if (count >= 3) duplicateTexts.add(text);
  }
  if (duplicateTexts.size > 0) {
    let demoted = 0;
    for (const r of scrapeResults) {
      if (r && r.status === 'success' && r.text_content && duplicateTexts.has(r.text_content.trim())) {
        r.status = 'error';
        r.error = `Duplicate text across ${textCounts.get(r.text_content.trim())} pages — likely a block/error page`;
        r.word_count = 0;
        r.text_content = '';
        r.text_preview = '';
        demoted++;
      }
    }
    logger.info(`Duplicate detection: ${demoted} pages demoted from success to error (${duplicateTexts.size} duplicate text pattern(s))`);
  }

  results.push(...scrapeResults);

  // Sort: errors first (same as browser-scraper)
  results.sort((a, b) => {
    const order = { error: 0, skipped: 1, success: 2, passed_through: 3 };
    return (order[a.status] ?? 3) - (order[b.status] ?? 3);
  });

  const entityResults = groupByEntity(results);

  const apiSuccess = scrapeResults.filter(r => r && r.status === 'success').length;
  const apiErrors = needsScrape.length - apiSuccess;

  const description = `${apiSuccess} of ${needsScrape.length} pages recovered by ScrapFly API, ${passThrough.length} passed through${apiErrors > 0 ? `, ${apiErrors} still failed` : ''} (${totalCredits} credits used)`;

  return {
    results: entityResults,
    summary: {
      total_entities: entities.length,
      total_items: allItems.length,
      api_attempted: needsScrape.length,
      api_success: apiSuccess,
      errors: apiErrors,
      passed_through: passThrough.length,
      credits_used: totalCredits,
      description,
    },
  };
}

// ---------------------------------------------------------------------------
// Cloudflare block detection
// ---------------------------------------------------------------------------

function isCloudflareBlock(html) {
  const markers = [
    'cf-challenge',
    'ray-id',
    'Cloudflare Ray ID',
    'Why have I been blocked',
    'This website is using a security service to protect itself',
    'Attention Required! | Cloudflare',
    'Just a moment...',
    'cf-browser-verification',
    'cf_chl_opt',
    'action you just performed triggered the security solution',
  ];
  const lower = html.toLowerCase();
  const matches = markers.filter(m => lower.includes(m.toLowerCase()));
  return matches.length >= 2;
}

/**
 * Check extracted plain text (not HTML) for Cloudflare block page content.
 * Block pages can have 80-100 words and pass the word_count threshold.
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

// ---------------------------------------------------------------------------
// Content extraction (same chain as browser-scraper)
// ---------------------------------------------------------------------------

function extractFromHtml(html, url, item, maxContentLength, logger) {
  const title = extractTitle(html) || item.title;
  const metaDescription = extractMetaDescription(html) || item.meta_description || null;

  let doc = null;
  try {
    const parsed = parseHTML(html);
    doc = parsed.document;
  } catch (_) { /* skip to regex */ }

  let textContent = '';
  let extractionMethod = 'none';

  // Tier 1: Readability
  if (doc) {
    try {
      const reader = new Readability(doc);
      const article = reader.parse();
      if (article && article.textContent && article.textContent.trim().length > 50) {
        textContent = cleanText(article.textContent);
        if (countWords(textContent) >= 30) {
          extractionMethod = 'readability';
        }
      }
    } catch (_) { /* continue */ }
  }

  // Tier 2: CMS-aware DOM extraction
  if (countWords(textContent) < 30 && doc) {
    try {
      // Re-parse since Readability mutates the document
      const parsed2 = parseHTML(html);
      const doc2 = parsed2.document;

      for (const sel of NOISE_SELECTORS) {
        try { doc2.querySelectorAll(sel).forEach(el => el.remove()); } catch (_) {}
      }

      for (const selector of CMS_SELECTORS) {
        try {
          const elements = doc2.querySelectorAll(selector);
          if (elements.length === 0) continue;

          const texts = [];
          for (const el of elements) {
            const text = el.textContent.trim();
            if (text.length > 20) texts.push(text);
          }
          if (texts.length === 0) continue;

          const combined = cleanText(texts.join('\n\n'));
          if (countWords(combined) >= 30) {
            textContent = combined;
            extractionMethod = 'cms_dom';
            break;
          }
        } catch (_) {}
      }

      // Body fallback
      if (countWords(textContent) < 30) {
        const body = doc2.querySelector('body');
        if (body) {
          const bodyText = cleanText(body.textContent);
          if (countWords(bodyText) > countWords(textContent)) {
            textContent = bodyText;
            extractionMethod = 'body_text';
          }
        }
      }
    } catch (_) { /* continue */ }
  }

  // Tier 3: Regex fallback
  if (countWords(textContent) < 30) {
    const regexText = extractTextRegex(html);
    if (countWords(regexText) > countWords(textContent)) {
      textContent = regexText;
      extractionMethod = 'regex_fallback';
    }
  }

  if (textContent.length > maxContentLength) {
    textContent = textContent.substring(0, maxContentLength);
  }

  const wordCount = countWords(textContent);
  const textPreview = textContent.length > 150 ? textContent.substring(0, 150) + '...' : textContent;

  return { title, metaDescription, textContent, wordCount, textPreview, extractionMethod };
}

function extractTextRegex(html) {
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
    .replace(/<\/(?:p|div|h[1-6]|li|tr|blockquote|section|article)>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ');

  content = content
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(Number(num)));

  return cleanText(content);
}

function extractTitle(html) {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) return titleMatch[1].replace(/<[^>]+>/g, '').trim();

  const ogMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
  if (ogMatch) return ogMatch[1].trim();

  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match) return h1Match[1].replace(/<[^>]+>/g, '').trim();

  return null;
}

function extractMetaDescription(html) {
  const match = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
  return match ? match[1].trim() : null;
}

// ---------------------------------------------------------------------------
// Grouping helper
// ---------------------------------------------------------------------------

function groupByEntity(results) {
  const byEntity = new Map();
  for (const result of results) {
    if (!byEntity.has(result.entity_name)) {
      byEntity.set(result.entity_name, []);
    }
    byEntity.get(result.entity_name).push(result);
  }

  const entityResults = [];
  for (const [entityName, items] of byEntity) {
    const apiScraped = items.filter(i => i.scrape_method === 'scrapfly').length;
    const apiSuccess = items.filter(i => i.scrape_method === 'scrapfly' && i.status === 'success').length;
    const errors = items.filter(i => i.status === 'error').length;
    const totalWords = items.reduce((sum, i) => sum + (i.word_count || 0), 0);
    const creditsUsed = items.reduce((sum, i) => sum + (i.scrapfly_credits || 0), 0);

    entityResults.push({
      entity_name: entityName,
      items,
      meta: {
        total: items.length,
        api_scraped: apiScraped,
        api_success: apiSuccess,
        passed_through: items.length - apiScraped,
        errors,
        total_words: totalWords,
        credits_used: creditsUsed,
      },
    });
  }

  return entityResults;
}

/**
 * Simple token-bucket rate limiter shared across all workers.
 * Ensures no more than `rpm` requests per minute to ScrapFly.
 * Returns a function that resolves when it's safe to make the next request.
 */
function createRateLimiter(rpm) {
  if (!rpm || rpm <= 0) return () => Promise.resolve(); // no limit

  const minIntervalMs = Math.ceil(60000 / rpm);
  let lastRequestTime = 0;
  let waitQueue = Promise.resolve();

  return () => {
    waitQueue = waitQueue.then(() => {
      const now = Date.now();
      const elapsed = now - lastRequestTime;
      const waitMs = Math.max(0, minIntervalMs - elapsed);
      lastRequestTime = now + waitMs;
      if (waitMs > 0) {
        return new Promise(resolve => setTimeout(resolve, waitMs));
      }
    });
    return waitQueue;
  };
}

module.exports = execute;
