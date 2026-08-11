/**
 * Manifest loadability guard.
 * Run: node modules/test-manifests-loadable.js   (exit 0 = all loadable, exit 1 = at least one would crash boot)
 *
 * WHY THIS EXISTS (the gap f2501ea exposed, 2026-08-11):
 *   Every module test suite requires ./execute.js directly and NEVER loads the
 *   manifest, so 75 green assertions and a green CI shipped a manifest that
 *   `content-pipeline-v2/server/services/moduleLoader.js` refuses to load
 *   (missing `output_schema`), which crash-loops pipeline-api at boot (loadModules
 *   is fail-closed — one invalid manifest takes the whole server down). This test
 *   is the missing guard: it loads EVERY manifest and asserts the loader contract.
 *
 *   It collects ALL violations per manifest (validateManifest throws on the first,
 *   which is exactly how decision-maker-selector's invalid `cost: "free"` stayed
 *   hidden behind its missing `output_schema`).
 *
 * KEEP IN SYNC with moduleLoader.js REQUIRED_FIELDS / VALID_* — this is a
 * deliberate mirror (the modules repo cannot import the app repo's ESM loader in
 * CI). If the loader's contract changes, update the constants below.
 */

const fs = require('fs');
const path = require('path');

// ── Mirror of moduleLoader.js validateManifest contract ──────────────────
const REQUIRED_FIELDS = ['id', 'name', 'description', 'version', 'step', 'category', 'cost', 'data_operation_default', 'requires_columns', 'item_key', 'output_schema'];
const VALID_STEPS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const VALID_COSTS = ['cheap', 'medium', 'expensive'];
const VALID_OPERATIONS = ['add', 'remove', 'transform'];
const VALID_POOL_PRECONDITIONS = ['empty_ok', 'requires_items'];

function manifestViolations(m) {
  const v = [];
  const missing = REQUIRED_FIELDS.filter((f) => m[f] === undefined);
  if (missing.length) v.push(`missing required field(s): ${missing.join(', ')}`);
  if (!VALID_STEPS.includes(m.step)) v.push(`invalid step: ${JSON.stringify(m.step)}`);
  if (!VALID_COSTS.includes(m.cost)) v.push(`invalid cost: ${JSON.stringify(m.cost)} (allowed: ${VALID_COSTS.join(', ')})`);
  if (!VALID_OPERATIONS.includes(m.data_operation_default)) v.push(`invalid data_operation_default: ${JSON.stringify(m.data_operation_default)}`);
  if (m.requires_columns !== undefined && !Array.isArray(m.requires_columns)) v.push('requires_columns must be an array');
  if (m.output_schema !== undefined && (typeof m.output_schema !== 'object' || m.output_schema === null)) v.push('output_schema must be an object');
  if (!m.pool_precondition) v.push("missing pool_precondition (set 'empty_ok' or 'requires_items')");
  else if (!VALID_POOL_PRECONDITIONS.includes(m.pool_precondition)) v.push(`invalid pool_precondition: ${JSON.stringify(m.pool_precondition)}`);
  return v;
}

// ── Discover manifests exactly as the loader does: step-N-*/<sub>/manifest.json ──
const modulesDir = path.join(__dirname); // this file lives in modules/
const stepDirs = fs.readdirSync(modulesDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && /^step-\d+-/.test(d.name))
  .map((d) => d.name)
  .sort();

let pass = 0;
let fail = 0;
const seenIds = new Map(); // id -> first manifest path (duplicate-id detection)

for (const step of stepDirs) {
  const stepPath = path.join(modulesDir, step);
  const subs = fs.readdirSync(stepPath, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  for (const sub of subs) {
    const mp = path.join(stepPath, sub, 'manifest.json');
    // The loader warns-and-skips dirs without a manifest.json (config/pipeline
    // helpers), so they are not a load failure — skip them here too.
    if (!fs.existsSync(mp)) continue;

    const rel = `${step}/${sub}`;
    let manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(mp, 'utf-8'));
    } catch (e) {
      console.log(`  FAIL: ${rel} — manifest.json is not valid JSON: ${e.message}`);
      fail++;
      continue;
    }

    const violations = manifestViolations(manifest);
    if (manifest.id !== undefined) {
      if (seenIds.has(manifest.id)) violations.push(`duplicate id "${manifest.id}" (already declared in ${seenIds.get(manifest.id)})`);
      else seenIds.set(manifest.id, rel);
    }

    if (violations.length === 0) {
      console.log(`  PASS: ${rel} (${manifest.id})`);
      pass++;
    } else {
      console.log(`  FAIL: ${rel} (${manifest.id}) would crash loadModules:`);
      for (const msg of violations) console.log(`          - ${msg}`);
      fail++;
    }
  }
}

console.log(`\nManifest loadability: ${pass} loadable, ${fail} would crash boot (of ${pass + fail} manifests).`);
if (fail > 0) {
  console.log('FAILED — at least one manifest would crash pipeline-api at boot (fail-closed loader).');
  process.exit(1);
}
console.log('OK — every manifest satisfies the moduleLoader contract.');
