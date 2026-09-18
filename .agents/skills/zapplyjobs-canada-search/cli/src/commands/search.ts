import { README_URL, textFetch, parseAllJobs, type JobRow } from "../helpers.js"

export interface SearchOpts {
  query?: string
  location?: string
  category?: string
  jobage?: number
  sponsorOnly: boolean
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}

function matches(job: JobRow, opts: SearchOpts): boolean {
  if (opts.category && job.category !== opts.category) return false
  if (opts.sponsorOnly && !job.flags.includes("sponsorship_offered")) return false
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
    const title = (j.title || "").slice(0, 42).padEnd(42)
    const company = (j.company || "—").slice(0, 22).padEnd(22)
    const loc = (j.location || "—").slice(0, 22).padEnd(22)
    const visa = j.flags.includes("sponsorship_offered") ? "Sponsor" : "—"
    const date = j.date || "—"
    return `${j.id.slice(0, 22).padEnd(22)} ${title} ${company} ${loc} ${visa.padEnd(7)} ${date}`
  })
  const header =
    "ID".padEnd(22) +
    " " +
    "TITLE".padEnd(42) +
    " " +
    "COMPANY".padEnd(22) +
    " " +
    "LOCATION".padEnd(22) +
    " " +
    "VISA".padEnd(7) +
    " DATE"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const readme = await textFetch(README_URL)
    if (!readme) throw new Error("could not fetch README.md from zapplyjobs/Canada-Jobs-2027")

    let jobs = parseAllJobs(readme).filter((j) => matches(j, opts))

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
              `${j.title}${j.flags.length ? " [" + j.flags.join(", ") + "]" : ""}\n  ${j.company || "—"} · ${j.location || "—"} · ${j.date || "—"}\n  id: ${j.id}\n  ${j.url}`,
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
