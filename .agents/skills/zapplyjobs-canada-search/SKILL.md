---
name: zapplyjobs-canada-search
version: 1.0.0
description: >
  Use this skill to search the zapplyjobs/Canada-Jobs-2027 GitHub repo - a
  crowdsourced, live-updated list of entry-level/new-grad Canadian roles
  across Software Engineering, Hardware & Systems, Data Science & Analytics,
  AI/ML, Operations & Support, and Other Tech Roles categories. Trigger
  phrases: new grad jobs Canada, zapply Canada, entry level jobs Canada, new
  grad software engineer roles Canada, new grad data jobs Canada, 2026/2027
  new grad Canadian roles, emplois nouveaux diplômés Canada, look up this
  zapply Canada posting.
context: fork
enabled: true
allowed-tools: Bash(bun run .agents/skills/zapplyjobs-canada-search/cli/src/cli.ts *)
---

# zapplyjobs Canada-Jobs-2027 Search Skill

Search the [zapplyjobs/Canada-Jobs-2027](https://github.com/zapplyjobs/Canada-Jobs-2027)
GitHub repo's README - a community-maintained list of entry-level/new-grad
**Canadian** roles, updated live. No authentication, no API key, **zero
runtime dependencies** - it runs with just `bun`.

## How this portal is different from the others

This is the same family/tooling as `zapplyjobs-search` (the US-only sibling
skill) and `simplifyjobs-search` (a different GitHub-README-backed portal),
but with real differences worth knowing:

- **No built-in freshness cap.** The US sibling repo stays roughly under 2
  weeks old by the source's own curation; this Canadian repo's postings range
  from minutes old to 24+ months old. `--jobage` is not applied for you -
  set it explicitly if you want a tighter window (the job-scraper skill's
  search-queries.md records a `--jobage 7` override for this portal).
- **A "Posted" cell can read the literal text "Date unknown".** The age
  parser (`ageToDate` in `cli/src/helpers.ts`) does not guess at these - they
  get `date: null`, same as any other unparseable format, and are excluded
  whenever `--jobage` is set (nothing to compare against) but included when
  it is omitted.
- **Plain Markdown table, not embedded HTML.** Each category lives inside a
  `<details><summary><h3>... <strong>Name</strong></h3></summary>` block
  wrapping a normal `| Company | Role | Location | Posted | Visa | Apply |`
  GFM table - no `<tr>`/`<td>` tags to parse.
- **A real Visa/sponsorship column**, not an occasional legend emoji: each
  row is either explicitly "✅ Sponsor" or blank. Blank means *not stated*,
  not confirmed non-sponsorship - `--sponsor-only` filters to confirmed
  sponsors on purpose, leaving everything else unfiltered by default. Since
  the candidate is a Canadian citizen/PR, this column matters less here than
  on the US sibling skill, but still useful for roles that explicitly note
  they *don't* sponsor a *different* permit type, or for cross-border teams.
- **Apply links redirect through `zapply.jobs`** rather than pointing at the
  employer's ATS directly. A normal `fetch()` with `redirect: "follow"`
  usually resolves them to the real posting page, but a stale link
  redirects back into zapply.jobs's own generic jobs page instead of
  erroring - `detail` detects this (`isUnresolvedZapplyUrl`, the post-redirect
  URL is still on `zapply.jobs`) and returns `null` rather than risking
  zapply.jobs's own marketing copy being presented as the job description
  (this exact failure mode was caught live while building the sibling
  `zapplyjobs-search` skill, on an Ashby-backed posting).
- **`detail` tries `og:description` first**, before falling back to a
  generic strip-tags pass - many ATS pages (Workday especially) populate
  that meta tag server-side even when the visible body is client-rendered,
  so it materially improves extraction quality. A `null` description with a
  `descriptionNote` is still a normal, honest outcome when neither source
  has enough text.
- **Canada roles only.** Unlike `simplifyjobs-search` (which has some Canada
  coverage alongside the US), this repo is Canada-only; use `zapplyjobs-search`
  for the US-only sibling list.

This is public data - the repo exists specifically to be shared and consumed
- fetched via GitHub's own `raw.githubusercontent.com` (no robots.txt
restriction on it), not scraped from the rendered page. `zapply.jobs` itself
also allows `/` broadly in its robots.txt. Still, keep volume reasonable:
every `search` or `detail` call fetches the whole README.

## Commands

### Search job listings

```bash
bun run .agents/skills/zapplyjobs-canada-search/cli/src/cli.ts search [flags]
```

Key flags:
- `--query <text>` / `-q <text>` - keyword search, matched against title + company. Optional.
- `--location <text>` / `-l <text>` - substring match against the posting's location text (e.g. `"Calgary"`, `"Toronto"`, `"Vancouver"`, `"Remote"`). Optional.
- `--category <slug>` - scope to one section: `software-engineering`, `hardware-systems`, `data-science-analytics`, `ai-ml`, `operations-support`, `other-tech-roles`. Omit for all sections.
- `--jobage <days>` - posted within N days, derived from the source's relative age column (minutes/hours/days/weeks/months). Approximate; rows with an unparseable age (including the literal "Date unknown") are excluded when this flag is set.
- `--sponsor-only` - only rows explicitly marked "✅ Sponsor". Default off.
- `--page <n>` - 1-indexed page (25 results/page). Default 1.
- `--limit <n>` / `-n <n>` - cap results emitted (client-side, applied after paging - it cannot exceed the 25-result page size, matching `linkedin-search`'s convention).
- `--format json|table|plain` - default `json`.

### Fetch a posting's application page (best-effort)

```bash
bun run .agents/skills/zapplyjobs-canada-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the id from a `search` result, or the posting's own `url` (the
zapply.jobs redirect link). Re-fetches the current README to resolve the row,
follows the redirect to the real employer application page, and extracts
`og:description` when present, else a generic strip-tags pass. If neither
yields substantial text, or the link no longer resolves off zapply.jobs,
`description` is `null` with a `descriptionNote` explaining why.

## Usage examples

```bash
# Software engineer roles in Calgary, table view
bun run .agents/skills/zapplyjobs-canada-search/cli/src/cli.ts search -q "software engineer" -l "Calgary" --format table

# Everything in Data Science & Analytics, Toronto
bun run .agents/skills/zapplyjobs-canada-search/cli/src/cli.ts search --category data-science-analytics -l "Toronto" --format table

# Software/data roles posted in the last 7 days (this repo has no freshness cap of its own)
bun run .agents/skills/zapplyjobs-canada-search/cli/src/cli.ts search -q "software engineer" --jobage 7 --format table

# UX/design roles, all categories
bun run .agents/skills/zapplyjobs-canada-search/cli/src/cli.ts search -q "UX designer" --format table

# Full detail on a specific posting
bun run .agents/skills/zapplyjobs-canada-search/cli/src/cli.ts detail <id> --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default - programmatic use, passing ids to `detail` |
| `table` | Quick human-readable scanning (includes a VISA column) |
| `plain` | Reading a single job's full detail (`detail` command) |

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- Data source: `https://raw.githubusercontent.com/zapplyjobs/Canada-Jobs-2027/main/README.md`, the repo's `main` (default) branch.
- No authentication required; no per-call cost.
- The category list is derived from the README's own `<details><summary><h3>...<strong>Name</strong>` headings at parse time, not hardcoded.
- `id` is a pure function of company + title + apply URL (`<company-slug>_<title-slug>-<hash>`), so the same posting always gets the same id across runs.
- Some postings are bilingual (English/French titles in the same row, e.g. "Stage - Hiver 2027 - ... / Internship - ..."), consistent with a Canada-wide source. A French-only title is not by itself evidence that French is required for the role - apply the Language Gate in `.claude/skills/job-application-assistant/04-job-evaluation.md` (FLAG, don't auto-exclude, unless the posting states a French-language job requirement).
- If zapplyjobs restructures the README's table markup, parsing will silently return fewer/garbled results rather than erroring - check `/scrape health zapplyjobs-canada` periodically (Step 4.75 in the job-scraper skill).
