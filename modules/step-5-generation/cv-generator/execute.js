/**
 * CV Generator — Step 5 Generation submodule
 *
 * Generates a tailored CV DOCX file from the job-analyzer's output.
 * Uses generate_core_cvs.js buildCV() with variant selection and overrides.
 * Also produces a suggestions DOCX documenting the analysis.
 *
 * Ported from: job-search-tool/server/services/cvGenerator.js
 */

const fs = require('fs');
const path = require('path');
const { Document, Packer, Paragraph, TextRun, BorderStyle } = require('docx');

const JOB_KEYS = ['onlyigaming', 'coinhero', 'betclic', 'comeon', 'mrgreen'];

// ── Helpers ────────────────────────────────────────────────────────

function buildOverrides(cv) {
  const overrides = {};
  if (cv.summary) overrides.summary = cv.summary;
  if (cv.highlights) overrides.highlights = cv.highlights;
  if (cv.competencies) overrides.competencies = cv.competencies;
  if (cv.otherExp) overrides.otherExp = cv.otherExp;
  if (cv.jobs) {
    overrides.jobs = {};
    for (const jobKey of JOB_KEYS) {
      if (cv.jobs[jobKey]) {
        overrides.jobs[jobKey] = {
          role: cv.jobs[jobKey].role,
          intro: cv.jobs[jobKey].intro,
          bullets: cv.jobs[jobKey].bullets,
        };
      }
    }
  }
  return overrides;
}

function buildSuggestionsDoc(config) {
  const { job_analysis, suggestions, gaps, company_name } = config;
  const children = [];

  const heading = (text) =>
    new Paragraph({
      spacing: { before: 300, after: 100 },
      children: [new TextRun({ text, bold: true, size: 28, color: '2B5C6E', font: 'Calibri' })],
    });

  const subheading = (text) =>
    new Paragraph({
      spacing: { before: 200, after: 60 },
      children: [new TextRun({ text, bold: true, size: 22, color: '1a1a1a', font: 'Calibri' })],
    });

  const body = (text, opts = {}) =>
    new Paragraph({
      spacing: { after: 40 },
      children: [new TextRun({ text, size: 18, color: opts.color || '3a3a3a', font: 'Calibri', ...opts })],
    });

  const label = (lbl, value) =>
    new Paragraph({
      spacing: { after: 30 },
      children: [
        new TextRun({ text: `${lbl}: `, bold: true, size: 18, color: '2B5C6E', font: 'Calibri' }),
        new TextRun({ text: value, size: 18, color: '3a3a3a', font: 'Calibri' }),
      ],
    });

  const rule = () =>
    new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: '2B5C6E' } },
      spacing: { before: 60, after: 60 },
      children: [],
    });

  // Title
  children.push(new Paragraph({
    spacing: { after: 40 },
    children: [new TextRun({ text: `CV Analysis & Suggestions - ${company_name}`, bold: true, size: 36, color: '2B5C6E', font: 'Calibri' })],
  }));
  children.push(new Paragraph({
    spacing: { after: 200 },
    children: [new TextRun({ text: `Generated ${new Date().toISOString().slice(0, 10)}. Review each suggestion and approve/reject.`, size: 18, color: '666666', font: 'Calibri', italics: true })],
  }));

  // 5-Layer Analysis
  if (job_analysis) {
    children.push(heading('5-Layer Job Ad Analysis'));
    children.push(rule());

    children.push(subheading('Layer 1: Explicit Requirements'));
    for (const req of job_analysis.explicit_requirements || []) {
      const freq = req.frequency > 1 ? ` (mentioned ${req.frequency}x)` : '';
      children.push(body(`  [${req.priority}] ${req.requirement}${freq}`));
    }

    children.push(subheading('Layer 2: Preferred Qualifications'));
    for (const q of job_analysis.preferred_qualifications || []) {
      children.push(body(`  - ${q}`));
    }

    children.push(subheading('Layer 3: Industry Language & Keywords'));
    children.push(body(`  ${(job_analysis.industry_language || []).join(', ')}`));

    children.push(subheading('Layer 4: Operational Context'));
    const ctx = job_analysis.operational_context || {};
    if (ctx.team_size) children.push(label('Team', ctx.team_size));
    if (ctx.reporting_to) children.push(label('Reports to', ctx.reporting_to));
    if (ctx.scope) children.push(label('Scope', ctx.scope));
    if (ctx.location) children.push(label('Location', ctx.location));

    children.push(subheading('Layer 5: Culture Signals'));
    for (const c of job_analysis.culture_signals || []) {
      children.push(body(`  - ${c}`));
    }
  }

  // Gaps
  if (gaps && gaps.length > 0) {
    children.push(heading('Content Gaps'));
    children.push(rule());
    for (let i = 0; i < gaps.length; i++) {
      const gap = gaps[i];
      children.push(subheading(`${i + 1}. ${gap.requirement || gap} [${gap.priority || ''}]`));
      if (gap.closest_match) children.push(label('Closest existing content', gap.closest_match));
      if (gap.question) children.push(label('Question for Daniel', gap.question));
    }
  }

  // Suggestions
  const sections = [
    { key: 'summary', title: 'Summary Suggestions' },
    { key: 'highlights', title: 'Highlights Suggestions' },
    { key: 'competencies', title: 'Competency Suggestions' },
    { key: 'job_bullets', title: 'Job Bullet Suggestions' },
  ];

  if (suggestions) {
    for (const sec of sections) {
      const data = suggestions[sec.key];
      if (!data || !data.has_suggestions || !data.items?.length) continue;
      children.push(heading(sec.title));
      children.push(rule());
      for (let i = 0; i < data.items.length; i++) {
        const item = data.items[i];
        children.push(subheading(`${i + 1}. [${item.type}]${item.job ? ` (${item.job})` : ''}`));
        if (item.current) children.push(label('CURRENT', item.current));
        children.push(label('SUGGESTED', item.suggested));
        children.push(label('ADDRESSES', item.addresses));
      }
    }
  }

  return new Document({
    styles: { default: { document: { run: { font: 'Calibri', size: 18 } } } },
    sections: [{
      properties: { page: { margin: { top: 720, bottom: 720, left: 720, right: 720 } } },
      children,
    }],
  });
}

// ── Main execute ───────────────────────────────────────────────────

async function execute(input, options, tools) {
  const { entities } = input;
  const { cv_source_dir, output_dir = '/tmp/job-search-output' } = options;
  const { logger, progress } = tools;

  // Ensure output directory exists
  if (!fs.existsSync(output_dir)) {
    fs.mkdirSync(output_dir, { recursive: true });
  }

  // Load buildCV from generate_core_cvs.js
  let buildCV;
  const genPath = path.join(cv_source_dir, 'generate_core_cvs.js');
  if (fs.existsSync(genPath)) {
    try {
      const mod = require(genPath);
      buildCV = mod.buildCV;
      logger.info('Loaded buildCV from generate_core_cvs.js');
    } catch (err) {
      logger.error(`Failed to load generate_core_cvs.js: ${err.message}`);
      return {
        results: entities.map(e => ({
          entity_name: e.name,
          items: [{ entity_name: e.name, status: 'error', error: `Cannot load CV builder: ${err.message}` }],
          meta: { errors: 1 }
        })),
        summary: { total_entities: entities.length, total_items: 0, description: 'Failed: CV builder not available', errors: ['CV builder load failed'] }
      };
    }
  } else {
    logger.error(`generate_core_cvs.js not found at: ${genPath}`);
    return {
      results: entities.map(e => ({
        entity_name: e.name,
        items: [{ entity_name: e.name, status: 'error', error: 'generate_core_cvs.js not found' }],
        meta: { errors: 1 }
      })),
      summary: { total_entities: entities.length, total_items: 0, description: 'Failed: CV builder not found', errors: ['generate_core_cvs.js not found'] }
    };
  }

  const results = [];
  const errors = [];

  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i];
    progress.update(i + 1, entities.length, `Generating CV: ${entity.name}`);

    // Find the analysis from upstream (job-analyzer output)
    const analysis = entity.analysis
      || (entity.items && entity.items.find(item => item.analysis)?.analysis)
      || null;

    if (!analysis) {
      logger.error(`${entity.name}: No analysis data found — skipping`);
      results.push({
        entity_name: entity.name,
        items: [{ entity_name: entity.name, status: 'error', error: 'No analysis data from job-analyzer' }],
        meta: { errors: 1 }
      });
      errors.push(`${entity.name}: No analysis data`);
      continue;
    }

    try {
      const companySlug = (analysis.company_name || entity.name)
        .replace(/[^a-zA-Z0-9_]/g, '_')
        .replace(/_+/g, '_');

      // 1. Generate CV DOCX
      logger.info(`${entity.name}: Building CV (variant: ${analysis.base_variant})`);
      const cvData = analysis.cv || {};
      const overrides = buildOverrides(cvData);
      const doc = buildCV(analysis.base_variant, overrides);
      const buffer = await Packer.toBuffer(doc);

      const cvFilename = `CV_Daniel_Oskarsson_${companySlug}_tailored.docx`;
      const cvPath = path.join(output_dir, cvFilename);
      fs.writeFileSync(cvPath, buffer);
      logger.info(`${entity.name}: CV written to ${cvFilename} (${Math.round(buffer.length / 1024)}KB)`);

      // 2. Generate suggestions DOCX
      const sugDoc = buildSuggestionsDoc(analysis);
      const sugBuffer = await Packer.toBuffer(sugDoc);
      const sugFilename = `SUGGESTIONS_${companySlug}.docx`;
      const sugPath = path.join(output_dir, sugFilename);
      fs.writeFileSync(sugPath, sugBuffer);
      logger.info(`${entity.name}: Suggestions written to ${sugFilename}`);

      // 3. Save raw analysis JSON
      const jsonFilename = `RESPONSE_${companySlug}.json`;
      fs.writeFileSync(path.join(output_dir, jsonFilename), JSON.stringify(analysis, null, 2));

      results.push({
        entity_name: entity.name,
        items: [{
          entity_name: entity.name,
          cv_file: cvPath,
          cv_filename: cvFilename,
          suggestions_file: sugPath,
          suggestions_filename: sugFilename,
          response_file: path.join(output_dir, jsonFilename),
          variant: analysis.base_variant,
          fit_score: analysis.fit_score,
          cv_size_kb: Math.round(buffer.length / 1024),
          status: 'success'
        }],
        meta: {
          variant: analysis.base_variant,
          cv_size_kb: Math.round(buffer.length / 1024),
          errors: 0
        }
      });

    } catch (err) {
      logger.error(`${entity.name}: CV generation failed — ${err.message}`);
      results.push({
        entity_name: entity.name,
        items: [{ entity_name: entity.name, status: 'error', error: err.message }],
        meta: { errors: 1 }
      });
      errors.push(`${entity.name}: ${err.message}`);
    }
  }

  const totalItems = results.filter(r => r.items[0]?.status === 'success').length;

  return {
    results,
    summary: {
      total_entities: entities.length,
      total_items: totalItems,
      description: errors.length > 0
        ? `${totalItems} of ${entities.length} CVs generated (${errors.length} failed)`
        : `${totalItems} CVs generated successfully`,
      errors
    }
  };
}

module.exports = execute;
