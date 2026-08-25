/**
 * LinkedIn Post Scraper — Step 3 Scraping submodule
 *
 * Modes:
 *   posts (default) — Fetches recent posts from LinkedIn profiles via the
 *     Profile API's /api/posts/:slug endpoint (Voyager GraphQL). Outputs
 *     structured post data with engagement metrics, hashtags, mentions.
 *
 *   post_engagers — Fetches posts first, then fans out per post to get
 *     commenters (name, slug, headline, comment text) via the Profile API's
 *     /api/post-comments endpoint (DOM scraping). Reaction and reshare counts
 *     are included from the Voyager feed but individual reactor/resharer
 *     identities are unavailable (LinkedIn removed the reactions list modal
 *     in the May 2026 SDUI migration). Outputs a superset of posts mode
 *     with an engagers object on each item.
 *
 * Delegates all LinkedIn communication to the Profile API (localhost:3847).
 */

const PROFILE_API_URL = process.env.LINKEDIN_API_URL || 'http://localhost:3847';
const PROFILE_API_KEY = process.env.LINKEDIN_API_KEY || 'oig-pipeline-2026';

// ---------------------------------------------------------------------------
// Main execute function — dispatches by mode
// ---------------------------------------------------------------------------

async function execute(input, options, tools) {
  const { entities } = input;
  const { logger, progress } = tools;
  const {
    mode = 'posts',
    posts_per_profile = 10,
    engagers_per_post = 50,
    requests_per_hour = 20,
    min_word_count = 10,
    source = 'entity_field',
  } = options;

  if (mode === 'feed_posts') {
    return executeFeedPosts(entities, { posts_per_feed: posts_per_profile, requests_per_hour, min_word_count, source }, tools);
  }

  if (mode === 'post_engagers') {
    return executePostEngagers(entities, { posts_per_profile, engagers_per_post, requests_per_hour, min_word_count, source }, tools);
  }

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

// ---------------------------------------------------------------------------
// post_engagers mode
// ---------------------------------------------------------------------------

async function executePostEngagers(entities, opts, tools) {
  const { logger, progress } = tools;
  const { posts_per_profile, engagers_per_post, requests_per_hour, min_word_count, source } = opts;

  // Step 1: Collect profiles (reuse existing logic)
  const profiles = collectProfiles(entities, source, logger);

  if (profiles.length === 0) {
    return {
      results: [],
      summary: {
        total_entities: entities.length,
        total_items: 0,
        mode: 'post_engagers',
        description: 'No LinkedIn profile slugs found in input',
        errors: [],
      },
    };
  }

  // Health check
  const sessionValid = await checkApiHealth(tools, logger);
  if (!sessionValid) {
    logger.error('LinkedIn Profile API unavailable — cannot fetch post engagers');
    return {
      results: profiles.map(p => ({
        entity_name: p.entity_name,
        items: [errorItem(p, 'LinkedIn Profile API unavailable')],
        meta: { profiles: 0, posts: 0, errors: 1 },
      })),
      summary: {
        total_entities: entities.length,
        total_items: 0,
        mode: 'post_engagers',
        description: 'API unavailable — 0 posts processed',
        errors: ['LinkedIn Profile API unavailable'],
      },
    };
  }

  const rateLimiter = createRateLimiter(requests_per_hour);
  const allResults = [];
  let totalPosts = 0;
  let totalErrors = 0;
  let consecutiveFailures = 0;
  let aborted = false;
  const errors = [];

  // Each profile: fetch posts, then fan out to get comments per post
  // Reactions are counts-only (LinkedIn removed reactor list modal May 2026) — we use counts from Voyager feed
  const callBudgetPerProfile = 1 + posts_per_profile; // 1 posts call + 1 comments call per post
  logger.info(`${profiles.length} profiles, ~${callBudgetPerProfile} API calls each (mode: post_engagers, rate: ${requests_per_hour}/hr)`);

  for (let pi = 0; pi < profiles.length; pi++) {
    const profile = profiles[pi];
    progress.update(pi + 1, profiles.length, `Engagers: ${profile.slug}`);

    if (aborted) {
      allResults.push(errorItem(profile, 'Aborted (circuit breaker)'));
      totalErrors++;
      errors.push(`${profile.slug}: circuit breaker`);
      continue;
    }

    // Fetch posts for this profile
    await rateLimiter();
    let postsData;
    try {
      postsData = await fetchPosts(profile.slug, posts_per_profile, tools, logger);
    } catch (err) {
      logger.warn(`Posts failed for ${profile.slug}: ${err.message}`);
      consecutiveFailures++;
      totalErrors++;
      errors.push(`${profile.slug}: ${err.message}`);
      allResults.push(errorItem(profile, err.message));
      if (consecutiveFailures >= 3) {
        logger.error(`Circuit breaker: 3 consecutive failures — aborting remaining profiles`);
        aborted = true;
      }
      continue;
    }

    consecutiveFailures = 0;
    const filteredPosts = (postsData.posts || [])
      .filter(p => {
        const wc = (p.text || '').split(/\s+/).filter(Boolean).length;
        return wc >= min_word_count;
      })
      // Sort by engagement descending, take top N
      .sort((a, b) => {
        const ea = (a.reactions_count || 0) + (a.comments_count || 0) + (a.reshares_count || 0);
        const eb = (b.reactions_count || 0) + (b.comments_count || 0) + (b.reshares_count || 0);
        return eb - ea;
      })
      .slice(0, posts_per_profile);

    if (filteredPosts.length === 0) {
      logger.warn(`${profile.slug}: no posts with >= ${min_word_count} words`);
      continue;
    }

    logger.info(`${profile.slug} (${postsData.name}): ${filteredPosts.length} posts, fetching engagers...`);

    // Fan out: fetch comments + reactions per post
    for (let pIdx = 0; pIdx < filteredPosts.length; pIdx++) {
      const post = filteredPosts[pIdx];
      const postItem = formatPostItem(post, profile, postsData.name, pIdx);

      if (aborted) {
        postItem.status = 'error';
        postItem.error = 'Aborted (circuit breaker)';
        postItem.found_via = 'linkedin_post_engager_scraper';
        allResults.push(postItem);
        totalErrors++;
        continue;
      }

      try {
        // Comments (1 API call — navigates Chrome to post page, scrapes DOM)
        await rateLimiter();
        const commentsData = await fetchComments(post.post_id, engagers_per_post, tools, logger);

        // Reactions: use counts from Voyager feed (already in post object).
        // Individual reactor identities unavailable — LinkedIn removed the
        // reactions list modal in the May 2026 SDUI migration.

        // Build engagers object
        postItem.engagers = buildEngagersObject(
          commentsData, post
        );
        postItem.found_via = 'linkedin_post_engager_scraper';
        allResults.push(postItem);
        totalPosts++;
        consecutiveFailures = 0;

        const ec = postItem.engagers.completeness;
        logger.info(`  ${post.post_id}: ${ec.comments_returned} commenters, ${ec.reactions_total} reactions (count only)`);

        if (tools._partialItems) {
          tools._partialItems.push(postItem);
        }
      } catch (err) {
        logger.warn(`  Engagers failed for post ${post.post_id}: ${err.message}`);
        consecutiveFailures++;
        totalErrors++;
        errors.push(`${post.post_id}: ${err.message}`);
        postItem.status = 'error';
        postItem.error = err.message;
        postItem.found_via = 'linkedin_post_engager_scraper';
        postItem.engagers = { commenters: [], reactors: [], resharers: [], completeness: { comments_returned: 0, comments_total: post.comments_count || 0, comments_truncated: false, reactions_returned: 0, reactions_total: post.reactions_count || 0, reactions_available: false, reactions_note: 'LinkedIn removed reactions list modal (SDUI migration May 2026)', reshares_returned: 0, reshares_total: post.reshares_count || 0, reshares_available: false, reshares_note: 'LinkedIn Voyager has no list-resharers endpoint' } };
        allResults.push(postItem);

        if (consecutiveFailures >= 3) {
          logger.error(`Circuit breaker: 3 consecutive failures — aborting remaining posts`);
          aborted = true;
        }
      }
    }
  }

  const entityResults = groupByEntity(allResults);
  const descParts = [`${totalPosts} posts with engagers from ${profiles.length} profiles`];
  if (totalErrors > 0) descParts.push(`${totalErrors} errors`);
  if (aborted) descParts.push('circuit breaker triggered');

  return {
    results: entityResults,
    summary: {
      total_entities: entities.length,
      total_items: totalPosts,
      mode: 'post_engagers',
      profiles_scraped: profiles.length,
      posts_with_engagers: totalPosts,
      posts_failed: totalErrors,
      aborted,
      description: descParts.join(' — '),
      errors,
    },
  };
}

// ---------------------------------------------------------------------------
// Engager API calls
// ---------------------------------------------------------------------------

async function fetchComments(activityId, count, tools, logger) {
  logger.info(`  Fetching comments: ${activityId} (max: ${count})`);
  const response = await tools.http.get(
    `${PROFILE_API_URL}/api/post-comments/${activityId}?count=${count}`,
    {
      headers: { 'x-api-key': PROFILE_API_KEY },
      timeout: 60000,
    }
  );
  const body = typeof response.body === 'string' ? JSON.parse(response.body) : response.body;
  if (response.status >= 400 || body.error) {
    throw new Error(body.error || `Comments API returned HTTP ${response.status}`);
  }
  return body;
}

function buildEngagersObject(commentsData, originalPost) {
  const commenters = (commentsData.comments || []).map(c => ({
    slug: c.slug || null,
    name: c.name || 'LinkedIn Member',
    headline: c.headline || '',
    comment_text: c.text || '',
    commented_at: c.posted_at || null,
    likes: c.likes || 0,
  }));

  const commentsTotal = originalPost.comments_count || 0;
  const reactionsTotal = originalPost.reactions_count || 0;
  const resharesTotal = originalPost.reshares_count || 0;

  return {
    commenters,
    reactors: [],
    resharers: [],
    completeness: {
      comments_returned: commenters.length,
      comments_total: commentsTotal,
      comments_truncated: commenters.length < commentsTotal,
      reactions_returned: 0,
      reactions_total: reactionsTotal,
      reactions_available: false,
      reactions_note: 'LinkedIn removed reactions list modal (SDUI migration May 2026)',
      reshares_returned: 0,
      reshares_total: resharesTotal,
      reshares_available: false,
      reshares_note: 'LinkedIn Voyager has no list-resharers endpoint',
    },
  };
}

// ---------------------------------------------------------------------------
// feed_posts mode — DOM scraping for company pages and group feeds
// ---------------------------------------------------------------------------

async function executeFeedPosts(entities, opts, tools) {
  const { logger, progress } = tools;
  const { posts_per_feed, requests_per_hour, min_word_count, source } = opts;

  const targets = collectFeedTargets(entities, source, logger);

  if (targets.length === 0) {
    return {
      results: [],
      summary: {
        total_entities: entities.length,
        total_items: 0,
        mode: 'feed_posts',
        description: 'No LinkedIn feed targets found in input',
        errors: [],
      },
    };
  }

  const sessionValid = await checkApiHealth(tools, logger);
  if (!sessionValid) {
    logger.error('LinkedIn Profile API unavailable — cannot fetch feed posts');
    return {
      results: targets.map(t => ({
        entity_name: t.entity_name,
        items: [feedErrorItem(t, 'LinkedIn Profile API unavailable')],
        meta: { feeds: 0, posts: 0, errors: 1 },
      })),
      summary: {
        total_entities: entities.length,
        total_items: 0,
        mode: 'feed_posts',
        description: 'API unavailable — 0 posts scraped',
        errors: ['LinkedIn Profile API unavailable'],
      },
    };
  }

  logger.info(`${targets.length} feed targets (${posts_per_feed} posts each, rate: ${requests_per_hour}/hr, mode: feed_posts)`);

  const allResults = [];
  let totalPosts = 0;
  let totalErrors = 0;
  let consecutiveFailures = 0;
  let aborted = false;
  const rateLimiter = createRateLimiter(requests_per_hour);
  const errors = [];

  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    progress.update(i + 1, targets.length, `Feed: ${target.type}/${target.slug}`);

    if (aborted) {
      allResults.push(feedErrorItem(target, 'Aborted (circuit breaker)'));
      totalErrors++;
      errors.push(`${target.slug}: circuit breaker`);
      continue;
    }

    await rateLimiter();

    try {
      const data = await fetchFeedPosts(target.type, target.slug, posts_per_feed, tools, logger);
      const posts = (data.posts || [])
        .filter(p => {
          const wc = (p.post_text || '').split(/\s+/).filter(Boolean).length;
          return wc >= min_word_count;
        })
        .map((p, idx) => formatFeedPostItem(p, target, idx));

      if (posts.length === 0) {
        logger.warn(`${target.type}/${target.slug}: no posts with >= ${min_word_count} words`);
      } else {
        logger.info(`${target.type}/${target.slug}: ${posts.length} posts`);
      }

      allResults.push(...posts);
      totalPosts += posts.length;
      consecutiveFailures = 0;

      if (tools._partialItems) {
        tools._partialItems.push(...posts);
      }
    } catch (err) {
      logger.warn(`Feed posts failed for ${target.type}/${target.slug}: ${err.message}`);
      consecutiveFailures++;
      totalErrors++;
      errors.push(`${target.slug}: ${err.message}`);
      allResults.push(feedErrorItem(target, err.message));

      if (consecutiveFailures >= 3) {
        logger.error(`Circuit breaker: 3 consecutive failures — aborting remaining ${targets.length - i - 1} feeds`);
        aborted = true;
      }
    }
  }

  const entityResults = groupByEntity(allResults);
  const descParts = [`${totalPosts} posts from ${targets.length} feeds`];
  if (totalErrors > 0) descParts.push(`${totalErrors} feed errors`);
  if (aborted) descParts.push('circuit breaker triggered');

  return {
    results: entityResults,
    summary: {
      total_entities: entities.length,
      total_items: totalPosts,
      mode: 'feed_posts',
      feeds_scraped: targets.length - totalErrors,
      feeds_failed: totalErrors,
      aborted,
      description: descParts.join(' — '),
      errors,
    },
  };
}

function collectFeedTargets(entities, source, logger) {
  const targets = [];
  const seen = new Set();

  for (const entity of entities) {
    if (source !== 'entity_field') {
      // Pool-item source (mirrors collectProfiles): company URLs only —
      // feed targets from pool items are /company/ pages (e.g. placed there
      // by api-fetcher's linkedin-company provider via field_map).
      for (const item of entity.items || []) {
        const itemUrl = item.linkedin_url;
        if (!itemUrl) continue;
        const match = itemUrl.match(/\/company\/([^/?#]+)/);
        if (!match) {
          logger.warn(`${entity.name}: pool item URL "${itemUrl}" is not a /company/ URL, skipping`);
          continue;
        }
        const itemKey = `company:${match[1]}`;
        if (seen.has(itemKey)) continue;
        seen.add(itemKey);
        targets.push({ entity_name: entity.name, type: 'company', slug: match[1] });
      }
      continue;
    }

    const url = entity.linkedin || entity.linkedin_url;
    if (!url) {
      logger.warn(`${entity.name}: no linkedin field, skipping`);
      continue;
    }

    let type = null;
    let slug = null;

    // Match company page URLs
    const companyMatch = url.match(/\/company\/([^/?#]+)/);
    if (companyMatch) {
      type = 'company';
      slug = companyMatch[1];
    }

    // Match group URLs
    if (!type) {
      const groupMatch = url.match(/\/groups\/([^/?#]+)/);
      if (groupMatch) {
        type = 'group';
        slug = groupMatch[1];
      }
    }

    // Match personal profile URLs (fallback)
    if (!type) {
      const profileMatch = url.match(/\/in\/([^/?#]+)/);
      if (profileMatch) {
        type = 'profile';
        slug = profileMatch[1];
      }
    }

    // Bare slug with explicit type hint in entity
    if (!type && entity.feed_type) {
      const VALID_TYPES = ['company', 'group', 'profile'];
      if (!VALID_TYPES.includes(entity.feed_type)) {
        logger.warn(`${entity.name}: invalid feed_type "${entity.feed_type}", skipping`);
        continue;
      }
      type = entity.feed_type;
      slug = url.replace(/^https?:\/\/[^/]+/, '').replace(/\//g, '').trim() || url;
    }

    if (!type || !slug) {
      logger.warn(`${entity.name}: could not determine feed type from URL "${url}", skipping`);
      continue;
    }

    const key = `${type}:${slug}`;
    if (seen.has(key)) continue;
    seen.add(key);
    targets.push({ entity_name: entity.name, type, slug });
  }

  return targets;
}

async function fetchFeedPosts(type, slug, count, tools, logger) {
  logger.info(`Fetching feed posts: ${type}/${slug} (count: ${count})`);
  const response = await tools.http.get(
    `${PROFILE_API_URL}/api/feed-posts/${type}/${slug}?count=${count}`,
    {
      headers: { 'x-api-key': PROFILE_API_KEY },
      timeout: 120000, // DOM scraping with scrolling takes longer
    }
  );
  const body = typeof response.body === 'string' ? JSON.parse(response.body) : response.body;
  if (response.status >= 400 || body.error) {
    throw new Error(body.error || `Feed posts API returned HTTP ${response.status}`);
  }
  return body;
}

function feedErrorItem(target, message) {
  return {
    post_id: `error-${target.type}-${target.slug}`,
    entity_name: target.entity_name,
    linkedin_slug: target.slug,
    source_type: target.type,
    source_slug: target.slug,
    author_name: target.slug,
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
    mentioned_companies: [],
    is_reshare: false,
    original_author_slug: null,
    status: 'error',
    error: message,
    found_via: 'linkedin_feed_scraper',
  };
}

function formatFeedPostItem(post, target, index) {
  const text = post.post_text || '';
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const textPreview = text.substring(0, 200);

  // Field names unified with posts/post_engagers modes so the skeleton's
  // ContentRenderer, detail_schema, and downloadable_fields work consistently.
  return {
    post_id: post.post_id || `unknown-${target.slug}-${index}`,
    post_url: post.post_url || null,
    entity_name: target.entity_name,
    linkedin_slug: target.slug,
    source_type: target.type,
    source_slug: target.slug,
    author_name: post.author_name || target.slug,
    author_slug: post.author_slug || null,
    posted_at: post.posted_at || null,
    posted_at_activity: post.posted_at_activity || null,
    post_type: post.post_format || 'unknown',
    has_image: post.has_image || false,
    has_video: post.has_video || false,
    has_document: post.has_document || false,
    has_poll: post.has_poll || false,
    text: text,
    text_preview: textPreview + (text.length > 200 ? '...' : ''),
    word_count: wordCount,
    reactions_count: post.reactions_total || 0,
    reaction_types_visible: post.reaction_types_visible || [],
    comments_count: post.comments_count || 0,
    reshares_count: post.reposts_count || 0,
    engagement_total: (post.reactions_total || 0) + (post.comments_count || 0) + (post.reposts_count || 0),
    hashtags: post.hashtags || [],
    mentions: post.mentioned_people || [],
    mentioned_companies: post.mentioned_companies || [],
    shared_article_url: post.shared_article_url || null,
    shared_article_title: post.shared_article_title || null,
    is_reshare: false,
    original_author_slug: null,
    status: 'success',
    error: null,
    found_via: 'linkedin_feed_scraper',
  };
}

module.exports = execute;
