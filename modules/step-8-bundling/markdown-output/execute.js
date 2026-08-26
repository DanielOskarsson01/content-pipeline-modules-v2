/**
 * Markdown Output — Step 8 Bundling submodule
 *
 * Transforms content_markdown pool items into clean, publishable Markdown.
 * Optionally adds YAML frontmatter from analysis_json metadata.
 *
 * Data-shape routing: finds input by field presence (content_markdown),
 * never by source_submodule.
 */

const yaml = require('js-yaml');
// Shared canonical marker grammar (W1.5) — single source of truth for the
// heading-bracket regex, also used by tone-seo-editor's preservation gate.
const { headingMarkerRegex } = require('../../_shared/marker-parser.js');
// M2: QA verdict travels WITH the content (additive metadata, never a gate).
const { collectQaVerdict } = require('../../_shared/qa-verdict.js');

/**
 * Strip the entire bracketed marker prefix from a heading, keeping the
 * descriptive title. The shared regex matches only "## [marker]" — never the
 * trailing title or the space after "]" — so returning just the hashes leaves
 * "## <title>" (the original space after "]" becomes the heading gap).
 *   "## [Tag: mobile] Mobile-First Slots Design" → "## Mobile-First Slots Design"
 *   "## [Overview] ELK Studios"                  → "## ELK Studios"
 */
function stripMarkers(markdown) {
  return markdown.replace(headingMarkerRegex(), (_match, hashes) => hashes);
}

/**
 * Convert [#n] inline citations to markdown footnotes.
 */
function citationsToFootnotes(markdown, sourceCitations) {
  // Collect all citation references
  const refs = new Set();
  markdown.replace(/\[#(\d+)\]/g, (_, n) => { refs.add(parseInt(n, 10)); });

  if (refs.size === 0) return markdown;

  // Replace inline [#n] with [^n]
  let output = markdown.replace(/\[#(\d+)\]/g, '[^$1]');

  // Build footnote definitions
  const footnotes = [];
  for (const n of [...refs].sort((a, b) => a - b)) {
    const citation = sourceCitations && sourceCitations.find(c => c.index === n);
    if (citation) {
      footnotes.push(`[^${n}]: ${citation.title || ''} — ${citation.url || ''}`);
    } else {
      footnotes.push(`[^${n}]: Source ${n}`);
    }
  }

  if (footnotes.length > 0) {
    output += '\n\n---\n\n' + footnotes.join('\n');
  }

  return output;
}

/**
 * Strip all [#n] citations from text.
 */
function stripCitations(markdown) {
  return markdown.replace(/\s*\[#\d+\]/g, '');
}

/**
 * Remove ONLY the ## [Meta] section: from its heading to just before the next
 * "## " heading, or EOF if none follows. A later section (e.g. [Sources]) is
 * preserved. Non-greedy tail + lookahead — was greedy-to-EOF, which deleted
 * everything after Meta.
 */
function removeMetaSection(markdown) {
  return markdown.replace(/\n## \[?Meta\]?[\s\S]*?(?=\n## |$)/, '').trim();
}

// Field list may arrive as a JSON string (UI stores JSON options as strings).
// Malformed input degrades to [] but warns — a silent [] would quietly strip
// the identifiers a delivery consumer depends on (W1-class silent-green).
function parseFieldList(raw, warn) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const p = JSON.parse(raw);
      if (Array.isArray(p)) return p;
      warn(`frontmatter_entity_fields parsed but is not a JSON array — ignoring: ${raw}`);
    } catch {
      warn(`frontmatter_entity_fields is not valid JSON — ignoring: ${raw}`);
    }
  }
  return [];
}

/**
 * Build YAML frontmatter from the entity, analysis data, and the QA verdict.
 * entityFields (B032-2): names of entity properties to stamp after title —
 * skipped silently when absent/null, so default [] output is byte-identical
 * to the pre-option version.
 */
function buildFrontmatter(entity, entityFields, analysisItems, qaVerdict) {
  const fm = { title: entity.name };

  for (const f of entityFields) {
    if (entity[f] != null) fm[f] = entity[f];
  }

  // M2: surface the QA verdict where the human reviewing the file sees it.
  // Additive — absent entirely when the pool carries no QA shapes.
  if (qaVerdict) {
    fm.qa_verdict = qaVerdict.verdict;
    fm.qa_flagged = qaVerdict.flagged;
    if (qaVerdict.failed_checks && qaVerdict.failed_checks.length > 0) {
      fm.qa_failed_checks = qaVerdict.failed_checks;
    }
  }

  if (analysisItems.length > 0) {
    const analysis = analysisItems.at(-1).analysis_json;
    if (analysis) {
      // Categories: { primary: [{slug, why, source}], secondary: [{slug, ...}] }
      if (analysis.categories) {
        const cats = [];
        if (Array.isArray(analysis.categories.primary)) {
          cats.push(...analysis.categories.primary.map(c => c.slug || c.name || String(c)));
        }
        if (Array.isArray(analysis.categories.secondary)) {
          cats.push(...analysis.categories.secondary.map(c => c.slug || c.name || String(c)));
        }
        if (cats.length > 0) fm.categories = cats;
      }
      // Tags: { existing: [{slug, why}], suggested_new: [{label, why, evidence}] }
      if (analysis.tags) {
        const tagSlugs = [];
        if (Array.isArray(analysis.tags.existing)) {
          tagSlugs.push(...analysis.tags.existing.map(t => t.slug || t.name || String(t)));
        }
        if (Array.isArray(analysis.tags.suggested_new)) {
          tagSlugs.push(...analysis.tags.suggested_new.map(t => t.label || t.slug || String(t)));
        }
        if (tagSlugs.length > 0) fm.tags = tagSlugs;
      }
    }
  }

  // Use js-yaml dump() for safe serialization (handles colons, quotes, special chars)
  return '---\n' + yaml.dump(fm, { lineWidth: -1 }).trim() + '\n---\n\n';
}

function countWords(text) {
  return text.split(/\s+/).filter(Boolean).length;
}

function countSections(markdown) {
  const headings = markdown.match(/^#{2,3}\s+/gm);
  return headings ? headings.length : 0;
}

async function execute(input, options, tools) {
  const { entities } = input;
  const {
    heading_style = 'strip_markers',
    citation_format = 'footnotes',
    include_frontmatter = true,
    include_meta_section = false,
    frontmatter_entity_fields = [],
  } = options;
  const { logger, progress } = tools;
  const entityFields = parseFieldList(frontmatter_entity_fields, (msg) => logger.warn(`markdown-output: ${msg}`));

  const results = [];

  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i];
    progress.update(i + 1, entities.length, `Processing ${entity.name}`);

    // Data-shape routing: find by field presence, use latest item (supports
    // re-runs and tone-seo-editor refinement chain via add data operation)
    const allMarkdownItems = (entity.items || []).filter(item => item.content_markdown);
    const analysisItems = (entity.items || []).filter(item => item.analysis_json);

    if (!allMarkdownItems.length) {
      logger.warn(`${entity.name}: no items with content_markdown`);
      results.push({
        entity_name: entity.name,
        items: [],
        error: 'No items with content_markdown found',
        meta: { errors: 1 },
      });
      continue;
    }

    try {
      // Use the latest content_markdown item (tone-seo-editor refines content-writer)
      let content = allMarkdownItems.at(-1).content_markdown;

      // Extract source citations for footnote conversion
      let sourceCitations = null;
      if (analysisItems.length > 0 && analysisItems.at(-1).analysis_json) {
        sourceCitations = analysisItems.at(-1).analysis_json.source_citations;
      }

      // 1. Remove Meta section if not wanted
      if (!include_meta_section) {
        content = removeMetaSection(content);
      }

      // 2. Handle heading markers
      if (heading_style === 'strip_markers') {
        content = stripMarkers(content);
      }

      // 3. Handle citations
      if (citation_format === 'footnotes') {
        content = citationsToFootnotes(content, sourceCitations);
      } else if (citation_format === 'strip') {
        content = stripCitations(content);
      }
      // 'inline' = keep as-is

      // 4. Build frontmatter
      // QA verdict is collected regardless of frontmatter so a flagged entity
      // still surfaces on the item row when include_frontmatter is off
      // (adversarial-review finding: otherwise a markdown-only template ships
      // flagged content with zero QA trace).
      const qaVerdict = collectQaVerdict(entity.items);

      let finalMarkdown = content.trim();
      const hasFrontmatter = include_frontmatter;
      if (include_frontmatter) {
        finalMarkdown = buildFrontmatter(entity, entityFields, analysisItems, qaVerdict) + finalMarkdown;
      }

      const wordCount = countWords(finalMarkdown);
      const sectionCount = countSections(finalMarkdown);
      const preview = finalMarkdown.substring(0, 200).replace(/\n/g, ' ');

      const entityResult = {
        entity_name: entity.name,
        items: [{
          entity_name: entity.name,
          final_markdown: finalMarkdown,
          word_count: wordCount,
          section_count: sectionCount,
          has_frontmatter: hasFrontmatter,
          qa_flagged: qaVerdict ? String(qaVerdict.flagged) : '',
          content_preview: preview,
        }],
        meta: { word_count: wordCount, section_count: sectionCount },
      };
      results.push(entityResult);
      if (tools._partialItems) tools._partialItems.push(...entityResult.items);

      logger.info(`${entity.name}: ${wordCount} words, ${sectionCount} sections`);
    } catch (err) {
      logger.error(`${entity.name}: ${err.message}`);
      results.push({
        entity_name: entity.name,
        items: [],
        error: err.message,
        meta: { errors: 1 },
      });
    }
  }

  const totalItems = results.reduce((sum, r) => sum + r.items.length, 0);
  const errors = results.filter(r => r.error).map(r => `${r.entity_name}: ${r.error}`);

  return {
    results,
    summary: {
      total_entities: entities.length,
      total_items: totalItems,
      description: `${totalItems} Markdown outputs from ${entities.length} entities${errors.length ? ` (${errors.length} failed)` : ''}`,
      errors,
    },
  };
}

module.exports = execute;
