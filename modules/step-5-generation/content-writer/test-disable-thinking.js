/**
 * v1.8.0 — disable_thinking option: proves what reaches ai.complete.
 *
 * The last attempt at a thinking control failed because the option existed
 * nowhere in the chain — so this test asserts the CALL SITE, not the manifest:
 * execute() must pass thinking:{type:'disabled'} to ai.complete exactly when
 * disable_thinking === true AND ai_provider === 'anthropic', and must not
 * send the key at all otherwise (default = byte-identical to v1.7.0).
 */
const assert = require('assert');
const execute = require('./execute.js');
const manifest = require('./manifest.json');

const calls = [];
const tools = {
  logger: { info: () => {}, warn: () => {}, error: () => {} },
  progress: { update: () => {} },
  ai: {
    complete: async (params) => {
      calls.push(params);
      return { text: '## Section\n\nProse [#1].', tokens_in: 10, tokens_out: 10 };
    },
  },
};

function input() {
  return {
    entities: [{
      name: 'TestCo',
      items: [
        { source_submodule: 'content-analyzer', analysis_json: { topic: 'x', source_citations: [] } },
        { source_submodule: 'page-scraper', url: 'https://t.co', title: 'T', text_content: 'Source text.' },
      ],
    }],
  };
}

async function run(extraOptions) {
  calls.length = 0;
  const options = { ...manifest.options_defaults, ...extraOptions };
  const res = await execute(input(), options, tools);
  assert.strictEqual(calls.length, 1, 'exactly one ai.complete call');
  assert.strictEqual(res.summary.total_items, 1, 'entity written successfully');
  return calls[0];
}

(async () => {
  // Manifest surface
  const opt = manifest.options.find(o => o.name === 'disable_thinking');
  assert(opt, 'disable_thinking option must exist in manifest');
  assert.strictEqual(opt.default, false, 'manifest default must be false (shipped behaviour unchanged)');
  assert.strictEqual(manifest.options_defaults.disable_thinking, false, 'options_defaults must carry false');

  // 1. Default (false) on anthropic → no thinking key at all (byte-identical request)
  let call = await run({});
  assert(!('thinking' in call), 'default: thinking key must be ABSENT from the ai.complete params');

  // 2. true + anthropic → thinking disabled reaches the call
  call = await run({ disable_thinking: true });
  assert.deepStrictEqual(call.thinking, { type: 'disabled' }, 'true+anthropic: thinking {type:disabled} must reach ai.complete');

  // 3. true + non-anthropic provider → param must NOT be sent
  call = await run({ disable_thinking: true, ai_provider: 'openai', ai_model: 'gpt-4o-mini' });
  assert(!('thinking' in call), 'true+openai: thinking must NOT be sent to non-Anthropic providers');

  // 4. Strict boolean: a string 'true' does not trigger it (options arrive as
  //    JSON booleans from workbench overrides / preset_map; matches the
  //    requires_prompt_override / require_slug_paths === true convention)
  call = await run({ disable_thinking: 'true' });
  assert(!('thinking' in call), "string 'true': strict === true gate, key absent");

  console.log('content-writer/test-disable-thinking: PASS (7 assertions)');
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
