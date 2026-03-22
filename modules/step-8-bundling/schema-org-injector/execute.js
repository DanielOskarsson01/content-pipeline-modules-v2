/**
 * Schema.org Injector — Step 8 Bundling submodule
 *
 * Generates Schema.org structured data (JSON-LD) for company profiles.
 * Produces Organization, Product, and FAQPage schemas for SEO rich snippets.
 *
 * Pure data transformation — no external APIs.
 * Data-shape routing: finds input by field presence, never by source_submodule.
 */

// ---------------------------------------------------------------------------
// Schema builders
// ---------------------------------------------------------------------------

/**
 * Build Schema.org Organization from available entity data.
 * Omits fields that have no data — never fabricates values.
 */
function buildOrganization(entityName, entityUrl, data) {
  const org = {
    '@type': 'Organization',
    'name': entityName,
  };

  if (entityUrl) {
    org.url = entityUrl;
  }

  // -- From structured JSON (json-output shape) --
  const json = data.jsonOutput;
  if (json) {
    // Description: use overview if available
    if (json.overview) {
      // Take first sentence or first 200 chars as description
      const firstSentence = json.overview.match(/^[^.!?]+[.!?]/);
      org.description = firstSentence ? firstSentence[0].trim() : json.overview.substring(0, 200).trim();
    }

    // Contact info
    if (json.contact) {
      if (json.contact.email) org.email = json.contact.email;
      if (json.contact.phone) org.telephone = json.contact.phone;
    }

    // Credentials / licenses
    if (json.credentials && Array.isArray(json.credentials) && json.credentials.length > 0) {
      org.hasCredential = json.credentials.map(cred => ({
        '@type': 'EducationalOccupationalCredential',
        'credentialCategory': 'license',
        'name': typeof cred === 'string' ? cred : cred.name || cred.detail || String(cred),
      }));
    }

    // Social links (sameAs)
    const sameAs = [];
    if (json.meta) {
      if (json.meta.linkedin) sameAs.push(json.meta.linkedin);
      if (json.meta.twitter) sameAs.push(json.meta.twitter);
      if (json.meta.facebook) sameAs.push(json.meta.facebook);
      if (json.meta.instagram) sameAs.push(json.meta.instagram);
      if (json.meta.youtube) sameAs.push(json.meta.youtube);
    }
    if (sameAs.length > 0) org.sameAs = sameAs;

    // Logo
    if (json.meta && json.meta.logo) {
      org.logo = json.meta.logo;
    }
  }

  // -- From analysis_json (content-analyzer shape) --
  const analysis = data.analysis;
  if (analysis) {
    const kf = analysis.key_facts;
    if (kf) {
      if (kf.founded && !org.foundingDate) {
        org.foundingDate = String(kf.founded);
      }
      if (kf.headquarters && !org.address) {
        org.address = {
          '@type': 'PostalAddress',
          'addressLocality': kf.headquarters,
        };
      }
      if (kf.employees && !org.numberOfEmployees) {
        org.numberOfEmployees = {
          '@type': 'QuantitativeValue',
          'value': kf.employees,
        };
      }
      if (kf.awards && Array.isArray(kf.awards) && kf.awards.length > 0 && !org.award) {
        org.award = kf.awards.map(a => typeof a === 'string' ? a : a.detail || a.name || String(a));
      }
      if (kf.licenses && Array.isArray(kf.licenses) && kf.licenses.length > 0 && !org.hasCredential) {
        org.hasCredential = kf.licenses.map(lic => ({
          '@type': 'EducationalOccupationalCredential',
          'credentialCategory': 'license',
          'name': typeof lic === 'string' ? lic : lic.detail || lic.name || String(lic),
        }));
      }
      if (kf.key_people && Array.isArray(kf.key_people) && kf.key_people.length > 0) {
        org.member = kf.key_people.map(person => ({
          '@type': 'Person',
          'name': typeof person === 'string' ? person : person.name || String(person),
        }));
      }
      if (kf.contact && !org.email) {
        if (kf.contact.email) org.email = kf.contact.email;
        if (kf.contact.phone && !org.telephone) org.telephone = kf.contact.phone;
      }
    }

    // Description fallback from categories
    if (!org.description && analysis.categories && Array.isArray(analysis.categories.primary) && analysis.categories.primary.length > 0) {
      const catSlug = analysis.categories.primary[0].slug || '';
      const catName = catSlug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      org.description = `${entityName} is a company in the ${catName} industry.`;
    }
  }

  return org;
}

/**
 * Build Schema.org Product schemas from categories/products data.
 * Generates one Product per primary category or product entry.
 */
function buildProducts(entityName, entityUrl, data) {
  const products = [];

  const json = data.jsonOutput;
  const analysis = data.analysis;

  // Try structured categories from json-output
  if (json && json.categories && Array.isArray(json.categories)) {
    for (const cat of json.categories) {
      const name = typeof cat === 'string' ? cat : cat.name || cat.slug || cat.label;
      if (!name) continue;

      const product = {
        '@type': 'Product',
        'name': formatCategoryName(name),
        'brand': {
          '@type': 'Organization',
          'name': entityName,
        },
      };
      if (entityUrl) product.url = entityUrl;
      if (typeof cat === 'object' && cat.description) {
        product.description = cat.description;
      }
      products.push(product);
    }
  }

  // Fallback: try analysis categories (primary only, since those are the main products/services)
  if (products.length === 0 && analysis && analysis.categories) {
    const primaryCats = Array.isArray(analysis.categories.primary) ? analysis.categories.primary : [];
    for (const cat of primaryCats) {
      const slug = cat.slug || cat.name || '';
      if (!slug) continue;

      const product = {
        '@type': 'Product',
        'name': formatCategoryName(slug),
        'brand': {
          '@type': 'Organization',
          'name': entityName,
        },
      };
      if (entityUrl) product.url = entityUrl;
      if (cat.why) product.description = cat.why;
      products.push(product);
    }
  }

  return products;
}

/**
 * Build Schema.org FAQPage from FAQ items.
 * Maps directly to Google's FAQ rich snippet format.
 */
function buildFAQPage(data) {
  const faqs = extractFAQs(data);
  if (faqs.length === 0) return null;

  return {
    '@type': 'FAQPage',
    'mainEntity': faqs.map(faq => ({
      '@type': 'Question',
      'name': faq.question,
      'acceptedAnswer': {
        '@type': 'Answer',
        'text': faq.answer,
      },
    })),
  };
}

/**
 * Extract FAQ items from all available data shapes.
 * Returns array of { question, answer } objects.
 */
function extractFAQs(data) {
  const faqs = [];

  // From json-output structured data
  if (data.jsonOutput && data.jsonOutput.faq) {
    const faqData = data.jsonOutput.faq;
    if (Array.isArray(faqData)) {
      for (const item of faqData) {
        const q = item.question || item.q;
        const a = item.answer || item.a;
        if (q && a) faqs.push({ question: q, answer: a });
      }
    }
  }

  // From SEO plan (seo_plan_json.faqs)
  if (faqs.length === 0 && data.seo && data.seo.faqs) {
    const seoFaqs = data.seo.faqs;
    if (Array.isArray(seoFaqs)) {
      for (const item of seoFaqs) {
        const q = item.question || item.q;
        const a = item.answer || item.a;
        if (q && a) faqs.push({ question: q, answer: a });
      }
    }
  }

  return faqs;
}

/**
 * Convert a slug or category name to a display-friendly format.
 * e.g. "online-casino" → "Online Casino"
 */
function formatCategoryName(slug) {
  return slug
    .split(/[-_]/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate a schema object for required fields and correct types.
 * Returns array of error strings (empty = valid).
 */
function validateSchema(schema) {
  const errors = [];

  if (!schema['@type']) {
    errors.push('Missing @type');
    return errors;
  }

  switch (schema['@type']) {
    case 'Organization':
      if (!schema.name) errors.push('Organization: missing required field "name"');
      if (!schema.url) errors.push('Organization: missing recommended field "url"');
      if (!schema.description) errors.push('Organization: missing recommended field "description"');
      if (schema.foundingDate && !/^\d{4}(-\d{2}(-\d{2})?)?$/.test(schema.foundingDate)) {
        errors.push(`Organization: foundingDate "${schema.foundingDate}" is not a valid ISO date format`);
      }
      if (schema.email && typeof schema.email !== 'string') {
        errors.push('Organization: email must be a string');
      }
      if (schema.sameAs && !Array.isArray(schema.sameAs)) {
        errors.push('Organization: sameAs must be an array');
      }
      break;

    case 'Product':
      if (!schema.name) errors.push('Product: missing required field "name"');
      break;

    case 'FAQPage':
      if (!schema.mainEntity || !Array.isArray(schema.mainEntity)) {
        errors.push('FAQPage: missing or invalid "mainEntity" (must be an array)');
      } else {
        for (let i = 0; i < schema.mainEntity.length; i++) {
          const q = schema.mainEntity[i];
          if (!q.name) errors.push(`FAQPage: question ${i + 1} missing "name"`);
          if (!q.acceptedAnswer || !q.acceptedAnswer.text) {
            errors.push(`FAQPage: question ${i + 1} missing "acceptedAnswer.text"`);
          }
        }
      }
      break;

    default:
      errors.push(`Unknown @type: ${schema['@type']}`);
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Data-shape routing helpers
// ---------------------------------------------------------------------------

/**
 * Detect json-output items by checking for fields like overview, categories,
 * faq, credentials, contact, meta, sources.
 */
function isJsonOutputItem(item) {
  return !!(
    item.overview ||
    item.categories ||
    item.faq ||
    item.credentials ||
    item.contact ||
    item.final_json
  );
}

/**
 * Parse a json-output item. If it has final_json (stringified), parse it.
 * Otherwise treat the item itself as the structured data.
 */
function parseJsonOutputItem(item) {
  if (item.final_json) {
    try {
      return typeof item.final_json === 'string' ? JSON.parse(item.final_json) : item.final_json;
    } catch {
      return null;
    }
  }
  return item;
}

// ---------------------------------------------------------------------------
// Main execute
// ---------------------------------------------------------------------------

async function execute(input, options, tools) {
  const { entities } = input;
  const {
    generate_organization = true,
    generate_products = true,
    generate_faq = true,
    company_url_field = 'website',
  } = options;
  const { logger, progress } = tools;

  const results = [];

  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i];
    progress.update(i + 1, entities.length, `Processing ${entity.name}`);

    // Data-shape routing: find items by field presence
    const jsonOutputItems = (entity.items || []).filter(item => isJsonOutputItem(item));
    const analysisItems = (entity.items || []).filter(item => item.analysis_json);
    const seoItems = (entity.items || []).filter(item => item.seo_plan_json);

    if (!jsonOutputItems.length && !analysisItems.length && !seoItems.length) {
      logger.warn(`${entity.name}: no items with recognized data shapes`);
      results.push({
        entity_name: entity.name,
        items: [],
        error: 'No items with json-output, analysis_json, or seo_plan_json found',
        meta: { errors: 1 },
      });
      continue;
    }

    try {
      // Collect data from available shapes
      const data = {
        jsonOutput: jsonOutputItems.length > 0 ? parseJsonOutputItem(jsonOutputItems[0]) : null,
        analysis: analysisItems.length > 0 ? analysisItems[0].analysis_json : null,
        seo: seoItems.length > 0 ? seoItems[0].seo_plan_json : null,
      };

      // Resolve company URL from entity fields
      let entityUrl = null;
      if (entity[company_url_field]) {
        entityUrl = entity[company_url_field];
        if (!entityUrl.startsWith('http')) {
          entityUrl = `https://${entityUrl}`;
        }
      }

      // Build schema objects
      const schemas = [];
      const schemaTypes = [];
      const allValidationErrors = [];

      // Organization
      if (generate_organization) {
        const org = buildOrganization(entity.name, entityUrl, data);
        const orgErrors = validateSchema(org);
        allValidationErrors.push(...orgErrors);
        schemas.push(org);
        schemaTypes.push('Organization');
        if (orgErrors.length > 0) {
          logger.warn(`${entity.name}: Organization validation: ${orgErrors.join('; ')}`);
        }
      }

      // Product(s)
      if (generate_products) {
        const products = buildProducts(entity.name, entityUrl, data);
        for (const product of products) {
          const productErrors = validateSchema(product);
          allValidationErrors.push(...productErrors);
          schemas.push(product);
          if (productErrors.length > 0) {
            logger.warn(`${entity.name}: Product validation: ${productErrors.join('; ')}`);
          }
        }
        if (products.length > 0) {
          schemaTypes.push(`Product (${products.length})`);
        }
      }

      // FAQPage
      if (generate_faq) {
        const faqPage = buildFAQPage(data);
        if (faqPage) {
          const faqErrors = validateSchema(faqPage);
          allValidationErrors.push(...faqErrors);
          schemas.push(faqPage);
          schemaTypes.push('FAQPage');
          if (faqErrors.length > 0) {
            logger.warn(`${entity.name}: FAQPage validation: ${faqErrors.join('; ')}`);
          }
        }
      }

      if (schemas.length === 0) {
        logger.warn(`${entity.name}: no schemas generated (all disabled or no data)`);
        results.push({
          entity_name: entity.name,
          items: [],
          error: 'No schemas could be generated from available data',
          meta: { errors: 1 },
        });
        continue;
      }

      // Build final JSON-LD
      // Use @graph pattern when multiple schemas exist
      let jsonLdObject;
      if (schemas.length === 1) {
        jsonLdObject = {
          '@context': 'https://schema.org',
          ...schemas[0],
        };
      } else {
        jsonLdObject = {
          '@context': 'https://schema.org',
          '@graph': schemas,
        };
      }

      const jsonLdString = JSON.stringify(jsonLdObject, null, 2);
      const scriptBlock = `<script type="application/ld+json">\n${jsonLdString}\n</script>`;
      const sizeKb = Math.round(Buffer.byteLength(scriptBlock, 'utf8') / 1024 * 10) / 10;

      results.push({
        entity_name: entity.name,
        items: [{
          entity_name: entity.name,
          schema_jsonld: scriptBlock,
          schema_types: schemaTypes.join(', '),
          validation_errors: allValidationErrors,
          validation_error_count: allValidationErrors.length,
          validation_errors_text: allValidationErrors.length > 0
            ? allValidationErrors.join('\n')
            : 'No validation errors',
          jsonld_size_kb: sizeKb,
        }],
        meta: {
          schema_types: schemaTypes,
          validation_error_count: allValidationErrors.length,
          jsonld_size_kb: sizeKb,
        },
      });

      logger.info(`${entity.name}: ${schemaTypes.join(', ')} — ${sizeKb}KB${allValidationErrors.length > 0 ? ` (${allValidationErrors.length} validation warnings)` : ''}`);

    } catch (err) {
      logger.error(`${entity.name}: ${err.message}`);
      results.push({
        entity_name: entity.name,
        items: [],
        error: err.message,
        meta: { errors: 1 },
      });
    }
  }

  const totalItems = results.reduce((sum, r) => sum + r.items.length, 0);
  const errors = results.filter(r => r.error).map(r => `${r.entity_name}: ${r.error}`);

  return {
    results,
    summary: {
      total_entities: entities.length,
      total_items: totalItems,
      description: `${totalItems} JSON-LD outputs from ${entities.length} entities${errors.length ? ` (${errors.length} failed)` : ''}`,
      errors,
    },
  };
}

module.exports = execute;
