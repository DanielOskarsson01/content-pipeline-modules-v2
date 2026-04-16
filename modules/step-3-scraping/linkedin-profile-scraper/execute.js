/**
 * LinkedIn Profile Scraper — Step 3 Scraping submodule
 *
 * Scrapes full LinkedIn personal profiles via CDP connection to a running
 * Chrome instance. A GUI Chrome must be running on the server with
 * --remote-debugging-port=9222, authenticated with LinkedIn (manual login).
 * The module connects via CDP, opens pages in the existing authenticated
 * context, and calls the Voyager REST API from within the browser to get
 * structured profile JSON.
 *
 * Fallback: ScrapeLinkedIn API ($0.01/profile) when Voyager fails.
 *
 * Data operation: ADD (➕) — produces profile items from entity linkedin_url.
 *
 * Requires: Chrome running with --remote-debugging-port=9222 on the server.
 * Optional: SCRAPELINKEDIN_API_KEY for fallback.
 */

// Direct Playwright import for CDP connection to running Chrome instance.
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

  const cdpUrl = process.env.LINKEDIN_CDP_URL || 'http://localhost:9222';

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

  // Connect to running Chrome via CDP. A GUI Chrome must be running on the
  // server with --remote-debugging-port=9222, already authenticated with LinkedIn.
  let browser;
  try {
    browser = await chromium.connectOverCDP(cdpUrl);
  } catch (err) {
    throw new Error(
      `Failed to connect to Chrome via CDP at ${cdpUrl}: ${err.message}. ` +
      'Ensure Chrome is running with --remote-debugging-port=9222 and is logged into LinkedIn.'
    );
  }

  const results = [];
  const failedProfiles = [];
  let consecutiveFailures = 0;
  let voyagerAborted = false;
  const rateLimiter = createRateLimiter(requests_per_hour);
  let voyagerSuccessCount = 0;
  let sessionValid = false;

  try {
    const contexts = browser.contexts();
    if (contexts.length === 0) {
      throw new Error('No browser contexts found in CDP Chrome — is the browser running?');
    }
    const context = contexts[0];

    // Validate session before batch
    sessionValid = await validateSession(context, logger);
    voyagerAborted = !sessionValid;

    if (!sessionValid) {
      logger.warn('LinkedIn session invalid — all profiles will use fallback');
      failedProfiles.push(...profilesToScrape);
    } else {
      // Scrape each profile via Voyager API (called from browser context)
      for (let i = 0; i < profilesToScrape.length; i++) {
        const profile = profilesToScrape[i];
        progress.update(i + 1, profilesToScrape.length, `Scraping ${profile.entity_name} (Voyager)`);

        if (voyagerAborted) {
          failedProfiles.push(profile);
          continue;
        }

        // Rate limit
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
    // For CDP connections, close() disconnects without closing the actual browser.
    try { await browser.close(); } catch {}
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

  // Check if there's already a LinkedIn page open in the browser
  const existingPage = context.pages().find(p => p.url().includes('linkedin.com'));
  if (existingPage) {
    const url = existingPage.url();
    if (url.includes('/feed') || url.includes('/in/') || url.includes('/mynetwork')) {
      logger.info('LinkedIn session is valid (existing page found)');
      return true;
    }
    if (url.includes('/login') || url.includes('/authwall') || url.includes('/checkpoint')) {
      logger.error(`Session invalid — existing page at: ${url}`);
      return false;
    }
  }

  // Navigate a new page to verify
  const page = await context.newPage();
  try {
    await page.goto('https://www.linkedin.com/feed/', {
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
// Voyager API via CDP browser context
// ---------------------------------------------------------------------------

async function scrapeProfileVoyager(context, slug, logger) {
  // Use an existing LinkedIn page to make the API call, or open one if needed.
  // This avoids opening/closing tabs for each profile.
  let page = context.pages().find(p => p.url().includes('linkedin.com'));
  let ownPage = false;

  if (!page) {
    page = await context.newPage();
    ownPage = true;
    await page.goto('https://www.linkedin.com/feed/', { timeout: 15000, waitUntil: 'domcontentloaded' });
  }

  try {
    logger.info(`Fetching Voyager API for ${slug}`);

    const result = await page.evaluate(async (profileSlug) => {
      // Extract CSRF token from cookies
      const csrfToken = document.cookie
        .split(';').map(c => c.trim())
        .find(c => c.startsWith('JSESSIONID='))
        ?.replace('JSESSIONID=', '')
        .replace(/"/g, '');

      if (!csrfToken) {
        return { error: 'No JSESSIONID cookie — session may be expired' };
      }

      const headers = {
        'csrf-token': csrfToken,
        'x-restli-protocol-version': '2.0.0',
        'x-li-lang': 'en_US',
      };

      // Call the Voyager dashProfiles endpoint with full profile decoration
      const url = `/voyager/api/identity/dash/profiles?q=memberIdentity&memberIdentity=${profileSlug}&decorationId=com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-109`;

      const res = await fetch(url, { headers });
      if (!res.ok) {
        return { error: `Voyager API returned ${res.status}`, status: res.status };
      }

      return await res.json();
    }, slug);

    if (result.error) {
      throw new Error(result.error);
    }

    const elements = result.elements || [];
    if (elements.length === 0) {
      throw new Error('Voyager API returned empty profile');
    }

    logger.info(`Voyager: profile data received for ${slug} (${(result.elements[0] && Object.keys(result.elements[0]).length) || 0} fields)`);
    return result;
  } finally {
    if (ownPage) await page.close();
  }
}

// ---------------------------------------------------------------------------
// Voyager response parsing
// ---------------------------------------------------------------------------

function parseVoyagerResponse(data) {
  // FullProfileWithEntities-109 format: elements[0] contains the full profile
  // with nested collections (profilePositionGroups, profileEducations, etc.)
  const el = (data.elements || [])[0] || {};

  const firstName = el.firstName || '';
  const lastName = el.lastName || '';
  const fullName = `${firstName} ${lastName}`.trim();
  const headline = el.headline || '';
  const summary = el.summary || '';

  // Location from nested geoLocation object
  let location = '';
  if (el.geoLocation?.geo) {
    location = el.geoLocation.geo.defaultLocalizedName || '';
  } else if (el.location?.geo) {
    location = el.location.geo.defaultLocalizedName || '';
  }

  // Positions — extracted from profilePositionGroups
  const positions = [];
  const posGroups = el.profilePositionGroups?.elements || [];
  for (const group of posGroups) {
    const companyName = group.company?.name || group.name || '';
    const items = group.profilePositionInPositionGroup?.elements || [];
    for (const p of items) {
      positions.push({
        title: p.title || '',
        company: p.companyName || companyName,
        location: p.locationName || p.geoLocationName || '',
        start: formatVoyagerDate(p.dateRange?.start),
        end: formatVoyagerDate(p.dateRange?.end),
        description: p.description || '',
      });
    }
  }
  positions.sort((a, b) => compareDates(b.start, a.start));

  // Education
  const education = (el.profileEducations?.elements || [])
    .map(e => ({
      school: e.school?.name || e.schoolName || '',
      degree: e.degreeName || '',
      field: e.fieldOfStudy || '',
      start: formatVoyagerDate(e.dateRange?.start),
      end: formatVoyagerDate(e.dateRange?.end),
      description: e.description || '',
    }))
    .sort((a, b) => compareDates(b.start, a.start));

  // Skills
  const skills = (el.profileSkills?.elements || [])
    .map(e => e.name || '')
    .filter(Boolean);

  // Languages
  const languages = (el.profileLanguages?.elements || [])
    .map(e => e.name || '')
    .filter(Boolean);

  // Certifications
  const certifications = (el.profileCertifications?.elements || [])
    .map(e => e.name || '')
    .filter(Boolean);

  // Volunteer experience (bonus data)
  const volunteer = (el.profileVolunteerExperiences?.elements || [])
    .map(e => ({
      role: e.role || '',
      organization: e.companyName || '',
      description: e.description || '',
    }))
    .filter(e => e.role || e.organization);

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
    volunteer,
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
    volunteer: [],
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
  if (parsed.positions.some(p => p.description && p.description.length > 20)) score += 10;
  if (parsed.education.length >= 1) score += 15;
  if (parsed.skills.length >= 1) score += 10;
  if (parsed.languages.length >= 1) score += 5;
  if (parsed.location) score += 5;
  if (parsed.certifications.length >= 1) score += 5;
  if ((parsed.volunteer || []).length >= 1) score += 5;
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
  const volunteerText = (parsed.volunteer || []).map(v => {
    const parts = [v.role];
    if (v.organization) parts.push(`@ ${v.organization}`);
    if (v.description) parts.push('\n' + v.description);
    return parts.join('\n');
  }).join('\n\n');

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
    volunteer: parsed.volunteer || [],
    volunteer_text: volunteerText,

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
