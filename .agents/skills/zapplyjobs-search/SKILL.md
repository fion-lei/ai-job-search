---
name: zapplyjobs-search
version: 1.0.0
description: >
  Use this skill to search the zapplyjobs/New-Grad-Jobs-2027 GitHub repo - a
  crowdsourced, ~10-minutely-updated list of new-grad US roles across
  Software Engineering, Data/AI & Research, Security Engineering, Hardware &
  Systems Engineering, Business & Operations, and Other categories. Trigger
  phrases: new grad jobs, zapply, zapplyjobs, new grad software engineer
  roles US, new grad data jobs, entry level new grad positions, 2026/2027 new
  grad US roles, visa sponsorship new grad jobs, look up this zapply posting.
context: fork
enabled: true
allowed-tools: Bash(bun run .agents/skills/zapplyjobs-search/cli/src/cli.ts *)
---

# zapplyjobs New-Grad-Jobs-2027 Search Skill

Search the [zapplyjobs/New-Grad-Jobs-2027](https://github.com/zapplyjobs/New-Grad-Jobs-2027)
GitHub repo's README - a community-maintained list of full-time new-grad
**US** roles, updated roughly every 10 minutes. No authentication, no API
key, **zero runtime dependencies** - it runs with just `bun`.

## How this portal is different from the others

This is the same shape as `simplifyjobs-search` (another GitHub-README-backed
portal in this repo), but with real differences worth knowing:

- **Plain Markdown table, not embedded HTML.** Each category lives inside a
  `<details><summary><h3>... <strong>Name</strong></h3></summary>` block
  wrapping a normal `| Company | Role | Location | Posted | Visa | Apply |`
  GFM table - no `<tr>`/`<td>` tags to parse.
- **A real Visa/sponsorship column**, not an occasional legend emoji: each
  row is either explicitly "✅ Sponsor" or blank. Blank means *not stated*,
  not confirmed non-sponsorship - `--sponsor-only` filters to confirmed
  sponsors on purpose, leaving everything else unfiltered by default. This is
  directly useful for the Eligibility Gate in
  `.claude/skills/job-application-assistant/04-job-evaluation.md`.
- **Posted ages are minutes/hours/days**, not just days - finer-grained than
  `simplifyjobs-search`'s day/month buckets. The CLI still converts to an
  approximate `YYYY-MM-DD`.
- **Apply links redirect through `zapply.jobs`** rather than pointing at the
  employer's ATS directly. A normal `fetch()` with `redirect: "follow"`
  resolves them to the real posting page (verified live, 2026-09-15).
- **`detail` tries `og:description` first**, before falling back to a
  generic strip-tags pass - many ATS pages (Workday especially) populate that
  meta tag server-side even when the visible body is client-rendered, so it
  materially improves extraction quality. A `null` description with a
  `descriptionNote` is still a normal, honest outcome when neither source has
  enough text. **A stale Apply link redirects back into zapply.jobs itself**
  rather than erroring (confirmed live on an Ashby-backed posting) - `detail`
  detects this (the post-redirect URL is still on `zapply.jobs`) and returns
  `null` rather than risking zapply.jobs's own generic marketing copy being
  presented as the job description.
- **US roles only.** Unlike `simplifyjobs-search`, this particular repo does
  not cover Canada.

This is public data - the repo exists specifically to be shared and consumed
- fetched via GitHub's own `raw.githubusercontent.com` (no robots.txt
restriction on it), not scraped from the rendered page. `zapply.jobs` itself
also allows `/` broadly in its robots.txt. Still, keep volume reasonable:
every `search` or `detail` call fetches the whole README.

## Commands

### Search job listings

```bash
bun run .agents/skills/zapplyjobs-search/cli/src/cli.ts search [flags]
```

Key flags:
- `--query <text>` / `-q <text>` - keyword search, matched against title + company. Optional.
- `--location <text>` / `-l <text>` - substring match against the posting's location text (e.g. `"San Francisco"`, `"Seattle"`, `"New York"`, `"Remote"`). Optional.
- `--category <slug>` - scope to one section: `software-engineering`, `data-ai-research`, `security-engineering`, `hardware-systems-engineering`, `business-operations`, `other-jobs`. Omit for all sections.
- `--jobage <days>` - posted within N days, derived from the source's relative age column. Approximate.
- `--sponsor-only` - only rows explicitly marked "✅ Sponsor". Default off.
- `--page <n>` - 1-indexed page (25 results/page). Default 1.
- `--limit <n>` / `-n <n>` - cap results emitted (client-side, applied after paging).
- `--format json|table|plain` - default `json`.

### Fetch a posting's application page (best-effort)

```bash
bun run .agents/skills/zapplyjobs-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the id from a `search` result, or the posting's own `url` (the
zapply.jobs redirect link). Re-fetches the current README to resolve the row,
follows the redirect to the real employer application page, and extracts
`og:description` when present, else a generic strip-tags pass. If neither
yields substantial text (common on heavily client-rendered ATS pages),
`description` is `null` with a `descriptionNote` explaining why.

## Usage examples

```bash
# Software engineer roles in San Francisco, table view
bun run .agents/skills/zapplyjobs-search/cli/src/cli.ts search -q "software engineer" -l "San Francisco" --format table

# Everything in Data/AI & Research that explicitly offers sponsorship
bun run .agents/skills/zapplyjobs-search/cli/src/cli.ts search --category data-ai-research --sponsor-only --format table

# Data engineer roles posted in the last 7 days
bun run .agents/skills/zapplyjobs-search/cli/src/cli.ts search -q "data engineer" --jobage 7 --format table

# UX/design roles, all categories
bun run .agents/skills/zapplyjobs-search/cli/src/cli.ts search -q "UX designer" --format table

# Full detail on a specific posting
bun run .agents/skills/zapplyjobs-search/cli/src/cli.ts detail <id> --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default - programmatic use, passing ids to `detail` |
| `table` | Quick human-readable scanning (includes a VISA column) |
| `plain` | Reading a single job's full detail (`detail` command) |

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- Data source: `https://raw.githubusercontent.com/zapplyjobs/New-Grad-Jobs-2027/main/README.md`, the repo's `main` (default) branch.
- No authentication required; no per-call cost.
- The category list is derived from the README's own `<details><summary><h3>...<strong>Name</strong>` headings at parse time, not hardcoded.
- `id` is a pure function of company + title + apply URL (`<company-slug>_<title-slug>-<hash>`), so the same posting always gets the same id across runs.
- If zapplyjobs restructures the README's table markup, parsing will silently return fewer/garbled results rather than erroring - check `/scrape health zapplyjobs` periodically (Step 4.75 in the job-scraper skill).
