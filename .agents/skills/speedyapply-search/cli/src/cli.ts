#!/usr/bin/env bun
// Self-contained CLI over the speedyapply/2027-SWE-College-Jobs GitHub
// repo's NEW_GRAD_USA.md - a crowdsourced, daily-updated list of US new-grad
// SWE roles across 3 categories: FAANG+, Quant, Other. No external CLI
// framework, so it runs anywhere `bun` is available with zero install
// beyond the repo clone.
//
// This is not a job-board API: there is no query/location search endpoint.
// `search` fetches the whole file once and filters client-side; `detail`
// fetches the posting's Apply link directly (no aggregator redirect layer,
// unlike the zapply.jobs-backed sibling skills in this repo) and does a
// best-effort extraction (og:description meta tag first, then a generic
// strip-tags fallback - see helpers.ts).
//
// Public data, no authentication. US new-grad roles only (NEW_GRAD_USA.md);
// the same repo also has INTERN_USA.md, NEW_GRAD_INTL.md, and
// INTERN_INTL.md, not covered by this skill. Keep volume reasonable - this
// fetches the file on every call.

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

const HELP = `speedyapply-cli — search US new-grad SWE roles from speedyapply/2027-SWE-College-Jobs (NEW_GRAD_USA.md)

USAGE
  bun run src/cli.ts search [flags]
  bun run src/cli.ts detail <id|url> [--format json|plain]

SEARCH FLAGS
  --query, -q <text>     Keywords matched against title + company. Optional.
  --location, -l <text>  Substring match against the posting's location text. Optional.
  --category <slug>      Scope to one section: faang, quant, other. Default: all sections.
  --jobage <days>        Posted within N days (derived from the source's relative
                          "Age" column, whole days - approximate, not exact).
  --page <n>             1-indexed page (25 results/page). Default 1.
  --limit, -n <n>        Cap results emitted (client-side, applied after paging).
  --format <fmt>         json (default) | table | plain.

EXAMPLES
  bun run src/cli.ts search -q "software engineer" -l "Seattle" --format table
  bun run src/cli.ts search --category quant --format table
  bun run src/cli.ts search -q "engineer" --jobage 14 --format table
  bun run src/cli.ts detail openai_software-engineer-applied-emerging-talent-2027-a1b2c3 --format plain

Public data (GitHub repo file, US new-grad roles only), no authentication.
Fetches the whole file on every call - keep volume reasonable. Salary is a
real column in this source (FAANG+/Quant sections) and shows up in every
result where the section provides it.
`

const KNOWN_FLAGS: Record<string, Set<string>> = {
  search: new Set(["query", "location", "category", "jobage", "page", "limit", "format", "help", "h"]),
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
