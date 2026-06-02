# FORMAT SPEC — Job Search Pipeline

> Reference doc for cover letter writer and CV builder.
> Defines the variant catalogue, cover letter structure, CV output structure, and response JSON shapes.

---

## CV variant catalogue

Daniel has 7 pre-approved variants. Each has a one-line summary, a set of section variants (summary/highlights/competencies/other experience), and a complete rewrite of each past job entry tailored to that voice.

| Variant | Use when the job is... |
|---|---|
| `generic` | Cross-functional senior leadership without a strong industry or function signal |
| `igaming` | iGaming operator, supplier, agency, or anything where industry credibility is the lead |
| `cmo` | Marketing leadership (CMO, VP Marketing, Head of Marketing, Head of Growth) outside iGaming |
| `cpo` | Product leadership (CPO, VP Product, Head of Product, Senior PM) outside iGaming |
| `ceo` | CEO, COO, GM, Country Manager, or other top-of-house operational role |
| `startup` | Early-stage company (Seed-A), founder/co-founder, hands-on builder roles |
| `digital` | Digital transformation, e-commerce, digital product, design-led roles |

The analyzer picks ONE variant per job in its JSON output (`base_variant`). The cv-generator passes this to `buildCV(variant, overrides)` in `generate_core_cvs.js`. The cover letter writer uses the same variant to set voice.

The variant files themselves live at `/Users/danieloskarsson/Library/CloudStorage/Dropbox/Projects/JobSearch/CVs/cv-source/en/` (English) and `cv-source/sv/` (Swedish).

---

## Cover letter structure

4-5 short paragraphs, ~250-320 words total.

| Paragraph | Purpose | Constraints |
|---|---|---|
| Open | One concrete, slightly bold claim grounded in a real Daniel accomplishment | NOT "why this company". NOT echoing the company tagline. |
| Middle (1-2) | Specific evidence: what he built, owned, decided | Show, don't list. Numbers must come from MASTER_CV.md only. |
| Bridge | Honest naming of any industry/title/seniority gap + strongest TRUE bridging fact | Don't hide. Don't apologize. One move only. |
| Optional | Why this role, in Daniel's own words | No flattery. Specific. |
| Close | One line, low-key call to talk | No begging, no "I am excited", no "happy to discuss". |

Banned writing patterns: see `cover_letter_prompt.md` § HARD WRITING RULES.

---

## Cover letter response JSON shape

The cover letter writer returns this exact structure:

```json
{
  "company_name": "Short company name for filename",
  "variant": "one of: generic, igaming, cmo, cpo, ceo, startup, digital",
  "variant_reasoning": "Why this variant/theme was chosen",
  "greeting": "Dear [Hiring Manager / specific name if mentioned in ad],",
  "paragraphs": [
    "First paragraph text...",
    "Second paragraph text...",
    "Third paragraph text (optional)...",
    "Closing paragraph..."
  ],
  "sign_off": "Best regards",
  "unsupported_by_cv": [
    "Each item: something the job ad asks for that Daniel's CV does not support, so he can verify or omit it. Empty list if the CV covers everything."
  ]
}
```

The DOCX is then composed by `buildCoverLetter(variant, result)` in `generate-cover-letter.js` (variant-themed cover image + paragraphs + sign-off).

---

## Job analyzer response JSON shape

The analyzer returns this exact structure:

```json
{
  "company_name": "Short company name for filename",
  "base_variant": "generic | igaming | cmo | cpo | ceo | startup | digital",
  "variant_reasoning": "1-2 sentences on why this variant",

  "job_analysis": {
    "explicit_requirements": [
      { "requirement": "description", "priority": "must-have | nice-to-have", "frequency": 1 }
    ],
    "preferred_qualifications": ["..."],
    "industry_language": ["..."],
    "operational_context": {
      "team_size": "...",
      "reporting_to": "...",
      "scope": "global | regional | local",
      "contract_type": "...",
      "location": "...",
      "travel": "... or null"
    },
    "culture_signals": ["..."],
    "key_keywords_ranked": ["..."]
  },

  "cv": {
    "summary": "exact text from CV_SECTION_VARIANTS.md",
    "summary_source": "which variant",
    "highlights": ["exact highlights"],
    "highlights_source": "which variant",
    "competencies": [
      { "title": "Exact Category Name from Pool", "items": ["exact item 1", ...] }
    ],
    "jobs": {
      "onlyigaming": { "variant_used": "...", "role": "...", "intro": "...", "bullets": [...] },
      "coinhero": { ... },
      "betclic": { ... },
      "comeon": { ... },
      "mrgreen": { ... }
    },
    "otherExp": [{ "company": "...", "desc": "..." }],
    "otherExp_source": "which variant"
  },

  "suggestions": {
    "summary":      { "has_suggestions": false, "items": [] },
    "highlights":   { "has_suggestions": false, "items": [] },
    "competencies": { "has_suggestions": false, "items": [] },
    "job_bullets":  { "has_suggestions": false, "items": [] }
  },

  "gaps": [],

  "fit_score": 0,
  "fit_summary": "1-2 sentences on overall fit"
}
```

Each suggestion item uses `type: "NEW" | "CHANGED"`, `section: "..."`, `current_text` (for CHANGED), `suggested_text`, `addresses`.

---

## Output filenames

When the pipeline produces three artifacts per job, slug them consistently:

| Artifact | Pattern | Example |
|---|---|---|
| CV DOCX | `CV_Daniel_Oskarsson_{slug}_tailored.docx` | `CV_Daniel_Oskarsson_KGK_Autoexperten_tailored.docx` |
| Suggestions DOCX | `SUGGESTIONS_{slug}.docx` | `SUGGESTIONS_KGK_Autoexperten.docx` |
| Analyzer response JSON | `RESPONSE_{slug}.json` | `RESPONSE_KGK_Autoexperten.json` |
| Cover letter DOCX | `CoverLetter_Daniel_Oskarsson_{slug}.docx` | `CoverLetter_Daniel_Oskarsson_KGK_Autoexperten.docx` |
| Cover letter response JSON | `RESPONSE_CoverLetter_{slug}.json` | `RESPONSE_CoverLetter_KGK_Autoexperten.json` |

For jobs where multiple roles share the same company (e.g., Fidel Group CEO + Head of Product), the slug must include the role suffix: `FidelGroup_CEO`, `FidelGroup_HeadOfProduct`. The wrapper's `ROLE_SUFFIX` map handles this.
