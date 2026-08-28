/**
 * Structural Compliance Checker -- Step 6 QA submodule
 *
 * Checks format spec adherence: heading hierarchy, section count, FAQ
 * presence, word count per section, and total word count.
 *
 * Data operation: add (+) -- QA verdict items added alongside existing content
 * (item_key entity_name; see manifest data_operation_default).
 * Data-shape routing: finds input by field presence (content_markdown),
 * never by source_submodule.
 *
 * Pure structural checks, no LLM needed.
 */

// ---------------------------------------------------------------------------
// Markdown structure parsing
// ---------------------------------------------------------------------------

/**
 * Parse markdown into a heading tree with word counts per section.
 *
 * Returns {
 *   h1: string[], h2: string[], h3: string[],
 *   sections: [{ level: number, title: string, wordCount: number }],
 *   totalWords: number,
 *   hasFaq: boolean,
 * }
 */
function parseStructure(markdown) {
  if (!markdown || typeof markdown !== 'string') {
    return { h1: [], h2: [], h3: [], sections: [], totalWords: 0, hasFaq: false };
  }

  // Strip frontmatter
  let content = markdown.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '');

  const lines = content.split('\n');
  const h1 = [];
  const h2 = [];
  const h3 = [];
  const sections = []; // { level, title, wordCount }
  let currentSection = null;
  let totalWords = 0;
  let hasFaq = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Detect headings
    const h1Match = trimmed.match(/^#\s+(.+)$/);
    const h2Match = trimmed.match(/^##\s+(.+)$/);
    const h3Match = trimmed.match(/^###\s+(.+)$/);

    if (h1Match || h2Match || h3Match) {
      // Close previous section
      if (currentSection) sections.push(currentSection);

      const level = h1Match ? 1 : h2Match ? 2 : 3;
      const title = (h1Match || h2Match || h3Match)[1].trim();

      if (level === 1) h1.push(title);
      if (level === 2) h2.push(title);
      if (level === 3) h3.push(title);

      // Check for FAQ heading
      const titleLower = title.toLowerCase();
      if (titleLower.includes('faq') || titleLower.includes('frequently asked questions')) {
        hasFaq = true;
      }

      currentSection = { level, title, wordCount: 0 };
      continue;
    }

    // Skip empty lines and non-heading markup
    if (!trimmed) continue;
    if (trimmed.startsWith('#')) continue; // H4+ headings

    // Count words
    const words = trimmed.split(/\s+/).filter(w => w.length > 0).length;
    totalWords += words;
    if (currentSection) {
      currentSection.wordCount += words;
    }
  }

  // Close last section
  if (currentSection) sections.push(currentSection);

  return { h1, h2, h3, sections, totalWords, hasFaq };
}

// ---------------------------------------------------------------------------
// Check 8 (B031-1): post-strip residual-bracket taxonomy-leak detection (#50)
//
// stripMarkers removes only ONE leading marker per heading (shared grammar), so
// a SECOND heading bracket, a bracket in body prose, or a trailing heading
// bracket all survive to the reader today. The transform is mirrored VERBATIM
// from markdown-output 1.2.0 so this check equals "what the reader sees":
// removeMetaSection (markdown-output/execute.js:74-76) then stripMarkers
// (markdown-output/execute.js:26-28), sharing the canonical heading-marker
// regex via _shared/marker-parser.js — the same lockstep rationale W1.5
// documents. If markdown-output's strip semantics change, this MUST change in
// lockstep, or the simulation stops matching the published page.
//
// Simulates markdown-output's DEFAULT publish config (include_meta_section=false
// => Meta removed; heading_style='strip_markers' => markers stripped) — both are
// the bundler defaults. A non-default bundler config could only make Check 8
// UNDER-report (a false negative, never a wrongful block), so plumbing the
// bundler's per-template options into a Step-6 checker (cross-module coupling)
// is not worth it.
// ---------------------------------------------------------------------------
const { headingMarkerRegex } = require('../../_shared/marker-parser.js');

// VERBATIM markdown-output/execute.js:26-28
function stripMarkers(markdown) {
  return markdown.replace(headingMarkerRegex(), (_match, hashes) => hashes);
}
// VERBATIM markdown-output/execute.js:74-76
function removeMetaSection(markdown) {
  return markdown.replace(/\n## \[?Meta\]?[\s\S]*?(?=\n## |$)/, '').trim();
}

/**
 * Scan strip-simulated (would-be-published) markdown for residual brackets that
 * would leak to the reader. Excludes inline citations [#n]/[n], footnote refs
 * [^n], and markdown links [text](url); skips fenced and inline code. Returns
 * [{ line, heading, bracket }] — heading vs body per hit.
 */
function findResidualBrackets(published) {
  if (typeof published !== 'string') return [];
  const leaks = [];
  const lines = published.split('\n');
  let inFence = false;
  for (let ln = 0; ln < lines.length; ln++) {
    const line = lines[ln];
    if (/^\s*```/.test(line)) { inFence = !inFence; continue; }
    if (inFence) continue;
    const isHeading = /^\s*#{1,6}\s/.test(line);
    const scan = line.replace(/`[^`]*`/g, ''); // mask inline code so bracketed code is not a leak
    const re = /\[([^\]]*)\]/g;
    let m;
    while ((m = re.exec(scan)) !== null) {
      const content = m[1];
      const after = scan.slice(m.index + m[0].length);
      if (/^#?\d+$/.test(content)) continue;   // [#n] inline citation / [n]
      if (/^\^\d+$/.test(content)) continue;    // [^n] footnote ref
      if (after.startsWith('(')) continue;      // [text](url) markdown link
      // ponytail: reference-style links [text][ref] are NOT excluded — the
      // pipeline emits none and the real corpus has zero; add a `[` next-char
      // skip only if that shape ever appears in output.
      leaks.push({ line: ln + 1, heading: isHeading, bracket: `[${content}]` });
    }
  }
  return leaks;
}

// ---------------------------------------------------------------------------
// Main execute function
// ---------------------------------------------------------------------------

async function execute(input, options, tools) {
  const { entities } = input;
  const { logger, progress } = tools;
  const {
    min_sections = 5,
    require_faq = true,
    min_words_per_section = 100,
    min_total_words = 1500,
    required_heading_levels = 'h1,h2',
    pass_threshold = 0.8,
    taxonomy_leak_check = false,
  } = options;

  const requiredLevels = typeof required_heading_levels === 'string'
    ? required_heading_levels.split(',').map(s => s.trim().toLowerCase())
    : [];

  // Accept both true and the string "true": UI presets are string-typed, and a
  // bare === true would silently disable the check (STEP5 saw a real prod option
  // arrive as disable_thinking:"false"). Anything else (incl. "false") => off.
  const taxonomyLeakCheck = taxonomy_leak_check === true || taxonomy_leak_check === 'true';

  logger.info(
    `Config: min_sections=${min_sections}, require_faq=${require_faq}, ` +
    `min_words_per_section=${min_words_per_section}, min_total_words=${min_total_words}, ` +
    `required_levels=${requiredLevels.join(',')}, pass_threshold=${pass_threshold}, ` +
    `taxonomy_leak_check=${taxonomyLeakCheck}`
  );

  const results = [];

  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i];
    progress.update(i + 1, entities.length, `Checking structure: ${entity.name}`);

    // --- Data-shape routing: find content by field presence ---
    const contentItems = (entity.items || []).filter(item => item.content_markdown);

    if (contentItems.length === 0) {
      logger.warn(`${entity.name}: no content_markdown found`);
      results.push({
        entity_name: entity.name,
        items: [{
          entity_name: entity.name,
          qa_pass: false,
          structural_score: 0,
          total_words: 0,
          section_count: 0,
          has_faq: false,
          violations: 'No content_markdown found -- ensure content-writer has run.',
          section_report: '',
        }],
        meta: { qa_pass: false, structural_score: 0 },
      });
      continue;
    }

    // Select the content_markdown to grade (H18b): content-writer and
    // tone-seo-editor both emit inline content_markdown under add, so both drafts
    // survive the pool. Grade only the latest (.at(-1)) -- the exact draft the
    // step-8 output modules publish (markdown-output:189 / html-output:182 /
    // json-output:151) -- not both concatenated.
    const allMarkdown = contentItems.at(-1).content_markdown;
    const structure = parseStructure(allMarkdown);

    const violations = [];
    let checksTotal = 0;
    let checksPassed = 0;

    // --- Check 1: Required heading levels ---
    for (const level of requiredLevels) {
      checksTotal++;
      const hasLevel = (level === 'h1' && structure.h1.length > 0)
        || (level === 'h2' && structure.h2.length > 0)
        || (level === 'h3' && structure.h3.length > 0);
      if (hasLevel) {
        checksPassed++;
      } else {
        violations.push(`Missing required heading level: ${level.toUpperCase()}`);
      }
    }

    // --- Check 2: Minimum section count (H2 sections) ---
    checksTotal++;
    const h2SectionCount = structure.h2.length;
    if (h2SectionCount >= min_sections) {
      checksPassed++;
    } else {
      violations.push(`Too few H2 sections: ${h2SectionCount} (minimum ${min_sections})`);
    }

    // --- Check 3: FAQ presence ---
    if (require_faq) {
      checksTotal++;
      if (structure.hasFaq) {
        checksPassed++;
      } else {
        violations.push('No FAQ or "Frequently Asked Questions" section found');
      }
    }

    // --- Check 4: Total word count ---
    checksTotal++;
    if (structure.totalWords >= min_total_words) {
      checksPassed++;
    } else {
      violations.push(`Total word count too low: ${structure.totalWords} (minimum ${min_total_words})`);
    }

    // --- Check 5: Per-section word count (H2 sections only) ---
    const h2Sections = structure.sections.filter(s => s.level === 2);
    const thinSections = [];
    for (const section of h2Sections) {
      if (section.wordCount < min_words_per_section) {
        thinSections.push(`"${section.title}" (${section.wordCount} words)`);
      }
    }
    checksTotal++;
    if (thinSections.length === 0) {
      checksPassed++;
    } else {
      violations.push(`${thinSections.length} section(s) below ${min_words_per_section} words: ${thinSections.join(', ')}`);
    }

    // --- Check 6: taxonomy-marker leakage in headings (M3) ---
    // Observed in delivered prod output: a prompt example leaked a SECOND
    // bracketed marker into headings ("## [Tag: scratchcards] [Suggested tag]
    // Scratchcard ..."), and nothing caught it. Detect (a) any heading whose
    // title carries two leading bracketed markers, and (b) a literal
    // "[Suggested tag]" anywhere in a heading — that string is marker-grammar
    // vocabulary (like the [Tag:]/[Primary Category:] prefixes the Step 8
    // bundlers parse), never legitimate heading text.
    // These two are OUTSIDE the score ratio: (a) folding them in would dilute
    // the denominator and silently loosen every threshold-tuned template, and
    // (b) at the 0.8 default a pure marker leak would score 7/8 and PASS —
    // the exact silent-shipping this check exists to stop. Instead they
    // force qa_pass to false directly (flag/route; the entity is not failed
    // and delivery is not blocked — the human decides).
    const markerLeaks = [];
    for (const s of structure.sections) {
      if (/^\s*\[[^\]]+\]\s*\[[^\]]+\]/.test(s.title) || /\[suggested tag\]/i.test(s.title)) {
        markerLeaks.push(s.title);
      }
    }
    if (markerLeaks.length > 0) {
      const shown = markerLeaks.slice(0, 5).map(t => `"${t}"`).join(', ');
      const more = markerLeaks.length > 5 ? ` …and ${markerLeaks.length - 5} more` : '';
      violations.push(`${markerLeaks.length} heading(s) leak taxonomy markers (second bracketed marker / literal [Suggested tag]): ${shown}${more}`);
    }

    // --- Check 7: duplicated-token artifacts in headings (M3) ---
    // Observed: "Api API Integration" — a slug-derived word colliding with the
    // heading text. Fires only on consecutive words equal case-INsensitively
    // but NOT byte-identical ("Api API" yes; "Pago Pago" / "Baden-Baden" no) —
    // the mechanical artifact always mixes cases, while legitimate repeated
    // names repeat exactly. Bracketed markers are stripped first so
    // "[Tag: api] API Integration" does not false-positive.
    // ponytail: identical-case dups ("API API") are deliberately NOT flagged —
    // widen only if that variant is ever observed in real output.
    const dupTokenHeadings = [];
    for (const s of structure.sections) {
      const words = s.title.replace(/\[[^\]]*\]/g, ' ').split(/[^A-Za-z0-9'-]+/).filter(w => w.length >= 2);
      if (words.some((w, i) => i > 0 && w !== words[i - 1] && w.toLowerCase() === words[i - 1].toLowerCase())) {
        dupTokenHeadings.push(s.title);
      }
    }
    if (dupTokenHeadings.length > 0) {
      const shown = dupTokenHeadings.slice(0, 5).map(t => `"${t}"`).join(', ');
      const more = dupTokenHeadings.length > 5 ? ` …and ${dupTokenHeadings.length - 5} more` : '';
      violations.push(`${dupTokenHeadings.length} heading(s) contain duplicated-token artifacts (e.g. "Api API"): ${shown}${more}`);
    }

    // --- Check 8: post-strip residual-bracket taxonomy leak (#50, B031-1) ---
    // OUTSIDE the score, like Checks 6/7: simulate the step-8 publish transform
    // and flag any bracket still visible to the reader (a second heading marker,
    // a body-prose marker, a trailing heading marker). A pure leak force-fails
    // qa_pass so it cannot hide behind a passing ratio. Option-gated (default
    // off) so prod's live v1 template is byte-identical; v3 flips it on.
    const residualLeaks = taxonomyLeakCheck
      ? findResidualBrackets(stripMarkers(removeMetaSection(allMarkdown)))
      : [];
    if (residualLeaks.length > 0) {
      const shown = residualLeaks.slice(0, 5)
        .map(l => `${l.heading ? 'heading' : 'body'} ${l.bracket} (L${l.line})`).join('; ');
      const more = residualLeaks.length > 5 ? ` …and ${residualLeaks.length - 5} more` : '';
      violations.push(`${residualLeaks.length} residual taxonomy marker(s) survive the publish strip (would leak to the reader): ${shown}${more}`);
    }

    // --- Calculate structural_score and pass/fail ---
    // Score semantics unchanged from v1.0 (same 5-check ratio); taxonomy
    // leakage force-fails qa_pass without touching the score.
    const structuralScore = checksTotal > 0
      ? Math.round((checksPassed / checksTotal) * 100) / 100
      : 0;
    const qaPassed = structuralScore >= pass_threshold
      && markerLeaks.length === 0
      && dupTokenHeadings.length === 0
      && residualLeaks.length === 0;

    // --- Build section report ---
    const reportLines = [];
    reportLines.push(`Total words: ${structure.totalWords}`);
    reportLines.push(`Headings: ${structure.h1.length} H1, ${structure.h2.length} H2, ${structure.h3.length} H3`);
    reportLines.push(`FAQ found: ${structure.hasFaq ? 'Yes' : 'No'}`);
    reportLines.push('');
    reportLines.push('Sections:');
    for (const section of structure.sections) {
      const prefix = section.level === 1 ? '#' : section.level === 2 ? '##' : '###';
      const flag = section.level === 2 && section.wordCount < min_words_per_section ? ' [THIN]' : '';
      reportLines.push(`  ${prefix} ${section.title}: ${section.wordCount} words${flag}`);
    }

    const logFn = qaPassed ? 'info' : 'warn';
    logger[logFn](
      `${entity.name}: structural_score=${structuralScore} (${qaPassed ? 'PASS' : 'FAIL'}) ` +
      `| ${structure.totalWords} words, ${h2SectionCount} H2 sections, FAQ=${structure.hasFaq}`
    );

    const entityResult = {
      entity_name: entity.name,
      items: [{
        entity_name: entity.name,
        qa_pass: qaPassed,
        structural_score: structuralScore,
        total_words: structure.totalWords,
        section_count: h2SectionCount,
        has_faq: structure.hasFaq,
        violations: violations.length > 0 ? violations.join('\n') : 'All structural checks passed.',
        section_report: reportLines.join('\n'),
      }],
      meta: {
        qa_pass: qaPassed,
        structural_score: structuralScore,
        total_words: structure.totalWords,
        section_count: h2SectionCount,
        has_faq: structure.hasFaq,
        checks_passed: checksPassed,
        checks_total: checksTotal,
        thin_sections: thinSections.length,
        marker_leak_headings: markerLeaks.length,
        dup_token_headings: dupTokenHeadings.length,
      },
    };
    // Added ONLY when the check runs, so default-off output is byte-identical.
    if (taxonomyLeakCheck) entityResult.meta.residual_bracket_leaks = residualLeaks.length;
    results.push(entityResult);
    if (tools._partialItems) tools._partialItems.push(...entityResult.items);
  }

  // --- Summary ---
  const totalEntities = entities.length;
  const totalItems = results.reduce((sum, r) => sum + r.items.length, 0);
  const passCount = results.filter(r => r.items.length > 0 && r.items[0].qa_pass === true).length;
  const failCount = results.filter(r => r.items.length > 0 && r.items[0].qa_pass === false).length;
  const avgScore = results.length > 0
    ? Math.round(results.reduce((sum, r) => sum + (r.items[0]?.structural_score || 0), 0) / results.length * 100) / 100
    : 0;

  let description;
  if (failCount === 0) {
    description = `All ${passCount} entities passed structural checks (avg score: ${avgScore})`;
  } else {
    const parts = [];
    if (passCount > 0) parts.push(`${passCount} passed`);
    if (failCount > 0) parts.push(`${failCount} failed`);
    description = `${parts.join(', ')} of ${totalEntities} entities (avg score: ${avgScore})`;
  }

  return {
    results,
    summary: {
      total_entities: totalEntities,
      total_items: totalItems,
      passed: passCount,
      failed: failCount,
      average_score: avgScore,
      description,
    },
  };
}

module.exports = execute;
