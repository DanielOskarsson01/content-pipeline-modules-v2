/**
 * LinkedIn Profile Scraper — Step 3 Scraping submodule
 *
 * Scrapes full LinkedIn personal profiles via Playwright + Voyager API
 * XHR interception. LinkedIn's frontend calls an internal REST API (Voyager)
 * to render profile pages. We navigate with a real browser and intercept
 * the structured JSON response — no selectors to maintain.
 *
 * Fallback: ScrapeLinkedIn API ($0.01/profile) when Voyager fails.
 *
 * Data operation: ADD (➕) — produces profile items from entity linkedin_url.
 *
 * Requires: LINKEDIN_LI_AT environment variable (session cookie).
 * Optional: SCRAPELINKEDIN_API_KEY for fallback.
 */

// Direct Playwright import (not tools.browser) because we need XHR interception
// and cookie injection, which tools.browser.fetch doesn't support.
const { chromium } = require('playwright');

// ---------------------------------------------------------------------------
// Main execute function
// ---------------------------------------------------------------------------

async function execute(input, options, tools) {
  const { entities } = input;
  const { logger, progress } = tools;
  const {
    requests_per_hour = 20,
    mode = 'bio',
    max_profiles_per_entity = 5,
    fallback_to_scrapelinkedin = true,
  } = options;

  const liAt = process.env.LINKEDIN_LI_AT;
  if (!liAt) {
    throw new Error(
      'LINKEDIN_LI_AT environment variable not set. ' +
      'Log into LinkedIn in Chrome → DevTools (F12) → Application → Cookies → copy li_at value.'
    );
  }

  // Collect profiles to scrape
  const profilesToScrape = collectProfiles(entities, mode, max_profiles_per_entity, logger);

  if (profilesToScrape.length === 0) {
    return {
      results: [],
      summary: {
        total_entities: entities.length,
        total_items: 0,
        description: 'No valid LinkedIn profile URLs found in input',
        errors: [],
      },
    };
  }

  logger.info(`${profilesToScrape.length} profiles to scrape (mode: ${mode}, rate: ${requests_per_hour}/hr)`);

  // Launch browser and create context with LinkedIn cookie
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (err) {
    throw new Error(`Failed to launch browser: ${err.message}. Run: npx playwright install chromium --with-deps`);
  }

  const results = [];
  const failedProfiles = [];
  let consecutiveFailures = 0;
  let voyagerAborted = false;
  const rateLimiter = createRateLimiter(requests_per_hour);
  let voyagerSuccessCount = 0;
  let sessionValid = false;

  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      locale: 'en-US',
    });
    await context.addCookies([{
      name: 'li_at',
      value: liAt,
      domain: '.linkedin.com',
      path: '/',
      httpOnly: true,
      secure: true,
    }]);

    // Validate session before batch
    sessionValid = await validateSession(context, logger);
    voyagerAborted = !sessionValid;

    if (!sessionValid) {
      logger.warn('LinkedIn session invalid — all profiles will use fallback');
      failedProfiles.push(...profilesToScrape);
    } else {
      // Scrape each profile via Voyager XHR interception
      for (let i = 0; i < profilesToScrape.length; i++) {
        const profile = profilesToScrape[i];
        progress.update(i + 1, profilesToScrape.length, `Scraping ${profile.entity_name} (Voyager)`);

        if (voyagerAborted) {
          failedProfiles.push(profile);
          continue;
        }

        // Rate limit — wait between page loads
        await rateLimiter();

        try {
          const voyagerData = await scrapeProfileVoyager(context, profile.slug, logger);
          const parsed = parseVoyagerResponse(voyagerData);
          const score = calculateCompleteness(parsed);
          const item = formatProfileItem(parsed, score, 'voyager', profile.linkedin_url, profile.entity_name);

          results.push(item);
          voyagerSuccessCount++;
          consecutiveFailures = 0;
          if (tools._partialItems) tools._partialItems.push(item);
        } catch (err) {
          logger.warn(`Voyager failed for ${profile.slug}: ${err.message}`);
          consecutiveFailures++;
          failedProfiles.push(profile);

          // Circuit breaker: 3 consecutive failures → stop Voyager
          if (consecutiveFailures >= 3) {
            logger.error(`Circuit breaker: 3 consecutive Voyager failures — queuing remaining ${profilesToScrape.length - i - 1} profiles for fallback`);
            voyagerAborted = true;
          }
        }
      }
    }
  } finally {
    await browser.close();
  }

  // ScrapeLinkedIn fallback for failed profiles
  let fallbackSuccessCount = 0;
  let fallbackCost = 0;

  if (failedProfiles.length > 0 && fallback_to_scrapelinkedin) {
    const apiKey = process.env.SCRAPELINKEDIN_API_KEY;
    if (!apiKey) {
      logger.warn('SCRAPELINKEDIN_API_KEY not set — skipping fallback for ' + failedProfiles.length + ' profiles');
      for (const profile of failedProfiles) {
        results.push({
          entity_name: profile.entity_name,
          linkedin_url: profile.linkedin_url,
          full_name: profile.entity_name,
          status: 'error',
          error: 'Voyager failed, no ScrapeLinkedIn API key for fallback',
          scrape_method: 'none',
          completeness_score: 0,
        });
      }
    } else {
      logger.info(`Trying ScrapeLinkedIn fallback for ${failedProfiles.length} profiles`);

      for (let i = 0; i < failedProfiles.length; i++) {
        const profile = failedProfiles[i];
        progress.update(
          voyagerSuccessCount + i + 1,
          profilesToScrape.length,
          `Fallback: ${profile.entity_name} (ScrapeLinkedIn)`
        );

        try {
          const data = await scrapeProfileScrapeLinkedIn(profile.linkedin_url, apiKey, tools, logger);
          const parsed = normalizeScrapeLinkedIn(data);
          const score = calculateCompleteness(parsed);
          const item = formatProfileItem(parsed, score, 'scrapelinkedin', profile.linkedin_url, profile.entity_name);

          results.push(item);
          fallbackSuccessCount++;
          fallbackCost += 0.01;
          if (tools._partialItems) tools._partialItems.push(item);
        } catch (err) {
          logger.error(`ScrapeLinkedIn failed for ${profile.slug}: ${err.message}`);
          results.push({
            entity_name: profile.entity_name,
            linkedin_url: profile.linkedin_url,
            full_name: profile.entity_name,
            status: 'error',
            error: `All methods failed: ${err.message}`,
            scrape_method: 'none',
            completeness_score: 0,
          });
        }
      }
    }
  } else if (failedProfiles.length > 0) {
    // Fallback disabled — mark remaining as errors
    for (const profile of failedProfiles) {
      results.push({
        entity_name: profile.entity_name,
        linkedin_url: profile.linkedin_url,
        full_name: profile.entity_name,
        status: 'error',
        error: 'Voyager failed, fallback disabled',
        scrape_method: 'none',
        completeness_score: 0,
      });
    }
  }

  // Group results by entity
  const entityResults = groupByEntity(results);

  const totalSuccess = voyagerSuccessCount + fallbackSuccessCount;
  const totalErrors = profilesToScrape.length - totalSuccess;
  const errors = results.filter(r => r.status === 'error').map(r => `${r.entity_name}: ${r.error}`);

  const descParts = [`${totalSuccess} of ${profilesToScrape.length} profiles scraped`];
  if (voyagerSuccessCount > 0) descParts.push(`${voyagerSuccessCount} via Voyager`);
  if (fallbackSuccessCount > 0) descParts.push(`${fallbackSuccessCount} via ScrapeLinkedIn ($${fallbackCost.toFixed(2)})`);
  if (totalErrors > 0) descParts.push(`${totalErrors} failed`);

  return {
    results: entityResults,
    summary: {
      total_entities: entities.length,
      total_items: results.length,
      voyager_success: voyagerSuccessCount,
      fallback_success: fallbackSuccessCount,
      voyager_aborted: voyagerAborted,
      voyager_status: sessionValid ? 'active' : 'session_expired',
      errors,
      cost_usd: fallbackCost,
      description: descParts.join(' — '),
    },
  };
}

// ---------------------------------------------------------------------------
// Profile collection from entities
// ---------------------------------------------------------------------------

function collectProfiles(entities, mode, maxPerEntity, logger) {
  const profiles = [];

  for (const entity of entities) {
    if (mode === 'bio') {
      const url = entity.linkedin || entity.linkedin_url;
      if (!url) {
        logger.warn(`${entity.name}: no linkedin column, skipping`);
        continue;
      }
      const slug = extractSlug(url);
      if (!slug) {
        logger.warn(`${entity.name}: invalid LinkedIn profile URL "${url}", skipping`);
        continue;
      }
      profiles.push({
        entity_name: entity.name,
        slug,
        linkedin_url: normalizeLinkedInUrl(slug),
      });
    } else {
      // company_people mode — look for employee profile links in entity data
      const employeeUrls = entity.employees || entity.employee_profiles || [];
      const urls = Array.isArray(employeeUrls) ? employeeUrls : [];
      let count = 0;
      for (const emp of urls) {
        if (count >= maxPerEntity) break;
        const url = typeof emp === 'string' ? emp : emp.linkedin_url || emp.url;
        if (!url) continue;
        const slug = extractSlug(url);
        if (!slug) continue;
        profiles.push({
          entity_name: entity.name,
          slug,
          linkedin_url: normalizeLinkedInUrl(slug),
        });
        count++;
      }
      if (count === 0) {
        logger.warn(`${entity.name}: no employee profile links found (company_people mode)`);
      }
    }
  }

  return profiles;
}

function extractSlug(url) {
  if (!url) return null;
  // Handle full URLs and bare slugs
  const match = url.match(/\/in\/([^/?#]+)/);
  if (match) return match[1];
  // Maybe it's just the slug
  if (/^[a-zA-Z0-9-]+$/.test(url) && url.includes('-')) return url;
  return null;
}

function normalizeLinkedInUrl(slug) {
  return `https://www.linkedin.com/in/${slug}`;
}

// ---------------------------------------------------------------------------
// Session validation
// ---------------------------------------------------------------------------

async function validateSession(context, logger) {
  logger.info('Validating LinkedIn session...');
  const page = await context.newPage();
  try {
    const response = await page.goto('https://www.linkedin.com/feed/', {
      timeout: 15000,
      waitUntil: 'domcontentloaded',
    });
    const finalUrl = page.url();
    if (finalUrl.includes('/login') || finalUrl.includes('/authwall') || finalUrl.includes('/checkpoint')) {
      logger.error(`Session invalid — redirected to: ${finalUrl}`);
      return false;
    }
    logger.info('LinkedIn session is valid');
    return true;
  } catch (err) {
    logger.error(`Session validation failed: ${err.message}`);
    return false;
  } finally {
    await page.close();
  }
}

// ---------------------------------------------------------------------------
// Voyager XHR interception
// ---------------------------------------------------------------------------

async function scrapeProfileVoyager(context, slug, logger) {
  const page = await context.newPage();
  let voyagerData = null;

  try {
    const profileUrl = `https://www.linkedin.com/in/${slug}/`;
    logger.info(`Navigating to ${profileUrl}`);

    // Log all Voyager-related XHRs for debugging
    page.on('response', (resp) => {
      const url = resp.url();
      if (url.includes('voyager/api')) {
        logger.info(`XHR: ${resp.status()} ${url.slice(0, 120)}`);
      }
    });

    // Start waiting for Voyager XHR before navigation (so we don't miss it)
    const voyagerPromise = page.waitForResponse(
      (resp) =>
        resp.url().includes('voyager/api/identity/dash/profiles') &&
        resp.status() === 200,
      { timeout: 15000 }
    ).then((resp) => resp.json()).catch(() => null);

    const response = await page.goto(profileUrl, {
      timeout: 30000,
      waitUntil: 'domcontentloaded',
    });

    // Check for redirects (login, authwall)
    const finalUrl = page.url();
    logger.info(`Final URL after navigation: ${finalUrl}`);
    if (finalUrl.includes('/login') || finalUrl.includes('/authwall')) {
      throw new Error(`Redirected to login: ${finalUrl}`);
    }

    // Wait for Voyager XHR response (up to 15s)
    voyagerData = await voyagerPromise;

    if (!voyagerData) {
      throw new Error('Voyager API response not intercepted — page may not have loaded correctly');
    }

    const includedCount = (voyagerData.included || []).length;
    logger.info(`Voyager: ${includedCount} entities captured for ${slug}`);

    return voyagerData;
  } finally {
    await page.close();
  }
}

// ---------------------------------------------------------------------------
// Voyager response parsing
// ---------------------------------------------------------------------------

function parseVoyagerResponse(data) {
  const included = data.included || [];

  // Profile
  const profile = included.find(e => e.$type && e.$type.endsWith('Profile'));
  const firstName = profile?.firstName || '';
  const lastName = profile?.lastName || '';
  const fullName = `${firstName} ${lastName}`.trim();
  const headline = profile?.headline || '';
  const summary = profile?.summary || '';

  // Location — resolve from Geo entity via geoLocation URN
  let location = '';
  if (profile?.geoLocation?.geoUrn) {
    const geo = included.find(e =>
      e.$type && e.$type.endsWith('Geo') &&
      e.entityUrn === profile.geoLocation.geoUrn
    );
    location = geo?.defaultLocalizedName || '';
  }

  // Positions
  const positions = included
    .filter(e => e.$type && e.$type.endsWith('Position'))
    .map(p => ({
      title: p.title || '',
      company: p.companyName || '',
      location: p.locationName || '',
      start: formatVoyagerDate(p.dateRange?.start),
      end: formatVoyagerDate(p.dateRange?.end),
      description: p.description || '',
    }))
    .sort((a, b) => compareDates(b.start, a.start)); // Most recent first

  // Education
  const education = included
    .filter(e => e.$type && e.$type.endsWith('Education'))
    .map(e => ({
      school: e.schoolName || '',
      degree: e.degreeName || '',
      field: e.fieldOfStudy || '',
      start: formatVoyagerDate(e.dateRange?.start),
      end: formatVoyagerDate(e.dateRange?.end),
      description: e.description || '',
    }))
    .sort((a, b) => compareDates(b.start, a.start));

  // Skills
  const skills = included
    .filter(e => e.$type && e.$type.endsWith('Skill'))
    .map(e => e.name || '')
    .filter(Boolean);

  // Languages (may not be in all decorations)
  const languages = included
    .filter(e => e.$type && (e.$type.endsWith('Language') || e.$type.includes('Language')))
    .map(e => e.name || '')
    .filter(Boolean);

  // Certifications
  const certifications = included
    .filter(e => e.$type && e.$type.endsWith('Certification'))
    .map(e => e.name || '')
    .filter(Boolean);

  return {
    full_name: fullName,
    headline,
    location,
    summary,
    positions,
    education,
    skills,
    languages,
    certifications,
  };
}

function formatVoyagerDate(dateObj) {
  if (!dateObj) return null;
  const { month, year } = dateObj;
  if (!year) return null;
  if (month) {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${monthNames[month - 1]} ${year}`;
  }
  return `${year}`;
}

function compareDates(a, b) {
  // Sort helper for date strings like "Mar 2023" or "2023" or null
  const parseYear = (d) => {
    if (!d) return 0;
    const match = d.match(/(\d{4})/);
    return match ? parseInt(match[1]) : 0;
  };
  const parseMonth = (d) => {
    if (!d) return 0;
    const months = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
    for (const [name, num] of Object.entries(months)) {
      if (d.startsWith(name)) return num;
    }
    return 0;
  };
  const ya = parseYear(a), yb = parseYear(b);
  if (ya !== yb) return ya - yb;
  return parseMonth(a) - parseMonth(b);
}

// ---------------------------------------------------------------------------
// ScrapeLinkedIn API fallback
// ---------------------------------------------------------------------------

async function scrapeProfileScrapeLinkedIn(linkedinUrl, apiKey, tools, logger) {
  logger.info(`[scrapelinkedin] Fetching ${linkedinUrl}`);

  const response = await tools.http.post(
    'https://api.scrapelinkedin.com/api/profile',
    { linkedin_url: linkedinUrl },
    {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 60000,
    }
  );

  const body = typeof response.body === 'string' ? JSON.parse(response.body) : response.body;

  if (response.status >= 400 || !body.success) {
    throw new Error(`ScrapeLinkedIn API error: HTTP ${response.status} — ${body.message || body.error || 'Unknown error'}`);
  }

  return body.data || body;
}

function normalizeScrapeLinkedIn(data) {
  // Normalize ScrapeLinkedIn response to same shape as Voyager parsed output
  const positions = (data.experience || data.positions || []).map(p => ({
    title: p.title || p.position || '',
    company: p.company || p.company_name || '',
    location: p.location || '',
    start: p.start_date || p.start || null,
    end: p.end_date || p.end || null,
    description: p.description || '',
  }));

  const education = (data.education || []).map(e => ({
    school: e.school || e.institution || '',
    degree: e.degree || e.degree_name || '',
    field: e.field || e.field_of_study || '',
    start: e.start_date || e.start || null,
    end: e.end_date || e.end || null,
    description: e.description || '',
  }));

  const skills = data.skills || [];
  const languages = data.languages || [];
  const certifications = data.certifications || [];

  return {
    full_name: data.full_name || data.name || '',
    headline: data.headline || data.title || '',
    location: data.location || '',
    summary: data.summary || data.about || '',
    positions,
    education,
    skills: Array.isArray(skills) ? skills.map(s => typeof s === 'string' ? s : s.name || '') : [],
    languages: Array.isArray(languages) ? languages.map(l => typeof l === 'string' ? l : l.name || '') : [],
    certifications: Array.isArray(certifications) ? certifications.map(c => typeof c === 'string' ? c : c.name || '') : [],
  };
}

// ---------------------------------------------------------------------------
// Completeness scoring
// ---------------------------------------------------------------------------

function calculateCompleteness(parsed) {
  let score = 0;
  if (parsed.headline) score += 10;
  if (parsed.summary && parsed.summary.length > 50) score += 15;
  if (parsed.positions.length >= 1) score += 20;
  if (parsed.positions.some(p => p.description && p.description.length > 20)) score += 15;
  if (parsed.education.length >= 1) score += 15;
  if (parsed.skills.length >= 1) score += 10;
  if (parsed.languages.length >= 1) score += 5;
  if (parsed.location) score += 5;
  if (parsed.certifications.length >= 1) score += 5;
  return score;
}

// ---------------------------------------------------------------------------
// Output formatting
// ---------------------------------------------------------------------------

function formatProfileItem(parsed, score, method, linkedinUrl, entityName) {
  // Format positions as readable text
  const experienceText = parsed.positions.map(p => {
    const dateStr = [p.start, p.end || 'Present'].filter(Boolean).join(' — ');
    const header = `${p.title}${p.company ? ' @ ' + p.company : ''}`;
    const parts = [header];
    if (dateStr) parts.push(dateStr);
    if (p.location) parts.push(p.location);
    if (p.description) parts.push('\n' + p.description);
    return parts.join('\n');
  }).join('\n\n---\n\n');

  // Format education as readable text
  const educationText = parsed.education.map(e => {
    const dateStr = [e.start, e.end].filter(Boolean).join(' — ');
    const parts = [e.school];
    if (e.degree || e.field) parts.push([e.degree, e.field].filter(Boolean).join(', '));
    if (dateStr) parts.push(dateStr);
    if (e.description) parts.push('\n' + e.description);
    return parts.join('\n');
  }).join('\n\n');

  const skillsText = parsed.skills.join(', ');
  const languagesText = parsed.languages.join(', ');
  const certificationsText = parsed.certifications.join(', ');

  const status = score < 50 ? 'incomplete' : 'success';

  return {
    // Display columns
    linkedin_url: linkedinUrl,
    full_name: parsed.full_name,
    headline: parsed.headline,
    location: parsed.location,
    experience_count: parsed.positions.length,
    education_count: parsed.education.length,
    skills_count: parsed.skills.length,
    completeness_score: score,
    scrape_method: method,
    status,
    error: null,
    entity_name: entityName,

    // Detail view / downstream fields
    summary: parsed.summary,
    experience_text: experienceText,
    education_text: educationText,
    skills_text: skillsText,
    languages_text: languagesText,
    certifications_text: certificationsText,

    // Structured data for downstream content generation
    positions: parsed.positions,
    education: parsed.education,
    skills: parsed.skills,
    languages: parsed.languages,
    certifications: parsed.certifications,

    // Metadata
    source_type: 'linkedin_profile',
    found_via: 'linkedin_profile_scraper',
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
    const voyagerCount = items.filter(i => i.scrape_method === 'voyager').length;
    const fallbackCount = items.filter(i => i.scrape_method === 'scrapelinkedin').length;
    const errorCount = items.filter(i => i.status === 'error').length;

    entityResults.push({
      entity_name: entityName,
      items,
      meta: {
        profiles_total: items.length,
        voyager_success: voyagerCount,
        fallback_success: fallbackCount,
        errors: errorCount,
        cost_usd: fallbackCount * 0.01,
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
      // Add human-like jitter (0-5 seconds)
      const jitter = Math.floor(Math.random() * 5000);
      await new Promise(resolve => setTimeout(resolve, waitMs + jitter));
    }
    lastRequestTime = Date.now();
  };
}

module.exports = execute;
