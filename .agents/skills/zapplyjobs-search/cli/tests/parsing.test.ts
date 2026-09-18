import { describe, test, expect } from "bun:test";
import {
  ageToDate,
  makeId,
  slugify,
  splitCategories,
  parseCategoryRows,
  parseAllJobs,
  parseGenericDescription,
  isUnresolvedZapplyUrl,
} from "../src/helpers";

function detailsBlock(name: string, emoji: string, tableRows: string): string {
  return `<details>\n<summary><h3>${emoji} <strong>${name}</strong></h3></summary>\n\n| Company | Role | Location | Posted | Visa | **Apply** |\n|---------|------|----------|--------|------|----------|\n${tableRows}\n</details>`;
}

function mdRow(company: string, role: string, location: string, posted: string, visa: string, applyUrl: string): string {
  return `| **${company}** | ${role} | ${location} | ${posted} | ${visa} | [<img src="images/apply.png" width="80" alt="Apply">](${applyUrl}) |`;
}

describe("slugify / makeId", () => {
  test("slugifies category names to lowercase-hyphen", () => {
    expect(slugify("Data, AI & Research")).toBe("data-ai-research");
  });

  test("makeId is a pure function of company+title+url", () => {
    const a = makeId("KLA", "Cloud Platform Engineer", "https://zapply.jobs/l/d/abc");
    const b = makeId("KLA", "Cloud Platform Engineer", "https://zapply.jobs/l/d/abc");
    expect(a).toBe(b);
  });

  test("makeId differs when the URL differs", () => {
    const a = makeId("KLA", "Role", "https://zapply.jobs/l/d/1");
    const b = makeId("KLA", "Role", "https://zapply.jobs/l/d/2");
    expect(a).not.toBe(b);
  });
});

describe("ageToDate", () => {
  const now = new Date("2026-09-15T12:00:00Z");

  test("converts minutes", () => {
    expect(ageToDate("30m", now)).toBe("2026-09-15");
  });

  test("converts hours", () => {
    expect(ageToDate("3h", now)).toBe("2026-09-15");
  });

  test("converts days", () => {
    expect(ageToDate("2d", now)).toBe("2026-09-13");
  });

  test("returns null for an unrecognized format", () => {
    expect(ageToDate("yesterday", now)).toBeNull();
  });
});

describe("splitCategories", () => {
  test("splits on <details><summary><h3>...<strong>Name</strong> blocks", () => {
    const readme = [
      "# Intro",
      detailsBlock("Software Engineering", "\u{1F4BB}", mdRow("Acme", "SWE", "Remote", "1h", "", "https://zapply.jobs/l/d/1")),
      detailsBlock("Data, AI & Research", "\u{1F916}", mdRow("Beta", "DS", "Remote", "1h", "✅ Sponsor", "https://zapply.jobs/l/d/2")),
    ].join("\n\n");
    const sections = splitCategories(readme);
    expect(sections.map((s) => s.slug)).toEqual(["software-engineering", "data-ai-research"]);
  });

  test("ignores a <details> block with no <h3><strong> heading (e.g. an FAQ accordion)", () => {
    const readme = "<details><summary>Not a category</summary>some text</details>";
    expect(splitCategories(readme)).toHaveLength(0);
  });
});

describe("parseCategoryRows", () => {
  const now = new Date("2026-09-15T12:00:00Z");

  test("parses a simple row", () => {
    const body = `\n| Company | Role | Location | Posted | Visa | **Apply** |\n|---------|------|----------|--------|------|----------|\n${mdRow("KLA", "Cloud Platform Engineer", "Milpitas, CA", "13m", "✅ Sponsor", "https://zapply.jobs/l/d/workday-kla-2639358?s=x")}\n`;
    const [job] = parseCategoryRows(body, "software-engineering", now);
    expect(job.company).toBe("KLA");
    expect(job.title).toBe("Cloud Platform Engineer");
    expect(job.location).toBe("Milpitas, CA");
    expect(job.url).toBe("https://zapply.jobs/l/d/workday-kla-2639358?s=x");
    expect(job.category).toBe("software-engineering");
    expect(job.flags).toEqual(["sponsorship_offered"]);
  });

  test("a blank Visa cell means no flag (not stated, not 'no sponsorship')", () => {
    const body = `\n| Company | Role | Location | Posted | Visa | **Apply** |\n|---------|------|----------|--------|------|----------|\n${mdRow("Acme", "Role", "Remote", "1h", "", "https://zapply.jobs/l/d/1")}\n`;
    const [job] = parseCategoryRows(body, "software-engineering", now);
    expect(job.flags).toEqual([]);
  });

  test("skips the header and separator rows", () => {
    const body = `\n| Company | Role | Location | Posted | Visa | **Apply** |\n|---------|------|----------|--------|------|----------|\n${mdRow("Acme", "Role", "Remote", "1h", "", "https://zapply.jobs/l/d/1")}\n`;
    expect(parseCategoryRows(body, "software-engineering", now)).toHaveLength(1);
  });

  test("skips a row with no Apply link", () => {
    const body = `| **Acme** | Role | Remote | 1h |  |  |`;
    expect(parseCategoryRows(body, "software-engineering", now)).toHaveLength(0);
  });

  test("one malformed row does not break parsing of the rest", () => {
    const good = mdRow("Acme", "Good Role", "Remote", "1h", "", "https://zapply.jobs/l/d/1");
    const bad = "| Broken |";
    const body = `\n| Company | Role | Location | Posted | Visa | **Apply** |\n|---------|------|----------|--------|------|----------|\n${bad}\n${good}\n`;
    const jobs = parseCategoryRows(body, "software-engineering", now);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].title).toBe("Good Role");
  });
});

describe("parseAllJobs", () => {
  test("parses across multiple category sections", () => {
    const readme = [
      detailsBlock("Software Engineering", "\u{1F4BB}", mdRow("Acme", "SWE Role", "Remote", "1h", "", "https://zapply.jobs/l/d/1")),
      detailsBlock("Data, AI & Research", "\u{1F916}", mdRow("Beta", "DS Role", "Remote", "1h", "", "https://zapply.jobs/l/d/2")),
    ].join("\n\n");
    const jobs = parseAllJobs(readme, new Date("2026-09-15T12:00:00Z"));
    expect(jobs.map((j) => j.category)).toEqual(["software-engineering", "data-ai-research"]);
  });
});

describe("parseGenericDescription", () => {
  test("returns null with a note for an empty page", () => {
    const { description, note } = parseGenericDescription("");
    expect(description).toBeNull();
    expect(note).toContain("did not load");
  });

  test("prefers og:description when substantial", () => {
    const ogText =
      "KLA is a global leader in diversified electronics for the semiconductor manufacturing ecosystem, hiring a Cloud Platform Engineer to build and operate internal infrastructure at scale.";
    const html = `<html><head><meta property="og:description" content="${ogText}"></head><body><div id="app"></div></body></html>`;
    const { description, note } = parseGenericDescription(html);
    expect(description).toBe(ogText);
    expect(note).toContain("og:description");
  });

  test("falls back to generic extraction when og:description is missing or short", () => {
    const paragraph =
      "We are looking for a great engineer with strong fundamentals and a genuine passion for building things people love, working closely with product and design every single day, on problems that matter to millions of users.";
    const html = `<html><body><script>evil()</script><h1>Software Engineer</h1><p>${paragraph}</p></body></html>`;
    const { description } = parseGenericDescription(html);
    expect(description).toContain("Software Engineer");
    expect(description).not.toContain("evil()");
  });

  test("returns null with a note for a near-empty JS-shell page with no og:description", () => {
    const { description, note } = parseGenericDescription('<html><body><div id="app"></div></body></html>');
    expect(description).toBeNull();
    expect(note).toContain("JavaScript");
  });
});

describe("isUnresolvedZapplyUrl", () => {
  // Regression: an Ashby-backed Apply link server-side-redirected back to
  // https://zapply.jobs/jobs instead of the real posting (confirmed live,
  // 2026-09-15). Trusting that page's og:description would have silently
  // presented zapply.jobs's own marketing copy as the job description.
  test("true when the resolved URL is still on zapply.jobs", () => {
    expect(isUnresolvedZapplyUrl("https://zapply.jobs/jobs/")).toBe(true);
  });

  test("false when the resolved URL reached the employer's ATS", () => {
    expect(
      isUnresolvedZapplyUrl("https://kla.wd1.myworkdayjobs.com/Search/job/Milpitas-CA/Cloud-Platform-Engineer_2639358"),
    ).toBe(false);
  });

  test("false for a lookalike domain that merely ends with the same letters", () => {
    expect(isUnresolvedZapplyUrl("https://evilzapply.jobs/x")).toBe(false);
  });

  test("true for a genuine zapply.jobs subdomain", () => {
    expect(isUnresolvedZapplyUrl("https://app.zapply.jobs/onboarding")).toBe(true);
  });

  test("returns false for an unparseable URL rather than throwing", () => {
    expect(isUnresolvedZapplyUrl("not a url")).toBe(false);
  });
});
