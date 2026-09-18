# Search Queries for Job Scraper

<!-- SETUP: Customize these queries based on your skills, target roles, and location -->

## Installed portal CLIs (primary for `/scrape`)

`/scrape` discovers every portal skill under `.agents/skills/*/SKILL.md` and runs its CLI first. Shipped country-agnostic CLIs include `linkedin-search` and `freehire-search`; Danish demos and any skill you add with `/add-portal` are included the same way. You do **not** need a matching `site:` line below for those CLIs to run.

**Indeed** was requested during `/setup` as an additional North American board - scaffold it with `/add-portal` (not yet installed under `.agents/skills/`). Until then, Indeed coverage falls back to the `site:` WebSearch templates below.

**`simplifyjobs-search`** (added via `/add-portal`, 2026-09-15) searches the crowdsourced [SimplifyJobs/New-Grad-Positions](https://github.com/SimplifyJobs/New-Grad-Positions) GitHub repo - new-grad roles across Software Engineering, Data Science/AI/ML, Product Management, Quant Finance, Hardware, and Other. **Portal-specific override: always pass `--jobage 7` for this portal, not the default 14-day window** - the user asked to keep this source scoped to postings under a week old, since it is high-volume and daily-updated. No `--location` support (it filters on a substring match instead); combine `-q` with a city/region term the way `jobindex-search` does. See `.agents/skills/simplifyjobs-search/SKILL.md` for the full flag reference (including `--category` to scope to one section).

**`zapplyjobs-search`** (added via `/add-portal`, 2026-09-15) searches the crowdsourced [zapplyjobs/New-Grad-Jobs-2027](https://github.com/zapplyjobs/New-Grad-Jobs-2027) GitHub repo - new-grad **US-only** roles across Software Engineering, Data/AI & Research, Security Engineering, Hardware & Systems Engineering, Business & Operations, and Other. **Portal-specific override: always pass `--jobage 7` for this portal, not the default 14-day window** - same reasoning as `simplifyjobs-search` (high-volume, updated roughly every 10 minutes). Has a real `--sponsor-only` flag (backed by the source's own Visa column) - useful given the candidate has no US work authorization; a blank Visa cell means "not stated," not "no sponsorship," so don't treat the absence of the flag as a rejection signal. No `--location` support (substring match, same as `simplifyjobs-search`). See `.agents/skills/zapplyjobs-search/SKILL.md` for the full flag reference.

**`zapplyjobs-canada-search`** (added via `/add-portal`, 2026-09-15) searches the crowdsourced [zapplyjobs/Canada-Jobs-2027](https://github.com/zapplyjobs/Canada-Jobs-2027) GitHub repo - entry-level/new-grad **Canada-only** roles across Software Engineering, Hardware & Systems, Data Science & Analytics, AI/ML, Operations & Support, and Other Tech Roles. **Portal-specific override: always pass `--jobage 7` for this portal, not the default 14-day window** - this one matters more than on the sibling repos, since this source has **no built-in freshness cap of its own** (postings range from minutes to 24+ months old, vs. the US sibling's ~2-week curation) - without `--jobage 7`, a run would surface very stale postings. Some rows have a literal "Date unknown" posted value (no computed date, excluded whenever `--jobage` is set). Same `--sponsor-only`/Visa-column semantics as `zapplyjobs-search`, though less critical here since the candidate doesn't need Canadian sponsorship. No `--location` support (substring match). See `.agents/skills/zapplyjobs-canada-search/SKILL.md` for the full flag reference.

**`speedyapply-search`** (added via `/add-portal`, 2026-09-15) searches [speedyapply/2027-SWE-College-Jobs](https://github.com/speedyapply/2027-SWE-College-Jobs)'s `NEW_GRAD_USA.md` - crowdsourced, daily-updated **US-only** new-grad SWE roles across just 3 categories: FAANG+, Quant, Other. **Portal-specific override: always pass `--jobage 7` for this portal, not the default 14-day window** - same reasoning as the other GitHub-README portals (no freshness cap of its own; ages up to 100+ days observed live). Carries a genuine **Salary** column (e.g. `$381k/yr` on Quant postings like Five Rings/Citadel/Jane Street) in the FAANG+ and Quant categories - a direct, concrete signal for the candidate's "high compensation relative to location" preference, more useful here than anywhere else in the portal lineup. Apply links go straight to the employer's ATS (no aggregator redirect layer, unlike the `zapplyjobs-*` skills). No `--location` support (substring match); no `--sponsor-only` (this source has no Visa column). See `.agents/skills/speedyapply-search/SKILL.md` for the full flag reference (including `--category faang|quant|other`).

The `site:` query templates in this file are the **WebSearch fallback** — for portals without a CLI, company career pages, or when a CLI fails.

**Language scope:** write every query category in every language listed in your CLAUDE.md Languages table (typically 1-2, sometimes more). A posting requiring a language you have *not* declared, as a job condition, is excluded before scoring; a posting requiring a *higher level* than you declared in a language you *do* work in is flagged for your own judgment, not excluded — see `04-job-evaluation.md`'s Language Gate, the single source of truth for this rule. Translate each category's keywords rather than machine-translating word-for-word (e.g. "Frontend Developer" -> "Desarrollador Frontend", not a literal word-for-word translation) if you work in more than one language.

Fion works in English only, so all query categories below are in English only.

## Search Sites

Primary (general job boards):
- **indeed.com** - large general job board covering Canada and the US (requested at setup; scaffold via `/add-portal` for a CLI, `site:` fallback used until then)
- **linkedin.com/jobs** - LinkedIn job listings (filter: Canada / United States); also covered by `linkedin-search` CLI
- **freehire** - covered by `freehire-search` CLI

Secondary (company career pages via Google):
- Direct Google searches with `site:` filters for the target companies listed below

## Target Companies

Companies to specifically monitor for openings, per `/setup`:

**Big Tech (FAANG/MAANG):** Meta, Apple, Amazon, Netflix, Google, Microsoft

**AI / dev-tools / infrastructure startups (Redpoint Infrared 100-style list):**
Abnormal, Anthropic, Antithesis, Applied Compute, Arctic Wolf, Armadin, Baseten, Blacksmith, Braintrust, Browserbase, Chainguard, ClickHouse, Cockroach Labs, Code Storage, CodeMetal, Coder, Cogent Security, Cognition, Cribl, Cursor, Cyera, Dash0, Databricks, David AI, Daytona, dbt Labs, Deeptune, Depthfirst, Docker, Dragonfly, Dux, E2B, ElevenLabs, Emergent, Eon, ERSC, Exa, Fable, Factory, Fal, Fireworks, Fleet, Gambit, Gimlet Labs, Glean, Glow, Grafana Labs, Herald, Hex, Hightouch, Imper, Inferact, Irregular Labs, Island, Jetstream, Judgment Labs, Keycard, Langchain, Legion, LiveKit, Lovable, Mercor, Meticulous AI, Mistral AI, Modal, n8n, Nexthop AI, Omni, OpenAI, OpenRouter, Parallel Web Systems, Patronus, Poolside, Postman, Prime Intellect, Push Security, Railway, Raindrop AI, Reactor, Redis, Reducto, Render, Replit, Restate, Revel, Sail Research, ScaleOps, Semgrep, Serval, Sphinx AI, Stripe, Sublime Security, Supabase, Surge, Tailscale, Temporal, Tenzai, Together AI, Trajectory, Traversal, Turbopuffer, Vapi, Vast, Vega, Vercel, WisdomAI, Zed

When running a company-focused search, combine `site:linkedin.com/jobs "<Company>"` or `site:<company-careers-domain>` with the role titles from Priority 1/2 below.

## Query Categories

Queries are grouped by priority. Combine each query with your location terms where the site supports it.

**Organize by function, not job title.** The same underlying work carries different titles across companies and markets. Fion is explicitly open to both the software/data-engineering direction and the UX/UI-design direction (new-grad, flexible), and does **not** want research-only roles — only industry/shipped-product roles.

### Priority 1: Software & Data Development

Fion's strongest and most desired career direction - building and shipping software and data systems.

```
site:indeed.com "Software Developer" Calgary
site:indeed.com "Software Engineer" Calgary
site:indeed.com "Data Developer" Calgary
site:indeed.com "Data Engineer" Calgary
site:indeed.com "Full-Stack Developer" Calgary
site:linkedin.com/jobs "Software Engineer" Canada
site:linkedin.com/jobs "Data Engineer" Canada
site:linkedin.com/jobs "Full-Stack Engineer" Canada
```

### Priority 2: UX/UI & Design Engineering

Fion's HCI/design-focused direction - equally desired, not a fallback.

```
site:indeed.com "UX Designer" Calgary
site:indeed.com "UI Designer" Calgary
site:indeed.com "Design Engineer" Calgary
site:linkedin.com/jobs "UX/UI Designer" Canada
site:linkedin.com/jobs "Design Engineer" Canada
```

### Priority 3: Adjacent Roles

Roles Fion could pivot into, given the data-engineering + HCI/design combination.

```
site:indeed.com "Product Engineer" Calgary
site:indeed.com "Developer Relations" Canada
site:linkedin.com/jobs "Frontend Engineer" Canada
site:linkedin.com/jobs "Platform Engineer" Canada
```

### Priority 4: Broader Technical (wider net)

```
site:indeed.com "Software Developer" "new grad" Canada
site:linkedin.com/jobs "Software Engineer" "new grad" Canada
site:linkedin.com/jobs "Software Engineer" "entry level" United States
```

## Location Filter

- **Ideal:** Calgary, Alberta (home base) - on-site, hybrid, or remote
- **Acceptable:** Remote roles anywhere in Canada; Vancouver, BC (on-site/hybrid/relocation)
- **Flag - requires sponsorship:** San Francisco, Seattle, New York City (US roles) - Fion is a Canadian citizen/PR with **no US work authorization**; only include these if the posting mentions visa sponsorship or is silent on it (flag per the Eligibility Gate in `04-job-evaluation.md`), never if it names a citizenship/PR requirement
- **Too far:** Any location outside Canada/US requiring relocation with no stated sponsorship or remote option

## Language Filter

Your working languages and levels are in CLAUDE.md's Languages table (English, Native/Fluent). When filtering scraped results, apply `04-job-evaluation.md`'s Language Gate: a posting requiring a language you haven't declared at all is excluded; a posting requiring a higher level than you declared in a language you do work in is not excluded, flag it clearly instead. Postings simply *written* in a language you don't work in, that don't require it on the job, are fine. In practice, English-only means almost no postings hit the FAIL branch of this gate - watch instead for postings requiring French (e.g. federal government roles) or another language as a job condition.

## Date Filter

Only include jobs posted within the last 14 days, or with an application deadline that has not yet passed. If a posting date cannot be determined, include it but flag as "date unknown".

## Deal-breakers (apply during Quick Fit Assessment / `/rank`)

- No defense companies / defense-sector contractors
- Prefer roles with compensation that is high relative to the role's specific location's cost of living, not just nominally high

## Adapting Queries

If the user specifies a focus area, select queries from the matching category and also generate 2-3 custom queries for that focus. For example:
- "/scrape data" -> Priority 1 queries + custom data-engineering-specific queries
- "/scrape design" -> Priority 2 queries + custom UX/UI-specific queries
- "/scrape [Company Name]" -> combine that company with Priority 1/2 role titles per the Target Companies section above
