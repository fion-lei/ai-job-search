// Data source: the zapplyjobs/New-Grad-Jobs-2027 GitHub repo's README.md,
// fetched raw (no auth, no robots.txt restriction on raw.githubusercontent.com).
// Like simplifyjobs-search, there is no query/location search endpoint: the
// README holds one plain Markdown table per category, inside a <details>
// block, updated roughly every 10 minutes by the repo's bot. "Search" means:
// fetch the whole README once, parse every row in every category table, then
// filter client-side.
//
// Apply links go through a zapply.jobs redirect (`https://zapply.jobs/l/d/...`)
// rather than linking the employer's ATS directly, but a normal `fetch()`
// with `redirect: "follow"` lands on the real posting page (verified against
// a live Workday-backed listing, 2026-09-15). `detail` fetches that resolved
// page; many ATS pages populate `<meta property="og:description">`
// server-side even when the visible body is client-rendered, so that is
// tried first before falling back to a generic strip-tags extraction.

export const README_URL =
  "https://raw.githubusercontent.com/zapplyjobs/New-Grad-Jobs-2027/main/README.md"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA = "Mozilla/5.0 (compatible; zapplyjobs-search-cli/1.0)"

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

/**
 * Like textFetch, but also reports the final URL after following redirects
 * (`Response.url`). `detail` needs this: a zapply.jobs Apply link that no
 * longer resolves to a live posting server-side-redirects back to
 * `zapply.jobs/jobs` (a generic listings page) instead of erroring -
 * confirmed live, 2026-09-15, on an Ashby-backed posting. Trusting that
 * page's own `og:description` would silently present zapply.jobs's own
 * marketing copy as if it were the job description, which is worse than an
 * honest null. Callers must check whether the returned URL is still on
 * zapply.jobs before trusting the page content.
 */
export async function fetchResolved(url: string): Promise<{ text: string; finalUrl: string }> {
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
    if (response.status === 404) return { text: "", finalUrl: response.url }
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    }
    return { text: await response.text(), finalUrl: response.url }
  }
  throw new Error("Request failed after max retries")
}

/** True if a resolved URL never left zapply.jobs - the Apply link's redirect
 * chain dead-ended back into the aggregator itself rather than reaching the
 * employer's ATS (see fetchResolved's doc comment). */
export function isUnresolvedZapplyUrl(finalUrl: string): boolean {
  try {
    const host = new URL(finalUrl).hostname
    return host === "zapply.jobs" || host.endsWith(".zapply.jobs")
  } catch {
    return false
  }
}

export interface JobRow {
  id: string
  title: string
  company: string | null
  location: string | null
  date: string | null // computed YYYY-MM-DD from the source's relative "Posted" age
  url: string
  category: string
  flags: string[] // "sponsorship_offered"
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

function stripMarkdownBold(text: string): string {
  return text.replace(/\*\*(.*?)\*\*/g, "$1").trim()
}

function clean(text: string): string {
  return decodeHtmlEntities(stripTags(stripMarkdownBold(text))).trim()
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

/** Convert the source's relative "Posted" age ("13m", "2h", "3d") to YYYY-MM-DD. */
export function ageToDate(age: string, now: Date = new Date()): string | null {
  const m = age.trim().match(/^(\d+)\s*(m|h|d|mo|y)$/i)
  if (!m) return null
  const n = parseInt(m[1], 10)
  const unit = m[2].toLowerCase()
  const minutes = unit === "m" ? n : unit === "h" ? n * 60 : unit === "d" ? n * 1440 : unit === "mo" ? n * 43200 : n * 525600
  const d = new Date(now.getTime() - minutes * 60 * 1000)
  return d.toISOString().slice(0, 10)
}

/**
 * Split the README into category sections. Each category is a
 * `<details><summary><h3>emoji <strong>Name</strong></h3></summary>...</details>`
 * block. The category list is derived from the file itself, not hardcoded.
 */
export function splitCategories(readme: string): { name: string; slug: string; body: string }[] {
  const blocks = readme.split(/<details>/i).slice(1)
  const sections: { name: string; slug: string; body: string }[] = []
  for (const block of blocks) {
    const end = block.search(/<\/details>/i)
    const content = end === -1 ? block : block.slice(0, end)
    const heading = content.match(/<summary>[\s\S]*?<strong>(.+?)<\/strong>[\s\S]*?<\/summary>/i)
    if (!heading) continue // not every <details> block in the README is a category (e.g. FAQ accordions)
    const name = clean(heading[1])
    const body = content.slice(content.search(/<\/summary>/i) + "</summary>".length)
    sections.push({ name, slug: slugify(name), body })
  }
  return sections
}

/**
 * Parse a Markdown table (`| Company | Role | Location | Posted | Visa | Apply |`)
 * into JobRows. One malformed row is skipped rather than aborting the whole
 * section, matching the chunked-parsing pattern used by the other portal
 * CLIs in this repo.
 */
export function parseCategoryRows(body: string, categorySlug: string, now: Date = new Date()): JobRow[] {
  const results: JobRow[] = []
  const lines = body.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("|"))

  for (const line of lines) {
    // Split on "| " boundaries; a raw split on "|" would also break on a "|"
    // that could appear inside a cell's own markdown, but no cell in this
    // table's schema legitimately contains one, so a plain split is safe.
    const cells = line
      .split("|")
      .slice(1, -1) // drop the empty strings before the first and after the last "|"
      .map((c) => c.trim())
    if (cells.length < 6) continue

    // Skip the header row and the "|---|---|" separator row.
    if (/^company$/i.test(cells[0]) || /^:?-+:?$/.test(cells[0])) continue

    const [companyCell, roleCell, locationCell, postedCell, visaCell, applyCell] = cells

    const company = clean(companyCell) || null
    if (!company) continue
    const title = clean(roleCell)
    if (!title) continue
    const location = clean(locationCell) || null

    const applyMatch = applyCell.match(/\]\(([^)]+)\)/)
    if (!applyMatch) continue
    const url = decodeHtmlEntities(applyMatch[1])

    const date = ageToDate(clean(postedCell), now)
    const flags: string[] = /sponsor/i.test(visaCell) ? ["sponsorship_offered"] : []

    results.push({
      id: makeId(company, title, url),
      title,
      company,
      location,
      date,
      url,
      category: categorySlug,
      flags,
    })
  }

  return results
}

export function parseAllJobs(readme: string, now: Date = new Date()): JobRow[] {
  const sections = splitCategories(readme)
  return sections.flatMap((s) => parseCategoryRows(s.body, s.slug, now))
}

/**
 * Best-effort description extraction for a job's real application page.
 * Tries the OpenGraph description meta tag first - many ATS platforms
 * (Workday included) populate it server-side for link-preview purposes even
 * when the visible page body is rendered client-side in JavaScript - then
 * falls back to a generic strip-tags extraction of the full page, and
 * finally to null with a note if neither yields substantial text. Never
 * fabricates a description; a page that genuinely has nothing gets `null`.
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
