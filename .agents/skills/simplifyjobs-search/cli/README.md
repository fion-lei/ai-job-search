# simplifyjobs-cli

Zero-dependency CLI over the [SimplifyJobs/New-Grad-Positions](https://github.com/SimplifyJobs/New-Grad-Positions)
GitHub repo - a crowdsourced, daily-updated README of new-grad roles (Software
Engineering, Data Science/AI/ML, Product Management, Quant Finance, Hardware,
Other).

## Why this CLI looks different from the other portal skills

This is not a job board with a search API. The whole "database" is one big
README.md rendered as HTML tables. So:

- **`search` has no server-side query.** It fetches the raw README once per
  call and filters the parsed rows client-side by `--query`, `--location`,
  `--category`, and `--jobage`.
- **There is no description endpoint.** Each row only links to the employer's
  own application page (Greenhouse, Workday, SmartRecruiters, iCIMS, Lever,
  Ashby, or a custom site - a different platform per company). `detail` does a
  best-effort generic fetch of that page and strips HTML tags; there is no
  per-ATS parser. Many of these pages render their real content client-side in
  JavaScript, so a `null` description with a `descriptionNote` explaining why
  is a common, honest outcome - never treated as a failure.

## Commands

```bash
bun run src/cli.ts search [flags]
bun run src/cli.ts detail <id|url> [--format json|plain]
```

See `bun run src/cli.ts --help` for the full flag reference, or
`.agents/skills/simplifyjobs-search/SKILL.md`.

## Development

```bash
bun install
bun run typecheck
bun run test
```
