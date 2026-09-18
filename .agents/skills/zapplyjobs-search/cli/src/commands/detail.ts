import {
  README_URL,
  textFetch,
  fetchResolved,
  isUnresolvedZapplyUrl,
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
    // Accept either our generated id or a direct zapply.jobs apply URL.
    // Either way we need the current README to resolve the posting's stored
    // metadata (title, company, location, category, flags) - there is no
    // per-posting endpoint.
    const readme = await textFetch(README_URL)
    if (!readme) throw new Error("could not fetch README.md from zapplyjobs/New-Grad-Jobs-2027")
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

    // Best-effort only. job.url is a zapply.jobs redirect link; fetchResolved's
    // `redirect: "follow"` normally lands on the real employer ATS page
    // (Workday, Greenhouse, Ashby, etc.), but a stale/expired link
    // server-side-redirects back into zapply.jobs's own generic jobs page
    // instead of erroring - trusting that page's content would silently
    // present zapply.jobs's own marketing copy as the job description, so
    // that case is treated as "could not resolve" rather than parsed.
    const { text: html, finalUrl } = await fetchResolved(job.url)
    const { description, note } = isUnresolvedZapplyUrl(finalUrl)
      ? {
          description: null,
          note: "the Apply link no longer resolves to the employer's posting (redirected back to zapply.jobs) - it may have been filled or removed; open the URL directly to confirm",
        }
      : parseGenericDescription(html)

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
