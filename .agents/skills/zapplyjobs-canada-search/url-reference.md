# zapplyjobs Canada-Jobs-2027 Data Reference

Public, unauthenticated GitHub-hosted README. Same access-rules basis as the
sibling `zapplyjobs-search` skill: `github.com`'s robots.txt allows the repo
root, `raw.githubusercontent.com` has no robots.txt (404, conventionally no
restriction), and `zapply.jobs` (the redirect target for Apply links) allows
`/` broadly in its own robots.txt.

## Source

```
GET https://raw.githubusercontent.com/zapplyjobs/Canada-Jobs-2027/main/README.md
```

The repo's default branch is `main` (checked via `gh api repos/zapplyjobs/Canada-Jobs-2027`,
2026-09-15) - same as the US sibling repo (`zapplyjobs/New-Grad-Jobs-2027`),
unlike `SimplifyJobs/New-Grad-Positions` which defaults to `dev`. Don't
assume the same branch name across GitHub-README-backed portal skills in
general; verify per repo.

There is no per-category or per-page endpoint; the CLI fetches this once per
`search`/`detail` call and does all filtering client-side.

## Structure

Identical table/heading shape to the US sibling repo (see
`.agents/skills/zapplyjobs-search/url-reference.md` for the shared
mechanics), with these differences specific to this repo:

- **Categories** (as of 2026-09-15, 6 total, derived at parse time from the
  README's own headings - not hardcoded): Software Engineering, Hardware &
  Systems, Data Science & Analytics, AI/ML, Operations & Support, Other Tech
  Roles. Different names and a different split than the US repo's own 6
  categories - don't assume the slug list transfers between the two skills.
- **Posted ages observed live include a `w` (weeks) unit** in addition to
  `m`/`h`/`d`/`mo` (e.g. `2w`), and ages up to `24mo`+ - this repo has no
  freshness curation, unlike the US sibling which stays under ~2 weeks.
  `ageToDate()` in `cli/src/helpers.ts` handles `m`/`h`/`d`/`w`/`mo`/`y`.
- **A "Posted" cell can be the literal text "Date unknown"** (observed live,
  e.g. a Google posting with no resolvable date). This does not match
  `ageToDate()`'s regex and falls through to `date: null`, exactly like any
  other unparseable format - never guessed at.
- **Bilingual postings appear directly in the table**, e.g. a single row
  titled "Stage - Hiver 2027 - Service Numériques pour les Moteurs –
  Développeur logiciel/ Internship - ..." (RTX, Quebec) or "Intern, Software
  Developer, Stagiaire en Développement Logiciel" (Autodesk, Montreal).
  Neither example states a French-language job requirement in the row
  itself - a French-containing title is a Language Gate FLAG signal for the
  consuming skill to surface, not grounds to exclude the posting.

## Apply-link redirect chain

Same `zapply.jobs/l/d/<slug>?s=...` redirect pattern as the US sibling repo -
see that skill's `url-reference.md` for the full verified redirect chain
(including the stale-link failure mode that redirects back into
`zapply.jobs/jobs` instead of erroring, and how `detail` guards against it
via `isUnresolvedZapplyUrl`). Not re-verified independently against a
Canada-repo-specific link, since the redirect infrastructure (`zapply.jobs`
itself) is shared across both repos - but treat the guard as equally
necessary here.

## Detail (best-effort, with an og:description fast path)

Same two-pass extraction as the US sibling skill
(`parseGenericDescription` in `cli/src/helpers.ts`): `og:description` meta
tag first (many ATS platforms populate it server-side even when the visible
body is client-rendered), then a generic strip-tags fallback, then `null`
with a `descriptionNote` if neither yields at least ~200/~80 characters
respectively. Verified live, 2026-09-15, against a Workday-backed Capital One
posting (clean extraction, no `og:description` needed).

## Notes

- No authentication required, no per-call cost.
- Respect volume - each call fetches the entire README; do not poll this in a tight loop.
- `id` is a pure function of company + title + apply URL, so re-running `search` reproduces the same ids for the same postings (dedup-safe across `/scrape` runs).
- If zapplyjobs changes the table markup for this repo (it is maintained separately from the US repo, even though the tooling looks shared), `parseCategoryRows` / `splitCategories` in `cli/src/helpers.ts` are where to fix it. One malformed row is skipped rather than aborting the section, so a markup change usually shows up as a drop in result count rather than a hard error.
