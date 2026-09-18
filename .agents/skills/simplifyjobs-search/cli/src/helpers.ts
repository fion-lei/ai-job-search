// Data source: the SimplifyJobs/New-Grad-Positions GitHub repo's README.md,
// fetched raw (no auth, no robots.txt restriction on raw.githubusercontent.com).
// Unlike a normal job board, there is no query/location search endpoint: the
// README is one big page of HTML tables (one per category), updated daily by
// the repo's maintainers/bots. "Search" means: fetch the whole README once,
// parse every row in every category table, then filter client-side.
//
// There is also no separate job-description endpoint. Each row only carries
// a direct "Apply" link into the employer's own ATS (Greenhouse, Workday,
// SmartRecruiters, iCIMS, Lever, Ashby, ...). `detail` does a best-effort
// generic fetch-and-strip-tags of that page; quality varies a lot by ATS and
// many are JS-rendered shells that return little or nothing server-side. See
// parseGenericDescription() below for the honesty rule this follows.

export const README_URL =
  "https://raw.githubusercontent.com/SimplifyJobs/New-Grad-Positions/dev/README.md"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA = "Mozilla/5.0 (compatible; simplifyjobs-search-cli/1.0)"

/** Fetch text with exponential backoff on 429/5xx. Returns "" on a 404. */
export async function textFetch(url: string): Promise<string> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/plain,text/html,*/*;q=0.8" },
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
    })
    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) {
        throw new Error(`Request failed: ${response.status} ${response.statusText}`)
      }
      const jitter = Math.floor(Math.random() * 500)
      await new Promise((r) => setTimeout(r, delay + jitter))
      delay = Math.min(delay * 2, 8000)
      continue
    }
    if (response.status === 404) return ""
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    }
    return response.text()
  }
  throw new Error("Request failed after max retries")
}

export interface JobRow {
  id: string
  title: string
  company: string | null
  location: string | null
  date: string | null // computed YYYY-MM-DD from the source's relative "age"
  url: string
  category: string
  flags: string[] // "no_sponsorship" | "us_citizenship_required" | "faang" | "advanced_degree_required"
  closed: boolean
}

export interface JobDetail extends JobRow {
  description: string | null
  descriptionNote: string | null
}

function numericEntity(cp: number): string {
  return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""
}

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => numericEntity(parseInt(dec, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, hex) => numericEntity(parseInt(hex, 16)))
    .replace(/&nbsp;/g, " ")
}

export function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

function clean(html: string): string {
  return decodeHtmlEntities(stripTags(html))
}

/** Lowercase ASCII slug, matching the style of tools/job_key.py in the main repo. */
export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/** Short, stable hash (djb2) so the id is a pure function of the posting. */
function shortHash(text: string): string {
  let hash = 5381
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 33) ^ text.charCodeAt(i)
  }
  return (hash >>> 0).toString(36).slice(0, 6)
}

export function makeId(company: string, title: string, applyUrl: string): string {
  const companySlug = slugify(company).slice(0, 40) || "unknown-company"
  const titleSlug = slugify(title).slice(0, 50) || "role"
  return `${companySlug}_${titleSlug}-${shortHash(applyUrl)}`
}

const LEGEND: Record<string, string> = {
  "\u{1F6C2}": "no_sponsorship", // 🛂
  "\u{1F1FA}\u{1F1F8}": "us_citizenship_required", // 🇺🇸
  "\u{1F512}": "closed", // 🔒
  "\u{1F525}": "faang", // 🔥
  "\u{1F393}": "advanced_degree_required", // 🎓
}

function extractFlags(rawTitle: string): { title: string; flags: string[]; closed: boolean } {
  let title = rawTitle
  const flags: string[] = []
  let closed = false
  for (const [emoji, meaning] of Object.entries(LEGEND)) {
    if (title.includes(emoji)) {
      title = title.split(emoji).join("").trim()
      if (meaning === "closed") closed = true
      else flags.push(meaning)
    }
  }
  return { title: title.trim(), flags, closed }
}

/** Convert the source's relative "age" ("0d", "7d", "1mo") to a YYYY-MM-DD date. */
export function ageToDate(age: string, now: Date = new Date()): string | null {
  const m = age.trim().match(/^(\d+)\s*(d|mo|y)$/i)
  if (!m) return null
  const n = parseInt(m[1], 10)
  const unit = m[2].toLowerCase()
  const days = unit === "d" ? n : unit === "mo" ? n * 30 : n * 365
  const d = new Date(now.getTime() - days * 86400 * 1000)
  return d.toISOString().slice(0, 10)
}

/**
 * Split the README into category sections. Each `## <emoji> <Name> New Grad
 * Roles` heading starts a section that runs to the next `## ` heading (or the
 * end of the file). The category list is derived from the file itself, not
 * hardcoded, so a renamed or added section keeps working without a CLI update.
 */
export function splitCategories(readme: string): { name: string; slug: string; body: string }[] {
  const headingRe = /^##\s+(?:\p{Emoji_Presentation}\s*)?(.+?)\s+New Grad Roles\s*$/gmu
  const sections: { name: string; slug: string; start: number }[] = []
  let m: RegExpExecArray | null
  while ((m = headingRe.exec(readme)) !== null) {
    sections.push({ name: m[1].trim(), slug: slugify(m[1]), start: m.index + m[0].length })
  }
  return sections.map((s, i) => ({
    name: s.name,
    slug: s.slug,
    body: readme.slice(s.start, i + 1 < sections.length ? sections[i + 1].start : readme.length),
  }))
}

/**
 * Parse every `<tr>` in a category's `<tbody>` into a JobRow. One malformed
 * row is skipped rather than aborting the whole section, matching the
 * chunked-parsing pattern used by the other portal CLIs in this repo.
 */
export function parseCategoryRows(body: string, categorySlug: string, now: Date = new Date()): JobRow[] {
  const results: JobRow[] = []
  const tbodyMatch = body.match(/<tbody>([\s\S]*?)<\/tbody>/i)
  if (!tbodyMatch) return results
  const rows = tbodyMatch[1].split(/<tr>/i).slice(1)

  let lastCompany: string | null = null

  for (const rawRow of rows) {
    const row = rawRow.split(/<\/tr>/i)[0]
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => c[1])
    if (cells.length < 4) continue

    const [companyCell, roleCell, locationCell, appCell, ageCell] = cells

    let company: string | null
    if (/^\s*↳\s*$/.test(clean(companyCell))) {
      company = lastCompany
    } else {
      company = clean(companyCell) || null
      lastCompany = company
    }
    if (!company) continue

    const { title, flags, closed } = extractFlags(clean(roleCell))
    if (!title) continue

    // Multi-location rows wrap the list in <details><summary>N locations</summary>
    // Loc1<br/>Loc2...</details>; strip the summary, turn <br>/</br> breaks into
    // "; " separators. Single-location rows have no <details> at all.
    let location: string | null
    const details = locationCell.match(/<details>[\s\S]*?<\/details>/i)
    const locationHtml = details
      ? details[0].replace(/<summary>[\s\S]*?<\/summary>/i, "")
      : locationCell
    location =
      clean(locationHtml.replace(/<\s*\/?br\s*\/?>/gi, "; ")).replace(/\s*;\s*/g, "; ") || null

    // The first real "Apply" link (an employer ATS URL); the second link
    // (alt="Simplify") is the aggregator's own tracking page, never the
    // posting itself, so it is deliberately skipped.
    const applyMatch = appCell.match(/href="([^"]+)"[^>]*>\s*<img[^>]*alt="Apply"/i)
    const anyLink = appCell.match(/href="([^"]+)"/i)
    const applyUrl = applyMatch ? applyMatch[1] : anyLink ? anyLink[1] : null
    if (!applyUrl) continue
    const url = decodeHtmlEntities(applyUrl)

    const age = clean(ageCell)
    const date = ageToDate(age, now)

    results.push({
      id: makeId(company, title, url),
      title,
      company,
      location,
      date,
      url,
      category: categorySlug,
      flags,
      closed,
    })
  }

  return results
}

export function parseAllJobs(readme: string, now: Date = new Date()): JobRow[] {
  const sections = splitCategories(readme)
  return sections.flatMap((s) => parseCategoryRows(s.body, s.slug, now))
}

/**
 * Best-effort generic description extraction for a job's real application
 * page. Every employer's ATS has different markup (Greenhouse, Workday,
 * SmartRecruiters, iCIMS, Lever, Ashby, custom...), so this does not attempt
 * per-site parsing: it strips <script>/<style>, strips remaining tags,
 * decodes entities, and collapses whitespace. Many ATS pages (Workday
 * especially) render almost everything client-side in JavaScript, so the
 * server HTML can be a near-empty shell - in that case this returns
 * description: null with a note, rather than fabricating or returning
 * navigation-chrome text as if it were the job description.
 */
export function parseGenericDescription(html: string): { description: string | null; note: string | null } {
  if (!html) return { description: null, note: "page did not load" }
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
  const text = decodeHtmlEntities(stripTags(withoutScripts))
  if (text.length < 200) {
    return {
      description: null,
      note: "page returned little or no server-rendered text (likely a JavaScript-rendered ATS page) - open the URL directly",
    }
  }
  return { description: text.slice(0, 8000), note: text.length > 8000 ? "truncated to 8000 characters" : null }
}
