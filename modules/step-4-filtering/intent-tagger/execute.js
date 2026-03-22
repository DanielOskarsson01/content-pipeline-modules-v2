/**
 * Intent Tagger -- Step 4 Filtering submodule
 *
 * Classifies each scraped page by its intent (About, Products, Press, Careers,
 * Contact, etc.) so downstream steps can prioritize and route content.
 *
 * V1: Heuristic classification (URL path + title keywords + content keyword density).
 * V2: LLM fallback for pages where heuristic confidence is below threshold.
 *
 * Data operation: TRANSFORM (=) -- same items in, same items out, with intent fields added.
 */

// -------------------------------------------------------------------------
// Intent categories
// -------------------------------------------------------------------------

const INTENTS = [
  'about',
  'products',
  'press',
  'careers',
  'contact',
  'investors',
  'partners',
  'resources',
  'blog_post',
  'news_article',
  'case_study',
  'other',
];

// -------------------------------------------------------------------------
// URL path patterns -- maps path segments to intents
// Each entry: [regex, intent, weight]
// -------------------------------------------------------------------------

const URL_PATTERNS = [
  // About
  [/\/(about|about-us|who-we-are|our-story|our-mission|our-team|team|leadership|management|company|company-overview)\b/i, 'about', 0.7],

  // Products
  [/\/(products|solutions|services|offerings|platform|features|pricing|plans)\b/i, 'products', 0.7],

  // Press
  [/\/(press|press-releases?|media|newsroom|news-room|media-center|media-centre)\b/i, 'press', 0.7],
  [/\/(news|announcements?)\b/i, 'press', 0.5],

  // Careers
  [/\/(careers|jobs|openings|vacancies|join-us|work-with-us|hiring|positions)\b/i, 'careers', 0.7],

  // Contact
  [/\/(contact|contact-us|get-in-touch|reach-us|support|help)\b/i, 'contact', 0.7],

  // Investors
  [/\/(investors?|investor-relations|ir|shareholder|annual-report|financial)\b/i, 'investors', 0.7],

  // Partners
  [/\/(partners?|partnerships?|affiliates?|integrations?|resellers?)\b/i, 'partners', 0.7],

  // Resources
  [/\/(resources|whitepapers?|ebooks?|guides?|downloads?|documentation|docs|library|knowledge-base)\b/i, 'resources', 0.6],

  // Blog
  [/\/(blog|articles?|insights?|thought-leadership|perspectives)\b/i, 'blog_post', 0.5],

  // Case study
  [/\/(case-stud(y|ies)|success-stor(y|ies)|customer-stor(y|ies)|testimonials?|use-cases?)\b/i, 'case_study', 0.7],
];

// -------------------------------------------------------------------------
// Title keyword patterns -- maps title keywords to intents
// Each entry: [regex, intent, weight]
// -------------------------------------------------------------------------

const TITLE_PATTERNS = [
  // About
  [/\b(about\s+us|who\s+we\s+are|our\s+story|our\s+mission|our\s+team|company\s+overview|meet\s+the\s+team|leadership\s+team|management\s+team)\b/i, 'about', 0.6],

  // Products
  [/\b(products?|solutions?|services|platform|features|pricing|plans)\b/i, 'products', 0.4],

  // Press
  [/\b(press\s+release|media\s+release|newsroom|news\s+release|announces?|announcement)\b/i, 'press', 0.6],

  // Careers
  [/\b(careers?|jobs?|openings?|vacancies|join\s+us|work\s+with\s+us|we.re\s+hiring|job\s+listing|open\s+positions?)\b/i, 'careers', 0.6],

  // Contact
  [/\b(contact\s+us|get\s+in\s+touch|reach\s+us|contact\s+information)\b/i, 'contact', 0.6],

  // Investors
  [/\b(investor\s+relations?|annual\s+report|quarterly\s+results?|financial\s+results?|shareholder|earnings)\b/i, 'investors', 0.6],

  // Partners
  [/\b(partners?|partnerships?|partner\s+program|become\s+a\s+partner|affiliate|integration\s+partners?)\b/i, 'partners', 0.5],

  // Resources
  [/\b(whitepaper|ebook|e-book|guide|resource\s+center|knowledge\s+base|documentation)\b/i, 'resources', 0.5],

  // Blog
  [/\b(blog|article|insight|perspective|thought\s+leadership)\b/i, 'blog_post', 0.3],

  // News article
  [/\b(news|update|latest|industry\s+news)\b/i, 'news_article', 0.3],

  // Case study
  [/\b(case\s+study|success\s+story|customer\s+story|testimonial|use\s+case)\b/i, 'case_study', 0.6],
];

// -------------------------------------------------------------------------
// Content keyword lists -- density-based scoring per intent
// -------------------------------------------------------------------------

const CONTENT_KEYWORDS = {
  about: [
    'founded', 'established', 'mission', 'vision', 'values', 'history',
    'our team', 'our story', 'who we are', 'headquartered', 'employees',
    'culture', 'leadership', 'ceo', 'cto', 'co-founder', 'founder',
    'board of directors', 'executive', 'management team', 'years of experience',
  ],
  products: [
    'features', 'pricing', 'demo', 'free trial', 'product', 'solution',
    'platform', 'integration', 'api', 'dashboard', 'analytics', 'module',
    'our software', 'technology', 'capabilities', 'specification', 'functionality',
  ],
  press: [
    'press release', 'media contact', 'for immediate release', 'announces',
    'announced today', 'media inquiries', 'newsroom', 'press kit',
    'media kit', 'spokesperson', 'media coverage', 'press conference',
  ],
  careers: [
    'apply now', 'job description', 'requirements', 'qualifications',
    'benefits', 'salary', 'remote work', 'full-time', 'part-time',
    'internship', 'we are hiring', 'join our team', 'open positions',
    'work-life balance', 'perks', 'compensation',
  ],
  contact: [
    'email us', 'phone', 'address', 'office location', 'get in touch',
    'contact form', 'send us a message', 'reach out', 'business hours',
    'headquarters', 'map', 'directions', 'telephone',
  ],
  investors: [
    'annual report', 'quarterly', 'revenue', 'earnings', 'shareholders',
    'stock', 'dividend', 'sec filing', 'financial statements', 'fiscal year',
    'investor presentation', 'market cap', 'ipo', 'share price',
  ],
  partners: [
    'partner program', 'become a partner', 'partner benefits', 'affiliate',
    'reseller', 'integration partner', 'technology partner', 'channel partner',
    'strategic partnership', 'alliance', 'ecosystem', 'partner portal',
  ],
  resources: [
    'download', 'whitepaper', 'ebook', 'webinar', 'tutorial', 'guide',
    'documentation', 'faq', 'knowledge base', 'how-to', 'best practices',
    'cheat sheet', 'template', 'toolkit',
  ],
  blog_post: [
    'posted on', 'published on', 'by author', 'read more', 'share this',
    'comments', 'tags', 'categories', 'related posts', 'continue reading',
    'min read', 'reading time',
  ],
  news_article: [
    'reported', 'according to', 'sources say', 'industry news',
    'market update', 'breaking', 'exclusive', 'coverage', 'update',
  ],
  case_study: [
    'challenge', 'solution', 'results', 'roi', 'client', 'customer story',
    'before and after', 'implementation', 'outcome', 'success story',
    'testimonial', 'case study', 'use case', 'customer success',
  ],
};

// -------------------------------------------------------------------------
// Helper: parse comma-separated string into trimmed array
// -------------------------------------------------------------------------

function parseList(str) {
  if (!str || typeof str !== 'string') return [];
  return str.split(',').map((s) => s.trim()).filter(Boolean);
}

// -------------------------------------------------------------------------
// Helper: count words
// -------------------------------------------------------------------------

function countWords(text) {
  if (!text || !text.trim()) return 0;
  return text.trim().split(/\s+/).length;
}

// -------------------------------------------------------------------------
// Heuristic classifier
// -------------------------------------------------------------------------

function classifyHeuristic(url, title, textContent) {
  const scores = {};
  const signals = [];

  // Initialize all intent scores to 0
  for (const intent of INTENTS) {
    scores[intent] = 0;
  }

  // --- 1. URL path matching ---
  if (url) {
    try {
      const path = new URL(url).pathname.toLowerCase();
      for (const [pattern, intent, weight] of URL_PATTERNS) {
        if (pattern.test(path)) {
          scores[intent] += weight;
          signals.push(`url_path:${intent} (${path})`);
        }
      }
    } catch {
      // Invalid URL — skip URL analysis
    }
  }

  // --- 2. Title keyword matching ---
  if (title) {
    for (const [pattern, intent, weight] of TITLE_PATTERNS) {
      if (pattern.test(title)) {
        scores[intent] += weight;
        signals.push(`title:${intent} ("${title.substring(0, 60)}")`);
      }
    }
  }

  // --- 3. Content keyword density ---
  if (textContent) {
    const contentLower = textContent.toLowerCase();
    const totalWords = countWords(textContent);

    if (totalWords > 0) {
      for (const [intent, keywords] of Object.entries(CONTENT_KEYWORDS)) {
        let hits = 0;
        const matchedKeywords = [];

        for (const keyword of keywords) {
          // Count occurrences of each keyword phrase
          const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
          const matches = contentLower.match(regex);
          if (matches) {
            hits += matches.length;
            matchedKeywords.push(keyword);
          }
        }

        if (hits > 0) {
          // Density score: normalize by content length, cap contribution at 0.5
          const densityScore = Math.min(0.5, (hits / totalWords) * 10);
          scores[intent] += densityScore;

          if (matchedKeywords.length > 0) {
            signals.push(`content:${intent} (${matchedKeywords.slice(0, 3).join(', ')}${matchedKeywords.length > 3 ? '...' : ''})`);
          }
        }
      }
    }
  }

  // --- 4. Find the highest-scoring intent ---
  let bestIntent = 'other';
  let bestScore = 0;

  for (const [intent, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestIntent = intent;
    }
  }

  // Normalize confidence to 0-1 range (cap at 1.0)
  // A score of 1.0+ (URL match + title match + content density) = very confident
  const confidence = Math.min(1.0, Math.round(bestScore * 100) / 100);

  // If nothing scored above 0, it's "other" with low confidence
  if (bestScore === 0) {
    return {
      page_intent: 'other',
      intent_confidence: 0.1,
      intent_signals: ['no_signals_matched'],
    };
  }

  return {
    page_intent: bestIntent,
    intent_confidence: confidence,
    intent_signals: signals,
  };
}

// -------------------------------------------------------------------------
// LLM classification prompt
// -------------------------------------------------------------------------

function buildLlmPrompt(title, textSnippet) {
  return `Classify this web page into exactly one intent category.

Categories: about, products, press, careers, contact, investors, partners, resources, blog_post, news_article, case_study, other

Page title: ${title || '(no title)'}

First 500 characters of page content:
${textSnippet || '(no content)'}

Respond with ONLY a JSON object, no other text:
{"intent": "<category>", "confidence": <0.0-1.0>}`;
}

// -------------------------------------------------------------------------
// Parse LLM response
// -------------------------------------------------------------------------

function parseLlmResponse(responseText) {
  try {
    // Extract JSON from the response (handle markdown code blocks)
    const jsonMatch = responseText.match(/\{[^}]+\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    if (parsed.intent && INTENTS.includes(parsed.intent)) {
      return {
        page_intent: parsed.intent,
        intent_confidence: typeof parsed.confidence === 'number'
          ? Math.min(1.0, Math.max(0, parsed.confidence))
          : 0.7,
      };
    }
    return null;
  } catch {
    return null;
  }
}

// -------------------------------------------------------------------------
// Main execute function
// -------------------------------------------------------------------------

async function execute(input, options, tools) {
  const { entities } = input;
  const { ai_model, ai_provider, ...otherOptions } = options;
  const { logger, progress, ai } = tools;

  const {
    use_llm = false,
    llm_threshold = 0.5,
    priority_intents = 'about,products,press',
  } = otherOptions;

  const priorityList = parseList(priority_intents);

  logger.info(
    `Intent Tagger config: use_llm=${use_llm}, llm_threshold=${llm_threshold}, priority_intents=[${priorityList.join(',')}]`
  );

  const results = [];
  let totalItems = 0;
  let llmCalls = 0;
  let llmFails = 0;
  const intentCounts = {};

  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i];
    progress.update(i + 1, entities.length, `Processing ${entity.name}`);

    // Collect items from this entity using data-shape routing
    const scrapedItems = (entity.items || []).filter(item => item.text_content || item.url);

    if (scrapedItems.length === 0) {
      logger.warn(`${entity.name}: no items with text_content or url — skipping`);
      results.push({
        entity_name: entity.name,
        items: [],
        meta: { total: 0, intent_breakdown: {}, llm_calls: 0 },
      });
      continue;
    }

    logger.info(`${entity.name}: classifying ${scrapedItems.length} pages`);

    const taggedItems = [];
    let entityLlmCalls = 0;

    for (const item of scrapedItems) {
      totalItems++;

      // Run heuristic classification
      const heuristic = classifyHeuristic(
        item.url || '',
        item.title || '',
        item.text_content || ''
      );

      let page_intent = heuristic.page_intent;
      let intent_confidence = heuristic.intent_confidence;
      let intent_signals = [...heuristic.intent_signals];

      // LLM fallback for low-confidence classifications
      if (use_llm && intent_confidence < llm_threshold && ai) {
        const textSnippet = (item.text_content || '').substring(0, 500);
        const prompt = buildLlmPrompt(item.title, textSnippet);

        try {
          const response = await ai.complete({
            prompt,
            model: ai_model,
            provider: ai_provider,
          });

          const llmResult = parseLlmResponse(response.text);
          if (llmResult) {
            page_intent = llmResult.page_intent;
            intent_confidence = llmResult.intent_confidence;
            intent_signals.push(`llm_override:${page_intent} (was ${heuristic.page_intent} @ ${heuristic.intent_confidence})`);
          } else {
            intent_signals.push('llm_fallback:parse_failed');
            llmFails++;
          }

          llmCalls++;
          entityLlmCalls++;
        } catch (err) {
          logger.warn(`${entity.name}: LLM classification failed for ${item.url}: ${err.message}`);
          intent_signals.push(`llm_fallback:error (${err.message})`);
          llmFails++;
          llmCalls++;
          entityLlmCalls++;
        }
      }

      // Track intent counts for summary
      intentCounts[page_intent] = (intentCounts[page_intent] || 0) + 1;

      // Build output item — carry through all original fields, add intent fields
      taggedItems.push({
        ...item,
        page_intent,
        intent_confidence,
        intent_signals: intent_signals.join(', '),
        entity_name: entity.name,
      });
    }

    // Sort items: priority intents first, then by confidence descending
    taggedItems.sort((a, b) => {
      const aPriority = priorityList.indexOf(a.page_intent);
      const bPriority = priorityList.indexOf(b.page_intent);

      // Both are priority intents — sort by priority order
      if (aPriority !== -1 && bPriority !== -1) {
        return aPriority - bPriority;
      }
      // Only a is priority
      if (aPriority !== -1) return -1;
      // Only b is priority
      if (bPriority !== -1) return 1;
      // Neither is priority — sort by confidence descending
      return b.intent_confidence - a.intent_confidence;
    });

    // Build per-entity intent breakdown
    const intentBreakdown = {};
    for (const item of taggedItems) {
      intentBreakdown[item.page_intent] = (intentBreakdown[item.page_intent] || 0) + 1;
    }

    results.push({
      entity_name: entity.name,
      items: taggedItems,
      meta: {
        total: taggedItems.length,
        intent_breakdown: intentBreakdown,
        llm_calls: entityLlmCalls,
      },
    });
  }

  // Build summary description
  const intentParts = Object.entries(intentCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([intent, count]) => `${count} ${intent}`)
    .join(', ');

  const llmPart = use_llm ? ` | LLM calls: ${llmCalls}${llmFails > 0 ? ` (${llmFails} failed)` : ''}` : '';
  const description = `${totalItems} pages classified across ${entities.length} entities: ${intentParts}${llmPart}`;

  return {
    results,
    summary: {
      total_entities: entities.length,
      total_items: totalItems,
      intent_breakdown: intentCounts,
      llm_calls: llmCalls,
      llm_failures: llmFails,
      errors: [],
      description,
    },
  };
}

module.exports = execute;
