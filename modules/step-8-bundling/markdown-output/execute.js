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

/**
 * Strip [Type Marker] prefixes from headings.
 * e.g. "## [Overview]" → "## Overview"
 * e.g. "## [Primary Category: online-casinos]" → "## Online Casinos"
 */
function stripMarkers(markdown) {
  return markdown.replace(
    /^(#{1,6})\s+\[([^\]]+)\]/gm,
    (match, hashes, content) => {
      // Clean up category/tag markers: "Primary Category: online-casinos" → "Online Casinos"
      let cleaned = content;
      if (cleaned.startsWith('Primary Category: ') || cleaned.startsWith('Secondary Category: ')) {
        cleaned = cleaned.replace(/^(?:Primary|Secondary) Category:\s*/, '');
        cleaned = slugToTitle(cleaned);
      } else if (cleaned.startsWith('Tag: ')) {
        cleaned = cleaned.replace(/^Tag:\s*/, '');
        cleaned = slugToTitle(cleaned);
      }
      return `${hashes} ${cleaned}`;
    }
  );
}

/**
 * Convert a slug to title case. "online-casinos" → "Online Casinos"
 */
function slugToTitle(slug) {
  return slug
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
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
 * Remove the ## [Meta] section from markdown.
 */
function removeMetaSection(markdown) {
  // Match from ## [Meta] or ## Meta to the next ## heading or end of string
  // Meta is typically the last section, so match greedily to end
  return markdown.replace(/\n## \[?Meta\]?[\s\S]*$/m, '').trim();
}

/**
 * Build YAML frontmatter from entity name and analysis data.
 */
function buildFrontmatter(entityName, analysisItems) {
  const fm = { title: entityName };

  if (analysisItems.length > 0) {
    const analysis = analysisItems[0].analysis_json;
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
  } = options;
  const { logger, progress } = tools;

  const results = [];

  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i];
    progress.update(i + 1, entities.length, `Processing ${entity.name}`);

    // Data-shape routing: find by field presence
    // For content_markdown: prefer AI-written items (have section_count from
    // content-writer) over raw scraped items (from page-scraper).
    const allMarkdownItems = (entity.items || []).filter(item => item.content_markdown);
    const writtenItems = allMarkdownItems.filter(item => item.section_count !== undefined);
    const markdownItems = writtenItems.length > 0 ? writtenItems : allMarkdownItems;
    const analysisItems = (entity.items || []).filter(item => item.analysis_json);

    if (!markdownItems.length) {
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
      // Merge all content_markdown items (typically one per entity, but handle multiples)
      let content = markdownItems.map(item => item.content_markdown).join('\n\n');

      // Extract source citations for footnote conversion
      let sourceCitations = null;
      if (analysisItems.length > 0 && analysisItems[0].analysis_json) {
        sourceCitations = analysisItems[0].analysis_json.source_citations;
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
      let finalMarkdown = content.trim();
      const hasFrontmatter = include_frontmatter;
      if (include_frontmatter) {
        finalMarkdown = buildFrontmatter(entity.name, analysisItems) + finalMarkdown;
      }

      const wordCount = countWords(finalMarkdown);
      const sectionCount = countSections(finalMarkdown);
      const preview = finalMarkdown.substring(0, 200).replace(/\n/g, ' ');

      results.push({
        entity_name: entity.name,
        items: [{
          entity_name: entity.name,
          final_markdown: finalMarkdown,
          word_count: wordCount,
          section_count: sectionCount,
          has_frontmatter: hasFrontmatter,
          content_preview: preview,
        }],
        meta: { word_count: wordCount, section_count: sectionCount },
      });

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
