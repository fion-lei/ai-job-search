import {
  README_URL,
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
    // Accept either our generated id or a direct apply URL. Either way we need
    // the current README to resolve the posting's stored metadata (title,
    // company, location, category, flags) - there is no per-posting endpoint.
    const readme = await textFetch(README_URL)
    if (!readme) throw new Error("could not fetch README.md from SimplifyJobs/New-Grad-Positions")
    const jobs = parseAllJobs(readme)

    const isUrl = /^https?:\/\//i.test(opts.id)
    const job = isUrl ? jobs.find((j) => j.url === opts.id) : jobs.find((j) => j.id === opts.id)

    if (!job) {
      writeError(
        "Posting not found in the current README (it may have been removed, or the id came from a stale search)",
        "NOT_FOUND",
      )
      return 1
    }

    // Best-effort only: this fetches whatever ATS the employer uses
    // (Greenhouse, Workday, SmartRecruiters, iCIMS, Lever, Ashby, custom...)
    // and strips tags generically. Many of these render client-side in
    // JavaScript, so a null description with a note is a common, honest
    // outcome here - never treated as an error.
    const html = await textFetch(job.url)
    const { description, note } = parseGenericDescription(html)

    const detail: JobDetail = { ...job, description, descriptionNote: note }

    if (opts.format === "plain") {
      const lines = [
        detail.title,
        `${detail.company || "—"} · ${detail.location || "—"}`,
        detail.flags.length ? `Flags: ${detail.flags.join(", ")}` : "",
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
