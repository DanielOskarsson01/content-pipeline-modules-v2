/**
 * HTML Output — Step 8 Bundling submodule
 *
 * Converts content_markdown to HTML. Optionally generates schema.org
 * Organization JSON-LD from analysis_json fields.
 *
 * Data-shape routing: finds input by field presence, never by source_submodule.
 */

const { marked } = require('marked');

/**
 * Strip [Type Marker] prefixes from markdown headings before HTML conversion.
 */
function stripMarkers(markdown) {
  return markdown.replace(
    /^(#{1,6})\s+\[([^\]]+)\]/gm,
    (match, hashes, content) => {
      let cleaned = content;
      if (cleaned.startsWith('Primary Category: ') || cleaned.startsWith('Secondary Category: ')) {
        cleaned = cleaned.replace(/^(?:Primary|Secondary) Category:\s*/, '');
        cleaned = cleaned.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      } else if (cleaned.startsWith('Tag: ')) {
        cleaned = cleaned.replace(/^Tag:\s*/, '');
        cleaned = cleaned.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      }
      return `${hashes} ${cleaned}`;
    }
  );
}

/**
 * Convert [#n] inline citations to superscript anchor links.
 * Returns { html, sourcesHtml } where sourcesHtml is the Sources section.
 */
function processCitations(markdown, sourceCitations, includeSources) {
  const refs = new Set();
  markdown.replace(/\[#(\d+)\]/g, (_, n) => { refs.add(parseInt(n, 10)); });

  if (refs.size === 0) return { markdown, sourcesHtml: '' };

  // Replace [#n] with superscript anchor links
  const processed = markdown.replace(
    /\[#(\d+)\]/g,
    '<sup><a href="#source-$1" id="ref-$1">[$1]</a></sup>'
  );

  let sourcesHtml = '';
  if (includeSources && sourceCitations) {
    const sortedRefs = [...refs].sort((a, b) => a - b);
    const sourceItems = sortedRefs.map(n => {
      const citation = sourceCitations.find(c => c.index === n);
      if (citation) {
        const link = citation.url ? `<a href="${escapeHtml(citation.url)}" target="_blank" rel="noopener">${escapeHtml(citation.title || citation.url)}</a>` : escapeHtml(citation.title || `Source ${n}`);
        return `<li id="source-${n}">${link} <a href="#ref-${n}">\u21A9</a></li>`;
      }
      return `<li id="source-${n}">Source ${n} <a href="#ref-${n}">\u21A9</a></li>`;
    });
    sourcesHtml = `<section class="sources"><h2>Sources</h2><ol>${sourceItems.join('')}</ol></section>`;
  }

  return { markdown: processed, sourcesHtml };
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Build schema.org Organization JSON-LD from analysis_json.
 * Field mapping:
 *   key_facts.founded → foundingDate
 *   key_facts.HQ → address
 *   key_facts.employees → numberOfEmployees
 *   key_facts.licenses → hasCredential (array)
 *   key_facts.awards → award (array)
 *   categories.primary.name → description prefix
 */
function buildSchemaOrg(entityName, analysisJson) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    'name': entityName,
  };

  if (!analysisJson) return schema;

  const kf = analysisJson.key_facts;
  if (kf) {
    if (kf.founded) schema.foundingDate = String(kf.founded);
    if (kf.HQ) schema.address = { '@type': 'PostalAddress', 'addressLocality': kf.HQ };
    if (kf.employees) schema.numberOfEmployees = { '@type': 'QuantitativeValue', 'value': kf.employees };
    if (kf.awards && Array.isArray(kf.awards) && kf.awards.length > 0) {
      schema.award = kf.awards;
    }
    if (kf.licenses && Array.isArray(kf.licenses) && kf.licenses.length > 0) {
      schema.hasCredential = kf.licenses.map(lic => ({
        '@type': 'EducationalOccupationalCredential',
        'credentialCategory': 'license',
        'name': typeof lic === 'string' ? lic : lic.name || String(lic),
      }));
    }
    if (kf.key_people && Array.isArray(kf.key_people) && kf.key_people.length > 0) {
      schema.member = kf.key_people.map(person => ({
        '@type': 'Person',
        'name': typeof person === 'string' ? person : person.name || String(person),
      }));
    }
    if (kf.contact) {
      if (kf.contact.email) schema.email = kf.contact.email;
      if (kf.contact.phone) schema.telephone = kf.contact.phone;
    }
  }

  // Description from categories
  if (analysisJson.categories && analysisJson.categories.primary) {
    const catName = analysisJson.categories.primary.name || analysisJson.categories.primary;
    schema.description = `${entityName} is a company in the ${catName} industry.`;
  }

  return schema;
}

const CSS_TEMPLATES = {
  none: '',
  basic: `<style>
body { font-family: system-ui, -apple-system, sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; line-height: 1.6; color: #333; }
h1, h2, h3 { color: #1a1a1a; }
a { color: #0066cc; }
sup a { text-decoration: none; color: #0066cc; }
.sources { border-top: 1px solid #ddd; margin-top: 2rem; padding-top: 1rem; font-size: 0.9em; }
</style>`,
  article: `<style>
body { font-family: Georgia, 'Times New Roman', serif; max-width: 720px; margin: 0 auto; padding: 2rem; line-height: 1.8; color: #2c2c2c; }
h1 { font-size: 2em; border-bottom: 2px solid #333; padding-bottom: 0.5rem; }
h2 { font-size: 1.4em; margin-top: 2rem; color: #444; }
h3 { font-size: 1.15em; color: #555; }
a { color: #1a5276; }
sup a { text-decoration: none; font-weight: bold; }
blockquote { border-left: 3px solid #ccc; margin: 1rem 0; padding: 0.5rem 1rem; color: #666; }
.sources { border-top: 1px solid #ddd; margin-top: 2rem; padding-top: 1rem; font-size: 0.85em; color: #666; }
.sources ol { padding-left: 1.5rem; }
</style>`,
};

async function execute(input, options, tools) {
  const { entities } = input;
  const {
    include_schema_org = true,
    css_template = 'none',
    include_sources_section = true,
    wrap_in_document = false,
  } = options;
  const { logger, progress } = tools;

  const results = [];

  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i];
    progress.update(i + 1, entities.length, `Processing ${entity.name}`);

    const markdownItems = (entity.items || []).filter(item => item.content_markdown);
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
      let content = markdownItems.map(item => item.content_markdown).join('\n\n');

      // Always strip markers for HTML output
      content = stripMarkers(content);

      // Get source citations for link conversion
      let sourceCitations = null;
      if (analysisItems.length > 0 && analysisItems[0].analysis_json) {
        sourceCitations = analysisItems[0].analysis_json.source_citations;
      }

      // Process citations before markdown-to-HTML conversion
      const { markdown: processedMd, sourcesHtml } = processCitations(
        content, sourceCitations, include_sources_section
      );

      // Convert markdown to HTML
      let html = marked.parse(processedMd);

      // Append sources section
      if (sourcesHtml) {
        html += '\n' + sourcesHtml;
      }

      // Schema.org JSON-LD
      let schemaOrgHtml = '';
      const hasSchemaOrg = include_schema_org && analysisItems.length > 0;
      if (hasSchemaOrg) {
        const schemaObj = buildSchemaOrg(entity.name, analysisItems[0].analysis_json);
        schemaOrgHtml = `<script type="application/ld+json">\n${JSON.stringify(schemaObj, null, 2)}\n</script>`;
      }

      // Assemble final HTML
      let finalHtml;
      const css = CSS_TEMPLATES[css_template] || '';

      if (wrap_in_document) {
        finalHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(entity.name)}</title>
${css}
${schemaOrgHtml}
</head>
<body>
${html}
</body>
</html>`;
      } else {
        finalHtml = [css, schemaOrgHtml, html].filter(Boolean).join('\n');
      }

      const headingCount = (html.match(/<h[1-6]/g) || []).length;
      const sizeKb = Math.round(Buffer.byteLength(finalHtml, 'utf8') / 1024 * 10) / 10;
      const preview = finalHtml.replace(/<[^>]+>/g, ' ').substring(0, 200).replace(/\s+/g, ' ').trim();

      results.push({
        entity_name: entity.name,
        items: [{
          entity_name: entity.name,
          final_html: finalHtml,
          html_size_kb: sizeKb,
          has_schema_org: hasSchemaOrg,
          heading_count: headingCount,
          content_preview: preview,
        }],
        meta: { html_size_kb: sizeKb, heading_count: headingCount, has_schema_org: hasSchemaOrg },
      });

      logger.info(`${entity.name}: ${sizeKb}KB HTML, ${headingCount} headings${hasSchemaOrg ? ', with schema.org' : ''}`);
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
      description: `${totalItems} HTML outputs from ${entities.length} entities${errors.length ? ` (${errors.length} failed)` : ''}`,
      errors,
    },
  };
}

module.exports = execute;
