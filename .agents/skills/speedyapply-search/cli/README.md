# speedyapply-cli

Zero-dependency CLI over [speedyapply/2027-SWE-College-Jobs](https://github.com/speedyapply/2027-SWE-College-Jobs)'s
`NEW_GRAD_USA.md` - a crowdsourced, daily-updated list of US new-grad SWE
roles across 3 categories: FAANG+, Quant, Other.

## Why this CLI looks different from a normal job-board portal

Like `simplifyjobs-search` and the `zapplyjobs-*` skills in this repo, this
is not a job board with a search API - the whole "database" is a plain
Markdown file with one table per `### <Category>` heading. So:

- **`search` has no server-side query.** It fetches the raw file once per
  call and filters the parsed rows client-side by `--query`, `--location`,
  `--category`, and `--jobage`.
- **Apply links point directly at the employer's ATS** (Greenhouse, Lever,
  Ashby, Workday, amazon.jobs, a company's own careers page, ...) - unlike
  the `zapplyjobs-*` skills, there is no aggregator redirect layer to resolve
  first.
- **Column sets differ by section.** FAANG+ and Quant carry a `Salary`
  column (e.g. `$242k/yr`); Other does not. The parser reads each section's
  own header row to map column name → index rather than assuming a fixed
  position, so this degrades gracefully instead of misreading data into the
  wrong field.
- **`detail` tries `og:description` first**, before falling back to a
  generic strip-tags pass - many ATS platforms (Workday especially)
  populate that meta tag server-side even when the visible body is
  client-rendered. A `null` description with a `descriptionNote` is a
  normal, honest outcome when neither source has enough text.

## Scope

This skill only covers `NEW_GRAD_USA.md`. The same repo also has
`INTERN_USA.md`, `NEW_GRAD_INTL.md`, and `INTERN_INTL.md` - not fetched by
this skill. Those could become separate sibling skills the same way
`simplifyjobs-search` / `zapplyjobs-search` / `zapplyjobs-canada-search` are
siblings rather than one skill trying to cover every variant.

## Commands

```bash
bun run src/cli.ts search [flags]
bun run src/cli.ts detail <id|url> [--format json|plain]
```

See `bun run src/cli.ts --help` for the full flag reference, or
`.agents/skills/speedyapply-search/SKILL.md`.

## Development

```bash
bun install
bun run typecheck
bun run test
```
