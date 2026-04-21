/**
 * Loop Router -- Step 10 Review submodule
 *
 * Reads QA verdicts from Step 6 submodules and produces a routing decision
 * for each entity: approve, loop back to an earlier step, or flag for manual
 * review.
 *
 * Data operation: TRANSFORM (=) -- one routing decision per entity.
 * Data-shape routing: finds QA results by field presence (qa_pass,
 * keyword_score, citation_score, hallucination_score, meta_title_ok),
 * never by source_submodule.
 *
 * This submodule makes routing DECISIONS. It does NOT execute the loops --
 * the skeleton handles backward routing. For Phase 1/2, it produces the
 * recommendation and the user acts on it manually.
 *
 * Routing priority (first match wins):
 *   1. Max loops exceeded          -> flag_manual
 *   2. Multiple QA failures        -> flag_manual
 *   3. Hallucination failure       -> loop_discovery (need better sources)
 *   4. Citation coverage failure   -> loop_discovery (need more sources)
 *   5. Insufficient sources        -> flag_manual (can't fix with loops)
 *   6. Keyword sufficiency failure -> loop_tone (rewrite with better keywords)
 *   7. Meta compliance failure     -> loop_generation (regenerate meta fields)
 *   8. All pass                    -> approve
 *   9. No QA results               -> configurable (default: flag_manual)
 *
 * No external dependencies -- pure decision logic.
 */

// ---------------------------------------------------------------------------
// QA result aggregation
// ---------------------------------------------------------------------------

/**
 * Find QA result items from the entity's item pool by checking field presence.
 * Each Step 6 submodule produces items with distinctive fields:
 *   - keyword-sufficiency-checker: keyword_score
 *   - meta-compliance-checker: meta_title_ok or (checks_passed + checks_total)
 *   - citation-coverage-checker: citation_score
 *   - hallucination-detector: hallucination_score
 *
 * All QA items also have qa_pass (boolean).
 */
function findQaItems(items) {
  return (items || []).filter(item =>
    item.qa_pass !== undefined ||
    item.keyword_score !== undefined ||
    item.citation_score !== undefined ||
    item.hallucination_score !== undefined ||
    item.meta_title_ok !== undefined
  );
}

/**
 * Find source page items (from Step 3 scrapers) by checking for text_content.
 */
function findSourcePages(items) {
  return (items || []).filter(item => item.text_content || item._blob_ref);
}

/**
 * Aggregate QA results into a summary object.
 * Returns { keyword, meta, citation, hallucination } where each value is
 * "pass", "fail", or "missing" (if no QA item found for that check).
 */
function aggregateQaResults(qaItems) {
  const summary = {
    keyword: 'missing',
    meta: 'missing',
    citation: 'missing',
    hallucination: 'missing',
  };

  for (const item of qaItems) {
    // Keyword sufficiency checker
    if (item.keyword_score !== undefined) {
      summary.keyword = item.qa_pass ? 'pass' : 'fail';
    }

    // Meta compliance checker -- detect by checks_passed/checks_total or meta_title_ok
    if (item.meta_title_ok !== undefined || (item.checks_passed !== undefined && item.checks_total !== undefined)) {
      summary.meta = item.qa_pass ? 'pass' : 'fail';
    }

    // Citation coverage checker
    if (item.citation_score !== undefined) {
      summary.citation = item.qa_pass ? 'pass' : 'fail';
    }

    // Hallucination detector
    if (item.hallucination_score !== undefined) {
      summary.hallucination = item.qa_pass ? 'pass' : 'fail';
    }
  }

  return summary;
}

/**
 * Format the QA summary into a human-readable string.
 */
function formatQaSummary(summary) {
  const lines = [];
  const labels = {
    keyword: 'Keyword Sufficiency',
    meta: 'Meta Compliance',
    citation: 'Citation Coverage',
    hallucination: 'Hallucination Detection',
  };

  for (const [key, label] of Object.entries(labels)) {
    const value = summary[key];
    const badge = value === 'pass' ? 'PASS' : value === 'fail' ? 'FAIL' : 'NOT RUN';
    lines.push(`${label}: ${badge}`);
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Routing logic
// ---------------------------------------------------------------------------

/**
 * Apply routing rules in priority order and return a decision.
 *
 * @param {object} summary - { keyword, meta, citation, hallucination }
 * @param {number} loopCount - how many times this entity has been looped
 * @param {number} sourcePageCount - number of source pages available
 * @param {object} opts - { max_loops, min_source_pages, default_no_qa }
 * @returns {{ decision: string, route_reason: string }}
 */
function route(summary, loopCount, sourcePageCount, opts) {
  const { max_loops, min_source_pages, default_no_qa } = opts;

  // Collect failures
  const failures = [];
  if (summary.keyword === 'fail') failures.push('keyword');
  if (summary.meta === 'fail') failures.push('meta');
  if (summary.citation === 'fail') failures.push('citation');
  if (summary.hallucination === 'fail') failures.push('hallucination');

  // Count how many checks actually ran (not "missing")
  const checksRun = Object.values(summary).filter(v => v !== 'missing').length;

  // Rule 0a: Dead site -- zero source pages means scraping found nothing
  if (sourcePageCount === 0) {
    return {
      decision: 'failed',
      failure_reason: 'dead_site',
      route_reason: 'No source pages found (site appears dead or completely blocked). Cannot produce content without sources.',
    };
  }

  // Rule 0b: No QA results at all
  if (checksRun === 0) {
    if (default_no_qa === 'approve') {
      return {
        decision: 'approve',
        route_reason: 'No QA results found (Step 6 was skipped). Auto-approved per configuration.',
      };
    }
    return {
      decision: 'flag_manual',
      route_reason: 'No QA results found (Step 6 was skipped). Flagged for manual review per configuration.',
    };
  }

  // Rule 1: Max loops exceeded -- terminal failure, not flag_manual
  if (loopCount >= max_loops) {
    return {
      decision: 'failed',
      failure_reason: 'max_loops_exceeded',
      route_reason: `Max loop count exceeded (${loopCount}/${max_loops}). Entity has been reworked too many times without passing QA.`,
    };
  }

  // Rule 2: Multiple failures -> flag for manual review
  if (failures.length >= 2) {
    return {
      decision: 'flag_manual',
      route_reason: `Multiple QA failures (${failures.join(', ')}). Too complex for automated routing -- requires manual review.`,
    };
  }

  // Rule 3: Hallucination failure -> loop back to discovery
  if (summary.hallucination === 'fail') {
    if (sourcePageCount < min_source_pages) {
      return {
        decision: 'flag_manual',
        route_reason: `Hallucination detected but only ${sourcePageCount} source pages available (minimum ${min_source_pages}). Cannot gather better sources with so few pages -- requires manual review.`,
      };
    }
    return {
      decision: 'loop_discovery',
      route_reason: 'Unsupported claims detected by hallucination checker. Routing back to Step 1 (Discovery) to gather better source material.',
    };
  }

  // Rule 4: Citation coverage failure -> loop back to discovery
  if (summary.citation === 'fail') {
    if (sourcePageCount < min_source_pages) {
      return {
        decision: 'flag_manual',
        route_reason: `Insufficient citation coverage but only ${sourcePageCount} source pages available (minimum ${min_source_pages}). Cannot add citations without more sources -- requires manual review.`,
      };
    }
    return {
      decision: 'loop_discovery',
      route_reason: 'Too few citations in generated content. Routing back to Step 1 (Discovery) to find additional sources to cite.',
    };
  }

  // Rule 5: Keyword sufficiency failure -> loop back to tone/SEO editor
  if (summary.keyword === 'fail') {
    return {
      decision: 'loop_tone',
      route_reason: 'Missing or poorly placed keywords. Routing back to Step 5 (Tone/SEO Editor) to rewrite with better keyword integration.',
    };
  }

  // Rule 6: Meta compliance failure -> loop back to content generation
  if (summary.meta === 'fail') {
    return {
      decision: 'loop_generation',
      route_reason: 'Meta title or description does not meet SEO requirements. Routing back to Step 5 (Content Writer) to regenerate meta fields.',
    };
  }

  // Rule 7: All checks that ran have passed
  if (failures.length === 0) {
    return {
      decision: 'approve',
      route_reason: 'All QA checks passed. Entity is ready for bundling and distribution.',
    };
  }

  // Fallback (should not be reached, but defensive)
  return {
    decision: 'flag_manual',
    route_reason: `Unexpected QA state. Failures: ${failures.join(', ')}. Flagged for manual review.`,
  };
}

// ---------------------------------------------------------------------------
// Main execute function
// ---------------------------------------------------------------------------

async function execute(input, options, tools) {
  const { entities } = input;
  const { logger, progress } = tools;
  const {
    default_no_qa = 'flag_manual',
    max_loops = 3,
    min_source_pages = 8,
  } = options;

  logger.info(
    `Config: default_no_qa=${default_no_qa}, max_loops=${max_loops}, min_source_pages=${min_source_pages}`
  );

  const results = [];

  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i];
    progress.update(i + 1, entities.length, `Routing ${entity.name}`);

    // --- Data-shape routing: find QA items and source pages ---
    const qaItems = findQaItems(entity.items);
    const sourcePages = findSourcePages(entity.items);
    const sourcePageCount = sourcePages.length;

    // Read loop_count from entity metadata (set by skeleton on rework)
    const loopCount = entity.loop_count || entity.meta?.loop_count || 0;

    // Aggregate QA verdicts
    const summary = aggregateQaResults(qaItems);
    const qaSummaryText = formatQaSummary(summary);

    // Apply routing rules
    const routeResult = route(summary, loopCount, sourcePageCount, {
      max_loops,
      min_source_pages,
      default_no_qa,
    });
    const { decision, route_reason } = routeResult;

    // Collect failed check names for the output
    const failedChecks = [];
    if (summary.keyword === 'fail') failedChecks.push('keyword_sufficiency');
    if (summary.meta === 'fail') failedChecks.push('meta_compliance');
    if (summary.citation === 'fail') failedChecks.push('citation_coverage');
    if (summary.hallucination === 'fail') failedChecks.push('hallucination');

    const logFn = decision === 'approve' ? 'info' : 'warn';
    logger[logFn](
      `${entity.name}: ${decision}` +
      (failedChecks.length > 0 ? ` (failed: ${failedChecks.join(', ')})` : '') +
      ` | sources: ${sourcePageCount} | loops: ${loopCount}`
    );

    results.push({
      entity_name: entity.name,
      items: [{
        entity_name: entity.name,
        decision,
        route_reason,
        qa_summary: qaSummaryText,
        failed_checks: failedChecks.length > 0 ? failedChecks.join(', ') : 'none',
        loop_count: loopCount,
        source_page_count: sourcePageCount,
        // Phase 2 additions: structured QA scores, failure reason, config overrides
        qa_scores: {
          keyword: summary.keyword,
          citation: summary.citation,
          hallucination: summary.hallucination,
          meta: summary.meta,
        },
        failure_reason: routeResult.failure_reason || null,
        config_overrides: {},
      }],
      meta: {
        decision,
        failed_checks: failedChecks,
        loop_count: loopCount,
        source_page_count: sourcePageCount,
        qa_keyword: summary.keyword,
        qa_meta: summary.meta,
        qa_citation: summary.citation,
        qa_hallucination: summary.hallucination,
      },
    });
  }

  // --- Summary ---
  const totalEntities = entities.length;
  const totalItems = results.reduce((sum, r) => sum + r.items.length, 0);
  const approvedCount = results.filter(r => r.meta.decision === 'approve').length;
  const loopDiscoveryCount = results.filter(r => r.meta.decision === 'loop_discovery').length;
  const loopGenerationCount = results.filter(r => r.meta.decision === 'loop_generation').length;
  const loopToneCount = results.filter(r => r.meta.decision === 'loop_tone').length;
  const flagManualCount = results.filter(r => r.meta.decision === 'flag_manual').length;
  const failedCount = results.filter(r => r.meta.decision === 'failed').length;

  const parts = [];
  if (approvedCount > 0) parts.push(`${approvedCount} approved`);
  if (loopDiscoveryCount > 0) parts.push(`${loopDiscoveryCount} -> discovery`);
  if (loopGenerationCount > 0) parts.push(`${loopGenerationCount} -> generation`);
  if (loopToneCount > 0) parts.push(`${loopToneCount} -> tone`);
  if (flagManualCount > 0) parts.push(`${flagManualCount} flagged`);
  if (failedCount > 0) parts.push(`${failedCount} failed`);

  const description = parts.length > 0
    ? `${parts.join(', ')} of ${totalEntities} entities`
    : `${totalEntities} entities processed (no routing decisions)`;

  return {
    results,
    summary: {
      total_entities: totalEntities,
      total_items: totalItems,
      approved: approvedCount,
      loop_discovery: loopDiscoveryCount,
      loop_generation: loopGenerationCount,
      loop_tone: loopToneCount,
      flag_manual: flagManualCount,
      failed: failedCount,
      errors: [],
      description,
    },
  };
}

module.exports = execute;
