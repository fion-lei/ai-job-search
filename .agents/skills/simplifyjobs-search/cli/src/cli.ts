#!/usr/bin/env bun
// Self-contained CLI over the SimplifyJobs/New-Grad-Positions GitHub repo - a
// crowdsourced, daily-updated list of new-grad roles (SWE, Data Science/AI/ML,
// Product Management, Quant Finance, Hardware, Other). No external CLI
// framework, so it runs anywhere `bun` is available with zero install beyond
// the repo clone.
//
// This is not a job-board API: there is no query/location search endpoint.
// `search` fetches the whole README once and filters client-side; `detail`
// does a best-effort generic fetch of the real employer application page
// (quality varies a lot by ATS - see helpers.ts).
//
// Public data, no authentication, no robots.txt restriction on the raw file.
// Keep volume reasonable - this fetches a ~1-2MB README on every call.

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

const HELP = `simplifyjobs-cli — search new-grad roles from SimplifyJobs/New-Grad-Positions

USAGE
  bun run src/cli.ts search [flags]
  bun run src/cli.ts detail <id|url> [--format json|plain]

SEARCH FLAGS
  --query, -q <text>     Keywords matched against title + company. Optional.
  --location, -l <text>  Substring match against the posting's location text. Optional.
  --category <slug>      Scope to one section: software-engineering, product-management,
                          data-science-ai-machine-learning, quantitative-finance,
                          hardware-engineering, other. Default: all sections.
  --jobage <days>        Posted within N days (derived from the source's relative age
                          column, e.g. "7d", "1mo" - approximate, not exact).
  --include-closed       Include rows marked 🔒 (closed). Default: excluded.
  --page <n>             1-indexed page (25 results/page). Default 1.
  --limit, -n <n>        Cap results emitted (client-side, applied after paging).
  --format <fmt>         json (default) | table | plain.

EXAMPLES
  bun run src/cli.ts search -q "software engineer" -l "Calgary" --format table
  bun run src/cli.ts search --category data-science-ai-machine-learning -l Canada --format table
  bun run src/cli.ts search -q "data engineer" --jobage 14 --format table
  bun run src/cli.ts detail alayacare_junior-fullstack-developer-python-a1b2c3 --format plain

Public data (GitHub repo README), no authentication. Fetches the whole README on
every call - keep volume reasonable.
`

const KNOWN_FLAGS: Record<string, Set<string>> = {
  search: new Set([
    "query", "location", "category", "jobage", "include-closed", "page", "limit", "format", "help", "h",
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
      includeClosed: flags["include-closed"] === true,
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
