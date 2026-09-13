/**
 * Real fixtures — pipeline run 36c75581-fb28-4e1d-a0a4-59154f801b58
 * (template company-profile-v3 1bb02368, project b0ae9801, status=archived).
 *
 * Pulled SELECT-only from the pipeline DB (Supabase fevxvwqjhndetktujeuu) on
 * 2026-09-13, the same evidence base as
 *   content-pipeline-specs/template-v3/content-quality/SEVERITY_FLOOR.md.
 *
 *  - `analysis` reconstructs the analysis_json.{categories,tags} the Step-8
 *    bundlers consume, from content-analyzer's stored `section_categories`/
 *    `section_tags` (existing slugs + suggested_new labels — verbatim). The
 *    suggested_new labels are exactly the ones observed leaking into published
 *    tags/keywords (ELK "bonus buy"/"betting strategies", etc.).
 *  - `hallucination` is the hallucination-detector output_data.items[0] verbatim
 *    (score, qa_pass, counts, flagged_claims {claim, severity, evidence}). All
 *    nine flagged claims are evidence:"in_window"; evidence_absent = 0.
 *
 * Used by the Step-8 leak tests and the UNIT-B/D tests so acceptance runs
 * against real production data, not synthetic stand-ins.
 */

const ELK = {
  name: 'ELK Studios',
  analysis: {
    categories: {
      primary: [{ slug: 'game-providers' }, { slug: 'game-developers' }],
      secondary: [{ slug: 'gamification' }],
    },
    tags: {
      existing: [
        { slug: 'slots' }, { slug: 'game-provider' }, { slug: 'mobile' },
        { slug: 'gamification' }, { slug: 'b2b-sales' }, { slug: 'rng' }, { slug: 'api' },
      ],
      suggested_new: [
        { label: 'bonus buy' }, { label: 'betting strategies' },
      ],
    },
  },
  hallucination: {
    hallucination_score: 0.914,
    qa_pass: false,
    total_claims_count: 70,
    flagged_claims_count: 3,
    flagged_claims: [
      { claim: 'ELK Studios does not source content from third parties.', evidence: 'in_window', severity: 'medium' },
      { claim: "Through SOFTSWISS's aggregation platform, connected operators gain access to ELK's full slot suite via a single technical integration.", evidence: 'in_window', severity: 'high' },
      { claim: 'ELK Compete and ELK Rewards are made available to connected operators through the aggregator-based model alongside the underlying game content.', evidence: 'in_window', severity: 'medium' },
    ],
  },
};

const PRG = {
  name: 'Pocket Rockets Gaming',
  analysis: {
    categories: {
      primary: [{ slug: 'software-development-services' }, { slug: 'strategy-consulting' }],
      secondary: [{ slug: 'consultancy-services' }, { slug: 'mergers-and-acquisitions' }],
    },
    tags: {
      existing: [
        { slug: 'software-development' }, { slug: 'consulting' }, { slug: 'platform-development' },
        { slug: 'rng' }, { slug: 'm&a' }, { slug: 'compliance' }, { slug: 'jackpot' },
      ],
      suggested_new: [
        { label: 'remote game server' }, { label: 'game porting' }, { label: 'lean operations' },
      ],
    },
  },
  hallucination: {
    hallucination_score: 0.867,
    qa_pass: false,
    total_claims_count: 75,
    flagged_claims_count: 4,
    flagged_claims: [
      { claim: "This due diligence work applies the firm's platform evaluation expertise to the transactional context.", evidence: 'in_window', severity: 'low' },
      { claim: 'Building an RGS offers greater long-term control than licensing or buying one.', evidence: 'in_window', severity: 'medium' },
      { claim: "Pocket Rockets Gaming's technical due diligence service applies the same platform-evaluation criteria it uses for studio clients to assess a target's technology risk in gaming M&A transactions.", evidence: 'in_window', severity: 'medium' },
      { claim: "Pocket Rockets Gaming builds compliance considerations into Engage's core.", evidence: 'in_window', severity: 'medium' },
    ],
  },
};

const VERM = {
  name: 'Vermantia',
  analysis: {
    categories: {
      primary: [{ slug: 'retail-systems' }, { slug: 'virtual-sports-solutions' }],
      secondary: [{ slug: 'sports-data-providers' }],
    },
    tags: {
      existing: [
        { slug: 'retail-solutions' }, { slug: 'retail' }, { slug: 'virtual-sports' },
        { slug: 'racing' }, { slug: 'sports-betting' }, { slug: 'pos' },
        { slug: 'platform' }, { slug: 'hardware' }, { slug: 'automation' },
      ],
      suggested_new: [
        { label: 'broadcast solutions' }, { label: 'live streaming' },
      ],
    },
  },
  hallucination: {
    hallucination_score: 0.928,
    qa_pass: false,
    total_claims_count: 69,
    flagged_claims_count: 2,
    flagged_claims: [
      { claim: "Vermantia's largest retail solutions deployment on record involved a content management migration for Lottomatica.", evidence: 'in_window', severity: 'medium' },
      { claim: "Vermantia rolled out more than a dozen virtual games across Superbet's Romanian online channels and retail points of sale.", evidence: 'in_window', severity: 'high' },
    ],
  },
};

module.exports = { ELK, PRG, VERM, ALL: [ELK, PRG, VERM] };
