/**
 * CSV Discovery - Step 1 Discovery submodule
 *
 * Reads CSV files from a local directory and maps rows to pipeline items.
 * Designed for external tools (Cowork, cron scripts) that drop discovery
 * results into a shared folder on a schedule.
 */

const fs = require('fs');
const path = require('path');

// ── CSV parser (no dependencies) ──────────────────────────────────

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  const headers = parseLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i]);
    if (values.length === 0) continue;
    const row = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j].trim().toLowerCase()] = (values[j] || '').trim();
    }
    rows.push(row);
  }
  return rows;
}

function parseLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

// ── Helpers ───────────────────────────────────────────────────────

function extractExternalId(value, sourceLabel) {
  if (!value) return null;
  // LinkedIn URL: extract numeric ID
  const linkedinMatch = value.match(/linkedin\.com\/jobs\/view\/(\d+)/);
  if (linkedinMatch) return `${sourceLabel}-${linkedinMatch[1]}`;
  // Generic URL: use full URL as ID
  if (value.startsWith('http')) return `${sourceLabel}-${value}`;
  // Raw ID
  return `${sourceLabel}-${value}`;
}

function globMatch(pattern, filename) {
  const regex = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${regex}$`, 'i').test(filename);
}

function loadProcessedList(sourceDir) {
  const p = path.join(sourceDir, '.processed');
  if (!fs.existsSync(p)) return new Set();
  return new Set(fs.readFileSync(p, 'utf-8').split('\n').filter(l => l.trim()));
}

function saveProcessedList(sourceDir, processed) {
  const p = path.join(sourceDir, '.processed');
  fs.writeFileSync(p, Array.from(processed).join('\n') + '\n');
}

// ── Main execute ──────────────────────────────────────────────────

async function execute(input, options, tools) {
  const { entities } = input;
  const {
    source_dir,
    file_pattern = 'jobs-*.csv',
    column_map = {},
    source_label = 'linkedin',
    skip_processed = true,
    exclude_keywords = []
  } = options;
  const { logger, progress } = tools;

  // Validate source directory
  if (!source_dir || !fs.existsSync(source_dir)) {
    logger.error(`Source directory not found: ${source_dir}`);
    return {
      results: entities.map(e => ({
        entity_name: e.name,
        items: [],
        meta: { total_found: 0, files_read: 0, errors: 1 }
      })),
      summary: {
        total_entities: entities.length,
        total_items: 0,
        description: `Error: source directory not found (${source_dir})`,
        errors: [`Directory not found: ${source_dir}`]
      }
    };
  }

  // Find matching CSV files
  const allFiles = fs.readdirSync(source_dir);
  const csvFiles = allFiles
    .filter(f => globMatch(file_pattern, f))
    .sort(); // chronological by filename

  // Filter out already-processed files
  const processed = skip_processed ? loadProcessedList(source_dir) : new Set();
  const newFiles = csvFiles.filter(f => !processed.has(f));

  if (newFiles.length === 0) {
    logger.info(`No new CSV files in ${source_dir} (${csvFiles.length} total, all processed)`);
    return {
      results: entities.map(e => ({
        entity_name: e.name,
        items: [],
        meta: { total_found: 0, files_read: 0, files_skipped: csvFiles.length, errors: 0 }
      })),
      summary: {
        total_entities: entities.length,
        total_items: 0,
        description: csvFiles.length > 0
          ? `No new files (${csvFiles.length} already processed)`
          : `No CSV files matching "${file_pattern}" in ${source_dir}`,
        errors: []
      }
    };
  }

  logger.info(`Found ${newFiles.length} new CSV file(s) to process`);

  // Default column map
  const map = {
    url: 'url',
    title: 'title',
    company: 'company',
    location: 'location',
    snippet: 'snippet',
    postedAt: 'posted_date',
    externalId: 'url',
    ...column_map
  };

  const excludeSet = new Set((exclude_keywords || []).map(k => k.toLowerCase()));
  const allItems = new Map(); // externalId -> item
  let filesRead = 0;
  const errors = [];

  for (let fi = 0; fi < newFiles.length; fi++) {
    const filename = newFiles[fi];
    progress.update(fi + 1, newFiles.length, `Reading: ${filename}`);

    try {
      const filePath = path.join(source_dir, filename);
      const content = fs.readFileSync(filePath, 'utf-8');
      const rows = parseCSV(content);

      let added = 0;
      for (const row of rows) {
        // Map columns
        const item = {
          source: source_label,
          status: 'success'
        };

        for (const [canonical, csvCol] of Object.entries(map)) {
          item[canonical] = row[csvCol.toLowerCase()] || null;
        }

        // Must have URL
        if (!item.url) continue;

        // Build externalId
        const rawIdField = row[(map.externalId || 'url').toLowerCase()] || item.url;
        item.externalId = extractExternalId(rawIdField, source_label);
        if (!item.externalId) continue;

        // Dedup
        if (allItems.has(item.externalId)) continue;

        // Exclude filter
        if (excludeSet.size > 0) {
          const titleLower = (item.title || '').toLowerCase();
          if ([...excludeSet].some(ex => titleLower.includes(ex))) continue;
        }

        // Store snippet as text_content too if it's substantial
        if (item.snippet && item.snippet.length > 200) {
          item.text_content = item.snippet;
          item.snippet = item.snippet.slice(0, 200);
        }

        allItems.set(item.externalId, item);
        added++;
      }

      filesRead++;
      processed.add(filename);
      logger.info(`${filename}: ${rows.length} rows, ${added} new items (${allItems.size} total)`);

      // Save partial results after each file for timeout resilience
      if (tools._partialItems) {
        tools._partialItems = Array.from(allItems.values());
      }

    } catch (err) {
      logger.error(`${filename}: ${err.message}`);
      errors.push(`${filename}: ${err.message}`);
    }
  }

  // Save processed list
  if (skip_processed && filesRead > 0) {
    try {
      saveProcessedList(source_dir, processed);
    } catch (err) {
      logger.warn(`Could not save .processed file: ${err.message}`);
    }
  }

  // Save partial results for timeout resilience
  const items = Array.from(allItems.values());
  if (tools._partialItems) {
    tools._partialItems = items;
  }

  // All entities get the same items (CSV discovery is entity-agnostic)
  const results = entities.map(e => ({
    entity_name: e.name,
    items,
    meta: {
      total_found: items.length,
      files_read: filesRead,
      files_skipped: csvFiles.length - newFiles.length,
      errors: errors.length
    }
  }));

  const totalItems = items.length;

  return {
    results,
    summary: {
      total_entities: entities.length,
      total_items: totalItems,
      description: errors.length > 0
        ? `${totalItems} items from ${filesRead} file(s) (${errors.length} errors)`
        : `${totalItems} items from ${filesRead} file(s)`,
      errors
    }
  };
}

module.exports = execute;
