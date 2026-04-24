/**
 * Browser Scraper — Step 3 Scraping submodule
 *
 * Re-scrapes pages that failed text extraction using Playwright Chromium
 * with CMS-aware fallback (Elementor, WordPress, Divi, WPBakery).
 * Targets pages where page-scraper extracted < min_word_threshold words —
 * JS-rendered SPAs, page-builder sites, Cloudflare-protected pages.
 *
 * Extraction chain: Readability → DOM CMS selectors → regex fallback → body text
 *
 * Run page-scraper first, then browser-scraper on the same working pool.
 * Pages that already have sufficient content are passed through unchanged.
 *
 * Data operation: TRANSFORM (＝) — same items enriched with content.
 */

const { Readability } = require('@mozilla/readability');
const { parseHTML } = require('linkedom');

// CMS content selectors — tried in priority order via querySelectorAll.
// Collects ALL matching elements (not just the first) to handle page builders
// that spread content across many widget containers.
const CMS_SELECTORS = [
  // WordPress
  '.entry-content',
  '.post-content',
  '.page-content',
  '.wp-block-post-content',
  // Elementor
  '.elementor-widget-text-editor .elementor-widget-container',
  '.elementor-widget-theme-post-content .elementor-widget-container',
  '[data-widget_type^="text-editor"] .elementor-widget-container',
  // Divi
  '.et_pb_text_inner',
  '.et_pb_post_content',
  '#et-main-area .et_pb_module',
  // WPBakery / Visual Composer
  '.wpb_text_column .wpb_wrapper',
  // Semantic HTML
  'main',
  'article',
  '[role="main"]',
  // Generic CMS containers
  '#content',
  '.content-area',
  '.site-content',
];

// Elements to strip from DOM before text extraction
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

function countWords(text) {
  return text.split(/\s+/).filter((w) => w.length > 0).length;
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
  const { logger, browser, progress } = tools;
  const {
    request_timeout = 20000,
    wait_for_network_idle = true,
    min_word_threshold = 50,
    max_content_length = 50000,
    concurrency = 3,
    auto_scroll = true,
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

  // Detect boilerplate: if 3+ pages share identical text_content, it's likely
  // footer/nav/cookie-banner text, not real article content. Force re-scrape.
  const textCounts = new Map();
  for (const item of allItems) {
    if (item.status === 'success' && item.text_content) {
      const text = item.text_content.trim();
      if (text.length > 0) {
        textCounts.set(text, (textCounts.get(text) || 0) + 1);
      }
    }
  }
  const boilerplateTexts = new Set();
  for (const [text, count] of textCounts) {
    if (count >= 3) {
      boilerplateTexts.add(text);
    }
  }
  if (boilerplateTexts.size > 0) {
    const boilerplateCount = allItems.filter(
      (i) => i.status === 'success' && i.text_content && boilerplateTexts.has(i.text_content.trim())
    ).length;
    logger.info(
      `Detected ${boilerplateTexts.size} duplicate text pattern(s) across ${boilerplateCount} pages — marking as boilerplate for re-scrape`
    );
  }

  // Partition: needs browser re-scrape vs pass-through.
  // Whitelist approach: only pass through items with known-good status.
  // Any unknown status (e.g. 'unique' from url-dedup) defaults to re-scrape.
  const needsScrape = [];
  const passThrough = [];

  for (const item of allItems) {
    const wc = item.word_count ?? 0;
    const status = item.status;

    // Pass through: successfully scraped with sufficient content
    if (status === 'success' && wc >= min_word_threshold
        && !(item.text_content && boilerplateTexts.has(item.text_content.trim()))
        && !isBlockPageText(item.text_content || item.text_preview || '')) {
      passThrough.push(item);
    // Pass through: non-HTML content (PDFs, images) — browser can't help
    } else if (status === 'skipped') {
      passThrough.push(item);
    // Re-scrape everything else: error, low_content, no status, unknown status
    } else {
      if (status === 'success' && isBlockPageText(item.text_content || item.text_preview || '')) {
        logger.info(`Block page detected in input for ${item.url} — will re-scrape with browser`);
      }
      needsScrape.push(item);
    }
  }

  logger.info(
    `${needsScrape.length} pages need browser re-scrape, ${passThrough.length} passed through (${allItems.length} total)`
  );

  // Pass-through items keep their original data + a scrape_method marker.
  // text_content is preserved from page-scraper so downstream modules
  // (boilerplate-stripper, content-filter, intent-tagger) can work with it.
  const results = passThrough.map((item) => ({
    ...item,
    scrape_method: 'passed_through',
    extraction_method: item.extraction_method || 'original',
    word_count: item.word_count ?? 0,
  }));

  // Save pass-through items as partial results immediately (survives timeout)
  if (tools._partialItems) tools._partialItems.push(...results);

  // Browser-scrape items that need it
  let doneCount = 0;
  const total = needsScrape.length;

  /**
   * Extract content from rendered HTML using a 3-tier chain:
   * 1. Readability (best quality — Firefox Reader Mode algorithm)
   * 2. DOM CMS selectors (collects ALL matching containers via querySelectorAll)
   * 3. Regex fallback (last resort for malformed HTML that breaks DOM parsing)
   *
   * Tiers 1 and 2 share a single parseHTML() call to avoid double-parsing
   * large Playwright-rendered pages.
   */
  function extractFromHtml(html, url, item) {
    const title = extractTitle(html) || item.title;
    const metaDescription = extractMetaDescription(html) || item.meta_description || null;
    const ogDescription = extractOgDescription(html) || item.og_description || null;

    // Parse DOM once — shared by Readability (tier 1) and CMS extraction (tier 2)
    let doc = null;
    try {
      const parsed = parseHTML(html);
      doc = parsed.document;
      if (url) {
        try { doc.baseURI = url; } catch (_) { /* linkedom may not support this */ }
      }
    } catch (_) {
      // DOM parsing failed entirely — skip to regex fallback
    }

    // Tier 1: Readability
    let textContent = '';
    let extractionMethod = 'none';

    if (doc) {
      try {
        textContent = extractTextReadability(doc);
        if (countWords(textContent) >= 30) {
          extractionMethod = 'readability';
        }
      } catch (_) {
        // Readability crashed — continue to next tier
      }
    }

    // Tier 2: DOM-based CMS-aware extraction (reuses same parsed document)
    if (countWords(textContent) < 30 && doc) {
      try {
        const cmsText = extractTextCmsAware(doc, logger);
        if (countWords(cmsText) > countWords(textContent)) {
          textContent = cmsText;
          extractionMethod = 'cms_dom';
        }
      } catch (_) {
        // CMS extraction failed — continue to regex fallback
      }
    }

    // Tier 3: Regex fallback (handles malformed HTML that breaks linkedom)
    if (countWords(textContent) < 30) {
      const regexText = extractTextRegexFallback(html);
      if (countWords(regexText) > countWords(textContent)) {
        textContent = regexText;
        extractionMethod = 'regex_fallback';
      }
    }

    if (textContent.length > max_content_length) {
      logger.info(`Truncated text for ${url} from ${textContent.length} to ${max_content_length} chars`);
      textContent = textContent.substring(0, max_content_length);
    }

    const wordCount = countWords(textContent);
    const textPreview = textContent.length > 150
      ? textContent.substring(0, 150) + '...'
      : textContent;

    return { title, metaDescription, ogDescription, textContent, wordCount, textPreview, extractionMethod };
  }

  /**
   * Build a result object from extracted content.
   */
  function buildResult(item, extracted, method, finalUrl, error) {
    return {
      ...item,
      url: item.url,
      final_url: finalUrl || item.url,
      title: extracted.title,
      word_count: extracted.wordCount,
      content_type: 'text/html',
      status: extracted.wordCount >= min_word_threshold ? 'success' : 'error',
      error: extracted.wordCount >= min_word_threshold ? null : (error || `Only ${extracted.wordCount} words extracted`),
      text_preview: extracted.textPreview,
      meta_description: extracted.metaDescription,
      og_description: extracted.ogDescription,
      text_content: extracted.textContent,
      entity_name: item.entity_name,
      scrape_method: method,
      extraction_method: extracted.extractionMethod,
    };
  }

  async function scrapeOne(item) {
    // --- Tier 2: Browser fetch ---
    let browserFailed = false;
    let browserError = '';
    try {
      logger.info(`[browser] Fetching ${item.url}`);
      const res = await browser.fetch(item.url, {
        timeout: request_timeout,
        waitForNetworkIdle: wait_for_network_idle,
        waitForSelector: 'article, main, [role="main"], .entry-content, .post-content',
        autoScroll: auto_scroll,
      });

      const extracted = extractFromHtml(res.body, item.url, item);

      // Check for Cloudflare block page before treating as success
      if (extracted.wordCount >= min_word_threshold && isBlockPageText(extracted.textContent)) {
        logger.warn(`[browser] ${item.url}: extracted text is a Cloudflare block page (${extracted.wordCount} words) — trying Wayback Machine`);
        browserFailed = true;
        browserError = `Browser: Cloudflare block page detected`;
      } else if (extracted.wordCount >= min_word_threshold) {
        // Truncation detection: even if word count passes threshold,
        // check if body text is shorter than the og:description summary
        if (isLikelyTruncated(extracted.textContent, extracted.ogDescription)) {
          logger.warn(`[browser] ${item.url}: content shorter than og:description (${extracted.textContent.length} chars vs ${extracted.ogDescription.length} chars) — likely truncated, trying Wayback Machine`);
          browserFailed = true;
          browserError = `Browser: content shorter than og:description — likely truncated (JS-rendered page)`;
        } else {
          if (res.status >= 400) {
            logger.info(`[browser] ${item.url}: HTTP ${res.status} but extracted ${extracted.wordCount} words via ${extracted.extractionMethod} — treating as success`);
          } else {
            logger.info(`[browser] ${item.url}: ${extracted.wordCount} words via ${extracted.extractionMethod} (was ${item.word_count || 0})`);
          }
          return buildResult(item, extracted, 'browser', res.url || item.url, null);
        }
      }

      // Browser returned but content is insufficient
      browserFailed = true;
      browserError = res.status >= 400
        ? `Browser HTTP ${res.status} (${extracted.wordCount} words)`
        : `Browser: only ${extracted.wordCount} words (tried ${extracted.extractionMethod})`;
      logger.warn(`[browser] ${item.url}: ${browserError} — trying Wayback Machine`);
    } catch (err) {
      browserFailed = true;
      browserError = `Browser: ${err.message}`;
      logger.warn(`[browser] ${item.url}: ${err.message} — trying Wayback Machine`);
    }

    // --- Tier 3: Wayback Machine fallback ---
    if (browserFailed && tools.http && tools.http.get) {
      try {
        const waybackUrl = `https://web.archive.org/web/${item.url}`;
        logger.info(`[wayback] Fetching ${item.url}`);
        const wbRes = await tools.http.get(waybackUrl, { timeout: request_timeout });

        if (wbRes.status >= 400) {
          throw new Error(`Wayback HTTP ${wbRes.status}`);
        }

        const wbBody = typeof wbRes.body === 'string' ? wbRes.body : String(wbRes.body);

        // Check if Wayback actually has a snapshot
        if (wbBody.includes('Wayback Machine has not archived that URL') ||
            wbBody.includes('The Wayback Machine has not archived that URL') ||
            wbBody.includes('This URL has been excluded from the Wayback Machine')) {
          throw new Error('No Wayback snapshot available');
        }

        const extracted = extractFromHtml(wbBody, item.url, item);

        if (extracted.wordCount >= min_word_threshold) {
          logger.info(`[wayback] ${item.url}: ${extracted.wordCount} words via ${extracted.extractionMethod} from Wayback Machine`);
          return buildResult(item, extracted, 'wayback', item.url, null);
        }

        logger.warn(`[wayback] ${item.url}: only ${extracted.wordCount} words from Wayback`);
      } catch (wbErr) {
        logger.warn(`[wayback] ${item.url}: ${wbErr.message}`);
      }
    }

    // --- All tiers failed ---
    logger.error(`[browser] ${item.url}: all methods failed`);
    return {
      ...item,
      url: item.url,
      final_url: item.url,
      title: item.title,
      word_count: 0,
      content_type: null,
      status: 'error',
      error: browserError,
      text_preview: '',
      meta_description: item.meta_description || null,
      og_description: item.og_description || null,
      text_content: '',
      entity_name: item.entity_name,
      scrape_method: 'browser',
      extraction_method: 'none',
    };
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
      // Save partial result so the worker can recover on timeout
      if (tools._partialItems) tools._partialItems.push(scrapeResults[idx]);
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

    // --- Duplicate text detection (post-scrape) ---
    // If 3+ browser-scraped pages return identical text_content, it's a block/error
    // page regardless of wording (catches Akamai, Imperva, DataDome, etc.)
    const scrapeTextCounts = new Map();
    for (const r of scrapeResults) {
      if (r && r.status === 'success' && r.text_content) {
        const text = r.text_content.trim();
        if (text.length > 0) {
          scrapeTextCounts.set(text, (scrapeTextCounts.get(text) || 0) + 1);
        }
      }
    }
    const scrapeDuplicates = new Set();
    for (const [text, count] of scrapeTextCounts) {
      if (count >= 3) scrapeDuplicates.add(text);
    }
    if (scrapeDuplicates.size > 0) {
      let demoted = 0;
      for (const r of scrapeResults) {
        if (r && r.status === 'success' && r.text_content && scrapeDuplicates.has(r.text_content.trim())) {
          r.status = 'error';
          r.error = `Duplicate text across ${scrapeTextCounts.get(r.text_content.trim())} pages — likely a block/error page`;
          r.word_count = 0;
          r.text_content = '';
          r.text_preview = '';
          demoted++;
        }
      }
      logger.info(`Post-scrape duplicate detection: ${demoted} pages demoted from success to error (${scrapeDuplicates.size} duplicate pattern(s))`);
    }

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

    // Count extraction methods for diagnostics
    const methodCounts = {};
    for (const i of items) {
      const m = i.extraction_method || 'unknown';
      methodCounts[m] = (methodCounts[m] || 0) + 1;
    }

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
        extraction_methods: methodCounts,
      },
    });
  }

  const browserTotal = needsScrape.length;
  const browserSuccess = scrapeResults ? scrapeResults.filter((r) => r && r.status === 'success').length : 0;
  const browserErrors = browserTotal - browserSuccess;

  // Aggregate extraction method stats
  const allMethodCounts = {};
  for (const r of results) {
    const m = r.extraction_method || 'unknown';
    allMethodCounts[m] = (allMethodCounts[m] || 0) + 1;
  }
  const methodSummary = Object.entries(allMethodCounts)
    .filter(([m]) => m !== 'original' && m !== 'unknown')
    .map(([m, c]) => `${c} ${m}`)
    .join(', ');

  const description = browserTotal > 0
    ? `${browserSuccess} of ${browserTotal} pages recovered by browser, ${passThrough.length} passed through${browserErrors > 0 ? `, ${browserErrors} still failed` : ''}${methodSummary ? ` [${methodSummary}]` : ''}`
    : `All ${passThrough.length} pages already had sufficient content — nothing to re-scrape`;

  return {
    results: entityResults,
    summary: {
      total_entities: entities.length,
      total_items: allItems.length,
      browser_attempted: browserTotal,
      browser_success: browserSuccess,
      errors: browserErrors,
      browser_errors: browserErrors,
      passed_through: passThrough.length,
      extraction_methods: allMethodCounts,
      description,
    },
  };
}

// --- Extraction Tier 1: Readability ---

/**
 * Extract text via Mozilla Readability (Firefox Reader Mode algorithm).
 * Accepts a pre-parsed linkedom document to avoid double-parsing.
 * Returns raw text only — does NOT fall through to other tiers.
 *
 * Note: Readability mutates the document (removes elements it considers
 * non-content). If it succeeds, the DOM is modified. If it fails and we
 * fall through to CMS extraction, the DOM may be partially stripped.
 * This is acceptable because CMS selectors target specific containers
 * that Readability typically leaves intact.
 */
function extractTextReadability(document) {
  const reader = new Readability(document);
  const article = reader.parse();

  if (article && article.textContent && article.textContent.trim().length > 50) {
    return cleanText(article.textContent);
  }
  return '';
}

// --- Extraction Tier 2: DOM-based CMS-aware extraction ---

/**
 * Use querySelectorAll on a pre-parsed linkedom document to find
 * CMS content containers. Collects ALL matching elements for each selector
 * (handles Elementor/Divi pages that spread content across many widgets).
 *
 * Strips noise elements (nav, footer, cookie banners, etc.) from DOM
 * before extraction — much more reliable than regex for nested HTML.
 *
 * Accepts a pre-parsed document to avoid double-parsing large pages.
 * Note: this mutates the document (removes noise elements).
 */
function extractTextCmsAware(document, logger) {
  // Strip noise elements from DOM before extraction
  for (const sel of NOISE_SELECTORS) {
    try {
      document.querySelectorAll(sel).forEach((el) => el.remove());
    } catch (_) {
      // Invalid selector in this DOM — skip
    }
  }

  // Try CMS selectors in priority order
  for (const selector of CMS_SELECTORS) {
    try {
      const elements = document.querySelectorAll(selector);
      if (elements.length === 0) continue;

      const texts = [];
      for (const el of elements) {
        const text = el.textContent.trim();
        if (text.length > 20) {
          texts.push(text);
        }
      }

      if (texts.length === 0) continue;

      const combined = cleanText(texts.join('\n\n'));
      const wc = countWords(combined);

      if (wc >= 30) {
        if (logger) {
          logger.info(`[cms_dom] Matched selector "${selector}" — ${elements.length} element(s), ${wc} words`);
        }
        return combined;
      }
    } catch (_) {
      // Selector not supported by linkedom — skip
    }
  }

  // No CMS selector matched — return body text as last resort
  const body = document.querySelector('body');
  if (body) {
    return cleanText(body.textContent);
  }

  return '';
}

// --- Extraction Tier 3: Regex fallback ---

/**
 * Regex-based text extraction. Last resort for HTML too malformed
 * for linkedom's DOM parser. Kept from the original implementation
 * but only used when both Readability and DOM extraction fail.
 */
function extractTextRegexFallback(html) {
  let content = html;

  const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);

  if (mainMatch) {
    content = mainMatch[1];
  } else if (articleMatch) {
    content = articleMatch[1];
  } else {
    const cmsPatterns = [
      /<div[^>]+class="[^"]*\bentry-content\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]+class="[^"]*\bpost-content\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]+class="[^"]*\bpage-content\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]+class="[^"]*\belementor-widget-text-editor\b[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i,
      /<div[^>]+class="[^"]*\bet_pb_text_inner\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]+class="[^"]*\bwpb_wrapper\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /<[^>]+role=["']main["'][^>]*>([\s\S]*?)<\/[a-z]+>/i,
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
      if (bodyMatch) content = bodyMatch[1];
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

  return cleanText(content);
}

// --- Shared helpers ---

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

/**
 * Extract og:description meta tag from HTML.
 * Always present in static HTML even on JS-rendered pages.
 */
function extractOgDescription(html) {
  const match = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i);
  return match ? decodeEntities(match[1].trim()) : null;
}

/**
 * Check if extracted text is likely truncated by comparing against og:description.
 */
function isLikelyTruncated(textContent, ogDescription) {
  if (!ogDescription || ogDescription.length < 100) return false;
  if (!textContent) return true;
  return textContent.length <= ogDescription.length;
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
