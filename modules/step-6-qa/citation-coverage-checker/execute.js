/**
 * Citation Coverage Checker -- Step 6 QA submodule
 *
 * Verifies that every factual claim in generated content is backed by a
 * citation to a valid source URL. Checks inline [#n] references against
 * the source_citations array from content-analyzer's analysis_json.
 *
 * Data operation: TRANSFORM (=) -- same entities, enriched with QA verdicts.
 * Data-shape routing: finds input by field presence, never by source_submodule.
 *
 * Checks performed:
 *   1. Content has citations at all (auto-fail if zero)
 *   2. Every [#n] reference maps to a source in source_citations
 *   3. No orphan citations (referenced index with no matching source)
 *   4. Factual claims (numbers, dates, statistics, company facts) have citations
 *   5. Optional: source URLs respond to HEAD requests (verify_urls)
 */

// ─── Regex patterns for inline citations ───

/** Matches [#1], [#2], [#12], etc. */
const CITATION_REF_PATTERN = /\[#(\d+)\]/g;

// ─── Heuristic patterns for factual claims ───

/**
 * Patterns that indicate a sentence contains a factual claim requiring citation.
 * Each pattern is tested case-insensitively against individual sentences.
 */
const FACTUAL_CLAIM_PATTERNS = [
  // Numbers and statistics
  /\b\d{1,3}(?:,\d{3})+\b/,                    // Large numbers: 1,000 or 1,000,000
  /\b\d+(?:\.\d+)?\s*(?:million|billion|trillion)\b/i,  // "5.2 million", "3 billion"
  /\b\d+(?:\.\d+)?\s*%/,                        // Percentages: "45%", "3.2%"
  /\$\s*\d+/,                                   // Dollar amounts: "$500", "$ 1.2"
  /\b€\s*\d+/,                                  // Euro amounts
  /\b£\s*\d+/,                                  // Pound amounts
  /\bUSD\s*\d+/i,                               // "USD 500"
  /\bEUR\s*\d+/i,                               // "EUR 500"
  /\bGBP\s*\d+/i,                               // "GBP 500"

  // Dates and time-based claims
  /\bfounded\s+in\s+\d{4}\b/i,                  // "founded in 2005"
  /\bestablished\s+in\s+\d{4}\b/i,              // "established in 1998"
  /\blaunched\s+in\s+\d{4}\b/i,                 // "launched in 2020"
  /\bsince\s+\d{4}\b/i,                         // "since 2010"
  /\bin\s+\d{4}\b/,                              // "in 2015" (year references)

  // Company-specific claims
  /\bheadquartered\s+in\b/i,                    // "headquartered in Malta"
  /\bbased\s+in\b/i,                            // "based in London"
  /\bemploys?\s+(?:over\s+|more\s+than\s+|approximately\s+)?\d/i, // "employs 500", "employs over 1000"
  /\b\d+\s+employees?\b/i,                      // "500 employees"
  /\blicensed?\s+(?:by|in|from)\b/i,            // "licensed by the MGA"
  /\bregulated\s+by\b/i,                        // "regulated by the UKGC"
  /\bacquired\s+(?:by|for)\b/i,                 // "acquired by Entain"
  /\bmerged\s+with\b/i,                         // "merged with Ladbrokes"
  /\bpartnership\s+with\b/i,                    // "partnership with Evolution"
  /\bsponsors?\s+(?:of|the)\b/i,                // "sponsor of Arsenal"
];

/**
 * Patterns for general-knowledge sentences that do NOT require citations.
 * If a sentence matches any of these, it is excluded from the uncited check
 * even if it also matches a factual claim pattern.
 */
const GENERAL_KNOWLEDGE_PATTERNS = [
  /\bigaming\s+is\b/i,                          // "iGaming is a growing industry"
  /\bonline\s+gambling\s+is\b/i,                // "online gambling is regulated"
  /\bthe\s+industry\s+(?:is|has|continues)\b/i, // "the industry continues to grow"
  /\bglobally\b/i,                              // General global statements
  /\bgenerally\s+(?:speaking|considered)\b/i,   // "generally speaking"
  /\bit\s+is\s+(?:widely|commonly|generally)\b/i, // "it is widely known"
  /\bas\s+(?:one\s+of\s+)?the\s+(?:largest|biggest|most)\b/i, // subjective superlatives
];

// ─── Helper functions ───

/**
 * Split markdown content into sentences. Handles common abbreviations
 * to avoid false splits on "Dr.", "Mr.", "Inc.", etc.
 */
function splitIntoSentences(text) {
  if (!text || typeof text !== 'string') return [];

  // Remove markdown formatting that could interfere with sentence splitting
  let cleaned = text
    .replace(/^#+\s+.*$/gm, '')          // Remove headings
    .replace(/^---+$/gm, '')             // Remove horizontal rules
    .replace(/^>\s+/gm, '')              // Remove blockquote markers
    .replace(/\*\*([^*]+)\*\*/g, '$1')   // Remove bold markers
    .replace(/\*([^*]+)\*/g, '$1')       // Remove italic markers
    .replace(/`[^`]+`/g, '')             // Remove inline code
    .replace(/```[\s\S]*?```/g, '')      // Remove code blocks
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Replace links with text
    .replace(/^-\s+/gm, '')             // Remove list markers
    .replace(/^\d+\.\s+/gm, '');         // Remove numbered list markers

  // Protect common abbreviations from sentence splitting
  const protections = [
    [/\bDr\./g, 'Dr\x00'],
    [/\bMr\./g, 'Mr\x00'],
    [/\bMs\./g, 'Ms\x00'],
    [/\bInc\./g, 'Inc\x00'],
    [/\bLtd\./g, 'Ltd\x00'],
    [/\bCo\./g, 'Co\x00'],
    [/\bvs\./g, 'vs\x00'],
    [/\be\.g\./g, 'eg\x00'],
    [/\bi\.e\./g, 'ie\x00'],
    [/\betc\./g, 'etc\x00'],
    [/\bNo\./g, 'No\x00'],
  ];
  for (const [pattern, replacement] of protections) {
    cleaned = cleaned.replace(pattern, replacement);
  }

  // Split on sentence-ending punctuation followed by whitespace or end-of-string
  const rawSentences = cleaned.split(/(?<=[.!?])\s+/);

  // Restore protected abbreviations and filter empty lines
  return rawSentences
    .map(s => s.replace(/\x00/g, '.').trim())
    .filter(s => s.length > 10); // Skip very short fragments
}

/**
 * Check if a sentence contains a factual claim pattern.
 */
function isFactualClaim(sentence) {
  return FACTUAL_CLAIM_PATTERNS.some(pattern => pattern.test(sentence));
}

/**
 * Check if a sentence is general knowledge (does not need citation).
 */
function isGeneralKnowledge(sentence) {
  return GENERAL_KNOWLEDGE_PATTERNS.some(pattern => pattern.test(sentence));
}

/**
 * Extract all unique citation reference numbers from content.
 * Returns Set of integers.
 */
function extractCitationRefs(content) {
  if (!content || typeof content !== 'string') return new Set();

  const refs = new Set();
  let match;
  // Reset lastIndex since we reuse the global regex
  const pattern = /\[#(\d+)\]/g;
  while ((match = pattern.exec(content)) !== null) {
    refs.add(parseInt(match[1], 10));
  }
  return refs;
}

/**
 * Build a map from citation index to source URL/title from analysis_json.source_citations.
 * Handles multiple shapes:
 *   - v1.3.0: [{index, url, title}]
 *   - v1.2.0: [{claim, sources: [url, ...]}] -- no explicit index
 *   - v1.0.0: ["url string"]
 */
function buildSourceMap(sourceCitations) {
  if (!Array.isArray(sourceCitations)) return new Map();

  const map = new Map();

  for (let i = 0; i < sourceCitations.length; i++) {
    const entry = sourceCitations[i];

    if (typeof entry === 'string') {
      // v1.0.0: plain URL strings, 1-indexed
      map.set(i + 1, { url: entry, title: '' });
    } else if (entry && entry.index !== undefined) {
      // v1.3.0: {index, url, title}
      map.set(entry.index, { url: entry.url || '', title: entry.title || '' });
    } else if (entry && entry.url) {
      // Object with url but no explicit index, use 1-based position
      map.set(i + 1, { url: entry.url, title: entry.title || '' });
    } else if (entry && entry.sources) {
      // v1.2.0: {claim, sources: [url, ...]}
      const url = Array.isArray(entry.sources) ? entry.sources[0] : '';
      map.set(i + 1, { url: url || '', title: entry.claim || '' });
    }
  }

  return map;
}

/**
 * Verify a URL is live via HEAD request.
 * Returns {url, alive: boolean, status: number|null, error: string|null}
 */
async function checkUrlAlive(url, http) {
  try {
    const response = await http.head(url, {
      timeout: 10000,
      headers: { 'User-Agent': 'ContentPipeline-QA/1.0' },
    });
    const status = response.status || response.statusCode || 0;
    return {
      url,
      alive: status >= 200 && status < 400,
      status,
      error: null,
    };
  } catch (err) {
    return {
      url,
      alive: false,
      status: null,
      error: err.message || 'Request failed',
    };
  }
}


// ─── Main execute function ───

async function execute(input, options, tools) {
  const { entities } = input;
  const { logger, progress } = tools;
  const {
    pass_threshold = 0.7,
    verify_urls = false,
    require_factual_citations = true,
  } = options;

  logger.info(
    `Config: pass_threshold=${pass_threshold}, verify_urls=${verify_urls}, ` +
    `require_factual_citations=${require_factual_citations}`
  );

  const results = [];

  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i];
    progress.update(i + 1, entities.length, `Checking citations for ${entity.name}`);

    // --- Data-shape routing: find content and analysis items by field presence ---
    const contentItems = (entity.items || []).filter(item => item.content_markdown);
    const analysisItems = (entity.items || []).filter(item => item.analysis_json);

    // --- Edge case: no content at all ---
    if (contentItems.length === 0) {
      logger.warn(`${entity.name}: no content_markdown found in any item`);
      results.push({
        entity_name: entity.name,
        items: [{
          entity_name: entity.name,
          qa_pass: false,
          citation_score: 0,
          citation_count: 0,
          source_count: 0,
          uncited_claims_count: 0,
          broken_citations_count: 0,
          uncited_claims_text: '',
          broken_citations_text: '',
          dead_urls_text: '',
          summary_text: 'No content_markdown found -- ensure content-writer has run.',
        }],
        meta: { qa_pass: false, citation_score: 0 },
      });
      continue;
    }

    // --- Combine all content_markdown from content items ---
    const allMarkdown = contentItems.map(item => item.content_markdown).join('\n\n');

    // --- Extract inline citation references from content ---
    const citationRefs = extractCitationRefs(allMarkdown);
    const citationCount = citationRefs.size;

    // --- Build source map from analysis_json ---
    let sourceMap = new Map();
    for (const item of analysisItems) {
      if (item.analysis_json && item.analysis_json.source_citations) {
        sourceMap = buildSourceMap(item.analysis_json.source_citations);
        break; // Use the first analysis_json found
      }
    }
    const sourceCount = sourceMap.size;

    // --- Edge case: content has no citations at all ---
    if (citationCount === 0) {
      logger.warn(`${entity.name}: content has zero inline citations -- automatic fail`);
      results.push({
        entity_name: entity.name,
        items: [{
          entity_name: entity.name,
          qa_pass: false,
          citation_score: 0,
          citation_count: 0,
          source_count: sourceCount,
          uncited_claims_count: 0,
          broken_citations_count: 0,
          uncited_claims_text: '',
          broken_citations_text: '',
          dead_urls_text: '',
          summary_text: 'Content contains no inline citations [#n]. Automatic fail.',
        }],
        meta: { qa_pass: false, citation_score: 0 },
      });
      continue;
    }

    // --- Check 1: orphan/broken citations (reference exists but no source) ---
    const brokenCitations = [];
    for (const refNum of citationRefs) {
      if (!sourceMap.has(refNum)) {
        brokenCitations.push(`[#${refNum}] -- referenced in content but no matching source in source_citations`);
      }
    }

    // --- Check 2: uncited factual claims ---
    const uncitedClaims = [];
    if (require_factual_citations) {
      const sentences = splitIntoSentences(allMarkdown);

      for (const sentence of sentences) {
        // Reset global regex lastIndex before each test
        CITATION_REF_PATTERN.lastIndex = 0;

        // Skip sentences that already have a citation
        if (CITATION_REF_PATTERN.test(sentence)) continue;

        // Skip general knowledge statements
        if (isGeneralKnowledge(sentence)) continue;

        // Check if this sentence contains a factual claim
        if (isFactualClaim(sentence)) {
          // Truncate long sentences for readability
          const display = sentence.length > 120
            ? sentence.substring(0, 117) + '...'
            : sentence;
          uncitedClaims.push(display);
        }
      }
    }

    // --- Check 3: optional URL verification ---
    const deadUrls = [];
    if (verify_urls && sourceMap.size > 0) {
      logger.info(`${entity.name}: verifying ${sourceMap.size} source URLs`);
      const urlChecks = [];
      const checkedUrls = new Set(); // Deduplicate URLs

      for (const [index, source] of sourceMap) {
        if (source.url && !checkedUrls.has(source.url)) {
          checkedUrls.add(source.url);
          urlChecks.push(
            checkUrlAlive(source.url, tools.http).then(result => ({
              index,
              ...result,
            }))
          );
        }
      }

      const urlResults = await Promise.all(urlChecks);
      for (const result of urlResults) {
        if (!result.alive) {
          deadUrls.push(
            `[#${result.index}] ${result.url} -- ${result.error || `HTTP ${result.status}`}`
          );
        }
      }

      if (deadUrls.length > 0) {
        logger.warn(`${entity.name}: ${deadUrls.length} dead source URL(s)`);
      }
    }

    // --- Calculate citation_score ---
    // Score = citations with valid sources / (citations with valid sources + uncited claims + broken citations)
    const validCitations = citationCount - brokenCitations.length;
    const problemCount = uncitedClaims.length + brokenCitations.length;
    const citationScore = validCitations + problemCount > 0
      ? validCitations / (validCitations + problemCount)
      : 0;

    // --- Determine pass/fail ---
    const qaPassed = citationScore >= pass_threshold;

    // --- Format text outputs ---
    const uncitedClaimsText = uncitedClaims.length > 0
      ? uncitedClaims.map((c, idx) => `${idx + 1}. ${c}`).join('\n')
      : 'None -- all factual claims have citations.';

    const brokenCitationsText = brokenCitations.length > 0
      ? brokenCitations.join('\n')
      : 'None -- all citation references have matching sources.';

    const deadUrlsText = verify_urls
      ? (deadUrls.length > 0
          ? deadUrls.join('\n')
          : 'All source URLs are live.')
      : 'URL verification disabled.';

    const summaryParts = [
      `${citationCount} inline citation(s) found, ${sourceCount} source(s) in citations array.`,
    ];
    if (brokenCitations.length > 0) {
      summaryParts.push(`${brokenCitations.length} broken citation reference(s).`);
    }
    if (uncitedClaims.length > 0) {
      summaryParts.push(`${uncitedClaims.length} factual claim(s) without citations.`);
    }
    if (deadUrls.length > 0) {
      summaryParts.push(`${deadUrls.length} dead source URL(s).`);
    }
    summaryParts.push(`Citation score: ${(citationScore * 100).toFixed(1)}% (threshold: ${(pass_threshold * 100).toFixed(1)}%).`);

    const summaryText = summaryParts.join(' ');

    const logFn = qaPassed ? 'info' : 'warn';
    logger[logFn](
      `${entity.name}: citation_score=${(citationScore * 100).toFixed(1)}% ` +
      `(${qaPassed ? 'PASS' : 'FAIL'}) -- ` +
      `${citationCount} citations, ${brokenCitations.length} broken, ` +
      `${uncitedClaims.length} uncited claims`
    );

    results.push({
      entity_name: entity.name,
      items: [{
        entity_name: entity.name,
        qa_pass: qaPassed,
        citation_score: parseFloat(citationScore.toFixed(3)),
        citation_count: citationCount,
        source_count: sourceCount,
        uncited_claims_count: uncitedClaims.length,
        broken_citations_count: brokenCitations.length,
        uncited_claims_text: uncitedClaimsText,
        broken_citations_text: brokenCitationsText,
        dead_urls_text: deadUrlsText,
        summary_text: summaryText,
      }],
      meta: {
        qa_pass: qaPassed,
        citation_score: parseFloat(citationScore.toFixed(3)),
        citation_count: citationCount,
        source_count: sourceCount,
        uncited_claims: uncitedClaims.length,
        broken_citations: brokenCitations.length,
        dead_urls: deadUrls.length,
      },
    });
  }

  // --- Build summary ---
  const totalEntities = entities.length;
  const passCount = results.filter(r => r.items.length > 0 && r.items[0].qa_pass === true).length;
  const failCount = results.filter(r => r.items.length > 0 && r.items[0].qa_pass === false).length;
  const avgScore = results.length > 0
    ? results.reduce((sum, r) => sum + (r.items[0]?.citation_score || 0), 0) / results.length
    : 0;

  let description;
  if (failCount === 0) {
    description = `All ${passCount} entities passed citation coverage (avg score: ${(avgScore * 100).toFixed(1)}%)`;
  } else {
    const parts = [];
    if (passCount > 0) parts.push(`${passCount} passed`);
    if (failCount > 0) parts.push(`${failCount} failed`);
    description = `${parts.join(', ')} of ${totalEntities} entities (avg score: ${(avgScore * 100).toFixed(1)}%)`;
  }

  return {
    results,
    summary: {
      total_entities: totalEntities,
      total_items: results.reduce((sum, r) => sum + r.items.length, 0),
      passed: passCount,
      failed: failCount,
      average_score: parseFloat(avgScore.toFixed(3)),
      description,
    },
  };
}

module.exports = execute;
