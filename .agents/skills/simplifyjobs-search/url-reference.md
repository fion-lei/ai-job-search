# SimplifyJobs New-Grad-Positions Data Reference

Public, unauthenticated GitHub-hosted README. No robots.txt restriction on
`raw.githubusercontent.com` (checked 2026-09-15: no file at all, which
conventionally means no restriction); `github.com`'s own robots.txt allows the
repo root and explicitly points automated consumers at its API rather than
disallowing access outright.

## Source

```
GET https://raw.githubusercontent.com/SimplifyJobs/New-Grad-Positions/dev/README.md
```

The repo's default branch is `dev` (checked via `gh api repos/SimplifyJobs/New-Grad-Positions`),
not `main` - a common trap when hand-constructing the raw URL.

Returns the whole README as Markdown-with-embedded-HTML-tables, roughly
1-2 MB, ~17,000 lines. There is no per-category or per-page endpoint; the CLI
fetches this once per `search`/`detail` call and does all filtering
client-side.

## Structure

- A `## <emoji> <Category Name> New Grad Roles` heading starts each category
  section (Software Engineering, Product Management, Data Science AI &
  Machine Learning, Quantitative Finance, Hardware Engineering, Other). The
  section runs until the next such heading or EOF. The CLI derives the
  category list from these headings at parse time - see `splitCategories` in
  `cli/src/helpers.ts`.
- Each section holds one `<table>` with a `<tbody>` of `<tr>` rows, columns:
  **Company | Role | Location | Application | Age**.
  - **Company:** `<td><strong><a href="...">Name</a></strong></td>`, or a bare
    `↳` (U+21B3) for a continuation row that repeats the same company as the
    row above it (multiple open reqs at once).
  - **Role:** plain text, sometimes suffixed with a legend emoji (see below).
  - **Location:** plain text for a single location; for multiple locations,
    `<details><summary><strong>N locations</strong></summary>Loc1<br/>Loc2...
    </details>` (note: the source sometimes emits the non-standard `</br>`
    instead of `<br/>` - the parser's break-regex matches both).
  - **Application:** two links inside a `<div align="center">` - a direct
    "Apply" link (`img alt="Apply"`, the real employer ATS URL) and a
    "Simplify" link (`img alt="Simplify"`, the aggregator's own tracking page
    at `simplify.jobs/p/<uuid>`). The CLI takes the **Apply** link only; the
    Simplify link is never a substitute for the real posting.
  - **Age:** relative, e.g. `0d`, `7d`, `1mo`. The CLI's `ageToDate()`
    approximates months as 30 days and years as 365 - treat the resulting
    date as approximate, not exact.

## Legend (emoji suffix on the Role cell)

| Emoji | Meaning | CLI mapping |
|-------|---------|-------------|
| 🛂 | Does NOT offer sponsorship | `flags: ["no_sponsorship"]` |
| 🇺🇸 | Requires U.S. Citizenship | `flags: ["us_citizenship_required"]` |
| 🔒 | Job application is closed | `closed: true`; excluded from `search` unless `--include-closed` |
| 🔥 | FAANG+ company | `flags: ["faang"]` |
| 🎓 | Advanced degree required (Master's/PhD/MBA) | `flags: ["advanced_degree_required"]` |

As of this writing (2026-09-15) none of the currently-listed rows carry these
flags, but the legend is documented in the README itself and the parser
handles them regardless.

## Detail (best-effort only)

There is no posting-detail endpoint in this source. `detail <id|url>`
re-fetches the README to resolve the row's stored metadata, then fetches the
row's real Apply URL directly and strips it to plain text generically
(`parseGenericDescription` in `cli/src/helpers.ts`) - no per-ATS parsing.
Expect wide quality variance: some ATS pages (Greenhouse, SmartRecruiters)
render server-side and extract cleanly; others (Workday especially) are
heavily client-rendered and return `description: null` with a
`descriptionNote` explaining why. This is treated as a normal, honest outcome,
never an error.

## Notes

- No authentication required, no per-call cost.
- Respect volume - each call fetches the entire README; do not poll this in a tight loop.
- `id` is a pure function of company + title + application URL, so re-running `search` reproduces the same ids for the same postings (dedup-safe across `/scrape` runs).
- If SimplifyJobs changes the table markup (column order, class names it doesn't currently have, a different Application-link structure), `parseCategoryRows` in `cli/src/helpers.ts` is where to fix it. Since one malformed row is skipped rather than aborting the section, a markup change usually shows up as a drop in result count rather than a hard error - worth an occasional `/scrape health simplifyjobs`.
