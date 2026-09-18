# zapplyjobs-cli

Zero-dependency CLI over the [zapplyjobs/New-Grad-Jobs-2027](https://github.com/zapplyjobs/New-Grad-Jobs-2027)
GitHub repo - a crowdsourced, ~10-minutely-updated README of new-grad **US**
roles (Software Engineering, Data/AI & Research, Security Engineering,
Hardware & Systems Engineering, Business & Operations, Other).

## Why this CLI looks different from the other portal skills

Like `simplifyjobs-search`, this is not a job board with a search API - the
whole "database" is a plain Markdown table (one per category, each inside a
`<details>` block) in one README.md. So:

- **`search` has no server-side query.** It fetches the raw README once per
  call and filters the parsed rows client-side by `--query`, `--location`,
  `--category`, `--jobage`, and `--sponsor-only`.
- **The Visa column is a real signal, not a legend emoji.** Each row is
  either explicitly marked "✅ Sponsor" or left blank. Blank means *not
  stated*, not *no sponsorship* - `--sponsor-only` filters to confirmed
  sponsors only, on purpose leaving the rest unfiltered by default.
- **Apply links redirect through zapply.jobs** rather than pointing straight
  at the employer's ATS, but a normal `fetch()` with `redirect: "follow"`
  resolves them to the real posting (verified live, 2026-09-15).
- **`detail` tries `og:description` first.** Many ATS platforms (Workday
  included) populate that meta tag server-side for link previews even when
  the visible page is client-rendered, so it is a materially better source
  than a generic strip-tags pass alone. If neither yields substantial text,
  `description` comes back `null` with a `descriptionNote` explaining why -
  an honest outcome, never a failure.

## Commands

```bash
bun run src/cli.ts search [flags]
bun run src/cli.ts detail <id|url> [--format json|plain]
```

See `bun run src/cli.ts --help` for the full flag reference, or
`.agents/skills/zapplyjobs-search/SKILL.md`.

## Development

```bash
bun install
bun run typecheck
bun run test
```
