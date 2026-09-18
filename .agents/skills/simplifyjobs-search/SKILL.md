---
name: simplifyjobs-search
version: 1.0.0
description: >
  Use this skill to search the SimplifyJobs/New-Grad-Positions GitHub repo - a
  crowdsourced, daily-updated list of new-grad roles in Software Engineering,
  Data Science/AI/ML, Product Management, Quantitative Finance, Hardware
  Engineering, and Other categories, covering the US and Canada. Trigger
  phrases: new grad jobs, SimplifyJobs, new grad software engineer roles, new
  grad data science jobs, entry level new grad positions, 2026/2027 new grad
  roles, look up this SimplifyJobs posting.
context: fork
enabled: true
allowed-tools: Bash(bun run .agents/skills/simplifyjobs-search/cli/src/cli.ts *)
---

# SimplifyJobs New-Grad-Positions Search Skill

Search the [SimplifyJobs/New-Grad-Positions](https://github.com/SimplifyJobs/New-Grad-Positions)
GitHub repo's README - a community-maintained list of full-time new-grad roles,
updated daily. No authentication, no API key, **zero runtime dependencies** -
it runs with just `bun`.

## How this portal is different from the others

Every other portal skill in this repo talks to a job board's own search API.
This one doesn't have one to talk to:

- **No query/location search endpoint.** The whole "database" is one big
  README.md rendered as HTML tables (one per category). `search` fetches the
  raw README once per call and filters the parsed rows client-side.
- **No job-description endpoint.** Each row only links to the employer's own
  application page (Greenhouse, Workday, SmartRecruiters, iCIMS, Lever, Ashby,
  or a custom site - a different platform per company). `detail` does a
  best-effort generic fetch of that page and strips HTML tags. There is no
  per-ATS parser, and many of these pages render their real content
  client-side in JavaScript - a `null` description with a `descriptionNote`
  explaining why is a common, honest result, not a bug.
- **Ages, not dates.** The source gives a relative age ("0d", "7d", "1mo"),
  not an absolute posting date. The CLI converts this to an approximate
  `YYYY-MM-DD` at fetch time - treat it as approximate, not exact.
- **A legend of emoji flags** some rows: 🛂 no sponsorship, 🇺🇸 requires US
  citizenship, 🔒 closed, 🔥 FAANG+, 🎓 advanced degree required. The CLI
  strips these from the title and surfaces them in a `flags` array instead -
  useful signal for the Eligibility Gate in
  `.claude/skills/job-application-assistant/04-job-evaluation.md`. 🔒 (closed)
  rows are excluded from `search` by default.

This is public data - the repo exists specifically to be shared and consumed -
fetched via GitHub's own `raw.githubusercontent.com` (no robots.txt
restriction on it), not scraped from the rendered page. Still, keep volume
reasonable: every `search` or `detail` call fetches the whole README
(1-2 MB).

## Commands

### Search job listings

```bash
bun run .agents/skills/simplifyjobs-search/cli/src/cli.ts search [flags]
```

Key flags:
- `--query <text>` / `-q <text>` - keyword search, matched against title + company. Optional.
- `--location <text>` / `-l <text>` - substring match against the posting's location text (e.g. `"Calgary"`, `"Canada"`, `"Remote"`). Optional.
- `--category <slug>` - scope to one section: `software-engineering`, `product-management`, `data-science-ai-machine-learning`, `quantitative-finance`, `hardware-engineering`, `other`. Omit for all sections.
- `--jobage <days>` - posted within N days, derived from the source's relative age column. Approximate.
- `--include-closed` - include rows marked 🔒 closed. Default: excluded.
- `--page <n>` - 1-indexed page (25 results/page). Default 1.
- `--limit <n>` / `-n <n>` - cap results emitted (client-side, applied after paging).
- `--format json|table|plain` - default `json`.

### Fetch a posting's application page (best-effort)

```bash
bun run .agents/skills/simplifyjobs-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the id from a `search` result, or the posting's own `url`. Re-fetches
the current README to resolve the row, then best-effort fetches the real
application page and strips it to plain text. If that page is JavaScript-
rendered (common with Workday in particular), `description` comes back `null`
with a `descriptionNote` explaining why - open the URL directly in that case.

## Usage examples

```bash
# Software/data roles in Calgary, table view
bun run .agents/skills/simplifyjobs-search/cli/src/cli.ts search -q "software engineer" -l "Calgary" --format table

# Everything in the Data Science/AI/ML category, anywhere in Canada
bun run .agents/skills/simplifyjobs-search/cli/src/cli.ts search --category data-science-ai-machine-learning -l Canada --format table

# Data engineer roles posted in the last 14 days
bun run .agents/skills/simplifyjobs-search/cli/src/cli.ts search -q "data engineer" --jobage 14 --format table

# UX/design roles, all categories
bun run .agents/skills/simplifyjobs-search/cli/src/cli.ts search -q "UX designer" --format table

# Full detail on a specific posting
bun run .agents/skills/simplifyjobs-search/cli/src/cli.ts detail <id> --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default - programmatic use, passing ids to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- Data source: `https://raw.githubusercontent.com/SimplifyJobs/New-Grad-Positions/dev/README.md`, the repo's `dev` branch (its default branch).
- No authentication required; no per-call cost.
- The category list is derived from the README's own `## <emoji> <Name> New Grad Roles` headings at parse time, not hardcoded - a renamed or added section keeps working without a CLI update.
- `id` is a pure function of company + title + application URL (`<company-slug>_<title-slug>-<hash>`), so the same posting always gets the same id across runs.
- If SimplifyJobs restructures the README's table markup, parsing will silently return fewer/garbled results rather than erroring - check `/scrape health simplifyjobs` periodically (Step 4.75 in the job-scraper skill).
