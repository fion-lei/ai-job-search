# zapplyjobs New-Grad-Jobs-2027 Data Reference

Public, unauthenticated GitHub-hosted README. `github.com`'s robots.txt allows
the repo root (checked 2026-09-15); `raw.githubusercontent.com` has no
robots.txt at all (404), which conventionally means no restriction.
`zapply.jobs` (the redirect target for Apply links, and where `detail`
ultimately lands before its own redirect resolves) has its own robots.txt
with `Allow: /` and only a handful of specific disallowed paths (`/cdn-cgi/`,
`/uninstall-survey/`, `/careers/campus-ambassador/apply/`) - none of which
this skill touches.

## Source

```
GET https://raw.githubusercontent.com/zapplyjobs/New-Grad-Jobs-2027/main/README.md
```

The repo's default branch is `main` (checked via `gh api repos/zapplyjobs/New-Grad-Jobs-2027`)
- unlike `SimplifyJobs/New-Grad-Positions`, which defaults to `dev`. Don't
assume the same branch name across GitHub-README-backed portal skills.

There is no per-category or per-page endpoint; the CLI fetches this once per
`search`/`detail` call and does all filtering client-side.

## Structure

- Each category is a `<details><summary><h3><emoji> <strong>Name</strong>
  </h3></summary>...</details>` block. As of 2026-09-15 there are 6:
  Software Engineering, Data, AI & Research, Security Engineering, Hardware &
  Systems Engineering, Business & Operations, Other Jobs. The CLI derives the
  category list from these headings at parse time (`splitCategories` in
  `cli/src/helpers.ts`), not a hardcoded list - a renamed or added section
  keeps working without a CLI update. Not every `<details>` block in the
  README is necessarily a category (e.g. a collapsible FAQ) - a block missing
  the `<h3><strong>...</strong></h3>` heading shape is skipped.
- Inside each block is one plain GFM Markdown table (not HTML `<table>`),
  columns **Company | Role | Location | Posted | Visa | Apply**:
  - **Company:** bold Markdown, e.g. `**KLA**`.
  - **Role:** plain text.
  - **Location:** plain text, single location per row (no multi-location
    expansion needed here, unlike `simplifyjobs-search`).
  - **Posted:** relative age - minutes (`13m`), hours (`3h`), or days (`2d`)
    observed live; the parser also accepts `mo`/`y` defensively even though
    unobserved (the list is kept to roughly the last 2 weeks by the source
    itself, so long ages are not expected in practice).
  - **Visa:** either `✅ Sponsor` or blank. Blank means *not stated in the
    source*, not *confirmed no sponsorship* - never treat it as a negative
    signal, only the presence of `✅ Sponsor` as a positive one.
  - **Apply:** a Markdown link wrapping an `<img>`, e.g.
    `[<img src="images/apply.png" alt="Apply">](https://zapply.jobs/l/d/...)`.
    The CLI extracts the URL via `\]\(([^)]+)\)`. Unlike SimplifyJobs, there
    is only one link per row (no separate aggregator-tracking link to avoid).
- No `↳` continuation-row convention was observed in this repo (each row
  repeats the company name in full, even for multiple postings at the same
  company).

## Apply-link redirect chain

`https://zapply.jobs/l/d/<slug>?s=...` is not the final posting URL. Verified
live (2026-09-15) with `curl -L`:

```
https://zapply.jobs/l/d/workday-kla-search-2639358?s=gh-new-grad-jobs-2027
  -> 301 -> https://zapply.jobs/l/d/workday-kla-search-2639358/?s=...
  -> 200  -> https://kla.wd1.myworkdayjobs.com/Search/job/Milpitas-CA/Cloud-Platform-Engineer_2639358
```

`fetchResolved()`'s `redirect: "follow"` (the default for `fetch()`) handles
this transparently for a *live* link - `search` results store the original
zapply.jobs URL (so `--limit`/dedup logic sees the same stable link the
README shows), while `detail` fetches through the redirect to reach the real
ATS page.

**A stale link does not error - it redirects back into zapply.jobs itself.**
Confirmed live (2026-09-15) on an Ashby-backed posting
(`ashby-openai-3b08148d-...`): the chain was
`zapply.jobs/l/d/<slug> -> 302 zapply.jobs/jobs -> 308 zapply.jobs/jobs/ -> 200`,
landing on zapply.jobs's own generic job-board page rather than an error or
the real posting. That page's own `og:description` describes zapply.jobs
itself ("Browse thousands of entry-level, new grad, and internship jobs..."),
not the job - if `detail` trusted it uncritically, it would silently present
the aggregator's marketing copy as if it were the job description. `detail`
guards against this with `isUnresolvedZapplyUrl()`: if the URL after
following redirects (`Response.url`) is still on `zapply.jobs`, the result is
`description: null` with a note that the link no longer resolves, never the
generic page's content.

## Detail (best-effort, with an og:description fast path)

There is no posting-detail endpoint in this source. `detail <id|url>`
re-fetches the README to resolve the row's stored metadata, follows the
Apply link's redirect chain, then extracts a description in two passes
(`parseGenericDescription` in `cli/src/helpers.ts`):

1. **`<meta property="og:description" content="...">`** - many ATS platforms
   (Workday confirmed live) populate this server-side for link-preview
   purposes even when the visible page body is a near-empty JavaScript
   shell. Used when present and at least 80 characters.
2. **Generic strip-tags fallback** over the full page - same approach as
   `simplifyjobs-search`, for ATS pages that render content server-side
   (Greenhouse, SmartRecruiters) but have no useful `og:description`.

If neither source yields at least ~200 characters, `description` is `null`
with a `descriptionNote` explaining why - never fabricated, never a
navigation-chrome fragment presented as if it were the job description.

## Notes

- No authentication required, no per-call cost.
- Respect volume - each call fetches the entire README; do not poll this in a tight loop.
- `id` is a pure function of company + title + apply URL, so re-running `search` reproduces the same ids for the same postings (dedup-safe across `/scrape` runs).
- If zapplyjobs changes the table markup (column order, a different Apply-link wrapper, a different `<details>` heading shape), `parseCategoryRows` / `splitCategories` in `cli/src/helpers.ts` are where to fix it. One malformed row is skipped rather than aborting the section, so a markup change usually shows up as a drop in result count rather than a hard error.
