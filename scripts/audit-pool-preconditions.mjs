#!/usr/bin/env node
/**
 * Pool Precondition Audit.
 *
 * Scans every modules/<step>/<id>/execute.js. For each module, looks for
 * patterns that indicate the module reads from the working pool. Proposes
 * pool_precondition based on what it finds.
 *
 * Usage:
 *   node scripts/audit-pool-preconditions.mjs
 *   node scripts/audit-pool-preconditions.mjs --csv > audit.csv
 *
 * Output: per-module table of (module_id, current_data_op, current_precondition,
 * proposed_precondition, evidence). Human reviews and adjusts.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MODULES_DIR = join(__dirname, '..', 'modules');

// Patterns that strongly suggest the module reads from the pool.
const POOL_READ_PATTERNS = [
  /entity\.items\b/,                 // canonical per-entity items array
  /entity\.pool_items\b/,            // alternate name
  /\binputData\.items\b/,            // some legacy shapes
  /\bentity\.items\.filter\b/,
  /\bentity\.items\.map\b/,
  /for\s*\(\s*const\s+item\s+of\s+entity\.items\b/,
];

const CSV_MODE = process.argv.includes('--csv');

function findExecuteFiles(root) {
  const results = [];
  for (const stepDir of readdirSync(root)) {
    const stepPath = join(root, stepDir);
    if (!statSync(stepPath).isDirectory()) continue;
    if (!/^step-\d+/.test(stepDir)) continue;
    for (const modDir of readdirSync(stepPath)) {
      const modPath = join(stepPath, modDir);
      if (!statSync(modPath).isDirectory()) continue;
      const exec = join(modPath, 'execute.js');
      const manifest = join(modPath, 'manifest.json');
      try { statSync(exec); statSync(manifest); }
      catch { continue; }
      results.push({ step: stepDir, id: modDir, executePath: exec, manifestPath: manifest });
    }
  }
  return results;
}

function analyze(executePath, manifestPath) {
  const src = readFileSync(executePath, 'utf8');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

  const matches = [];
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    for (const pat of POOL_READ_PATTERNS) {
      if (pat.test(lines[i])) {
        matches.push({ line: i + 1, text: lines[i].trim().slice(0, 100), pattern: pat.source });
      }
    }
  }

  const proposed = matches.length > 0 ? 'requires_items' : 'empty_ok';
  return {
    id: manifest.id,
    step: manifest.step,
    currentDataOp: manifest.data_operation_default,
    currentPrecondition: manifest.pool_precondition ?? '(none)',
    proposedPrecondition: proposed,
    matchCount: matches.length,
    evidence: matches.slice(0, 3).map(m => `L${m.line}: ${m.text}`).join(' | '),
  };
}

const modules = findExecuteFiles(MODULES_DIR);
const results = modules.map(m => analyze(m.executePath, m.manifestPath));

if (CSV_MODE) {
  console.log('id,step,current_data_op,current_precondition,proposed_precondition,match_count,evidence');
  for (const r of results) {
    const safe = (s) => `"${String(s).replace(/"/g, '""')}"`;
    console.log([r.id, r.step, r.currentDataOp, r.currentPrecondition, r.proposedPrecondition, r.matchCount, safe(r.evidence)].join(','));
  }
} else {
  const rows = results.map(r => ({
    id: r.id,
    step: r.step,
    data_op: r.currentDataOp,
    current: r.currentPrecondition,
    proposed: r.proposedPrecondition,
    matches: r.matchCount,
  }));
  console.table(rows);
  console.log('\nProposed: requires_items if execute.js reads pool, else empty_ok.');
  console.log('Run with --csv to get a copy-pasteable spreadsheet with evidence lines.');
}
