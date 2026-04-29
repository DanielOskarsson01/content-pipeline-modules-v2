/**
 * LinkedIn Scraper — Step 3 Scraping submodule
 *
 * Modes:
 *   bio / company_people — Scrape LinkedIn personal profiles (ADD operation)
 *   job_description     — Enrich pool items with full LinkedIn job descriptions (TRANSFORM)
 *
 * All modes delegate to the LinkedIn Profile API (localhost:3847), which manages
 * the CDP connection to an authenticated Chrome instance and calls LinkedIn's
 * Voyager REST API. This submodule is a thin HTTP client.
 *
 * Optional: SCRAPELINKEDIN_API_KEY for profile fallback.
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
    requests_per_hour = 20,
    mode = 'bio',
    max_profiles_per_entity = 5,
    fallback_to_scrapelinkedin = true,
  } = options;

  // Job description mode — completely different flow
  if (mode === 'job_description') {
    return executeJobMode(input, options, tools);
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

  // Check if Profile API is healthy (validates LinkedIn session)
  const sessionValid = await checkApiHealth(tools, logger);

  const results = [];
  const failedProfiles = [];
  let consecutiveFailures = 0;
  let voyagerAborted = !sessionValid;
  const rateLimiter = createRateLimiter(requests_per_hour);
  let voyagerSuccessCount = 0;

  if (!sessionValid) {
    logger.warn('LinkedIn Profile API unavailable — all profiles will use fallback');
    failedProfiles.push(...profilesToScrape);
  } else {
    // Scrape each profile via Profile API
    for (let i = 0; i < profilesToScrape.length; i++) {
      const profile = profilesToScrape[i];
      progress.update(i + 1, profilesToScrape.length, `Scraping ${profile.entity_name}`);

      if (voyagerAborted) {
        failedProfiles.push(profile);
        continue;
      }

      await rateLimiter();

      try {
        const apiData = await scrapeProfileViaApi(profile.slug, tools, logger);
        const parsed = normalizeProfileApiResponse(apiData);
        const score = calculateCompleteness(parsed);
        const item = formatProfileItem(parsed, score, 'voyager', profile.linkedin_url, profile.entity_name);

        results.push(item);
        voyagerSuccessCount++;
        consecutiveFailures = 0;
        if (tools._partialItems) tools._partialItems.push(item);
      } catch (err) {
        logger.warn(`Profile API failed for ${profile.slug}: ${err.message}`);
        consecutiveFailures++;
        failedProfiles.push(profile);

        if (consecutiveFailures >= 3) {
          logger.error(`Circuit breaker: 3 consecutive failures — queuing remaining ${profilesToScrape.length - i - 1} profiles for fallback`);
          voyagerAborted = true;
        }
      }
    }
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
          error: 'Profile API failed, no ScrapeLinkedIn API key for fallback',
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
    for (const profile of failedProfiles) {
      results.push({
        entity_name: profile.entity_name,
        linkedin_url: profile.linkedin_url,
        full_name: profile.entity_name,
        status: 'error',
        error: 'Profile API failed, fallback disabled',
        scrape_method: 'none',
        completeness_score: 0,
      });
    }
  }

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

async function scrapeProfileViaApi(slug, tools, logger) {
  logger.info(`Fetching profile via API: ${slug}`);
  const response = await tools.http.get(
    `${PROFILE_API_URL}/api/profile/${slug}`,
    {
      headers: { 'x-api-key': PROFILE_API_KEY },
      timeout: 30000,
    }
  );
  const body = typeof response.body === 'string' ? JSON.parse(response.body) : response.body;
  if (response.status >= 400 || body.error) {
    throw new Error(body.error || `Profile API returned HTTP ${response.status}`);
  }
  logger.info(`Profile API: ${slug} — ${body.name || 'unknown'} (${(body.positions || []).length} positions)`);
  return body;
}

async function scrapeJobViaApi(jobId, tools, logger) {
  logger.info(`Fetching job via API: ${jobId}`);
  const response = await tools.http.get(
    `${PROFILE_API_URL}/api/job/${jobId}`,
    {
      headers: { 'x-api-key': PROFILE_API_KEY },
      timeout: 30000,
    }
  );
  const body = typeof response.body === 'string' ? JSON.parse(response.body) : response.body;
  if (response.status >= 400 || body.error) {
    throw new Error(body.error || `Job API returned HTTP ${response.status}`);
  }
  return body;
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
      // company_people mode
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
  const match = url.match(/\/in\/([^/?#]+)/);
  if (match) return match[1];
  if (/^[a-zA-Z0-9-]+$/.test(url) && url.includes('-')) return url;
  return null;
}

function normalizeLinkedInUrl(slug) {
  return `https://www.linkedin.com/in/${slug}`;
}

// ---------------------------------------------------------------------------
// Profile API response normalization
// ---------------------------------------------------------------------------

function normalizeProfileApiResponse(data) {
  const positions = (data.positions || []).map(p => ({
    title: p.title || '',
    company: p.company || '',
    location: p.location || '',
    start: formatDateObj(p.start),
    end: formatDateObj(p.end),
    description: p.description || '',
  }));
  positions.sort((a, b) => compareDates(b.start, a.start));

  const education = (data.educations || []).map(e => ({
    school: e.school || '',
    degree: e.degree || '',
    field: e.field || '',
    start: formatDateObj(e.start),
    end: formatDateObj(e.end),
    description: e.description || '',
  }));
  education.sort((a, b) => compareDates(b.start, a.start));

  return {
    full_name: data.name || '',
    headline: data.headline || '',
    location: data.location || '',
    summary: data.summary || '',
    positions,
    education,
    skills: Array.isArray(data.skills) ? data.skills : [],
    languages: Array.isArray(data.languages)
      ? data.languages.map(l => typeof l === 'string' ? l : l.name || '').filter(Boolean)
      : [],
    certifications: Array.isArray(data.certifications)
      ? data.certifications.map(c => typeof c === 'string' ? c : c.name || '').filter(Boolean)
      : [],
    volunteer: (data.volunteer || []).map(v => ({
      role: v.role || '',
      organization: v.org || v.organization || '',
      description: v.description || '',
    })).filter(v => v.role || v.organization),
  };
}

function formatDateObj(dateObj) {
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
  const experienceText = parsed.positions.map(p => {
    const dateStr = [p.start, p.end || 'Present'].filter(Boolean).join(' — ');
    const header = `${p.title}${p.company ? ' @ ' + p.company : ''}`;
    const parts = [header];
    if (dateStr) parts.push(dateStr);
    if (p.location) parts.push(p.location);
    if (p.description) parts.push('\n' + p.description);
    return parts.join('\n');
  }).join('\n\n---\n\n');

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
    summary: parsed.summary,
    experience_text: experienceText,
    education_text: educationText,
    skills_text: skillsText,
    languages_text: languagesText,
    certifications_text: certificationsText,
    positions: parsed.positions,
    education: parsed.education,
    skills: parsed.skills,
    languages: parsed.languages,
    certifications: parsed.certifications,
    volunteer: parsed.volunteer || [],
    volunteer_text: volunteerText,
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
// Job description mode
// ---------------------------------------------------------------------------

function extractJobId(url) {
  if (!url) return null;
  const match = url.match(/linkedin\.com\/jobs\/view\/(?:.*?[-/])?(\d{5,})/);
  return match ? match[1] : null;
}

function collectJobs(entities, logger) {
  const jobs = [];
  const seen = new Set();

  for (const entity of entities) {
    const items = entity.items || [];
    for (const item of items) {
      const url = item.url;
      if (!url || !url.includes('linkedin.com/jobs/')) continue;
      const jobId = extractJobId(url);
      if (!jobId || seen.has(jobId)) continue;
      seen.add(jobId);
      jobs.push({
        ...item,
        entity_name: entity.name || item.entity_name || 'unknown',
        _jobId: jobId,
      });
    }
  }

  if (jobs.length === 0) {
    logger.info('No LinkedIn job URLs found in pool items');
  }

  return jobs;
}

function parseJobResponse(data) {
  const title = data.title || data.jobPostingTitle || '';

  let description = '';
  if (data.description) {
    if (typeof data.description === 'string') {
      description = data.description;
    } else {
      description = data.description.text || data.description.rawText || '';
    }
  }

  let company = '';
  if (data.companyDetails) {
    const details = Object.values(data.companyDetails)[0];
    if (details?.companyResolutionResult?.name) {
      company = details.companyResolutionResult.name;
    } else if (details?.company?.name) {
      company = details.company.name;
    } else if (typeof details === 'object' && details?.name) {
      company = details.name;
    }
  }
  if (!company) company = data.companyName || '';

  const location = data.formattedLocation || '';

  let workplaceType = '';
  if (data.workplaceTypesResolutionResults) {
    workplaceType = Object.values(data.workplaceTypesResolutionResults)
      .map(t => t.localizedName || '').filter(Boolean).join(', ');
  } else if (data.workplaceType) {
    workplaceType = String(data.workplaceType);
  }

  const employmentType = data.formattedEmploymentStatus || '';
  const seniority = data.formattedExperienceLevel || '';
  const industries = (data.formattedIndustries || []).join(', ');
  const jobFunctions = (data.formattedJobFunctions || []).join(', ');

  let postedAt = null;
  if (data.listedAt) {
    postedAt = new Date(data.listedAt).toISOString();
  }

  return { title, description, company, location, workplaceType, employmentType, seniority, industries, jobFunctions, postedAt };
}

async function executeJobMode(input, options, tools) {
  const { entities } = input;
  const { logger, progress } = tools;
  const { requests_per_hour = 20 } = options;

  const jobs = collectJobs(entities, logger);

  if (jobs.length === 0) {
    return {
      results: entities.map(e => ({
        entity_name: e.name,
        items: e.items || [],
        meta: { total: (e.items || []).length, scraped: 0, errors: 0 },
      })),
      summary: {
        total_entities: entities.length,
        total_items: 0,
        description: 'No LinkedIn job URLs found in pool items',
        errors: [],
      },
    };
  }

  logger.info(`${jobs.length} LinkedIn jobs to scrape (rate: ${requests_per_hour}/hr)`);

  // Check if Profile API is healthy
  const sessionValid = await checkApiHealth(tools, logger);
  if (!sessionValid) {
    logger.error('LinkedIn Profile API unavailable — cannot scrape job descriptions');
    return {
      results: entities.map(e => ({
        entity_name: e.name,
        items: (e.items || []).map(item => ({ ...item, scrape_method: 'none', status: 'error', error: 'LinkedIn Profile API unavailable' })),
        meta: { total: (e.items || []).length, scraped: 0, errors: (e.items || []).length },
      })),
      summary: {
        total_entities: entities.length,
        total_items: jobs.length,
        voyager_status: 'session_expired',
        description: `API unavailable — 0 of ${jobs.length} jobs scraped`,
        errors: ['LinkedIn Profile API unavailable — check profile-api service'],
      },
    };
  }

  const enrichedMap = new Map();
  let voyagerSuccessCount = 0;
  let consecutiveFailures = 0;
  let voyagerAborted = false;
  const rateLimiter = createRateLimiter(requests_per_hour);
  const errors = [];

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    progress.update(i + 1, jobs.length, `Job ${i + 1}/${jobs.length} (${job._jobId})`);

    if (voyagerAborted) {
      enrichedMap.set(job._jobId, { ...job, scrape_method: 'none', status: 'error', error: 'Aborted (circuit breaker)' });
      errors.push(`Job ${job._jobId}: circuit breaker`);
      continue;
    }

    await rateLimiter();

    try {
      const voyagerData = await scrapeJobViaApi(job._jobId, tools, logger);
      const parsed = parseJobResponse(voyagerData);

      const enriched = {
        ...job,
        title: parsed.title || job.title,
        company: parsed.company || job.company,
        location: parsed.location || job.location,
        text_content: parsed.description,
        workplace_type: parsed.workplaceType,
        employment_type: parsed.employmentType,
        seniority_level: parsed.seniority,
        industries: parsed.industries,
        job_functions: parsed.jobFunctions,
        postedAt: parsed.postedAt || job.postedAt,
        scrape_method: 'voyager',
        status: parsed.description ? 'success' : 'incomplete',
        source_type: 'linkedin_job',
      };
      delete enriched._jobId;

      enrichedMap.set(job._jobId, enriched);
      voyagerSuccessCount++;
      consecutiveFailures = 0;
      logger.info(`Job ${job._jobId}: ${parsed.description.length} chars`);

      if (tools._partialItems) {
        tools._partialItems.length = 0;
        tools._partialItems.push(...enrichedMap.values());
      }
    } catch (err) {
      logger.warn(`Job ${job._jobId}: ${err.message}`);
      consecutiveFailures++;
      errors.push(`Job ${job._jobId}: ${err.message}`);
      enrichedMap.set(job._jobId, { ...job, scrape_method: 'none', status: 'error', error: err.message });

      if (consecutiveFailures >= 3) {
        logger.error('Circuit breaker: 3 consecutive failures — aborting remaining jobs');
        voyagerAborted = true;
      }
    }
  }

  const entityResults = entities.map(e => {
    const items = (e.items || []).map(item => {
      const jobId = extractJobId(item.url);
      return jobId && enrichedMap.has(jobId) ? enrichedMap.get(jobId) : item;
    });
    return {
      entity_name: e.name,
      items,
      meta: {
        total: items.length,
        scraped: items.filter(i => i.scrape_method === 'voyager').length,
        errors: items.filter(i => i.status === 'error').length,
      },
    };
  });

  return {
    results: entityResults,
    summary: {
      total_entities: entities.length,
      total_items: jobs.length,
      voyager_success: voyagerSuccessCount,
      voyager_aborted: voyagerAborted,
      description: errors.length > 0
        ? `${voyagerSuccessCount} of ${jobs.length} job descriptions scraped (${errors.length} errors)`
        : `${voyagerSuccessCount} of ${jobs.length} job descriptions scraped`,
      errors,
    },
  };
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
      const jitter = Math.floor(Math.random() * 5000);
      await new Promise(resolve => setTimeout(resolve, waitMs + jitter));
    }
    lastRequestTime = Date.now();
  };
}

module.exports = execute;
