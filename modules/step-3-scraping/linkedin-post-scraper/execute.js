/**
 * LinkedIn Post Scraper — Step 3 Scraping submodule
 *
 * Fetches recent posts from LinkedIn profiles via the Profile API's
 * /api/posts/:slug endpoint (Voyager GraphQL). Outputs structured post
 * data with engagement metrics, hashtags, mentions, and post type.
 *
 * Delegates all LinkedIn communication to the Profile API (localhost:3847).
 */

const PROFILE_API_URL = process.env.LINKEDIN_API_URL || 'http://localhost:3847';
const PROFILE_API_KEY = process.env.LINKEDIN_API_KEY || 'oig-pipeline-2026';

// ---------------------------------------------------------------------------
// Main execute function
// ---------------------------------------------------------------------------

async function execute(input, options, tools) {
  const { entities } = input;
  const { logger, progress } = tools;
  const {
    posts_per_profile = 10,
    requests_per_hour = 20,
    min_word_count = 10,
    source = 'entity_field',
  } = options;

  // Collect profile slugs to scrape
  const profiles = collectProfiles(entities, source, logger);

  if (profiles.length === 0) {
    return {
      results: [],
      summary: {
        total_entities: entities.length,
        total_items: 0,
        description: 'No LinkedIn profile slugs found in input',
        errors: [],
      },
    };
  }

  logger.info(`${profiles.length} profiles to fetch posts from (${posts_per_profile} posts each, rate: ${requests_per_hour}/hr)`);

  // Health check
  const sessionValid = await checkApiHealth(tools, logger);
  if (!sessionValid) {
    logger.error('LinkedIn Profile API unavailable — cannot fetch posts');
    return {
      results: profiles.map(p => ({
        entity_name: p.entity_name,
        items: [errorItem(p, 'LinkedIn Profile API unavailable')],
        meta: { profiles: 0, posts: 0, errors: 1 },
      })),
      summary: {
        total_entities: entities.length,
        total_items: 0,
        voyager_status: 'session_expired',
        description: 'API unavailable — 0 posts scraped',
        errors: ['LinkedIn Profile API unavailable'],
      },
    };
  }

  const allResults = [];
  let totalPosts = 0;
  let totalErrors = 0;
  let consecutiveFailures = 0;
  let voyagerAborted = false;
  const rateLimiter = createRateLimiter(requests_per_hour);
  const errors = [];

  for (let i = 0; i < profiles.length; i++) {
    const profile = profiles[i];
    progress.update(i + 1, profiles.length, `Posts: ${profile.slug}`);

    if (voyagerAborted) {
      allResults.push(errorItem(profile, 'Aborted (circuit breaker)'));
      totalErrors++;
      errors.push(`${profile.slug}: circuit breaker`);
      continue;
    }

    await rateLimiter();

    try {
      const data = await fetchPosts(profile.slug, posts_per_profile, tools, logger);
      const posts = (data.posts || [])
        .filter(p => {
          const wc = (p.text || '').split(/\s+/).filter(Boolean).length;
          return wc >= min_word_count;
        })
        .map((p, idx) => formatPostItem(p, profile, data.name, idx));

      if (posts.length === 0) {
        logger.warn(`${profile.slug}: no posts with >= ${min_word_count} words`);
      } else {
        logger.info(`${profile.slug} (${data.name}): ${posts.length} posts`);
      }

      allResults.push(...posts);
      totalPosts += posts.length;
      consecutiveFailures = 0;

      if (tools._partialItems) {
        tools._partialItems.push(...posts);
      }
    } catch (err) {
      logger.warn(`Posts failed for ${profile.slug}: ${err.message}`);
      consecutiveFailures++;
      totalErrors++;
      errors.push(`${profile.slug}: ${err.message}`);

      allResults.push(errorItem(profile, err.message));

      if (consecutiveFailures >= 3) {
        logger.error(`Circuit breaker: 3 consecutive failures — aborting remaining ${profiles.length - i - 1} profiles`);
        voyagerAborted = true;
      }
    }
  }

  const entityResults = groupByEntity(allResults);

  const descParts = [`${totalPosts} posts from ${profiles.length} profiles`];
  if (totalErrors > 0) descParts.push(`${totalErrors} profile errors`);
  if (voyagerAborted) descParts.push('circuit breaker triggered');

  return {
    results: entityResults,
    summary: {
      total_entities: entities.length,
      total_items: totalPosts,
      profiles_scraped: profiles.length - totalErrors,
      profiles_failed: totalErrors,
      voyager_aborted: voyagerAborted,
      description: descParts.join(' — '),
      errors,
    },
  };
}

// ---------------------------------------------------------------------------
// Profile API communication
// ---------------------------------------------------------------------------

async function checkApiHealth(tools, logger) {
  try {
    const response = await tools.http.get(`${PROFILE_API_URL}/api/health`, { timeout: 10000 });
    const body = typeof response.body === 'string' ? JSON.parse(response.body) : response.body;
    if (body.status === 'ok') {
      logger.info(`LinkedIn Profile API healthy (page: ${body.page})`);
      return true;
    }
    logger.error(`LinkedIn Profile API unhealthy: ${body.error || 'unknown'}`);
    return false;
  } catch (err) {
    logger.error(`LinkedIn Profile API unreachable: ${err.message}`);
    return false;
  }
}

async function fetchPosts(slug, count, tools, logger) {
  logger.info(`Fetching posts: ${slug} (count: ${count})`);
  const response = await tools.http.get(
    `${PROFILE_API_URL}/api/posts/${slug}?count=${count}`,
    {
      headers: { 'x-api-key': PROFILE_API_KEY },
      timeout: 60000,
    }
  );
  const body = typeof response.body === 'string' ? JSON.parse(response.body) : response.body;
  if (response.status >= 400 || body.error) {
    throw new Error(body.error || `Posts API returned HTTP ${response.status}`);
  }
  return body;
}

// ---------------------------------------------------------------------------
// Profile collection
// ---------------------------------------------------------------------------

function collectProfiles(entities, source, logger) {
  const profiles = [];
  const seen = new Set();

  for (const entity of entities) {
    if (source === 'entity_field') {
      // Read from entity's linkedin/linkedin_url field
      const url = entity.linkedin || entity.linkedin_url;
      if (!url) {
        logger.warn(`${entity.name}: no linkedin field, skipping`);
        continue;
      }
      const slug = extractSlug(url);
      if (!slug) {
        logger.warn(`${entity.name}: invalid LinkedIn URL "${url}", skipping`);
        continue;
      }
      if (!seen.has(slug)) {
        seen.add(slug);
        profiles.push({ entity_name: entity.name, slug });
      }
    } else {
      // Read from profile-scraper output items in pool
      const items = entity.items || [];
      for (const item of items) {
        const url = item.linkedin_url;
        if (!url) continue;
        const slug = extractSlug(url);
        if (!slug || seen.has(slug)) continue;
        seen.add(slug);
        profiles.push({ entity_name: entity.name, slug });
      }
    }
  }

  return profiles;
}

function extractSlug(url) {
  if (!url) return null;
  const match = url.match(/\/in\/([^/?#]+)/);
  if (match) return match[1];
  // Bare slug (no URL)
  if (/^[a-zA-Z0-9-]+$/.test(url) && url.includes('-')) return url;
  return null;
}

// ---------------------------------------------------------------------------
// Output formatting
// ---------------------------------------------------------------------------

function errorItem(profile, message) {
  return {
    post_id: `error-${profile.slug}`,
    entity_name: profile.entity_name,
    linkedin_slug: profile.slug,
    author_name: profile.slug,
    posted_at: null,
    post_type: 'unknown',
    text: '',
    text_preview: '',
    word_count: 0,
    reactions_count: 0,
    comments_count: 0,
    reshares_count: 0,
    engagement_total: 0,
    hashtags: [],
    mentions: [],
    is_reshare: false,
    original_author_slug: null,
    status: 'error',
    error: message,
    source_type: 'linkedin_post',
    found_via: 'linkedin_post_scraper',
  };
}

function formatPostItem(post, profile, authorName, index) {
  const wordCount = (post.text || '').split(/\s+/).filter(Boolean).length;
  const textPreview = (post.text || '').substring(0, 200);

  return {
    post_id: post.post_id || `unknown-${profile.slug}-${index}`,
    entity_name: profile.entity_name,
    linkedin_slug: profile.slug,
    author_name: authorName || profile.slug,
    posted_at: post.posted_at || null,
    post_type: post.post_type || 'unknown',
    text: post.text || '',
    text_preview: textPreview + (post.text && post.text.length > 200 ? '...' : ''),
    word_count: wordCount,
    reactions_count: post.reactions_count || 0,
    comments_count: post.comments_count || 0,
    reshares_count: post.reshares_count || 0,
    engagement_total: (post.reactions_count || 0) + (post.comments_count || 0) + (post.reshares_count || 0),
    hashtags: post.hashtags || [],
    mentions: post.mentions || [],
    is_reshare: post.is_reshare || false,
    original_author_slug: post.original_author_slug || null,
    status: 'success',
    error: null,
    source_type: 'linkedin_post',
    found_via: 'linkedin_post_scraper',
  };
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

function groupByEntity(results) {
  const byEntity = new Map();
  for (const result of results) {
    const name = result.entity_name;
    if (!byEntity.has(name)) byEntity.set(name, []);
    byEntity.get(name).push(result);
  }

  const entityResults = [];
  for (const [entityName, items] of byEntity) {
    const successCount = items.filter(i => i.status === 'success').length;
    const errorCount = items.filter(i => i.status === 'error').length;
    const totalEngagement = items.reduce((sum, i) => sum + (i.engagement_total || 0), 0);

    entityResults.push({
      entity_name: entityName,
      items,
      meta: {
        posts_total: successCount,
        errors: errorCount,
        total_engagement: totalEngagement,
      },
    });
  }

  return entityResults;
}

// ---------------------------------------------------------------------------
// Rate limiter
// ---------------------------------------------------------------------------

function createRateLimiter(requestsPerHour) {
  if (!requestsPerHour || requestsPerHour <= 0) return () => Promise.resolve();

  const minIntervalMs = Math.ceil(3600000 / requestsPerHour);
  let lastRequestTime = 0;

  return async () => {
    const now = Date.now();
    const elapsed = now - lastRequestTime;
    const waitMs = Math.max(0, minIntervalMs - elapsed);
    if (waitMs > 0) {
      const jitter = Math.floor(Math.random() * 3000);
      await new Promise(resolve => setTimeout(resolve, waitMs + jitter));
    }
    lastRequestTime = Date.now();
  };
}

module.exports = execute;
