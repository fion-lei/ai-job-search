# zapplyjobs-canada-cli

Zero-dependency CLI over the [zapplyjobs/Canada-Jobs-2027](https://github.com/zapplyjobs/Canada-Jobs-2027)
GitHub repo - a crowdsourced, live-updated README of entry-level/new-grad
**Canadian** roles (Software Engineering, Hardware & Systems, Data Science &
Analytics, AI/ML, Operations & Support, Other Tech Roles).

Same family/tooling as `zapplyjobs-search` (the US-only sibling skill), with
two real differences worth knowing:

- **No built-in freshness cap.** The US repo stays roughly under 2 weeks old;
  this one ranges from minutes old to 24+ months old. Use `--jobage` if you
  want a tighter window - it isn't applied for you.
- **A "Posted" cell can read the literal text "Date unknown".** The age
  parser doesn't guess at these - they get `date: null`, same as any other
  unparseable format.

## Why this CLI looks different from a normal job-board portal

Like `simplifyjobs-search` and `zapplyjobs-search`, this is not a job board
with a search API - the whole "database" is a plain Markdown table (one per
category, each inside a `<details>` block) in one README.md. So:

- **`search` has no server-side query.** It fetches the raw README once per
  call and filters the parsed rows client-side by `--query`, `--location`,
  `--category`, `--jobage`, and `--sponsor-only`.
- **The Visa column is a real signal, not a legend emoji.** Each row is
  either explicitly marked "✅ Sponsor" or left blank. Blank means *not
  stated*, not *no sponsorship* - `--sponsor-only` filters to confirmed
  sponsors only, on purpose leaving the rest unfiltered by default.
- **Apply links redirect through zapply.jobs** rather than pointing straight
  at the employer's ATS. A normal `fetch()` with `redirect: "follow"`
  usually resolves them to the real posting, but a stale link redirects back
  into zapply.jobs's own generic jobs page instead of erroring - `detail`
  detects this (`isUnresolvedZapplyUrl`) and returns `null` rather than
  risking zapply.jobs's own marketing copy being presented as the job
  description (this exact failure mode was caught live while building the
  sibling `zapplyjobs-search` skill).
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
`.agents/skills/zapplyjobs-canada-search/SKILL.md`.

## Development

```bash
bun install
bun run typecheck
bun run test
```
