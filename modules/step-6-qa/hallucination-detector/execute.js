/**
 * Hallucination Detector -- Step 6 QA submodule
 *
 * Compares generated content claims against original source material to
 * flag statements that aren't supported by any source. Uses LLM-based
 * verification to handle paraphrasing, analysis-derived facts, and
 * general knowledge.
 *
 * Data operation: TRANSFORM (=) -- same entities, enriched with QA verdicts.
 * Data-shape routing: finds input by field presence, never by source_submodule.
 *
 * Process:
 *   1. Extract factual claims from content_markdown using heuristics
 *   2. Gather source text_content from scraped pages
 *   3. Batch claims and send to LLM with source text for verification
 *   4. Score: verified / total claims
 *   5. Pass/fail based on pass_threshold
 */

// ─── Heuristic patterns for factual claims ───

/**
 * Patterns that indicate a sentence contains a specific factual claim
 * worth verifying against sources. Each is tested case-insensitively.
 */
const FACTUAL_CLAIM_PATTERNS = [
  // Numbers and statistics
  /\b\d{1,3}(?:,\d{3})+\b/,                    // Large numbers: 1,000 or 1,000,000
  /\b\d+(?:\.\d+)?\s*(?:million|billion|trillion)\b/i,  // "5.2 million", "3 billion"
  /\b\d+(?:\.\d+)?\s*%/,                        // Percentages: "45%", "3.2%"
  /\$\s*\d+/,                                   // Dollar amounts
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
  /\bemploys?\s+(?:over\s+|more\s+than\s+|approximately\s+)?\d/i, // "employs 500"
  /\b\d+\s+employees?\b/i,                      // "500 employees"
  /\blicensed?\s+(?:by|in|from)\b/i,            // "licensed by the MGA"
  /\bregulated\s+by\b/i,                        // "regulated by the UKGC"
  /\bacquired\s+(?:by|for)\b/i,                 // "acquired by Entain"
  /\bmerged\s+with\b/i,                         // "merged with Ladbrokes"
  /\bpartnership\s+with\b/i,                    // "partnership with Evolution"
  /\bsponsors?\s+(?:of|the)\b/i,                // "sponsor of Arsenal"
  /\bpowered\s+by\b/i,                          // "powered by Pragmatic Play"
  /\boperates?\s+in\s+\d+/i,                    // "operates in 20 markets"
  /\bover\s+\d+\s+(?:brands?|markets?|countries|games?|titles?)\b/i, // "over 500 games"
];

/**
 * Patterns for general-knowledge sentences that should NOT be extracted
 * as claims requiring verification, even if they match factual patterns.
 */
const GENERAL_KNOWLEDGE_PATTERNS = [
  /\bigaming\s+is\b/i,
  /\bonline\s+gambling\s+is\b/i,
  /\bthe\s+industry\s+(?:is|has|continues)\b/i,
  /\bglobally\b/i,
  /\bgenerally\s+(?:speaking|considered)\b/i,
  /\bit\s+is\s+(?:widely|commonly|generally)\b/i,
  /\bas\s+(?:one\s+of\s+)?the\s+(?:largest|biggest|most)\b/i,
  /\bis\s+(?:a|an)\s+(?:popular|common|well-known|leading|major)\b/i,
  /\bplays?\s+(?:a|an)\s+(?:important|key|crucial|vital)\s+role\b/i,
  /\bcontinues?\s+to\s+(?:grow|expand|evolve)\b/i,
];

// ─── Text processing helpers ───

/**
 * Split markdown content into sentences, handling abbreviations and
 * markdown formatting. Strips structural elements (headings, lists, code).
 */
function splitIntoSentences(text) {
  if (!text || typeof text !== 'string') return [];

  // Remove markdown formatting
  let cleaned = text
    .replace(/^#+\s+.*$/gm, '')          // Headings
    .replace(/^---+$/gm, '')             // Horizontal rules
    .replace(/^>\s+/gm, '')              // Blockquote markers
    .replace(/\*\*([^*]+)\*\*/g, '$1')   // Bold
    .replace(/\*([^*]+)\*/g, '$1')       // Italic
    .replace(/`[^`]+`/g, '')             // Inline code
    .replace(/```[\s\S]*?```/g, '')      // Code blocks
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Links -> text
    .replace(/^-\s+/gm, '')             // List markers
    .replace(/^\d+\.\s+/gm, '')         // Numbered list markers
    .replace(/\[#?\d+\]/g, '');          // Citation references

  // Protect abbreviations from sentence splitting
  const protections = [
    [/\bDr\./g, 'Dr\x00'], [/\bMr\./g, 'Mr\x00'], [/\bMs\./g, 'Ms\x00'],
    [/\bInc\./g, 'Inc\x00'], [/\bLtd\./g, 'Ltd\x00'], [/\bCo\./g, 'Co\x00'],
    [/\bvs\./g, 'vs\x00'], [/\be\.g\./g, 'eg\x00'], [/\bi\.e\./g, 'ie\x00'],
    [/\betc\./g, 'etc\x00'], [/\bNo\./g, 'No\x00'],
  ];
  for (const [pattern, replacement] of protections) {
    cleaned = cleaned.replace(pattern, replacement);
  }

  const rawSentences = cleaned.split(/(?<=[.!?])\s+/);

  return rawSentences
    .map(s => s.replace(/\x00/g, '.').trim())
    .filter(s => s.length > 15); // Skip very short fragments
}

/**
 * Check if a sentence contains a factual claim worth verifying.
 */
function isFactualClaim(sentence) {
  return FACTUAL_CLAIM_PATTERNS.some(pattern => pattern.test(sentence));
}

/**
 * Check if a sentence is general knowledge (does not need verification).
 */
function isGeneralKnowledge(sentence) {
  return GENERAL_KNOWLEDGE_PATTERNS.some(pattern => pattern.test(sentence));
}

/**
 * Extract factual claims from markdown content.
 * Returns array of claim strings.
 */
function extractClaims(markdown) {
  const sentences = splitIntoSentences(markdown);
  const claims = [];

  for (const sentence of sentences) {
    // Skip general knowledge
    if (isGeneralKnowledge(sentence)) continue;
    // Keep sentences with factual claim patterns
    if (isFactualClaim(sentence)) {
      // Truncate very long sentences for LLM context efficiency
      const claim = sentence.length > 200
        ? sentence.substring(0, 197) + '...'
        : sentence;
      claims.push(claim);
    }
  }

  return claims;
}

/**
 * Combine source text_content items into a single string,
 * respecting max_source_chars limit. Truncates from the end.
 */
function combineSourceText(sourceItems, maxChars) {
  let combined = '';
  for (const item of sourceItems) {
    const text = item.text_content || '';
    if (!text) continue;

    // Add separator between sources
    const separator = combined ? '\n\n---SOURCE BOUNDARY---\n\n' : '';
    const addition = separator + text;

    if (combined.length + addition.length > maxChars) {
      // Add what fits
      const remaining = maxChars - combined.length;
      if (remaining > 100) { // Only add if meaningful amount remaining
        combined += addition.substring(0, remaining) + '\n[TRUNCATED]';
      }
      break;
    }
    combined += addition;
  }

  return combined;
}

/**
 * Split claims into batches of the specified size.
 */
function batchClaims(claims, batchSize) {
  const batches = [];
  for (let i = 0; i < claims.length; i += batchSize) {
    batches.push(claims.slice(i, i + batchSize));
  }
  return batches;
}

/**
 * Parse LLM response text into structured JSON.
 * Handles markdown code fences and raw JSON.
 */
function parseLlmResponse(responseText) {
  if (!responseText || typeof responseText !== 'string') return [];

  let cleaned = responseText.trim();

  // Remove markdown code fences if present
  const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return parsed;
    return [];
  } catch {
    // Try to extract JSON array from the response
    const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      try {
        const parsed = JSON.parse(arrayMatch[0]);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        return [];
      }
    }
    return [];
  }
}


// ─── Main execute function ───

async function execute(input, options, tools) {
  const { entities } = input;
  const { ai_model, ai_provider, ...otherOptions } = options;
  const { logger, progress, ai } = tools;
  const {
    pass_threshold = 0.9,
    max_source_chars = 100000,
    claims_per_batch = 10,
    prompt: promptTemplate,
  } = otherOptions;

  // Prompt comes from manifest options (editable by operator in UI)
  const verificationPrompt = promptTemplate;

  logger.info(
    `Config: pass_threshold=${pass_threshold}, model=${ai_model || 'default'}, ` +
    `provider=${ai_provider || 'default'}, max_source_chars=${max_source_chars}, ` +
    `claims_per_batch=${claims_per_batch}`
  );

  const results = [];

  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i];
    progress.update(i + 1, entities.length, `Processing ${entity.name}`);

    // --- Data-shape routing: find content and source items by field presence ---
    const contentItems = (entity.items || []).filter(item => item.content_markdown);
    const sourceItems = (entity.items || []).filter(item => item.text_content);

    // --- Edge case: no content_markdown ---
    if (contentItems.length === 0) {
      logger.warn(`${entity.name}: no content_markdown found -- skipping`);
      results.push({
        entity_name: entity.name,
        items: [{
          entity_name: entity.name,
          qa_pass: true,
          hallucination_score: 1,
          verified_claims_count: 0,
          total_claims_count: 0,
          flagged_claims_count: 0,
          flagged_claims: [],
          flagged_claims_text: '',
          partial_claims_text: '',
          summary_text: 'No content_markdown found -- nothing to verify. Skipped.',
        }],
        meta: { qa_pass: true, hallucination_score: 1, skipped: true, skip_reason: 'no_content' },
      });
      continue;
    }

    // --- Edge case: no source text_content ---
    if (sourceItems.length === 0) {
      logger.warn(`${entity.name}: no source text_content available -- cannot verify, passing with warning`);
      results.push({
        entity_name: entity.name,
        items: [{
          entity_name: entity.name,
          qa_pass: true,
          hallucination_score: 1,
          verified_claims_count: 0,
          total_claims_count: 0,
          flagged_claims_count: 0,
          flagged_claims: [],
          flagged_claims_text: '',
          partial_claims_text: '',
          summary_text: 'No source text_content available -- cannot verify claims against sources. Passed with warning.',
        }],
        meta: { qa_pass: true, hallucination_score: 1, skipped: true, skip_reason: 'no_sources' },
      });
      continue;
    }

    // --- Combine content_markdown ---
    const allMarkdown = contentItems.map(item => item.content_markdown).join('\n\n');

    // --- Extract factual claims ---
    const claims = extractClaims(allMarkdown);

    if (claims.length === 0) {
      logger.info(`${entity.name}: no factual claims detected in content -- automatic pass`);
      results.push({
        entity_name: entity.name,
        items: [{
          entity_name: entity.name,
          qa_pass: true,
          hallucination_score: 1,
          verified_claims_count: 0,
          total_claims_count: 0,
          flagged_claims_count: 0,
          flagged_claims: [],
          flagged_claims_text: '',
          partial_claims_text: '',
          summary_text: 'No factual claims detected in content (no numbers, dates, statistics, or company-specific facts). Automatic pass.',
        }],
        meta: { qa_pass: true, hallucination_score: 1, total_claims: 0 },
      });
      continue;
    }

    // --- Combine source text ---
    const sourceText = combineSourceText(sourceItems, max_source_chars);

    logger.info(
      `${entity.name}: ${claims.length} claims extracted, ` +
      `${sourceItems.length} source(s), ${sourceText.length} chars of source text`
    );

    // --- Batch claims and verify with LLM ---
    const batches = batchClaims(claims, claims_per_batch);
    const allVerdicts = [];

    for (let b = 0; b < batches.length; b++) {
      const batch = batches[b];
      progress.update(
        i + 1, entities.length,
        `${entity.name}: verifying batch ${b + 1}/${batches.length}`
      );

      const claimsText = batch.map((c, idx) => `${idx + 1}. ${c}`).join('\n');

      const filledPrompt = verificationPrompt
        .replace('{{CLAIMS}}', claimsText)
        .replace('{{SOURCES}}', sourceText);

      try {
        const response = await ai.complete({
          prompt: filledPrompt,
          model: ai_model,
          provider: ai_provider,
        });

        const verdicts = parseLlmResponse(response.text);

        if (verdicts.length === 0) {
          logger.warn(
            `${entity.name}: batch ${b + 1} returned unparseable response -- ` +
            `treating ${batch.length} claims as unverified`
          );
          // Treat unparseable response as all claims being unverifiable
          for (const claim of batch) {
            allVerdicts.push({
              claim,
              verdict: 'unsupported',
              quote: null,
              severity: 'medium',
              _parse_error: true,
            });
          }
        } else {
          // Match verdicts back to claims by position
          for (let v = 0; v < batch.length; v++) {
            if (v < verdicts.length) {
              allVerdicts.push({
                claim: batch[v], // Use our original claim text
                verdict: verdicts[v].verdict || 'unsupported',
                quote: verdicts[v].quote || null,
                severity: verdicts[v].severity || 'medium',
              });
            } else {
              // LLM returned fewer verdicts than claims
              allVerdicts.push({
                claim: batch[v],
                verdict: 'unsupported',
                quote: null,
                severity: 'medium',
                _missing_verdict: true,
              });
            }
          }
        }
      } catch (err) {
        logger.warn(
          `${entity.name}: LLM call failed for batch ${b + 1}: ${err.message} -- ` +
          `treating ${batch.length} claims as unverified`
        );
        for (const claim of batch) {
          allVerdicts.push({
            claim,
            verdict: 'unsupported',
            quote: null,
            severity: 'medium',
            _error: err.message,
          });
        }
      }
    }

    // --- Calculate scores ---
    const totalClaims = allVerdicts.length;
    const supportedClaims = allVerdicts.filter(v => v.verdict === 'supported');
    const partialClaims = allVerdicts.filter(v => v.verdict === 'partial');
    const unsupportedClaims = allVerdicts.filter(v => v.verdict === 'unsupported');

    // Verified = supported + partial (partial counts as 0.5)
    const verifiedValue = supportedClaims.length + partialClaims.length * 0.5;
    const verifiedCount = Math.round(verifiedValue);
    const hallucinationScore = totalClaims > 0
      ? verifiedValue / totalClaims
      : 1;

    const qaPassed = hallucinationScore >= pass_threshold;

    // --- Build flagged claims output ---
    const flaggedClaims = unsupportedClaims.map(v => ({
      claim: v.claim,
      severity: v.severity,
    }));

    const flaggedClaimsText = unsupportedClaims.length > 0
      ? unsupportedClaims
          .map((v, idx) => `${idx + 1}. [${(v.severity || 'medium').toUpperCase()}] ${v.claim}`)
          .join('\n')
      : 'None -- all claims are supported by source material.';

    const partialClaimsText = partialClaims.length > 0
      ? partialClaims
          .map((v, idx) => {
            const quotePart = v.quote ? ` (source: "${v.quote}")` : '';
            return `${idx + 1}. ${v.claim}${quotePart}`;
          })
          .join('\n')
      : 'None.';

    // --- Summary ---
    const summaryParts = [
      `${totalClaims} factual claim(s) extracted from content.`,
      `${supportedClaims.length} fully supported, ${partialClaims.length} partially supported, ${unsupportedClaims.length} unsupported.`,
    ];

    if (unsupportedClaims.length > 0) {
      const highSeverity = unsupportedClaims.filter(v => v.severity === 'high').length;
      const mediumSeverity = unsupportedClaims.filter(v => v.severity === 'medium').length;
      const lowSeverity = unsupportedClaims.filter(v => v.severity === 'low').length;
      const severityParts = [];
      if (highSeverity > 0) severityParts.push(`${highSeverity} high`);
      if (mediumSeverity > 0) severityParts.push(`${mediumSeverity} medium`);
      if (lowSeverity > 0) severityParts.push(`${lowSeverity} low`);
      summaryParts.push(`Unsupported severity: ${severityParts.join(', ')}.`);
    }

    summaryParts.push(
      `Hallucination score: ${(hallucinationScore * 100).toFixed(1)}% ` +
      `(threshold: ${(pass_threshold * 100).toFixed(1)}%).`
    );

    const summaryText = summaryParts.join(' ');

    const logFn = qaPassed ? 'info' : 'warn';
    logger[logFn](
      `${entity.name}: hallucination_score=${(hallucinationScore * 100).toFixed(1)}% ` +
      `(${qaPassed ? 'PASS' : 'FAIL'}) -- ` +
      `${supportedClaims.length} supported, ${partialClaims.length} partial, ` +
      `${unsupportedClaims.length} unsupported of ${totalClaims} claims`
    );

    results.push({
      entity_name: entity.name,
      items: [{
        entity_name: entity.name,
        qa_pass: qaPassed,
        hallucination_score: parseFloat(hallucinationScore.toFixed(3)),
        verified_claims_count: verifiedCount,
        total_claims_count: totalClaims,
        flagged_claims_count: unsupportedClaims.length,
        flagged_claims: flaggedClaims,
        flagged_claims_text: flaggedClaimsText,
        partial_claims_text: partialClaimsText,
        summary_text: summaryText,
      }],
      meta: {
        qa_pass: qaPassed,
        hallucination_score: parseFloat(hallucinationScore.toFixed(3)),
        total_claims: totalClaims,
        supported: supportedClaims.length,
        partial: partialClaims.length,
        unsupported: unsupportedClaims.length,
        batches_sent: batches.length,
      },
    });
  }

  // --- Build summary ---
  const totalEntities = entities.length;
  const passCount = results.filter(r => r.items.length > 0 && r.items[0].qa_pass === true).length;
  const failCount = results.filter(r => r.items.length > 0 && r.items[0].qa_pass === false).length;
  const skippedCount = results.filter(r => r.meta && r.meta.skipped).length;
  const avgScore = results.length > 0
    ? results.reduce((sum, r) => sum + (r.items[0]?.hallucination_score || 0), 0) / results.length
    : 0;

  let description;
  if (failCount === 0) {
    description = `All ${passCount} entities passed hallucination detection (avg score: ${(avgScore * 100).toFixed(1)}%)`;
  } else {
    const parts = [];
    if (passCount > 0) parts.push(`${passCount} passed`);
    if (failCount > 0) parts.push(`${failCount} failed`);
    if (skippedCount > 0) parts.push(`${skippedCount} skipped`);
    description = `${parts.join(', ')} of ${totalEntities} entities (avg score: ${(avgScore * 100).toFixed(1)}%)`;
  }

  return {
    results,
    summary: {
      total_entities: totalEntities,
      total_items: results.reduce((sum, r) => sum + r.items.length, 0),
      passed: passCount,
      failed: failCount,
      skipped: skippedCount,
      average_score: parseFloat(avgScore.toFixed(3)),
      description,
    },
  };
}

module.exports = execute;
