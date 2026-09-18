---
name: speedyapply-search
version: 1.0.0
description: >
  Use this skill to search the speedyapply/2027-SWE-College-Jobs GitHub
  repo's NEW_GRAD_USA.md - a crowdsourced, daily-updated list of US new-grad
  SWE roles across FAANG+, Quant, and Other categories, with real salary
  figures. Trigger phrases: new grad SWE jobs US, speedyapply, FAANG new grad
  jobs, quant new grad jobs, new grad software engineer salary, 2027 college
  jobs, look up this speedyapply posting.
context: fork
enabled: true
allowed-tools: Bash(bun run .agents/skills/speedyapply-search/cli/src/cli.ts *)
---

# speedyapply 2027-SWE-College-Jobs (NEW_GRAD_USA.md) Search Skill

Search [speedyapply/2027-SWE-College-Jobs](https://github.com/speedyapply/2027-SWE-College-Jobs)'s
`NEW_GRAD_USA.md` - a crowdsourced, daily-updated list of **US** new-grad SWE
roles. No authentication, no API key, **zero runtime dependencies** - it runs
with just `bun`.

## How this portal is different from the others

Same family (a GitHub-README-style Markdown source, not a job-board API) as
`simplifyjobs-search` and the `zapplyjobs-*` skills, but with real
differences worth knowing:

- **Only 3 categories, and they're simpler:** FAANG+, Quant, Other. Fewer
  moving parts than the SimplifyJobs/zapplyjobs category sets.
- **A genuine Salary column** - real figures like `$242k/yr`, `$381k/yr` -
  present in FAANG+ and Quant, absent in Other. This is a direct, valuable
  signal for a "high compensation relative to location" preference, and the
  parser reads each section's own header row to map column name → index
  (rather than a fixed position) so a missing/reordered column degrades
  gracefully instead of misreading data into the wrong field.
- **Apply links point directly at the employer's ATS** (Greenhouse, Lever,
  Ashby, Workday, amazon.jobs, a company's own careers page, ...) - unlike
  the `zapplyjobs-*` skills, there is no aggregator redirect layer to
  resolve first, so `detail` has one less failure mode to guard against.
- **Age is whole days only** (`0d`, `34d`, observed up to 100+ days) - no
  minutes/hours granularity, and **no freshness cap of its own**: use
  `--jobage` if you want a tighter window (search-queries.md records a
  `--jobage 7` override for this portal, same as the sibling GitHub-README
  portals).
- **US new-grad roles only, and only the USA file.** The same repo also has
  `INTERN_USA.md`, `NEW_GRAD_INTL.md`, and `INTERN_INTL.md` - not covered by
  this skill. A future `/add-portal` run could add those as siblings.

This is public data - fetched via GitHub's own `raw.githubusercontent.com`
(no robots.txt restriction on it), not scraped from a rendered page. Keep
volume reasonable: every `search` or `detail` call fetches the whole file.

## Commands

### Search job listings

```bash
bun run .agents/skills/speedyapply-search/cli/src/cli.ts search [flags]
```

Key flags:
- `--query <text>` / `-q <text>` - keyword search, matched against title + company. Optional.
- `--location <text>` / `-l <text>` - substring match against the posting's location text (e.g. `"Seattle"`, `"San Francisco"`, `"New York"`, `"Remote"`). Optional.
- `--category <slug>` - scope to one section: `faang`, `quant`, `other`. Omit for all sections.
- `--jobage <days>` - posted within N days, derived from the source's relative "Age" column (whole days). Approximate.
- `--page <n>` - 1-indexed page (25 results/page). Default 1.
- `--limit <n>` / `-n <n>` - cap results emitted (client-side, applied after paging).
- `--format json|table|plain` - default `json`.

### Fetch a posting's application page (best-effort)

```bash
bun run .agents/skills/speedyapply-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the id from a `search` result, or the posting's own `url` (a direct
ATS link). Re-fetches the current file to resolve the row, fetches the Apply
URL directly, and extracts `og:description` when present, else a generic
strip-tags pass. If neither yields substantial text (common on heavily
client-rendered ATS pages), `description` is `null` with a `descriptionNote`
explaining why.

## Usage examples

```bash
# Software engineer roles in Seattle, table view (with salary)
bun run .agents/skills/speedyapply-search/cli/src/cli.ts search -q "software engineer" -l "Seattle" --format table

# Everything in Quant (high comp, high bar - useful for a candidate open to quant-adjacent data roles)
bun run .agents/skills/speedyapply-search/cli/src/cli.ts search --category quant --format table

# Roles posted in the last 7 days (this source has no freshness cap of its own)
bun run .agents/skills/speedyapply-search/cli/src/cli.ts search -q "engineer" --jobage 7 --format table

# Full detail on a specific posting
bun run .agents/skills/speedyapply-search/cli/src/cli.ts detail <id> --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default - programmatic use, passing ids to `detail` |
| `table` | Quick human-readable scanning (includes a SALARY column) |
| `plain` | Reading a single job's full detail (`detail` command) |

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- Data source: `https://raw.githubusercontent.com/speedyapply/2027-SWE-College-Jobs/main/NEW_GRAD_USA.md`, the repo's `main` (default) branch.
- No authentication required; no per-call cost.
- The category list is derived from the file's own `### <Name>` headings at parse time (filtered to only those with a real `| Company |` table - the file also has non-table navigation headings), not hardcoded.
- `id` is a pure function of company + title + apply URL (`<company-slug>_<title-slug>-<hash>`), so the same posting always gets the same id across runs.
- A `Location` cell can carry a `+N` suffix (e.g. `"Houston, TX +2"`) meaning N additional locations exist that the source does not name individually - the CLI keeps this as-is in the `location` field rather than fabricating the unlisted cities.
- If speedyapply restructures the file's table markup, parsing will silently return fewer/garbled results rather than erroring - check `/scrape health speedyapply` periodically (Step 4.75 in the job-scraper skill).
