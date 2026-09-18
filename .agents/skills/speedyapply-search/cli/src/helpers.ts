// Data source: the speedyapply/2027-SWE-College-Jobs GitHub repo's
// NEW_GRAD_USA.md, fetched raw (no auth, no robots.txt restriction on
// raw.githubusercontent.com). Like the zapplyjobs/simplifyjobs skills in
// this repo, there is no query/location search endpoint: the file holds one
// plain Markdown table per category (### FAANG+, ### Quant, ### Other),
// updated daily by the repo's bot. "Search" means: fetch the file once,
// parse every row in every category table, then filter client-side.
//
// Two things make this source different from the other GitHub-README
// portals already in this repo:
//
// 1. Apply links point directly at the employer's own ATS (Greenhouse,
//    Lever, Ashby, Workday, amazon.jobs, a company's own careers page, ...) -
//    there is no aggregator redirect layer to resolve first, unlike
//    zapply.jobs on the sibling zapplyjobs-* skills.
// 2. Column sets differ by section: FAANG+ and Quant carry a Salary column
//    ("$242k/yr"), Other does not. The parser reads each section's own
//    header row to map column name -> index rather than assuming a fixed
//    position, so a missing or reordered column degrades gracefully instead
//    of misreading data into the wrong field.
//
// This repo covers only NEW_GRAD_USA.md - the same repo also has
// INTERN_USA.md, NEW_GRAD_INTL.md, and INTERN_INTL.md, which this skill does
// not fetch. A future /add-portal run could add those as separate skills the
// same way simplifyjobs-search / zapplyjobs-search / zapplyjobs-canada-search
// are siblings rather than one skill trying to cover every variant.

export const SOURCE_URL =
  "https://raw.githubusercontent.com/speedyapply/2027-SWE-College-Jobs/main/NEW_GRAD_USA.md"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA = "Mozilla/5.0 (compatible; speedyapply-search-cli/1.0)"

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
  date: string | null // computed YYYY-MM-DD from the source's relative "Age"
  url: string
  category: string
  salary: string | null // e.g. "$242k/yr"; null when the section has no Salary column
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

function clean(text: string): string {
  return decodeHtmlEntities(stripTags(text)).trim()
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

/** Convert the source's relative "Age" ("0d", "34d") to YYYY-MM-DD. Also
 * accepts m/h/w/mo/y defensively even though only whole days are observed
 * live, for robustness if the source ever changes granularity. */
export function ageToDate(age: string, now: Date = new Date()): string | null {
  const m = age.trim().match(/^(\d+)\s*(m|h|d|w|mo|y)$/i)
  if (!m) return null
  const n = parseInt(m[1], 10)
  const unit = m[2].toLowerCase()
  const minutesPerUnit: Record<string, number> = { m: 1, h: 60, d: 1440, w: 10080, mo: 43200, y: 525600 }
  const minutes = n * minutesPerUnit[unit]
  const d = new Date(now.getTime() - minutes * 60 * 1000)
  return d.toISOString().slice(0, 10)
}

/**
 * Split the file into category sections. Each `### Name` heading starts a
 * section that runs to the next `### ` heading or EOF; only sections whose
 * body actually contains a `| Company |` table header are kept (the file
 * also has `### USA Positions` / `### International Positions` navigation
 * headings with no table). The category list is derived from the file
 * itself, not hardcoded.
 */
export function splitCategories(source: string): { name: string; slug: string; body: string }[] {
  const headingRe = /^###\s+(.+?)\s*$/gm
  const matches: { name: string; start: number }[] = []
  let m: RegExpExecArray | null
  while ((m = headingRe.exec(source)) !== null) {
    matches.push({ name: clean(m[1]), start: m.index + m[0].length })
  }
  const sections = matches.map((s, i) => ({
    name: s.name,
    body: source.slice(s.start, i + 1 < matches.length ? matches[i + 1].start : source.length),
  }))
  return sections
    .filter((s) => /\|\s*company\s*\|/i.test(s.body))
    .map((s) => ({ name: s.name, slug: slugify(s.name), body: s.body }))
}

/**
 * Parse a Markdown table into JobRows. The header row is read to map column
 * name -> index rather than assuming a fixed position, since the Salary
 * column is present in some sections (FAANG+, Quant) and absent in others
 * (Other). One malformed row is skipped rather than aborting the whole
 * section, matching the chunked-parsing pattern used by the other portal
 * CLIs in this repo.
 */
export function parseCategoryRows(body: string, categorySlug: string, now: Date = new Date()): JobRow[] {
  const results: JobRow[] = []
  const lines = body.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("|"))
  if (lines.length === 0) return results

  const splitRow = (line: string) => line.split("|").slice(1, -1).map((c) => c.trim())

  const headerCells = splitRow(lines[0]).map((c) => c.toLowerCase())
  const colIndex = (name: string) => headerCells.indexOf(name)
  const idx = {
    company: colIndex("company"),
    position: colIndex("position"),
    location: colIndex("location"),
    salary: colIndex("salary"),
    posting: colIndex("posting"),
    age: colIndex("age"),
  }
  if (idx.company === -1 || idx.position === -1 || idx.posting === -1) return results

  for (const line of lines.slice(1)) {
    const cells = splitRow(line)
    if (cells.length < headerCells.length) continue
    if (/^:?-+:?$/.test(cells[0])) continue // the "|---|---|" separator row

    const company = clean(cells[idx.company]) || null
    if (!company) continue
    const title = clean(cells[idx.position])
    if (!title) continue
    const location = idx.location >= 0 ? clean(cells[idx.location]) || null : null
    const salary = idx.salary >= 0 ? clean(cells[idx.salary]) || null : null

    const applyMatch = cells[idx.posting].match(/href="([^"]+)"/)
    if (!applyMatch) continue
    const url = decodeHtmlEntities(applyMatch[1])

    const date = idx.age >= 0 ? ageToDate(clean(cells[idx.age]), now) : null

    results.push({
      id: makeId(company, title, url),
      title,
      company,
      location,
      date,
      url,
      category: categorySlug,
      salary,
    })
  }

  return results
}

export function parseAllJobs(source: string, now: Date = new Date()): JobRow[] {
  const sections = splitCategories(source)
  return sections.flatMap((s) => parseCategoryRows(s.body, s.slug, now))
}

/**
 * Best-effort description extraction for a job's application page. Tries the
 * OpenGraph description meta tag first - many ATS platforms (Workday
 * especially) populate it server-side for link-preview purposes even when
 * the visible page body is rendered client-side in JavaScript - then falls
 * back to a generic strip-tags extraction of the full page, and finally to
 * null with a note if neither yields substantial text. Never fabricates a
 * description; a page that genuinely has nothing gets `null`.
 */
export function parseGenericDescription(html: string): { description: string | null; note: string | null } {
  if (!html) return { description: null, note: "page did not load" }

  const og = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([\s\S]*?)["']/i)
  if (og) {
    const text = decodeHtmlEntities(og[1]).trim()
    if (text.length >= 80) return { description: text, note: "from og:description meta tag" }
  }

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
