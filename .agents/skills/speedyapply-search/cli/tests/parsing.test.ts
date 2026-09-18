import { describe, test, expect } from "bun:test";
import {
  ageToDate,
  makeId,
  slugify,
  splitCategories,
  parseCategoryRows,
  parseAllJobs,
  parseGenericDescription,
} from "../src/helpers";

function row(company: string, position: string, location: string, salary: string | null, applyUrl: string, age: string): string {
  const salaryCell = salary === null ? "" : ` ${salary} |`;
  return `| <a href="https://example.com"><strong>${company}</strong></a> | ${position} | ${location} |${salaryCell} <a href="${applyUrl}"><img src="x" alt="Apply" width="70"/></a> | ${age} |`;
}

function tableWithSalary(rows: string): string {
  return `\n| Company | Position | Location | Salary | Posting | Age |\n|---|---|---|---|---|---|\n${rows}\n`;
}

function tableNoSalary(rows: string): string {
  return `\n| Company | Position | Location | Posting | Age |\n|---|---|---|---|---|\n${rows}\n`;
}

describe("slugify / makeId", () => {
  test("slugifies category names to lowercase-hyphen", () => {
    expect(slugify("FAANG+")).toBe("faang");
  });

  test("makeId is a pure function of company+title+url", () => {
    const a = makeId("OpenAI", "Software Engineer", "https://jobs.ashbyhq.com/openai/1");
    const b = makeId("OpenAI", "Software Engineer", "https://jobs.ashbyhq.com/openai/1");
    expect(a).toBe(b);
  });

  test("makeId differs when the URL differs", () => {
    const a = makeId("OpenAI", "Role", "https://jobs.ashbyhq.com/openai/aaaa-1111");
    const b = makeId("OpenAI", "Role", "https://boards.greenhouse.io/openai/jobs/2222");
    expect(a).not.toBe(b);
  });
});

describe("ageToDate", () => {
  const now = new Date("2026-09-15T12:00:00Z");

  test("converts whole days (the only unit observed live)", () => {
    expect(ageToDate("34d", now)).toBe("2026-08-12");
  });

  test("converts 0d to today", () => {
    expect(ageToDate("0d", now)).toBe("2026-09-15");
  });

  test("returns null for an unrecognized format", () => {
    expect(ageToDate("yesterday", now)).toBeNull();
  });
});

describe("splitCategories", () => {
  test("keeps only sections with a real table, dropping navigation headings", () => {
    const source = [
      "### USA Positions",
      "- [Internships](/) - 660 available",
      "### FAANG+",
      tableWithSalary(row("OpenAI", "SWE", "SF, CA", "$242k/yr", "https://a.example/1", "0d")),
      "### Other",
      tableNoSalary(row("Acme", "SWE", "Remote", null, "https://a.example/2", "1d")),
    ].join("\n\n");
    const sections = splitCategories(source);
    expect(sections.map((s) => s.slug)).toEqual(["faang", "other"]);
  });
});

describe("parseCategoryRows", () => {
  const now = new Date("2026-09-15T12:00:00Z");

  test("parses a row with a Salary column", () => {
    const body = tableWithSalary(row("OpenAI", "Software Engineer - Applied Emerging Talent - 2027", "San Francisco, CA", "$242k/yr", "https://jobs.ashbyhq.com/openai/1", "0d"));
    const [job] = parseCategoryRows(body, "faang", now);
    expect(job.company).toBe("OpenAI");
    expect(job.title).toBe("Software Engineer - Applied Emerging Talent - 2027");
    expect(job.location).toBe("San Francisco, CA");
    expect(job.salary).toBe("$242k/yr");
    expect(job.url).toBe("https://jobs.ashbyhq.com/openai/1");
    expect(job.date).toBe("2026-09-15");
    expect(job.category).toBe("faang");
  });

  test("parses a row with no Salary column (salary: null, not a shifted field)", () => {
    const body = tableNoSalary(row("Acme", "Software Engineer", "Remote", null, "https://acme.example/1", "1d"));
    const [job] = parseCategoryRows(body, "other", now);
    expect(job.company).toBe("Acme");
    expect(job.title).toBe("Software Engineer");
    expect(job.location).toBe("Remote");
    expect(job.salary).toBeNull();
    expect(job.url).toBe("https://acme.example/1");
  });

  test("skips the header and separator rows", () => {
    const body = tableWithSalary(row("Acme", "Role", "Remote", "$100k/yr", "https://acme.example/1", "1d"));
    expect(parseCategoryRows(body, "faang", now)).toHaveLength(1);
  });

  test("returns empty when the table has no Company/Position/Posting header (unrecognized shape)", () => {
    const body = "\n| Foo | Bar |\n|---|---|\n| a | b |\n";
    expect(parseCategoryRows(body, "faang", now)).toHaveLength(0);
  });

  test("one malformed row does not break parsing of the rest", () => {
    const good = row("Acme", "Good Role", "Remote", "$100k/yr", "https://acme.example/1", "1d");
    const bad = "| Broken |";
    const body = tableWithSalary(`${bad}\n${good}`);
    const jobs = parseCategoryRows(body, "faang", now);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].title).toBe("Good Role");
  });
});

describe("parseAllJobs", () => {
  test("parses across multiple category sections with different column sets", () => {
    const source = [
      "### FAANG+",
      tableWithSalary(row("OpenAI", "SWE Role", "SF, CA", "$242k/yr", "https://a.example/1", "0d")),
      "### Other",
      tableNoSalary(row("Acme", "SWE Role", "Remote", null, "https://a.example/2", "1d")),
    ].join("\n\n");
    const jobs = parseAllJobs(source, new Date("2026-09-15T12:00:00Z"));
    expect(jobs.map((j) => j.category)).toEqual(["faang", "other"]);
    expect(jobs[0].salary).toBe("$242k/yr");
    expect(jobs[1].salary).toBeNull();
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
      "OpenAI is hiring a Software Engineer to work on applied emerging talent initiatives across the organization, partnering closely with research and product teams.";
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
