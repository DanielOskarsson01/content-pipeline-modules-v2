/**
 * JobTech / Platsbanken — Step 1 Discovery submodule
 *
 * Searches the Swedish public employment service API (Arbetsförmedlingen)
 * for job postings matching configured keywords. Free, no auth required.
 *
 * API docs: https://jobsearch.api.jobtechdev.se/
 */

const BASE_URL = 'https://jobsearch.api.jobtechdev.se/search';

async function execute(input, options, tools) {
  const { entities } = input;
  const {
    keywords = [],
    exclude_keywords = [],
    max_results = 50,
    municipality_code = ''
  } = options;
  const { logger, http, progress } = tools;

  if (!keywords.length) {
    logger.warn('No keywords configured — nothing to search');
    return {
      results: entities.map(e => ({
        entity_name: e.name,
        items: [],
        meta: { total_found: 0, api_calls: 0, keywords_searched: 0, errors: 0 }
      })),
      summary: {
        total_entities: entities.length,
        total_items: 0,
        description: 'No keywords configured',
        errors: []
      }
    };
  }

  const excludeSet = new Set(exclude_keywords.map(k => k.toLowerCase()));
  const results = [];

  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i];
    const allJobs = new Map();
    let callsMade = 0;
    const errors = [];

    for (let k = 0; k < keywords.length; k++) {
      const keyword = keywords[k];
      progress.update(k + 1, keywords.length, `Searching: ${keyword}`);

      try {
        const params = new URLSearchParams({
          q: keyword,
          limit: String(max_results)
        });
        if (municipality_code) {
          params.set('municipality', municipality_code);
        }

        const url = `${BASE_URL}?${params}`;
        const res = await http.get(url, { timeout: 15000 });
        callsMade++;

        if (res.status !== 200) {
          logger.warn(`JobTech API returned ${res.status} for "${keyword}"`);
          errors.push(`"${keyword}": HTTP ${res.status}`);
          continue;
        }

        const body = typeof res.body === 'string' ? res.body : String(res.body);
        const data = JSON.parse(body);
        const hits = data.hits || [];

        let added = 0;
        for (const hit of hits) {
          const externalId = `jobtech-${hit.id}`;
          if (allJobs.has(externalId)) continue;

          const title = hit.headline || 'Unknown';

          // Apply exclude filter
          const titleLower = title.toLowerCase();
          if (excludeSet.size > 0 && [...excludeSet].some(ex => titleLower.includes(ex))) {
            continue;
          }

          allJobs.set(externalId, {
            title,
            company: hit.employer?.name || null,
            location: hit.workplace_address?.municipality || hit.workplace_address?.region || null,
            url: hit.webpage_url || hit.application_details?.url || null,
            source: 'jobtech',
            externalId,
            snippet: (hit.description?.text || '').slice(0, 200),
            postedAt: hit.publication_date || null,
            status: 'success'
          });
          added++;
        }

        logger.info(`"${keyword}": ${hits.length} hits, ${added} new (${allJobs.size} unique total)`);

        // Save partial results for timeout resilience
        if (tools._partialItems) {
          tools._partialItems = Array.from(allJobs.values());
        }
      } catch (err) {
        logger.error(`Search for "${keyword}" failed: ${err.message}`);
        errors.push(`"${keyword}": ${err.message}`);
      }
    }

    const items = Array.from(allJobs.values());

    results.push({
      entity_name: entity.name,
      items,
      meta: {
        total_found: items.length,
        api_calls: callsMade,
        keywords_searched: keywords.length,
        errors: errors.length
      }
    });

    logger.info(`${entity.name}: ${items.length} unique jobs from ${callsMade} API calls`);
  }

  const totalItems = results.reduce((sum, r) => sum + r.items.length, 0);
  const totalErrors = results.reduce((sum, r) => sum + (r.meta?.errors || 0), 0);

  return {
    results,
    summary: {
      total_entities: entities.length,
      total_items: totalItems,
      description: totalErrors > 0
        ? `${totalItems} jobs discovered from JobTech across ${keywords.length} keywords (${totalErrors} errors)`
        : `${totalItems} jobs discovered from JobTech across ${keywords.length} keywords`,
      errors: results.flatMap(r => r.errors || [])
    }
  };
}

module.exports = execute;
