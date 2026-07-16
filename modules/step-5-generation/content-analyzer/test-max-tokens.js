/**
 * Guards the FIX A cap (content-analyzer max_tokens 8192 -> 16384).
 *
 * Sized for HAIKU (no thinking-token overhead). Complete analysis_json outputs
 * on the largest observed entities (223-page inputs, 2026-07-14 calibration)
 * ran 1.2k-6.6k tokens; the prove-out (Push Gaming) hit the old 8192 cap.
 * 16384 gives ~2.5x headroom. If a Claude-5 model is ever assigned here,
 * adaptive thinking consumes the budget invisibly and this number must be
 * re-derived — see manifest usage_notes LANDMINE.
 */
const assert = require('assert');
const manifest = require('./manifest.json');

const EXPECTED = 16384;

const opt = manifest.options.find(o => o.name === 'max_tokens');
assert(opt, 'max_tokens option must exist');
assert.strictEqual(opt.default, EXPECTED, `options[max_tokens].default must be ${EXPECTED}`);
assert.strictEqual(manifest.options_defaults.max_tokens, EXPECTED, `options_defaults.max_tokens must be ${EXPECTED}`);
assert(EXPECTED <= opt.max, `default ${EXPECTED} must be <= manifest max ${opt.max}`);

console.log('content-analyzer/test-max-tokens: PASS (3 assertions, cap = 16384)');
