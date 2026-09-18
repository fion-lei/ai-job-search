#!/usr/bin/env bun
// Self-contained CLI over the zapplyjobs/Canada-Jobs-2027 GitHub repo - a
// crowdsourced, live-updated list of entry-level/new-grad Canadian roles
// (Software Engineering, Hardware & Systems, Data Science & Analytics,
// AI/ML, Operations & Support, Other Tech Roles). Same family/tooling as
// zapplyjobs-search (the US-only sibling), but note: this repo has no
// built-in freshness cap - postings range from minutes old to 24mo+, and a
// "Posted" cell can literally read "Date unknown". No external CLI
// framework, so it runs anywhere `bun` is available with zero install
// beyond the repo clone.
//
// This is not a job-board API: there is no query/location search endpoint.
// `search` fetches the whole README once and filters client-side; `detail`
// follows the posting's zapply.jobs redirect to the real employer ATS page
// and does a best-effort extraction (og:description meta tag first, then a
// generic strip-tags fallback - see helpers.ts).
//
// Public data, no authentication, robots.txt on zapply.jobs allows "/".
// Canada roles only. Keep volume reasonable - this fetches the README on every call.

import { runSearch, type SearchOpts } from "./commands/search.js"
import { runDetail, type DetailOpts } from "./commands/detail.js"

interface Flags {
  _: string[]
  [k: string]: string | boolean | string[]
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] }
  const alias: Record<string, string> = { q: "query", l: "location", n: "limit" }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith("--") || a.startsWith("-")) {
      const key = alias[a.replace(/^-+/, "")] ?? a.replace(/^-+/, "")
      const next = argv[i + 1]
      if (next === undefined || next.startsWith("-")) {
        flags[key] = true
      } else {
        flags[key] = next
        i++
      }
    } else {
      ;(flags._ as string[]).push(a)
    }
  }
  return flags
}

const HELP = `zapplyjobs-canada-cli — search entry-level/new-grad Canadian roles from zapplyjobs/Canada-Jobs-2027

USAGE
  bun run src/cli.ts search [flags]
  bun run src/cli.ts detail <id|url> [--format json|plain]

SEARCH FLAGS
  --query, -q <text>     Keywords matched against title + company. Optional.
  --location, -l <text>  Substring match against the posting's location text. Optional.
  --category <slug>      Scope to one section: software-engineering, hardware-systems,
                          data-science-analytics, ai-ml, operations-support,
                          other-tech-roles. Default: all sections.
  --jobage <days>        Posted within N days (derived from the source's relative
                          minutes/hours/days/weeks/months age column - approximate,
                          not exact). A row with an unparseable or "Date unknown" age
                          has no computed date and is excluded whenever --jobage is set
                          (there is nothing to compare it against), but is included when
                          --jobage is omitted.
  --sponsor-only         Only rows explicitly marked "✅ Sponsor" in the Visa column.
                          Default: off (blank does not mean no sponsorship - it means
                          not stated).
  --page <n>             1-indexed page (25 results/page). Default 1.
  --limit, -n <n>        Cap results emitted (client-side, applied after paging).
  --format <fmt>         json (default) | table | plain.

EXAMPLES
  bun run src/cli.ts search -q "software engineer" -l "Toronto" --format table
  bun run src/cli.ts search --category data-science-analytics -l "Calgary" --format table
  bun run src/cli.ts search -q "data engineer" --jobage 7 --format table
  bun run src/cli.ts detail capital-one_principal-associate-software-engineer-a1b2c3 --format plain

Public data (GitHub repo README, Canada roles only), no authentication. This
repo has NO built-in freshness cap (postings range from minutes to 24mo+ old,
unlike the US sibling repo) - use --jobage to scope it yourself. Fetches the
whole README on every call - keep volume reasonable.
`

const KNOWN_FLAGS: Record<string, Set<string>> = {
  search: new Set([
    "query", "location", "category", "jobage", "sponsor-only", "page", "limit", "format", "help", "h",
  ]),
  detail: new Set(["format", "help", "h"]),
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2)
  const flags = parseFlags(argv)
  const cmd = (flags._ as string[])[0]

  if (!cmd || flags.help || flags.h) {
    process.stdout.write(HELP)
    return cmd ? 0 : 1
  }

  const knownFlags = KNOWN_FLAGS[cmd]
  if (knownFlags) {
    for (const key of Object.keys(flags)) {
      if (key === "_" || knownFlags.has(key)) continue
      process.stderr.write(
        JSON.stringify({
          error: `unknown flag --${key} for '${cmd}' - flags are never silently ignored, because a discarded filter changes what the search returns; see --help for the supported flags`,
          code: "UNKNOWN_FLAG",
        }) + "\n",
      )
      return 1
    }
  }

  if (cmd === "search") {
    const fmt = (flags.format as string) || "json"

    const parseIntFlag = (name: string, raw: string | boolean | string[]): number | null => {
      const val = typeof raw === "string" ? Number(raw.trim()) : NaN
      if (!Number.isInteger(val) || val < 1) {
        process.stderr.write(
          JSON.stringify({ error: `--${name} must be a whole number of at least 1, got "${raw}"`, code: "BAD_ARG" }) + "\n",
        )
        return null
      }
      return val
    }

    let jobage: number | undefined
    if (flags.jobage !== undefined) {
      const v = parseIntFlag("jobage", flags.jobage)
      if (v === null) return 1
      jobage = v
    }
    let page = 1
    if (flags.page !== undefined) {
      const v = parseIntFlag("page", flags.page)
      if (v === null) return 1
      page = v
    }
    let limit: number | undefined
    if (flags.limit !== undefined) {
      const v = parseIntFlag("limit", flags.limit)
      if (v === null) return 1
      limit = v
    }

    const opts: SearchOpts = {
      query: typeof flags.query === "string" ? flags.query : undefined,
      location: typeof flags.location === "string" ? flags.location : undefined,
      category: typeof flags.category === "string" ? flags.category : undefined,
      jobage,
      sponsorOnly: flags["sponsor-only"] === true,
      page,
      limit,
      format: (["json", "table", "plain"].includes(fmt) ? fmt : "json") as SearchOpts["format"],
    }
    return runSearch(opts)
  }

  if (cmd === "detail") {
    const id = (flags._ as string[])[1]
    if (!id) {
      process.stderr.write(JSON.stringify({ error: "detail requires an <id|url>", code: "NO_ID" }) + "\n")
      return 1
    }
    const fmt = (flags.format as string) || "json"
    const opts: DetailOpts = { id, format: (fmt === "plain" ? "plain" : "json") as DetailOpts["format"] }
    return runDetail(opts)
  }

  process.stderr.write(JSON.stringify({ error: `Unknown command "${cmd}"`, code: "BAD_CMD" }) + "\n")
  return 1
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    process.stderr.write(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e), code: "INTERNAL_ERROR" }) + "\n",
    )
    process.exit(1)
  })
