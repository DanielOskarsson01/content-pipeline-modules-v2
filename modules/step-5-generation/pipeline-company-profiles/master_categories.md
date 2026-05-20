# MASTER CATEGORIES - OnlyiGaming

> Reference document for content-analyzer, AI tagging prompt, and editorial classification.
> Use these categories to classify companies and tag articles.
> When a company fits a category, use the exact slug. If no category fits, suggest a new one.

## Classification Rules

- **Primary** = core business model / main revenue driver. A company typically has 1-2 primary categories. The primary DIR for an article determines canonical URL and SEO link equity.
- **Secondary** = add-on services, integrations, or less-specialized offerings alongside the core business.
- **Suggested** = if sources show clear evidence for a category not listed here, suggest it with evidence and confidence score.
- Every classification must cite at least one source.
- Tags are separate from categories - tags capture specific features/USPs (3 words or fewer each).

## Slug Convention (production URLs)

Every slug below matches the live URL pattern:

```
https://onlyigaming.com/categories/{slug}
```

For example: `casino` maps to `/categories/casino`, `e-wallet-solutions` maps to `/categories/e-wallet-solutions`. Slugs must not be changed without updating URL redirects.

## Operator Categories

The categories `operator`, `multi-product`, `casino`, `sportsbook`, `poker`, `bingo`, `lottery`, `esports`, `racing`, and `crypto` are all B2C operator categories. The display name is "Operator X" (e.g., "Operator Casino", "Operator Poker") but the slug remains the bare product noun to match production URLs.

These categories are distinct from the B2B platform categories (`casino-platforms`, `sportsbook-platform`, etc.) which are technology providers serving operators. When an article mentions a company that runs the casino brand (B2C), use the operator category. When it mentions a company that provides the technology behind it (B2B), use the platform category.

## Primary Selection

When an article fits multiple categories, see `rules/primary-triage.md` for the decision framework. Summary of the DIR primary test:

1. **Subject test:** What is the article fundamentally about? Not which companies are mentioned, but what business domain is the focus.
2. **Reader test:** Which category page would a reader expect to find this article on?
3. **Company core business:** If the article is about a specific company, what is that company's primary business category?

## Distinguish From

Each category that has boundary tension with adjacent categories has a "Distinguish from" section. This supports both LLM tagging decisions and human company-profile classification when writing new profiles or suggesting new categories.

---

## Categories

### strategy-consulting - Strategy Consulting
Strategy consultants provide high-level guidance to gambling operators and suppliers regarding market entry, product focus, and pricing models. These experts deliver specific outputs including market sizing reports, competitor benchmarking, and OKR roadmaps to ensure sustainable growth. A primary function involves evaluating "build-vs-buy" technology strategies and calculating the compliance cost-to-serve in regulated jurisdictions, helping leadership teams navigate complex tax implications and local partnering requirements.

**Distinguish from:**
- `marketing-consulting` (Marketing Consulting): Strategy is corporate-level. Marketing consulting is acquisition/brand strategy specifically.
- `consultancy-services` (Consultancy Services): Strategy consulting is the specific specialty. Consultancy Services is the generic catch-all for firms covering multiple domains.
- `mergers-and-acquisitions` (Mergers & Acquisitions): M&A advisors specifically handle deals. Strategy consulting includes broader corporate strategy.

### licensing-and-regulatory-consulting - Licensing & Regulatory Consulting
Securing a gambling license requires navigating complex global regulations to select the optimal jurisdiction for your business model. Consultants in this field manage the full application lifecycle, drafting mandatory policies for Anti-Money Laundering (AML) and Responsible Gaming while assembling technical evidence for regulators. Post-licensing services include managing annual audits, handling corporate control notifications, and maintaining the "good standing" status required to operate legally in markets like the UK, Malta, or US states.

**Distinguish from:**
- `compliance-and-regulatory-services` (Compliance & Regulatory Services): Licensing consulting handles the application and onboarding. Compliance services handle ongoing regulatory obligations after the license is granted.
- `corporate-services` (Corporate Services): Licensing covers gambling-specific regulatory work. Corporate services covers company formation, directors, registered offices.

### compliance-and-regulatory-services - Compliance & Regulatory Services
Compliance firms assist operators and suppliers in meeting the continuous demands of gambling regulations across multiple territories. These providers offer advisory services, managed teams, or software platforms to handle licensing applications, audit preparation, and ongoing reporting. Solutions frequently cover broader legal obligations including GDPR privacy laws and jurisdiction-specific anti-money laundering directives, ensuring that the business avoids fines and license suspensions.

**Distinguish from:**
- `licensing-and-regulatory-consulting` (Licensing & Regulatory Consulting): Compliance services are ongoing operational support. Licensing consulting is one-time application work.
- `regulatory-reporting-tools` (Regulatory Reporting Tools): Compliance services are advisory and managed services. Regulatory reporting tools are the software that submits the reports.
- `aml-solutions` (AML Solutions): Compliance services cover all regulatory obligations broadly. AML solutions are specifically money-laundering detection software.

### corporate-services - Corporate Services
Establishing a legitimate operational footprint is a prerequisite for licensing in key hubs such as Malta, the Isle of Man, or Gibraltar. Corporate service providers handle foundational governance including company formation, providing resident directors, and managing registered office requirements. These firms also manage day-to-day administrative tasks like bookkeeping, VAT returns, and banking interfaces, ensuring the business meets all "economic substance" laws required by international tax authorities.

**Distinguish from:**
- `licensing-and-regulatory-consulting` (Licensing & Regulatory Consulting): Corporate services are general company-formation services. Licensing consulting is gambling-specific regulatory work.

### mergers-and-acquisitions - Mergers & Acquisitions
Buying or selling a gambling business requires rigorous due diligence regarding licensing validity, technology ownership, and player database quality. M&A advisors guide buy-side and sell-side teams through valuations and regulatory approval processes, including complex change-of-control notifications. Outputs include detailed synergy models, "red flag" reports on compliance risks, and integration roadmaps to merge personnel and platforms without disrupting ongoing revenue streams.

**Distinguish from:**
- `strategy-consulting` (Strategy Consulting): M&A advisors execute deals. Strategy consultants advise on broader corporate strategy that may or may not involve deals.

### marketing-consulting - Marketing Consulting
Marketing consultants advise on acquisition strategies, market positioning, and media planning to maximize brand growth efficiently. They help design affiliate programs and advertising campaigns that adhere to strict gambling rules, such as age-gating and social responsibility messaging. Deliverables typically include channel mix playbooks and measurement frameworks to track Lifetime Value (LTV) and Customer Acquisition Cost (CAC), ensuring marketing spend is fully optimized across digital and traditional channels.

**Distinguish from:**
- `marketing-services` (Marketing Services): Marketing consulting is strategic advisory. Marketing services is the execution of specific campaigns or programs.
- `marketing-agencies` (Marketing Agencies): Consultants provide strategy and frameworks. Agencies execute campaigns end-to-end including creative and media buying.
- `crm-consulting` (CRM Consulting): Marketing consulting covers acquisition. CRM consulting covers retention and lifecycle.

### crm-consulting - CRM Consulting
Since player retention drives long-term profitability, CRM consultants design comprehensive lifecycle programs covering onboarding, cross-selling, and reactivation. They assist in selecting the right CRM tools and defining the logic for player segmentation and automated bonus offers. Projects prioritize data governance to meet GDPR standards while focusing on improving critical KPIs such as churn reduction, deposit frequency, and Average Revenue Per User (ARPU).

**Distinguish from:**
- `marketing-consulting` (Marketing Consulting): CRM consulting is retention/lifecycle specific. Marketing consulting is acquisition-focused.
- `crm-platforms` (CRM Platforms): CRM consulting is advisory. CRM platforms are the software systems.
- `cro-consulting` (CRO Consulting): CRM consulting covers post-acquisition retention. CRO consulting covers pre-acquisition funnel optimization.

### cro-consulting - CRO Consulting
External experts perform audits on player acquisition flows to identify lost revenue opportunities. Consultants design hypotheses and run multivariate tests to improve conversion performance. Deliverables typically include a prioritized roadmap of optimizations - such as simplifying the sign-up form or changing button placements - that directly impact acquisition KPIs.

**Distinguish from:**
- `cro-solutions` (CRO Solutions): CRO consulting is advisory and human expertise. CRO solutions are the testing/analytics software tools.
- `marketing-consulting` (Marketing Consulting): CRO consulting is funnel-specific. Marketing consulting is broader strategy.

### payment-consulting - Payment Consulting
Optimizing the cashier requires a strategic mix of providers and favorable rates. Consultants advise operators on selecting the best payment partners and negotiating fees to maximize margins. They analyze player preferences in different markets to ensure the payment offering is competitive and cost-efficient, reducing transaction friction.

**Distinguish from:**
- `payment-services` (Payment Services): Payment consulting is advisory. Payment services is the actual PSP service.

### consultancy-services - Consultancy Services
General consultancy firms provide broad advisory services across multiple areas of iGaming operations. Unlike specialist consultants focused on a single domain such as licensing or CRM, these firms offer integrated guidance spanning market entry, technology selection, regulatory strategy, and operational efficiency. They serve as strategic partners for businesses entering or expanding within the gambling industry.

**Distinguish from:**
- `strategy-consulting` (Strategy Consulting): Consultancy Services is the generic catch-all. Strategy Consulting is the specific specialty for corporate-level strategy.

### recruitment-services - Recruitment Services
Specialized recruitment agencies focus on sourcing talent for niche iGaming roles ranging from sports traders and compliance officers to C-level executives. They manage the entire hiring process including candidate screening, technical assessments, and right-to-work checks to meet industry standards. These services aim to optimize time-to-hire and retention rates while adhering to strict data protection guidelines, often leveraging deep networks to find candidates with specific experience in regulated markets.

### aml-solutions - AML Solutions
Regulators enforce strict anti-money laundering rules which require robust systems to monitor transactions and screen players effectively. Providers offer technology for real-time risk scoring, sanctions list screening, and adverse media checks to detect potential financial crime. These solutions allow operators to identify suspicious activity immediately and file necessary Suspicious Activity Reports (SARs) to ensure full regulatory compliance without slowing down payments for legitimate users.

**Distinguish from:**
- `kyc-services` (KYC Services): AML is transaction monitoring after onboarding. KYC is identity verification during onboarding.
- `fraud-prevention` (Fraud Prevention): AML targets money laundering specifically. Fraud prevention covers bonus abuse, multi-accounting, chargebacks.
- `compliance-and-regulatory-services` (Compliance & Regulatory Services): AML solutions are the software/technology. Compliance services are the broader advisory work.

### kyc-services - KYC Services
Identity verification is essential for confirming player age and eligibility during the initial onboarding process. KYC services automate this verification using document scanning, biometric facial recognition, and address validation databases. Integrating these checks via API allows operators to filter out fraud and underage users in seconds, maximizing the conversion rate of legitimate sign-ups while maintaining a smooth, friction-free user experience.

**Distinguish from:**
- `aml-solutions` (AML Solutions): KYC is identity verification at onboarding. AML is ongoing transaction monitoring.
- `fraud-prevention` (Fraud Prevention): KYC verifies who the player is. Fraud prevention monitors what the player does.

### fraud-prevention - Fraud Prevention
Profitability is constantly threatened by malicious activities such as bonus abuse, multi-accounting, and chargeback schemes. Fraud prevention tools analyze device fingerprints, betting patterns, and behavioral data to detect anomalies in real-time. These systems typically operate in the background to block fraudsters before they can withdraw funds or abuse promotional offers, protecting operator margins without disturbing genuine players.

**Distinguish from:**
- `aml-solutions` (AML Solutions): Fraud prevention targets bonus abuse, multi-accounting, chargebacks. AML targets money laundering specifically.
- `risk-management` (Risk Management): Fraud prevention is technology-based detection. Risk management is broader (includes payment risk, regulatory risk).
- `affiliate-fraud-protection` (Affiliate Fraud Protection): Fraud prevention protects against player fraud. Affiliate fraud protection covers affiliate traffic manipulation.

### risk-management - Risk Management
Protecting financial integrity requires constant vigilance against fraud and abuse. Risk management services focus on detecting chargebacks, identity theft, and money laundering. They leverage AI and data analytics to distinguish between genuine players and malicious actors, ensuring compliance with strict regulations while minimizing false positives that block good customers.

**Distinguish from:**
- `fraud-prevention` (Fraud Prevention): Risk management is broader operational/payment risk. Fraud prevention is specifically player-fraud detection.
- `payment-services` (Payment Services): Risk management is the analysis/control layer. Payment services are the processing infrastructure.

### affiliate-fraud-protection - Affiliate Fraud Protection
Operators allocate significant budgets to affiliates, making them targets for invalid traffic and lead manipulation. Protection services monitor affiliate programs to detect click fraud, cookie stuffing, and attribution abuse. Advanced analytics identify low-quality or bot traffic to ensure commissions are paid only for genuine player acquisition, protecting marketing ROI and maintaining transparent relationships with partners.

**Distinguish from:**
- `fraud-prevention` (Fraud Prevention): Affiliate fraud protection is specifically affiliate-traffic-related. Fraud prevention targets player fraud.
- `affiliate-tracking` (Affiliate Tracking): Affiliate fraud protection detects bad traffic. Affiliate tracking is the attribution/commission software itself.

### responsible-gaming - Responsible Gaming
Protecting players from gambling-related harm is a critical regulatory mandate and a key part of corporate social responsibility. Solutions in this sector provide self-exclusion tools, deposit limits, and real-time behavioral monitoring to detect problem gambling patterns. Companies also offer policy design and audit services to ensure player protection frameworks integrate correctly with regulator-mandated central systems, helping operators intervene early with at-risk customers.

**Distinguish from:**
- `game-security-and-fair-play` (Game Security & Fair Play): Responsible gaming protects players from harm. Game security ensures game integrity (fair RNG, anti-cheat).

### game-security-and-fair-play - Game Security & Fair Play
Operators must demonstrate to players and regulators that their games are secure and operate with genuine randomness. Providers conduct audits on Random Number Generators (RNG) and perform penetration testing on platforms to identify cybersecurity vulnerabilities. Certification seals from these firms serve as proof that the gaming environment is tamper-proof and fair, which is often a mandatory requirement for entering new regulated markets.

**Distinguish from:**
- `game-testing-and-certification` (Game Testing & Certification): Game security is ongoing audit and pentest. Game testing is pre-launch certification of game math/RNG.
- `rng-solutions` (RNG Solutions): Game security audits the RNG. RNG solutions are the providers of the RNG technology itself.
- `responsible-gaming` (Responsible Gaming): Game security ensures fair play. Responsible gaming protects against player harm.

### game-testing-and-certification - Game Testing & Certification
Before launching in a regulated market, games must be verified by an accredited independent test lab. These labs inspect the Random Number Generator, payout percentages (RTP), and mathematical models to ensure they meet specific technical standards. Certification acts as the final approval allowing a game to be released globally, ensuring that the math works as advertised and complies with local laws in jurisdictions like the UK, Italy, or New Jersey.

**Distinguish from:**
- `game-security-and-fair-play` (Game Security & Fair Play): Game testing is pre-launch certification. Game security is ongoing monitoring and pentest.
- `rng-solutions` (RNG Solutions): Testing labs verify and certify games. RNG solutions provide the underlying RNG technology being certified.

### rng-solutions - RNG Solutions
The Random Number Generator is the core technology ensuring fair digital gaming. Specialists provide certified RNG libraries and integration support to prove that game outcomes are truly random and not manipulated. Their services ensure the technology is tamper-proof and meets the strict standards of regulators worldwide, acting as the foundation of trust for online casinos.

**Distinguish from:**
- `game-testing-and-certification` (Game Testing & Certification): RNG solutions provide the technology. Game testing certifies the RNG meets standards.
- `game-providers` (Game Providers): RNG solutions provide the underlying random number layer. Game providers create the games that use the RNG.

### regulatory-reporting-tools - Regulatory Reporting Tools
Regulatory reporting tools automate the generation and submission of compliance reports required by gambling authorities. These platforms handle data aggregation from multiple systems to produce jurisdiction-specific reports covering financial transactions, player activity, and responsible gaming metrics. Automation reduces manual errors and ensures operators meet tight filing deadlines across multiple jurisdictions simultaneously.

**Distinguish from:**
- `compliance-and-regulatory-services` (Compliance & Regulatory Services): Regulatory reporting tools are software/SaaS. Compliance services are advisory/managed services.
- `aml-solutions` (AML Solutions): Regulatory reporting handles report submission. AML solutions handle transaction monitoring.

### casino-platforms - Casino Platforms
Dedicated casino platforms provide the infrastructure specifically needed to run online slots, live dealer games, and table games. They handle player account management, payment processing, and game content integration from multiple studios. Operators can utilize these systems as licensed software or as fully managed white-label solutions to launch competitive casino brands, often featuring built-in tournaments and loyalty engines to drive engagement.

**Distinguish from:**
- `casino` (Operator Casino): Casino platforms are B2B technology providers. Operator Casino (casino) is the B2C operator running the casino brand.
- `white-label-solutions` (White Label Solutions): Casino platforms can be deployed under the operator's own license. White label bundles platform + license + payments.
- `turnkey-solutions` (Turnkey Solutions): Casino platforms provide the technology stack. Turnkey solutions add games + payments + tools on top.
- `game-aggregators` (Game Aggregators): Casino platforms run the full casino operation. Aggregators just provide the games API hub.

### sportsbook-platform - Sportsbook Platform
Managing a sportsbook requires a powerful engine capable of handling live odds, risk management, and bet settlement for thousands of events. These platforms support vast market coverage ranging from pre-match to in-play and include features such as cash-out and multi-sport accumulators. They are engineered to process high-volume traffic during peak sporting events while maintaining strict integrity and reporting standards.

**Distinguish from:**
- `sportsbook` (Operator Sportsbook): Sportsbook Platform is B2B technology. Operator Sportsbook (sportsbook) is the B2C bookmaker.
- `sports-data-providers` (Sports Data Providers): Sportsbook Platform is the betting engine. Sports data providers supply the odds/results feed.
- `virtual-sports-solutions` (Virtual Sports Solutions): Sportsbook Platform handles real sports. Virtual sports are computer-generated event simulations.

### poker-platforms - Poker Platforms
Running a poker room requires specialized software to handle table management, tournaments, and rake calculations. These platforms support variants including Texas Hold'em and Omaha while incorporating anti-collusion security features to prevent cheating. They often connect to larger networks to ensure sufficient player liquidity is available to keep games running continuously, ensuring players can always find a table at their stake level.

**Distinguish from:**
- `poker` (Operator Poker): Poker platforms are B2B software. Operator Poker (poker) is the B2C poker room.

### bingo-platforms - Bingo Platforms
Online bingo platforms integrate community tools and chat features alongside standard number draws. They manage ticket sales for variants including 75-ball and 90-ball bingo and often link jackpots across multiple rooms. The focus is on social interaction to replicate the experience of a traditional bingo hall, often including "chat host" tools to keep players entertained between games.

**Distinguish from:**
- `bingo` (Operator Bingo): Bingo platforms are B2B software. Operator Bingo (bingo) is the B2C bingo brand.

### lottery-platforms - Lottery Platforms
Lottery platforms manage online ticket sales, draw mechanics, and instant win games for state lotteries and licensed operators. These systems handle the complex logistics of large-scale draws, prize distribution, and subscription management. They enable traditional lottery providers to expand their reach into the digital channel while adhering to strict state regulations and ensuring the integrity of every draw.

**Distinguish from:**
- `lottery` (Operator Lottery): Lottery platforms are B2B software. Operator Lottery (lottery) is the licensed operator.

### esports-platforms - Esports Platforms
Esports platforms are tailored for the video gaming audience, offering betting markets on competitive events like CS:GO or League of Legends. They integrate specific data feeds, match coverage, and risk tools designed for esports titles. Many solutions include community features such as tournament hosting and live streaming directly in the bet slip to engage younger demographics who expect an interactive experience.

**Distinguish from:**
- `esports` (Operator Esports): Esports platforms are B2B technology. Operator Esports (esports) is the B2C esports betting brand.
- `esports-data-providers` (Esports Data Providers): Platforms handle the betting infrastructure. Data providers supply the live esports data feeds.
- `sportsbook-platform` (Sportsbook Platform): Esports platforms are esports-specific. Sportsbook Platform is traditional sports.

### virtual-sports-solutions - Virtual Sports Solutions
When real sporting events are unavailable, virtual sports platforms provide computer-generated simulations of football, racing, and other events. These solutions use Random Number Generators to determine results while presenting them with broadcast-quality graphics. This ensures 24/7 betting content is available to fill downtime and maintain player engagement, providing a fast-paced betting option that resolves in minutes rather than hours.

**Distinguish from:**
- `sportsbook-platform` (Sportsbook Platform): Virtual sports are computer-generated events. Sportsbook Platform handles real sporting events.
- `game-providers` (Game Providers): Virtual sports are RNG-based event simulations. Game providers create slot/casino content.

### mobile-platforms - Mobile Platforms
With the majority of betting activity occurring on smartphones, mobile platforms are optimized for touch interfaces and lightweight performance. They offer responsive web designs or standalone native apps focused on speed, UX, and secure mobile payments. These solutions handle specific challenges including geolocation compliance to ensure players are within authorized areas, providing a seamless betting experience on smaller screens.

**Distinguish from:**
- `casino-platforms` (Casino Platforms): Mobile platforms are mobile-specific tech stacks. Casino Platforms are full casino backends (mobile is a component).

### white-label-solutions - White Label Solutions
White label solutions offer a rapid route to market by bundling technology, licensing, and payment processing into a single package. This model allows businesses to launch a branded site with minimal technical setup by operating under the provider's existing infrastructure and master license. While offering speed and convenience, it typically provides less customization than a standalone license, making it ideal for marketing-led companies focusing on acquisition.

**Distinguish from:**
- `turnkey-solutions` (Turnkey Solutions): White label uses the provider's license. Turnkey lets the operator use their own license.
- `casino-platforms` (Casino Platforms): White label bundles license + platform + payments. Casino Platforms is just the tech stack.

### turnkey-solutions - Turnkey Solutions
Turnkey platforms provide a complete technical package including games, payments, and back-office tools while allowing the operator to use their own license. This delivery model offers greater control over strategy, branding, and asset value compared to white label solutions. It is designed for experienced businesses seeking long-term independence and operational flexibility, allowing them to build their own contracts with payment and game providers.

**Distinguish from:**
- `white-label-solutions` (White Label Solutions): Turnkey requires the operator to have their own license. White label provides the license too.
- `casino-platforms` (Casino Platforms): Turnkey is the complete stack including games + payments. Casino Platforms is just the platform layer.

### telegram-casino-platforms - Telegram Casino Platforms
Leveraging the vast user base of messaging apps, Telegram casino platforms allow users to bet directly within the chat interface. These solutions feature lightweight onboarding and integrated cryptocurrency wallets for instant play. They are particularly effective in emerging markets where users prefer accessible, simple interfaces over data-heavy mobile applications, offering a streamlined experience that bypasses traditional app stores.

**Distinguish from:**
- `casino-platforms` (Casino Platforms): Telegram platforms are Telegram-specific. Casino Platforms are general-purpose casino backends.
- `mobile-platforms` (Mobile Platforms): Telegram platforms run inside the Telegram app. Mobile platforms are standalone apps or responsive web.

### social-gaming-solutions - Social Gaming Solutions
Social gaming platforms offer casino-style experiences for entertainment purposes without real-money wagering. Revenue is generated through in-app purchases and advertisements rather than gambling activity. These platforms serve as powerful engagement tools to build a database of players that can eventually be funneled into real-money products once regulations allow, or simply monetized as a standalone "freemium" product.

**Distinguish from:**
- `casino-platforms` (Casino Platforms): Social gaming has no real-money wagering. Casino Platforms run real-money operations.
- `skill-games-platform` (Skill Games Platform): Social gaming is casino-style without real money. Skill games involve player ability (fantasy, trivia).

### skill-games-platform - Skill Games Platform
Skill games platforms host competitive games where player ability influences the outcome, distinguishing them from pure chance-based gambling products. These platforms support games such as fantasy sports, trivia, and strategy-based competitions. They often operate under different regulatory frameworks than traditional gambling, making them attractive for markets where standard casino licensing is restrictive.

**Distinguish from:**
- `social-gaming-solutions` (Social Gaming Solutions): Skill games involve player skill. Social gaming is casino-style without real money.
- `casino-platforms` (Casino Platforms): Skill games are skill-based. Casino Platforms run chance-based games.

### game-providers - Game Providers
Game providers create and supply the betting content that fills an operator's lobby, including slots, table games, and specialty titles. They maintain extensive portfolios and ensure all games comply with technical standards in regulated markets. High-quality content from these providers is a primary driver of player acquisition and retention, often featuring recognizable mechanics or branded themes that attract players.

**Distinguish from:**
- `game-developers` (Game Developers): Game providers are established studios with broad portfolios. Game developers may be smaller studios creating titles for aggregators.
- `game-aggregators` (Game Aggregators): Providers create games. Aggregators provide the API hub to access many providers' games.
- `live-casino-studios` (Live Casino Studios): Game providers create RNG-based games. Live casino studios stream real-dealer games.

### game-developers - Game Developers
Innovation in the sector stems from developers who design the mathematical models, themes, and mechanics for new games. These studios handle the creative and technical production of titles, often distributing them through larger aggregators. They are responsible for the unique features, such as "Buy Bonus" or "Megaways," that differentiate a game in a crowded marketplace and capture player attention.

**Distinguish from:**
- `game-providers` (Game Providers): Game developers are creators/studios. Game providers are established suppliers (often overlap, but providers have broader distribution).

### game-aggregators - Game Aggregators
Integrating game studios individually is inefficient, so aggregators provide a single API to access thousands of titles from dozens of providers. They unify reporting, compliance, and content management, allowing operators to add new providers rapidly. This hub model helps smaller developers reach a global audience without negotiating direct deals with every operator, and simplifies the technical workload for the casino.

**Distinguish from:**
- `game-providers` (Game Providers): Aggregators provide a single API for many providers. Providers supply their own games directly.
- `casino-platforms` (Casino Platforms): Aggregators only handle game content distribution. Casino Platforms run the full casino operation.

### live-casino-studios - Live Casino Studios
Live casino studios stream real-time games including blackjack and roulette using professional dealers in broadcast-quality sets. They provide the video technology, RNG-certified equipment, and player interaction tools needed for the broadcast. This sector is critical for operators aiming to offer an immersive, authentic casino atmosphere online that bridges the gap between retail and digital gaming.

**Distinguish from:**
- `game-providers` (Game Providers): Live casino studios stream real dealers. Game providers create RNG-based games.

### jackpot-solutions - Jackpot Solutions
Jackpot solutions link games together to create pooled or progressive prize funds that grow with every bet. These providers supply the technical infrastructure to manage fund accumulation and the real-time monitoring required for high-value payouts. Massive jackpots serve as powerful marketing tools for increasing player retention and excitement, often driving traffic to specific games.

**Distinguish from:**
- `game-providers` (Game Providers): Jackpot solutions are the infrastructure pooling jackpots across games. Game providers may include built-in jackpots in individual games.

### data-and-analytics - Data & Analytics
The gambling industry generates massive datasets which require specialized tools for analysis and visualization. Providers offer data warehouses and dashboards to track KPIs such as Gross Gaming Revenue (GGR), player behavior, and marketing performance. Consultants in this space also build custom reporting frameworks to audit operational strategy, helping management make evidence-based decisions to improve profitability.

**Distinguish from:**
- `ai-and-machine-learning` (AI & Machine Learning): Data & Analytics is descriptive (BI dashboards). AI/ML is predictive (models, automation).
- `cro-solutions` (CRO Solutions): Data & Analytics is general business intelligence. CRO is funnel-specific testing.

### ai-and-machine-learning - AI & Machine Learning
Artificial intelligence is utilized to personalize player experiences and manage operational risk at scale. Vendors provide algorithms for churn prediction, player segmentation, and fraud detection. Automating these complex decisions allows operators to improve efficiency and deliver tailored offers to individual users, such as recommending games based on past play history.

**Distinguish from:**
- `data-and-analytics` (Data & Analytics): AI/ML is predictive/prescriptive. Data & Analytics is descriptive reporting.
- `fraud-prevention` (Fraud Prevention): AI/ML may power fraud detection but the category is broader (CRM, content recommendations).

### sports-data-providers - Sports Data Providers
Accurate betting odds depend on fast and reliable data feeds from the field. These companies supply real-time statistics for pre-match analysis, live scores, and settlement outcomes. Sportsbooks rely on this data to power betting markets, while consultants advise on integration and data rights compliance to ensure the bookmaker has the official rights to offer bets on specific leagues.

**Distinguish from:**
- `esports-data-providers` (Esports Data Providers): Sports data covers traditional sports. Esports data covers competitive video gaming.
- `sportsbook-platform` (Sportsbook Platform): Sports data is the data feed. Sportsbook Platform is the betting engine using the data.

### esports-data-providers - Esports Data Providers
Competitive gaming requires specialized providers to track fast-paced match events and player stats. They deliver official data feeds for esports tournaments, covering in-game stats and live results. This data powers the odds generation and integrity monitoring for esports betting platforms and media sites, ensuring accurate settlements for games like Dota 2 or FIFA.

**Distinguish from:**
- `sports-data-providers` (Sports Data Providers): Esports data is for competitive video gaming. Sports data is for traditional sports.
- `esports-platforms` (Esports Platforms): Esports data is the feed. Esports Platforms are the betting infrastructure.

### cro-solutions - CRO Solutions
Conversion Rate Optimization tools focus on identifying and fixing leaks in the player acquisition funnel. They enable A/B testing on registration flows, deposit pages, and onboarding steps. The objective is to use behavioral data to remove friction and increase the percentage of visitors who become active, depositing players, directly impacting the return on marketing ad spend.

**Distinguish from:**
- `cro-consulting` (CRO Consulting): CRO Solutions are software/tools (A/B testing platforms). CRO Consulting is human advisory services.
- `data-and-analytics` (Data & Analytics): CRO is funnel-specific testing. Data & Analytics is broader BI.

### affiliate-programs - Affiliate Programs
Affiliate programs provide the structure for third-party marketers to promote a brand in exchange for commissions (CPA or Revenue Share). These systems supply tracking links, dashboards, and reporting tools to manage thousands of partners. They serve as a central pillar of player acquisition in the iGaming industry, driving traffic from review sites, streamers, and SEO portals.

**Distinguish from:**
- `affiliate-agencies` (Affiliate Agencies): Affiliate Programs are operator-run programs. Affiliate Agencies manage affiliate relationships on behalf of operators.
- `affiliate-tracking` (Affiliate Tracking): Affiliate Programs are the operator schemes. Affiliate Tracking is the software/SaaS layer.
- `affiliates` (Affiliates): Affiliate Programs are the operator side. Affiliates is the publisher/promoter side.

### affiliate-agencies - Affiliate Agencies
Managing large affiliate networks can be resource-intensive, leading many operators to outsource this function. Agencies handle the recruitment, negotiation, and compliance monitoring of publishers. They scale programs by identifying new partners and optimizing campaigns, often focusing on specific regulated markets where they have existing relationships with top affiliates.

**Distinguish from:**
- `affiliate-programs` (Affiliate Programs): Affiliate Agencies manage programs on behalf of operators. Affiliate Programs are operator-run.
- `marketing-agencies` (Marketing Agencies): Affiliate Agencies specialize in affiliate channel. Marketing Agencies cover all marketing channels.

### affiliate-tracking - Affiliate Tracking
Precise software is required to calculate commissions and attribute players correctly to the right partner. Tracking platforms monitor clicks, conversions, and player value across all traffic sources. They also include fraud detection to ensure operators do not pay for fake leads, keeping affiliate relationships transparent and profitable for both sides.

**Distinguish from:**
- `affiliate-programs` (Affiliate Programs): Affiliate Tracking is the SaaS tech. Affiliate Programs are operator-run schemes using the tech.
- `affiliate-fraud-protection` (Affiliate Fraud Protection): Affiliate Tracking calculates commissions. Affiliate Fraud Protection detects bad traffic.

### affiliates - Affiliates
Affiliates include publishers, review sites, and influencers who generate traffic for gambling operators. They drive player acquisition through SEO, paid media, or content marketing. These partners earn revenue based on the quality of the leads they provide, making them vital components of the iGaming ecosystem by acting as the primary source of new depositing players.

**Distinguish from:**
- `affiliate-agencies` (Affiliate Agencies): Affiliates are the publishers/promoters themselves. Affiliate Agencies manage relationships with affiliates.
- `affiliate-programs` (Affiliate Programs): Affiliates are publishers. Affiliate Programs are operator schemes that pay affiliates.
- `media-networks` (Media Networks): Affiliates are individual publishers/sites. Media Networks aggregate ad inventory across many publishers.

### marketing-agencies - Marketing Agencies
Full-service agencies provide integrated support covering brand identity, acquisition campaigns, and retention strategy. They adapt creative concepts to fit compliance standards and manage cross-channel initiatives. Their goal is to drive both new player acquisition and long-term brand loyalty, often handling everything from TV commercials to digital banner ads.

**Distinguish from:**
- `marketing-consulting` (Marketing Consulting): Marketing Agencies execute campaigns. Marketing Consulting provides strategy/advisory.
- `marketing-services` (Marketing Services): Marketing Agencies are full-service. Marketing Services may be specific service offerings (e.g., just media buying).
- `seo-agencies` (SEO Agencies): Marketing Agencies are multi-channel. SEO Agencies are search-specific.
- `affiliate-agencies` (Affiliate Agencies): Marketing Agencies cover all channels. Affiliate Agencies specialize in affiliate management.

### seo-agencies - SEO Agencies
Organic search is a high-value channel for player acquisition that requires specialized expertise to navigate. SEO agencies optimize technical website structures and build high-authority links to rank for competitive gambling keywords. Their services include penalty recovery and navigating search engine restrictions on gambling content to drive sustainable, low-cost traffic.

**Distinguish from:**
- `marketing-agencies` (Marketing Agencies): SEO Agencies are search-specific. Marketing Agencies are multi-channel.
- `content-and-translation` (Content & Translation): SEO Agencies optimize for ranking. Content & Translation produces localized content.

### marketing-services - Marketing Services
Agencies and consultants in this sector offer campaign planning, brand strategy, and creative production. They specialize in the nuances of the gambling industry, ensuring that media buying and sponsorship activations are effective while strictly adhering to local advertising regulations. This includes managing restrictions on where and when gambling ads can be shown to avoid regulatory fines.

**Distinguish from:**
- `marketing-agencies` (Marketing Agencies): Marketing Services may be standalone specialist offerings. Marketing Agencies are full-service.
- `marketing-tools` (Marketing Tools): Marketing Services are human services. Marketing Tools are SaaS software.

### marketing-tools - Marketing Tools
Specialized software automates the heavy lifting of acquisition and retention marketing. These tools handle campaign management, email automation, and attribution tracking. They integrate directly with the operator's back office to streamline marketing operations and improve customer engagement by delivering the right message at the right time.

**Distinguish from:**
- `marketing-services` (Marketing Services): Marketing Tools are SaaS software. Marketing Services are human services.
- `crm-platforms` (CRM Platforms): Marketing Tools cover acquisition automation. CRM Platforms cover retention/lifecycle automation.

### media-networks - Media Networks
Accessing premium advertising inventory is challenging for gambling brands due to restrictions on mainstream platforms. Media networks aggregate ad space across multiple publishers, allowing operators to buy placements at scale under a single contract. They offer targeting options and ensure ads appear only in compliance-safe environments, maximizing reach without risking brand safety.

**Distinguish from:**
- `affiliates` (Affiliates): Media Networks aggregate ad inventory. Affiliates are individual publishers/sites.
- `marketing-agencies` (Marketing Agencies): Media Networks sell inventory. Marketing Agencies buy inventory on behalf of operators.

### content-and-translation - Content & Translation
Engaging players globally requires high-quality localization rather than direct translation. Providers offer copywriting, game reviews, and technical documentation tailored to specific markets. They specialize in gambling terminology to ensure cultural accuracy and regulatory compliance in every region, ensuring terms like "wager," "bonus," and "payout" are used correctly.

**Distinguish from:**
- `creative-production-graphic-audio-and-video` (Creative Production - Graphic, Audio and Video): Content & Translation is written content. Creative Production is visual/audio/video.
- `marketing-agencies` (Marketing Agencies): Content & Translation is specialized service. Marketing Agencies are full-service.

### creative-production-graphic-audio-and-video - Creative Production - Graphic, Audio and Video
Creative production agencies deliver visual, audio, and video content tailored to the iGaming sector. Services include game marketing trailers, brand identity packages, banner ad production, and promotional video content. These firms understand the specific compliance requirements around gambling advertising and produce assets that meet regulatory standards while maintaining creative impact across multiple markets and channels.

**Distinguish from:**
- `content-and-translation` (Content & Translation): Creative Production is visual/audio/video. Content & Translation is written copy.
- `marketing-agencies` (Marketing Agencies): Creative Production is asset creation. Marketing Agencies handle full campaigns.
- `ui-ux-and-graphic-design` (UI/UX and Graphic Design): Creative Production is for marketing assets (banners, trailers). UI/UX & Graphic Design is for product interfaces.

### events-organizers - Events Organizers
Networking is a primary driver of business in the B2B iGaming sector. Event organizers host global conferences and expos where the industry gathers. They provide platforms for lead generation, thought leadership, and deal-making, offering sponsorship and exhibitor opportunities to suppliers and operators to showcase their latest products and services.

**Distinguish from:**
- `marketing-agencies` (Marketing Agencies): Events Organizers run B2B conferences/expos. Marketing Agencies handle B2C marketing.

### crm-platforms - CRM Platforms
Centralized systems for storing and analyzing player data are essential for modern operations. CRM platforms allow operators to segment audiences based on behavior and deliver personalized promotions. They are critical for managing touchpoints across web, mobile, and email to increase retention and lifetime value by keeping players active and engaged.

**Distinguish from:**
- `crm-consulting` (CRM Consulting): CRM Platforms are SaaS software. CRM Consulting is advisory.
- `crm-and-vip-management` (CRM & VIP Management): CRM Platforms manage all players. CRM & VIP Management is specifically high-value segment management.
- `marketing-tools` (Marketing Tools): CRM Platforms focus on retention/lifecycle. Marketing Tools focus on acquisition automation.

### crm-and-vip-management - CRM & VIP Management
High-value players contribute a significant portion of revenue and require a tailored management approach. This category covers tools and services used to identify VIPs and manage tiered reward programs. Strategies often involve dedicated account managers and personalized operational flows to build long-term loyalty and prevent these valuable players from switching to competitors.

**Distinguish from:**
- `crm-platforms` (CRM Platforms): VIP Management is the high-value segment. CRM Platforms cover all player segments.
- `gamification` (Gamification): VIP Management is tiered loyalty for high-rollers. Gamification is engagement mechanics for all players.

### gamification - Gamification
Gamification solutions integrate game-like mechanics such as leaderboards, achievements, and challenges into the betting experience. These tools reward player activity beyond simple wagering to increase engagement. This approach helps improve retention metrics and differentiates the brand in a competitive market by adding layers of fun and competition.

**Distinguish from:**
- `crm-and-vip-management` (CRM & VIP Management): Gamification is engagement mechanics for all players. VIP Management is tiered for high-rollers.
- `crm-platforms` (CRM Platforms): Gamification adds game mechanics. CRM Platforms manage data and messaging.

### customer-support-services - Customer Support Services
Players expect assistance 24/7, making outsourced support a key operational service. Providers supply multilingual teams to handle inquiries via live chat, email, and phone. This allows operators to scale support capacity cost-effectively and handle activity peaks during major sporting events without compromising service quality or response times.

**Distinguish from:**
- `customer-support-tools` (Customer Support Tools): Customer Support Services are outsourced teams/people. Customer Support Tools are SaaS software.

### customer-support-tools - Customer Support Tools
Efficient support operations rely on software to streamline ticket management and knowledge bases. These tools utilize AI automation to categorize queries and suggest responses. They help agents resolve issues faster and allow operators to track metrics such as response time and customer satisfaction (CSAT), ensuring high service standards.

**Distinguish from:**
- `customer-support-services` (Customer Support Services): Customer Support Tools are SaaS software. Customer Support Services are people/teams.

### payment-processing - Payment Processing
Seamless deposits and withdrawals are the foundation of player trust and retention. Payment processors handle transaction routing and settlement across multiple currencies. Reliable processing minimizes failed transactions and ensures funds move quickly, which directly impacts the operator's bottom line and reduces the likelihood of players abandoning the cashier.

**Distinguish from:**
- `payment-gateways` (Payment Gateways): Payment Processing handles routing/settlement. Payment Gateways are the secure bridge handling encryption/PCI.
- `payment-services` (Payment Services): Payment Processing is the specific routing service. Payment Services (PSPs) bundle processing + gateway + fraud.
- `e-wallet-solutions` (E-Wallet Solutions): Payment Processing is the underlying routing infrastructure. E-Wallet Solutions are a specific consumer-facing payment method.

### payment-gateways - Payment Gateways
The payment gateway serves as the secure bridge between an operator's platform and the financial network. It handles encryption and PCI DSS compliance to ensure data safety. A robust gateway supports multi-currency transactions and protects sensitive player information during transfers, acting as the technical checkpoint for all money entering or leaving the site.

**Distinguish from:**
- `payment-processing` (Payment Processing): Payment Gateways are the secure bridge (encryption/PCI). Payment Processing is routing/settlement.
- `payment-services` (Payment Services): Payment Gateways are a specific component. Payment Services (PSPs) bundle multiple components.

### payment-services - Payment Services
Payment Service Providers (PSPs) often bundle processing, gateways, and fraud protection into a single agreement. This comprehensive service simplifies financial operations by reducing the number of vendor contracts an operator needs to manage. It allows businesses to scale into new markets with a unified payment infrastructure and consolidated reporting.

**Distinguish from:**
- `payment-processing` (Payment Processing): Payment Services (PSPs) bundle multiple components. Payment Processing is the specific routing service.
- `payment-gateways` (Payment Gateways): Payment Services bundle processing + gateway + fraud. Payment Gateways are just the secure bridge component.

### e-wallet-solutions - E-Wallet Solutions
Digital wallets are a preferred payment method in iGaming due to their speed and convenience. Providers facilitate instant deposits and withdrawals while adding a layer of security. For operators, e-wallets reduce chargeback risks and provide a familiar transaction option for players who prefer not to share bank details directly with a casino.

**Distinguish from:**
- `payment-processing` (Payment Processing): E-Wallet Solutions are a specific consumer-facing payment method. Payment Processing is the underlying routing layer.
- `cryptocurrency-payments` (Cryptocurrency Payments): E-Wallets handle fiat currency. Crypto Payments handle digital assets.
- `local-payment-solutions` (Local Payment Solutions): E-Wallets are global/multi-region (Skrill, Neteller). Local Payment Solutions are region-specific (Pix, GCash).

### cryptocurrency-payments - Cryptocurrency Payments
Cryptocurrency solutions offer players privacy, speed, and lower fees compared to traditional banking. These platforms enable operators to accept Bitcoin and other digital assets with features including instant fiat conversion. They open access to new customer segments who prefer decentralized financial tools and often facilitate faster payouts than bank transfers.

**Distinguish from:**
- `e-wallet-solutions` (E-Wallet Solutions): Crypto Payments handle digital assets. E-Wallets handle fiat.
- `payment-processing` (Payment Processing): Crypto Payments are crypto-specific. Payment Processing is general fiat routing.
- `crypto` (Operator Crypto): Cryptocurrency Payments is the B2B payment infrastructure. Operator Crypto (crypto) is the B2C crypto casino brand.

### local-payment-solutions - Local Payment Solutions
Penetrating specific regional markets requires offering payment methods that locals trust and use daily. These providers aggregate regional bank transfer systems, mobile wallets, and cash vouchers. Integrating these options is crucial for success in markets such as Latin America, Asia, and Africa where international credit cards often have low acceptance rates.

**Distinguish from:**
- `e-wallet-solutions` (E-Wallet Solutions): Local Payment Solutions are region-specific (Pix in Brazil, GCash in Philippines). E-Wallets are global brands.
- `payment-processing` (Payment Processing): Local Payment Solutions aggregate regional methods. Payment Processing is the underlying routing infrastructure.

### slot-machines-manufacturers - Slot Machines Manufacturers
Manufacturers design and build the physical cabinets and hardware for land-based casinos. They combine engineering with game design to create immersive floor experiences. Many suppliers also adapt their popular retail titles for online distribution to create an omnichannel offering that allows players to play their favorite floor games on mobile.

**Distinguish from:**
- `retail-systems` (Retail Systems): Slot Machines Manufacturers build the cabinets/hardware. Retail Systems are the management software (terminals, cash management).
- `game-providers` (Game Providers): Slot Machines Manufacturers focus on physical cabinets. Game Providers create digital online content (some overlap when a manufacturer also distributes online).

### retail-systems - Retail Systems
Managing land-based betting shops or casinos requires specialized hardware and software. These systems handle betting terminals, cash management, and real-time reporting for physical locations. Modern solutions connect retail play with online accounts to create a seamless "single-wallet" experience, allowing players to bet in-store and withdraw online.

**Distinguish from:**
- `slot-machines-manufacturers` (Slot Machines Manufacturers): Retail Systems are the management/reporting layer. Slot Machines Manufacturers build the gaming hardware.
- `sportsbook-platform` (Sportsbook Platform): Retail Systems handle in-shop betting terminals. Sportsbook Platform is the online betting engine.

### software-development-services - Software Development Services
Custom software development firms build bespoke solutions for iGaming operators who need functionality beyond what off-the-shelf platforms provide. Services range from API integrations and back-office tools to full platform builds. These companies typically work on a project or retainer basis, offering expertise in gambling-specific technical requirements including regulatory compliance, real-time data processing, and high-availability architecture.

**Distinguish from:**
- `casino-platforms` (Casino Platforms): Software Development is bespoke project work. Casino Platforms are product SaaS.
- `ui-ux-and-graphic-design` (UI/UX and Graphic Design): Software Development is full-stack engineering. UI/UX is interface design specifically.

### ui-ux-and-graphic-design - UI/UX and Graphic Design
The interface design directly impacts player conversion and retention rates. Specialized agencies create intuitive, compliant layouts that simplify navigation and betting. They balance attractive branding with the functional requirements of complex betting slips and game lobbies to maximize usability and ensure players can find their favorite games easily.

**Distinguish from:**
- `creative-production-graphic-audio-and-video` (Creative Production - Graphic, Audio and Video): UI/UX is for product interfaces. Creative Production is for marketing assets (banners, trailers).
- `software-development-services` (Software Development Services): UI/UX is interface/visual design. Software Development is engineering implementation.

### hosting-services - Hosting Services
High-traffic gambling sites require robust infrastructure to ensure uptime and speed. Hosting providers deliver secure cloud or server solutions configured to withstand cyber threats like DDoS attacks. They also offer geo-specific hosting to meet data residency laws in regulated jurisdictions where servers must be physically located within the country.

**Distinguish from:**
- `software-development-services` (Software Development Services): Hosting Services are infrastructure (servers, cloud). Software Development is the application code.

### elearning-solutions - Elearning Solutions
Training staff on compliance is a mandatory regulatory requirement in most jurisdictions. E-learning platforms deliver online courses on topics including AML, responsible gaming, and customer service. They allow operators to track employee certifications and use gamification to make training more effective, ensuring the workforce remains compliant with evolving laws.

**Distinguish from:**
- `compliance-and-regulatory-services` (Compliance & Regulatory Services): E-Learning Solutions train staff. Compliance Services are advisory/managed services.

### operator - Operator (Generic)
A generic iGaming operator category for B2C companies licensed to provide online gambling services to the public. Use this only when the operator does not have a clear single-vertical product focus AND is not specifically multi-product. Most operators fit one of the more specific operator categories below (Casino, Sportsbook, Poker, etc.) or the Multi-Product category. This category exists as a fallback.

**Distinguish from:**
- `multi-product` (Operator Multi-Product): Use Multi-Product when the operator clearly spans multiple verticals (casino + sportsbook + poker). Use Operator only when classification is unclear.
- `casino` (Operator Casino): Use Operator Casino if the operator is primarily a casino. Use Operator only as last resort.

### multi-product - Operator Multi-Product
Multi-product operators combine multiple gambling verticals under a single brand and platform, typically offering casino, sportsbook, poker, and live dealer products together. This approach allows cross-selling between verticals and provides a unified player wallet experience. The strategy maximizes lifetime value by catering to diverse player preferences within one ecosystem.

**Distinguish from:**
- `operator` (Operator (Generic)): Multi-Product is for operators clearly spanning multiple verticals. Operator (Generic) is a fallback when classification is unclear.
- `casino` (Operator Casino): Multi-Product spans multiple verticals. Operator Casino is for operators primarily focused on casino.
- `sportsbook` (Operator Sportsbook): Multi-Product spans multiple verticals. Operator Sportsbook is for operators primarily focused on sports betting.

### casino - Operator Casino
Online casino operators specialize in digital gaming verticals such as slots, live dealer tables, and RNG games. They prioritize user experience and game variety to attract players. Their strategy focuses heavily on retention marketing and VIP management in a highly competitive sector, often competing on the quality of their loyalty programs and game library.

**Distinguish from:**
- `casino-platforms` (Casino Platforms): Operator Casino is the B2C brand running the casino. Casino Platforms is the B2B technology provider.
- `multi-product` (Operator Multi-Product): Use Operator Casino when casino is the clear primary focus. Use Multi-Product when the operator equally serves multiple verticals.
- `crypto` (Operator Crypto): Operator Casino is fiat-focused or mixed. Operator Crypto is crypto-first/crypto-only casino brands.
- `sportsbook` (Operator Sportsbook): Operator Casino focuses on casino games. Operator Sportsbook focuses on sports betting (some operators do both - then use Multi-Product).

### sportsbook - Operator Sportsbook
Sportsbook operators focus on providing betting markets for real-world sporting events. Success depends on offering competitive odds, market depth, and a fast live betting product. They often invest in data partnerships and live streaming to enhance the betting experience, aiming to capture the engagement of sports fans during matches.

**Distinguish from:**
- `sportsbook-platform` (Sportsbook Platform): Operator Sportsbook is the B2C brand. Sportsbook Platform is the B2B technology.
- `multi-product` (Operator Multi-Product): Use Operator Sportsbook when sports betting is the clear primary product. Use Multi-Product if equally focused on casino too.
- `racing` (Operator Racing): Operator Sportsbook covers all sports. Operator Racing specifically covers horse/greyhound betting (some overlap).

### poker - Operator Poker
Poker operators manage online card rooms, focusing on player liquidity and game integrity. They organize tournaments and cash games, ensuring sufficient traffic for games to run at all hours. Many participate in larger poker networks to pool liquidity and offer a secure environment where players feel safe from collusion or bots.

**Distinguish from:**
- `poker-platforms` (Poker Platforms): Operator Poker is the B2C brand. Poker Platforms is the B2B software.
- `multi-product` (Operator Multi-Product): Use Operator Poker when poker is the clear primary product (e.g., PokerStars). Use Multi-Product if casino is equally featured.

### bingo - Operator Bingo
Bingo operators build their brands around the social and community aspects of the game. They integrate chat functionality and side games to maintain engagement during draws. These operators appeal to a broad demographic and often use bingo as a gateway to cross-sell other casino products, fostering a strong sense of community among players.

**Distinguish from:**
- `bingo-platforms` (Bingo Platforms): Operator Bingo is the B2C brand. Bingo Platforms is the B2B software.
- `multi-product` (Operator Multi-Product): Use Operator Bingo when bingo is the clear primary product. Use Multi-Product if casino is equally featured.

### lottery - Operator Lottery
Licensed lottery operators manage the sale of tickets and the distribution of prizes for draw-based games. They often work with government monopolies or under specific concessions. These operators bring traditional lottery products to a digital audience while adhering to strict state regulations regarding ticket sales and prize payouts.

**Distinguish from:**
- `lottery-platforms` (Lottery Platforms): Operator Lottery is the licensed operator. Lottery Platforms is the B2B software.

### esports - Operator Esports
Esports operators target the video gaming community by offering betting on competitive tournaments like The International or Worlds. They combine betting markets with community features such as live streaming. Success in this niche requires understanding the nuances of different game titles and the preferences of younger demographics who may not bet on traditional sports.

**Distinguish from:**
- `esports-platforms` (Esports Platforms): Operator Esports is the B2C brand. Esports Platforms is the B2B technology.
- `sportsbook` (Operator Sportsbook): Operator Esports focuses on competitive video gaming. Operator Sportsbook focuses on real sports (some sportsbooks offer esports - use Multi-Product or Sportsbook depending on focus).

### racing - Operator Racing
Racing operators specialize in horse and greyhound wagering, providing deep data and video feeds. They cater to a knowledgeable player base that values detailed form guides and track conditions. Their platforms support specific betting types such as pool betting and pari-mutuel wagering, often distinct from fixed-odds sportsbooks.

**Distinguish from:**
- `sportsbook` (Operator Sportsbook): Operator Racing is racing-specialist. Operator Sportsbook covers all sports broadly (often includes racing).

### crypto - Operator Crypto
Crypto casinos operate primarily using blockchain technology, offering deposits and gameplay in digital currencies. They appeal to players seeking privacy, speed, and transparency. Many feature "provably fair" games that allow users to verify the randomness of every outcome, creating a distinct niche separate from traditional fiat-based sites.

**Distinguish from:**
- `cryptocurrency-payments` (Cryptocurrency Payments): Operator Crypto is the B2C crypto casino brand. Cryptocurrency Payments is the B2B payment infrastructure.
- `casino` (Operator Casino): Operator Crypto is crypto-first/crypto-only. Operator Casino is fiat-focused or mixed.

---

## Document Information

| Field | Value |
|-------|-------|
| Total Categories | 83 |
| Version | 2.0 |
| Last Updated | May 2026 |
| Source of Truth | This file (alongside companion `dir-categories.md` for internal codes) |
| Cardinality | 1-3 per article. ONE primary required. |
| Primary Selection | See `rules/primary-triage.md` |
| URL Pattern | https://onlyigaming.com/categories/{slug} |
| Used By | AI tagging prompt, content-analyzer, editorial classification, company profile suggestions |
| Changelog | v2.0: Operator category display names updated (Operator Casino, Operator Poker, etc.) with slugs unchanged. Added Distinguish-from sections for boundary cases. Grouped categories logically. Aligned with `dir-categories.md` DIR-001 to DIR-083 internal codes. |
