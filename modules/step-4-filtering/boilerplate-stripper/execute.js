/**
 * Boilerplate Stripper -- Step 4 Filtering submodule
 *
 * Removes navigation menus, cookie banners, footer disclaimers, and repeated
 * boilerplate from scraped text_content using two complementary strategies:
 *
 * 1. Cross-page fingerprinting: blocks that appear on many pages from the same
 *    entity are likely navigation/footer boilerplate.
 * 2. Known-pattern matching: common boilerplate phrases (cookie consent, GDPR,
 *    newsletter CTAs, social sharing) are stripped regardless of frequency.
 *
 * Data operation: TRANSFORM (=) -- same items in, same items out, cleaner text.
 */

// -------------------------------------------------------------------------
// Known boilerplate patterns (case-insensitive substrings)
// -------------------------------------------------------------------------

const KNOWN_PATTERNS = [
  // Cookie consent
  'we use cookies',
  'this website uses cookies',
  'cookie policy',
  'accept all cookies',
  'manage cookie preferences',
  'manage preferences',
  'by continuing to browse',
  'we use cookies to improve',
  'cookie settings',
  'accept cookies',
  'reject all cookies',
  'this site uses cookies',

  // GDPR / Privacy
  'privacy policy',
  'data protection',
  'your privacy choices',
  'gdpr',
  'personal data',
  'consent to the use',
  'update your preferences',
  'manage your privacy',

  // Newsletter / subscription CTAs
  'subscribe to our newsletter',
  'sign up for updates',
  'enter your email',
  'get the latest news',
  'join our mailing list',
  'subscribe now',
  'stay up to date',
  'sign up for our newsletter',
  'unsubscribe at any time',

  // Social sharing
  'follow us on',
  'share this',
  'tweet this',
  'share on facebook',
  'share on twitter',
  'share on linkedin',
  'pin it',

  // Navigation artifacts
  'skip to content',
  'skip to main content',
  'toggle navigation',
  'back to top',
  'scroll to top',

  // Copyright / legal boilerplate
  'all rights reserved',
  'terms and conditions',
  'terms of service',
  'terms of use',
];

// -------------------------------------------------------------------------
// Simple string hash (djb2) -- fast, no crypto dependency needed
// -------------------------------------------------------------------------

function hashBlock(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return hash;
}

// -------------------------------------------------------------------------
// Normalize a text block for fingerprinting
// -------------------------------------------------------------------------

function normalizeBlock(block) {
  return block
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// -------------------------------------------------------------------------
// Split text_content into blocks (paragraphs separated by double newlines)
// -------------------------------------------------------------------------

function splitIntoBlocks(text) {
  if (!text) return [];
  return text
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter((b) => b.length > 0);
}

// -------------------------------------------------------------------------
// Check if a block matches any known boilerplate pattern
// -------------------------------------------------------------------------

function matchesKnownPattern(normalizedBlock) {
  for (const pattern of KNOWN_PATTERNS) {
    if (normalizedBlock.includes(pattern)) {
      return true;
    }
  }
  return false;
}

// -------------------------------------------------------------------------
// Count words in a string
// -------------------------------------------------------------------------

function countWords(text) {
  if (!text || !text.trim()) return 0;
  return text.trim().split(/\s+/).length;
}

// -------------------------------------------------------------------------
// Main execute function
// -------------------------------------------------------------------------

async function execute(input, options, tools) {
  const { entities } = input;
  const { logger, progress } = tools;
  const {
    frequency_threshold = 0.5,
    min_block_length = 20,
    min_content_ratio = 0.3,
    strip_known_patterns = true,
  } = options;

  logger.info(
    `Boilerplate Stripper config: frequency_threshold=${frequency_threshold}, min_block_length=${min_block_length}, min_content_ratio=${min_content_ratio}, strip_known_patterns=${strip_known_patterns}`
  );

  // Step 1: Collect all items, grouped by entity
  const entityGroups = [];

  for (const entity of entities) {
    const items = [];

    if (entity.items && entity.items.length > 0) {
      for (const item of entity.items) {
        items.push({
          ...item,
          entity_name: entity.name || item.entity_name || 'unknown',
        });
      }
    } else if (entity.url) {
      // Flat entity (acts as its own item)
      items.push({
        ...entity,
        entity_name: entity.entity_name || entity.name || 'unknown',
      });
    } else {
      logger.warn(
        `Skipping entity with no items and no url. Keys: ${Object.keys(entity).join(', ')}`
      );
      continue;
    }

    entityGroups.push({
      entity_name: entity.name || 'unknown',
      items,
    });
  }

  const totalItems = entityGroups.reduce((sum, g) => sum + g.items.length, 0);
  logger.info(`Processing ${totalItems} items across ${entityGroups.length} entities`);

  // Step 2: Process each entity group independently
  const results = [];
  let processedCount = 0;
  let totalStrippedChars = 0;
  let totalFlagged = 0;

  for (const group of entityGroups) {
    const { entity_name, items } = group;
    const pageCount = items.length;

    // ---------------------------------------------------------------
    // Build cross-page frequency map (only useful with 2+ pages)
    // ---------------------------------------------------------------
    const blockFrequency = new Map(); // hash -> { normalized, count }

    if (pageCount >= 2) {
      // Determine effective threshold:
      // With 2 pages, require 100% match (both pages must have the block)
      const effectiveThreshold = pageCount === 2 ? 1.0 : frequency_threshold;

      for (const item of items) {
        const blocks = splitIntoBlocks(item.text_content || '');
        // Track which hashes this page has seen (dedupe within a page)
        const seenOnThisPage = new Set();

        for (const block of blocks) {
          const normalized = normalizeBlock(block);
          if (normalized.length < min_block_length) continue;

          const hash = hashBlock(normalized);
          if (seenOnThisPage.has(hash)) continue;
          seenOnThisPage.add(hash);

          if (!blockFrequency.has(hash)) {
            blockFrequency.set(hash, { normalized, count: 0 });
          }
          blockFrequency.get(hash).count++;
        }
      }

      // Mark blocks above the threshold as boilerplate
      const minCount = Math.ceil(pageCount * effectiveThreshold);
      for (const [hash, entry] of blockFrequency) {
        if (entry.count < minCount) {
          blockFrequency.delete(hash);
        }
      }

      logger.info(
        `${entity_name}: ${blockFrequency.size} boilerplate blocks identified across ${pageCount} pages (threshold: ${effectiveThreshold}, min count: ${minCount})`
      );
    } else {
      logger.info(
        `${entity_name}: single page -- cross-page analysis skipped, using pattern matching only`
      );
    }

    // ---------------------------------------------------------------
    // Strip boilerplate from each item
    // ---------------------------------------------------------------
    const cleanedItems = [];

    for (const item of items) {
      processedCount++;
      progress.update(processedCount, totalItems, `Cleaning ${entity_name}: ${processedCount}/${totalItems}`);

      const originalText = item.text_content || '';
      const originalLength = originalText.length;

      // Nothing to clean
      if (!originalText.trim()) {
        cleanedItems.push({
          url: item.url,
          text_content: '',
          word_count: 0,
          stripped_chars: 0,
          boilerplate_ratio: 0,
          flagged: false,
          entity_name: item.entity_name,
        });
        continue;
      }

      const blocks = splitIntoBlocks(originalText);
      const keptBlocks = [];

      for (const block of blocks) {
        const normalized = normalizeBlock(block);

        // Check 1: cross-page frequency (if we have a frequency map)
        if (blockFrequency.size > 0) {
          const hash = hashBlock(normalized);
          if (blockFrequency.has(hash)) {
            continue; // Skip boilerplate block
          }
        }

        // Check 2: known pattern matching
        if (strip_known_patterns && normalized.length >= min_block_length) {
          if (matchesKnownPattern(normalized)) {
            continue; // Skip known boilerplate block
          }
        }

        keptBlocks.push(block);
      }

      const cleanedText = keptBlocks.join('\n\n');
      const cleanedLength = cleanedText.length;
      const strippedChars = originalLength - cleanedLength;
      const boilerplateRatio = originalLength > 0
        ? Math.round((strippedChars / originalLength) * 100) / 100
        : 0;

      // Flag if too much was stripped
      const contentRatio = originalLength > 0 ? cleanedLength / originalLength : 1;
      const flagged = contentRatio < min_content_ratio && strippedChars > 0;

      if (flagged) {
        logger.warn(
          `${entity_name}: ${item.url} -- content ratio ${(contentRatio * 100).toFixed(1)}% below threshold ${(min_content_ratio * 100).toFixed(1)}%`
        );
        totalFlagged++;
      }

      totalStrippedChars += strippedChars;

      cleanedItems.push({
        url: item.url,
        text_content: cleanedText,
        word_count: countWords(cleanedText),
        stripped_chars: strippedChars,
        boilerplate_ratio: boilerplateRatio,
        flagged,
        entity_name: item.entity_name,
      });
    }

    results.push({
      entity_name,
      items: cleanedItems,
      meta: {
        total: cleanedItems.length,
        boilerplate_blocks_found: blockFrequency.size,
        total_stripped_chars: cleanedItems.reduce((s, i) => s + i.stripped_chars, 0),
        flagged: cleanedItems.filter((i) => i.flagged).length,
      },
    });
  }

  // Build summary
  const errors = [];
  const avgRatio = totalItems > 0
    ? Math.round(
        (results.reduce(
          (sum, r) => sum + r.items.reduce((s, i) => s + i.boilerplate_ratio, 0),
          0
        ) / totalItems) * 100
      )
    : 0;

  const flaggedPart = totalFlagged > 0 ? `, ${totalFlagged} flagged` : '';
  const description = `${totalItems} pages cleaned across ${entityGroups.length} entities -- ${totalStrippedChars} chars stripped (avg ${avgRatio}% boilerplate)${flaggedPart}`;

  return {
    results,
    summary: {
      total_entities: entityGroups.length,
      total_items: totalItems,
      total_stripped_chars: totalStrippedChars,
      average_boilerplate_pct: avgRatio,
      flagged: totalFlagged,
      description,
      errors,
    },
  };
}

module.exports = execute;
