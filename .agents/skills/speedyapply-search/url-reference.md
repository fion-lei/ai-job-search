# speedyapply 2027-SWE-College-Jobs Data Reference

Public, unauthenticated GitHub-hosted file. Same access-rules basis as the
other GitHub-README-backed portal skills in this repo: `github.com`'s
robots.txt allows the repo root, `raw.githubusercontent.com` has no
robots.txt (404, conventionally no restriction).

## Source

```
GET https://raw.githubusercontent.com/speedyapply/2027-SWE-College-Jobs/main/NEW_GRAD_USA.md
```

The repo's default branch is `main` (checked via `gh api repos/speedyapply/2027-SWE-College-Jobs`,
2026-09-15). This skill fetches only `NEW_GRAD_USA.md`; the same repo also
has `INTERN_USA.md`, `NEW_GRAD_INTL.md`, and `INTERN_INTL.md`, none of which
this skill touches.

There is no per-category or per-page endpoint; the CLI fetches this once per
`search`/`detail` call and does all filtering client-side.

## Structure

- `### <Name>` Markdown headings mark sections. As of 2026-09-15 the file has
  5 such headings; only 3 carry a real job table (`FAANG+`, `Quant`, `Other`)
  - the other two (`USA Positions`, `International Positions`) are top-of-file
  navigation lists with no `| Company |` table, and are filtered out by
  `splitCategories()` in `cli/src/helpers.ts` checking for that header
  literally rather than hardcoding "skip these 2 headings by name" (so a
  renamed or added table-bearing section keeps working automatically).
- Each real section holds one plain GFM Markdown table. **The column set is
  not identical across sections**:
  - `FAANG+` and `Quant`: `| Company | Position | Location | Salary | Posting | Age |`
  - `Other`: `| Company | Position | Location | Posting | Age |` (no Salary)

  `parseCategoryRows()` reads each section's own header row and builds a
  column-name → index map before parsing data rows, rather than assuming a
  fixed position - this is what makes the missing Salary column in `Other`
  safe (falls back to `salary: null`) instead of silently reading the
  Posting-link cell as if it were a salary string.
- **Company:** `<a href="https://company-homepage"><strong>Name</strong></a>`
  - the link goes to the company's own homepage, not the job posting.
- **Position:** plain text (the job title).
- **Location:** plain text, sometimes suffixed `+N` (e.g. `"Houston, TX +2"`)
  meaning N additional locations exist that are not individually named in
  this source. Kept as-is; never expanded or guessed at.
- **Salary** (FAANG+/Quant only): plain text, e.g. `$242k/yr`, `$381k/yr`.
  Real, employer-disclosed figures (this repo is US-only, where salary
  transparency laws in several states make this a common practice) - a
  materially more concrete signal than anything the other GitHub-README
  portal skills in this repo carry.
- **Posting:** a Markdown link wrapping an `<img alt="Apply">`, e.g.
  `<a href="https://jobs.ashbyhq.com/openai/...">`. Unlike the `zapplyjobs-*`
  skills, this URL is the employer's own ATS directly - no aggregator
  redirect layer to resolve, so there is no equivalent of those skills'
  "stale link redirects back to the aggregator" failure mode to guard
  against here.
- **Age:** relative, whole days only observed live (`0d` through `120d`+;
  no minutes/hours/weeks granularity, unlike the `zapplyjobs-*` sources).
  `ageToDate()` in `cli/src/helpers.ts` also accepts `m`/`h`/`w`/`mo`/`y`
  defensively, for robustness if the source ever changes granularity, even
  though only `d` has been observed.
- No `↳`/continuation-row convention observed (each row repeats the company
  name in full, even for multiple postings at the same company - e.g.
  multiple Amazon and TikTok rows throughout the file).
- No "closed"/"expired" row markers observed in this file (unlike
  SimplifyJobs's 🔒 legend emoji) - `search` does not filter on this basis.

## Detail (best-effort, with an og:description fast path)

Same two-pass extraction as the `zapplyjobs-*` skills
(`parseGenericDescription` in `cli/src/helpers.ts`): `og:description` meta
tag first (many ATS platforms populate it server-side even when the visible
body is client-rendered), then a generic strip-tags fallback, then `null`
with a `descriptionNote` if neither yields at least ~200/~80 characters
respectively. Verified live, 2026-09-15, against:
- A TikTok posting (`lifeattiktok.com`) - thin but real `og:description` text.
- A Five Rings posting (Greenhouse-backed) - rich, server-rendered extraction.

Since Apply links here go directly to the employer's ATS (no zapply.jobs-style
redirect layer), there is no need for an `isUnresolvedZapplyUrl`-equivalent
guard - a dead link here either 404s (returns `""`, handled by `textFetch`)
or genuinely 200s with real (if sometimes thin) content.

## Notes

- No authentication required, no per-call cost.
- Respect volume - each call fetches the entire file; do not poll this in a tight loop.
- `id` is a pure function of company + title + apply URL, so re-running `search` reproduces the same ids for the same postings (dedup-safe across `/scrape` runs).
- If speedyapply changes the table markup (column order, a different Posting-link wrapper, a different heading shape), `parseCategoryRows` / `splitCategories` in `cli/src/helpers.ts` are where to fix it. One malformed row is skipped rather than aborting the section, so a markup change usually shows up as a drop in result count rather than a hard error.
