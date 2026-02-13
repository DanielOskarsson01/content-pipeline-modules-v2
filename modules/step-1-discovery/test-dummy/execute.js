/**
 * Test Dummy — Step 1 Discovery submodule
 *
 * Returns fake data after a configurable delay per entity.
 * Useful for testing the full BullMQ execution pipeline
 * without requiring external HTTP calls or API keys.
 */

async function execute(input, options, tools) {
  const { entities } = input;
  const { delay_ms = 1000, items_per_entity = 3, fail_entity = '' } = options;
  const { logger, progress } = tools;

  const results = [];
  let totalItems = 0;
  const errors = [];

  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i];
    const name = entity.name || `Entity ${i + 1}`;
    progress.update(i + 1, entities.length, `Processing ${name}`);

    // Simulate work
    logger.info(`[test-dummy] Processing ${name} (delay: ${delay_ms}ms)`);
    await sleep(delay_ms);

    // Optional: simulate failure for a specific entity
    if (fail_entity && name.toLowerCase().includes(fail_entity.toLowerCase())) {
      const msg = `Simulated failure for ${name}`;
      logger.error(msg);
      results.push({
        entity_name: name,
        items: [],
        error: msg,
        meta: { simulated: true },
      });
      errors.push(msg);
      continue;
    }

    // Generate fake items
    const items = [];
    for (let j = 0; j < items_per_entity; j++) {
      items.push({
        url: `https://${name.toLowerCase().replace(/\s+/g, '-')}.example.com/page-${j + 1}`,
        title: `${name} — Page ${j + 1}`,
        score: Math.round(Math.random() * 100),
      });
    }

    results.push({
      entity_name: name,
      items,
      meta: { simulated: true, delay_ms },
    });

    totalItems += items.length;
    logger.info(`[test-dummy] ${name}: generated ${items.length} fake items`);
  }

  return {
    results,
    summary: {
      total_entities: entities.length,
      total_items: totalItems,
      errors,
    },
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = execute;
