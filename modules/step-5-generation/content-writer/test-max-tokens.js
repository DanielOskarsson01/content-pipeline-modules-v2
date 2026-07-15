/**
 * Guards the FIX B cap (content-writer max_tokens 16384 -> 32768).
 *
 * Unlike content-analyzer/seo-planner (haiku-only), this module legitimately
 * runs a Claude-5 model (sonnet) in QA-retry cards, where adaptive thinking is
 * ON by default and consumes max_tokens INVISIBLY (~10-12k thinking tokens per
 * sonnet-5 call, on top of ~5-7k tokens of markdown text). 16384 truncated 4/7
 * complete sonnet retries in the 2026-07-14 calibration; the skeleton
 * fail-closed guard turns any such truncation into a failed run. 32768 gives
 * the visible text room to complete after thinking.
 *
 * Streaming was verified in the skeleton (stageWorker.js sends stream:true),
 * so the large cap does not risk an HTTP timeout.
 */
const assert = require('assert');
const manifest = require('./manifest.json');

const EXPECTED = 32768;

const opt = manifest.options.find(o => o.name === 'max_tokens');
assert(opt, 'max_tokens option must exist');
assert.strictEqual(opt.default, EXPECTED, `options[max_tokens].default must be ${EXPECTED}`);
assert.strictEqual(manifest.options_defaults.max_tokens, EXPECTED, `options_defaults.max_tokens must be ${EXPECTED}`);
assert(EXPECTED <= opt.max, `default ${EXPECTED} must be <= manifest max ${opt.max}`);

console.log('content-writer/test-max-tokens: PASS (3 assertions, cap = 32768)');
