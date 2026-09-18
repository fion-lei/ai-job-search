import { SOURCE_URL, textFetch, parseAllJobs, type JobRow } from "../helpers.js"

export interface SearchOpts {
  query?: string
  location?: string
  category?: string
  jobage?: number
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}

function matches(job: JobRow, opts: SearchOpts): boolean {
  if (opts.category && job.category !== opts.category) return false
  if (opts.jobage !== undefined) {
    if (!job.date) return false
    const ageDays = Math.floor((Date.now() - new Date(job.date).getTime()) / 86400000)
    if (ageDays > opts.jobage) return false
  }
  if (opts.query) {
    const q = opts.query.toLowerCase()
    const haystack = `${job.title} ${job.company ?? ""}`.toLowerCase()
    if (!haystack.includes(q)) return false
  }
  if (opts.location) {
    const l = opts.location.toLowerCase()
    if (!(job.location ?? "").toLowerCase().includes(l)) return false
  }
  return true
}

function renderTable(jobs: JobRow[]): string {
  if (jobs.length === 0) return "No results."
  const rows = jobs.map((j) => {
    const title = (j.title || "").slice(0, 40).padEnd(40)
    const company = (j.company || "—").slice(0, 20).padEnd(20)
    const loc = (j.location || "—").slice(0, 20).padEnd(20)
    const salary = (j.salary || "—").padEnd(9)
    const date = j.date || "—"
    return `${j.id.slice(0, 22).padEnd(22)} ${title} ${company} ${loc} ${salary} ${date}`
  })
  const header =
    "ID".padEnd(22) +
    " " +
    "TITLE".padEnd(40) +
    " " +
    "COMPANY".padEnd(20) +
    " " +
    "LOCATION".padEnd(20) +
    " " +
    "SALARY".padEnd(9) +
    " DATE"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const source = await textFetch(SOURCE_URL)
    if (!source) throw new Error("could not fetch NEW_GRAD_USA.md from speedyapply/2027-SWE-College-Jobs")

    let jobs = parseAllJobs(source).filter((j) => matches(j, opts))

    const pageSize = 25
    const start = (opts.page - 1) * pageSize
    const paged = jobs.slice(start, start + pageSize)
    const limited = opts.limit !== undefined && opts.limit >= 0 ? paged.slice(0, opts.limit) : paged

    if (opts.format === "table") {
      process.stdout.write(renderTable(limited) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        limited
          .map(
            (j) =>
              `${j.title}${j.salary ? " (" + j.salary + ")" : ""}\n  ${j.company || "—"} · ${j.location || "—"} · ${j.date || "—"}\n  id: ${j.id}\n  ${j.url}`,
          )
          .join("\n\n") + "\n",
      )
    } else {
      process.stdout.write(
        JSON.stringify(
          { meta: { count: limited.length, page: opts.page, total: jobs.length }, results: limited },
          null,
          2,
        ) + "\n",
      )
    }
    return 0
  } catch (e) {
    process.stderr.write(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e), code: "SEARCH_FAILED" }) + "\n",
    )
    return 1
  }
}
