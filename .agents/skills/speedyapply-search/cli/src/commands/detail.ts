import {
  SOURCE_URL,
  textFetch,
  parseAllJobs,
  parseGenericDescription,
  writeError,
  type JobDetail,
} from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  try {
    // Accept either our generated id or the posting's own Apply URL. Either
    // way we need the current file to resolve the posting's stored metadata
    // (title, company, location, category, salary) - there is no
    // per-posting endpoint.
    const source = await textFetch(SOURCE_URL)
    if (!source) throw new Error("could not fetch NEW_GRAD_USA.md from speedyapply/2027-SWE-College-Jobs")
    const jobs = parseAllJobs(source)

    const isUrl = /^https?:\/\//i.test(opts.id)
    const job = isUrl ? jobs.find((j) => j.url === opts.id) : jobs.find((j) => j.id === opts.id)

    if (!job) {
      writeError(
        "Posting not found in the current file (it may have been removed, or the id came from a stale search)",
        "NOT_FOUND",
      )
      return 1
    }

    // Best-effort only: this is a direct link into whatever ATS the employer
    // uses (Greenhouse, Lever, Ashby, Workday, amazon.jobs, a custom careers
    // page, ...), no aggregator redirect layer to resolve first (unlike the
    // zapply.jobs-backed sibling skills).
    const html = await textFetch(job.url)
    const { description, note } = parseGenericDescription(html)

    const detail: JobDetail = { ...job, description, descriptionNote: note }

    if (opts.format === "plain") {
      const lines = [
        detail.title,
        `${detail.company || "—"} · ${detail.location || "—"}`,
        detail.salary ? `Salary: ${detail.salary}` : "",
        "",
        detail.description || `(no description extracted${detail.descriptionNote ? " - " + detail.descriptionNote : ""})`,
        "",
        `URL: ${detail.url}`,
      ].filter((l) => l !== "")
      process.stdout.write(lines.join("\n") + "\n")
    } else {
      process.stdout.write(JSON.stringify(detail, null, 2) + "\n")
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "DETAIL_FAILED")
    return 1
  }
}
