#!/usr/bin/env node
/**
 * Apply pool_precondition to every module manifest based on scripts/audit-results.csv.
 *
 * Inserts the pool_precondition field immediately AFTER data_operation_default
 * in each manifest.json. Preserves JSON formatting style (2-space indent, trailing newline).
 *
 * Usage: node scripts/apply-pool-preconditions.mjs
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MODULES_DIR = join(__dirname, '..', 'modules');
const CSV_PATH    = join(__dirname, 'audit-results.csv');

// --- Parse CSV (simple — no embedded commas in id/step/precondition columns) ---
const csvLines = readFileSync(CSV_PATH, 'utf8').split('\n').filter(Boolean);
const header = csvLines.shift();
const cols = header.split(',');
const idIdx          = cols.indexOf('id');
const proposedIdx    = cols.indexOf('proposed_precondition');
const idToPrecondition = new Map();
for (const line of csvLines) {
  // Split on first 5 commas only — evidence column may contain commas
  const parts = [];
  let rest = line;
  for (let i = 0; i < 5; i++) {
    const c = rest.indexOf(',');
    parts.push(rest.slice(0, c));
    rest = rest.slice(c + 1);
  }
  // parts now has id, step, current_data_op, current_precondition, proposed_precondition
  idToPrecondition.set(parts[0], parts[4]);
}

// --- Walk modules directory ---
function findManifests(root) {
  const results = [];
  for (const stepDir of readdirSync(root)) {
    const stepPath = join(root, stepDir);
    if (!statSync(stepPath).isDirectory()) continue;
    if (!/^step-\d+-/.test(stepDir)) continue;
    for (const modDir of readdirSync(stepPath)) {
      const modPath = join(stepPath, modDir);
      if (!statSync(modPath).isDirectory()) continue;
      const manifestPath = join(modPath, 'manifest.json');
      try { statSync(manifestPath); }
      catch { continue; }
      results.push(manifestPath);
    }
  }
  return results;
}

const manifests = findManifests(MODULES_DIR);
let updated = 0, skipped = 0, missing = [];

for (const path of manifests) {
  const src = readFileSync(path, 'utf8');
  const manifest = JSON.parse(src);
  const precondition = idToPrecondition.get(manifest.id);
  if (!precondition) {
    missing.push(manifest.id);
    continue;
  }
  if (manifest.pool_precondition === precondition) {
    skipped++;
    continue;
  }

  // Insert pool_precondition immediately after data_operation_default, preserving
  // existing field order and indentation. Use a regex-based text insertion
  // (rather than re-serializing the whole JSON) to keep diffs minimal.
  const needle = /(\n\s*"data_operation_default":\s*"[^"]+",)(\s*\n)/;
  if (!needle.test(src)) {
    console.error(`SKIP: ${path} — no data_operation_default field found`);
    continue;
  }
  const newSrc = src.replace(needle, (_m, head, ws) => {
    // Detect leading whitespace on the data_operation line to match indentation
    const indentMatch = head.match(/\n(\s*)"data_operation_default"/);
    const indent = indentMatch ? indentMatch[1] : '  ';
    return `${head}\n${indent}"pool_precondition": "${precondition}",${ws.slice(1)}`;
  });
  writeFileSync(path, newSrc);
  updated++;
  console.log(`updated  ${manifest.id} → ${precondition}`);
}

console.log(`\nDone: ${updated} updated, ${skipped} already correct.`);
if (missing.length) {
  console.error(`MISSING from CSV (${missing.length}):`, missing.join(', '));
  process.exit(1);
}
