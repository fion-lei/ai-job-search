import { describe, test, expect } from "bun:test";
import { ageToDate, makeId, slugify, splitCategories, parseCategoryRows, parseAllJobs, parseGenericDescription } from "../src/helpers";

function table(rows: string): string {
  return `<table><thead><tr><th>Company</th><th>Role</th><th>Location</th><th>Application</th><th>Age</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function row(company: string, role: string, location: string, applyUrl: string, age: string): string {
  return `<tr><td>${company}</td><td>${role}</td><td>${location}</td><td><div align="center"><a href="${applyUrl}"><img src="x" alt="Apply"></a> <a href="https://simplify.jobs/p/abc"><img src="y" alt="Simplify"></a></div></td><td>${age}</td></tr>`;
}

describe("slugify / makeId", () => {
  test("slugifies company names to lowercase-hyphen", () => {
    expect(slugify("Acme & Co.")).toBe("acme-co");
  });

  test("makeId is a pure function of company+title+url", () => {
    const a = makeId("Acme", "Software Engineer", "https://acme.example/jobs/1");
    const b = makeId("Acme", "Software Engineer", "https://acme.example/jobs/1");
    expect(a).toBe(b);
  });

  test("makeId differs when the URL differs (two reqs, same title)", () => {
    const a = makeId("Acme", "Software Engineer", "https://acme.example/jobs/1");
    const b = makeId("Acme", "Software Engineer", "https://acme.example/jobs/2");
    expect(a).not.toBe(b);
  });
});

describe("ageToDate", () => {
  const now = new Date("2026-09-15T00:00:00Z");

  test("converts days", () => {
    expect(ageToDate("7d", now)).toBe("2026-09-08");
  });

  test("converts 0d to today", () => {
    expect(ageToDate("0d", now)).toBe("2026-09-15");
  });

  test("converts months (approximate, 30 days each)", () => {
    expect(ageToDate("1mo", now)).toBe("2026-08-16");
  });

  test("returns null for an unrecognized format", () => {
    expect(ageToDate("yesterday", now)).toBeNull();
  });
});

describe("splitCategories", () => {
  test("splits on '## <emoji> <Name> New Grad Roles' headings", () => {
    const readme = [
      "# Intro",
      "## \u{1F4BB} Software Engineering New Grad Roles",
      "SWE body",
      "## \u{1F916} Data Science, AI & Machine Learning New Grad Roles",
      "DS body",
    ].join("\n");
    const sections = splitCategories(readme);
    expect(sections.map((s) => s.slug)).toEqual(["software-engineering", "data-science-ai-machine-learning"]);
    expect(sections[0].body).toContain("SWE body");
    expect(sections[0].body).not.toContain("DS body");
    expect(sections[1].body).toContain("DS body");
  });
});

describe("parseCategoryRows", () => {
  const now = new Date("2026-09-15T00:00:00Z");

  test("parses a simple single-location row", () => {
    const body = table(
      row(
        '<strong><a href="https://simplify.jobs/c/Acme">Acme</a></strong>',
        "Software Engineer New Grad",
        "Calgary, AB, Canada",
        "https://boards.greenhouse.io/acme/jobs/1",
        "0d",
      ),
    );
    const [job] = parseCategoryRows(body, "software-engineering", now);
    expect(job.company).toBe("Acme");
    expect(job.title).toBe("Software Engineer New Grad");
    expect(job.location).toBe("Calgary, AB, Canada");
    expect(job.url).toBe("https://boards.greenhouse.io/acme/jobs/1");
    expect(job.date).toBe("2026-09-15");
    expect(job.category).toBe("software-engineering");
    expect(job.closed).toBe(false);
    expect(job.flags).toEqual([]);
  });

  test("a continuation row (↳) reuses the previous company", () => {
    const body = table(
      row(
        '<strong><a href="https://simplify.jobs/c/Acme">Acme</a></strong>',
        "Role A",
        "Remote",
        "https://acme.example/jobs/1",
        "1d",
      ) +
        row("↳", "Role B", "Remote", "https://acme.example/jobs/2", "1d"),
    );
    const jobs = parseCategoryRows(body, "software-engineering", now);
    expect(jobs).toHaveLength(2);
    expect(jobs[1].company).toBe("Acme");
  });

  test("strips legend emoji from the title and records flags", () => {
    const body = table(
      row(
        '<strong><a href="https://simplify.jobs/c/Acme">Acme</a></strong>',
        "Data Scientist New Grad \u{1F393}",
        "Remote",
        "https://acme.example/jobs/1",
        "2d",
      ),
    );
    const [job] = parseCategoryRows(body, "data-science-ai-machine-learning", now);
    expect(job.title).toBe("Data Scientist New Grad");
    expect(job.flags).toEqual(["advanced_degree_required"]);
  });

  test("marks a 🔒 row as closed", () => {
    const body = table(
      row(
        '<strong><a href="https://simplify.jobs/c/Acme">Acme</a></strong>',
        "Old Role \u{1F512}",
        "Remote",
        "https://acme.example/jobs/1",
        "30d",
      ),
    );
    const [job] = parseCategoryRows(body, "software-engineering", now);
    expect(job.closed).toBe(true);
  });

  test("joins a multi-location <details> row with '; '", () => {
    const multi =
      '<details><summary><strong>2 locations</strong></summary>Toronto, ON, Canada</br>Calgary, AB, Canada</details>';
    const body = table(
      row(
        '<strong><a href="https://simplify.jobs/c/Acme">Acme</a></strong>',
        "Role",
        multi,
        "https://acme.example/jobs/1",
        "3d",
      ),
    );
    const [job] = parseCategoryRows(body, "software-engineering", now);
    expect(job.location).toBe("Toronto, ON, Canada; Calgary, AB, Canada");
  });

  test("skips a row with no Apply link", () => {
    const body = `<table><tbody><tr><td>Acme</td><td>Role</td><td>Remote</td><td></td><td>1d</td></tr></tbody></table>`;
    expect(parseCategoryRows(body, "software-engineering", now)).toHaveLength(0);
  });

  test("one malformed row does not break parsing of the rest", () => {
    const good = row(
      '<strong><a href="https://simplify.jobs/c/Acme">Acme</a></strong>',
      "Good Role",
      "Remote",
      "https://acme.example/jobs/1",
      "1d",
    );
    const bad = "<tr><td>Broken</td></tr>";
    const body = table(bad + good);
    const jobs = parseCategoryRows(body, "software-engineering", now);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].title).toBe("Good Role");
  });
});

describe("parseAllJobs", () => {
  test("parses across multiple category sections", () => {
    const readme = [
      "## \u{1F4BB} Software Engineering New Grad Roles",
      table(
        row(
          '<strong><a href="https://simplify.jobs/c/Acme">Acme</a></strong>',
          "SWE Role",
          "Remote",
          "https://acme.example/jobs/1",
          "1d",
        ),
      ),
      "## \u{1F916} Data Science, AI & Machine Learning New Grad Roles",
      table(
        row(
          '<strong><a href="https://simplify.jobs/c/Beta">Beta</a></strong>',
          "DS Role",
          "Remote",
          "https://beta.example/jobs/1",
          "1d",
        ),
      ),
    ].join("\n");
    const jobs = parseAllJobs(readme, new Date("2026-09-15T00:00:00Z"));
    expect(jobs.map((j) => j.category)).toEqual(["software-engineering", "data-science-ai-machine-learning"]);
  });
});

describe("parseGenericDescription", () => {
  test("returns null with a note for an empty page", () => {
    const { description, note } = parseGenericDescription("");
    expect(description).toBeNull();
    expect(note).toContain("did not load");
  });

  test("returns null with a note for a near-empty JS-shell page", () => {
    const { description, note } = parseGenericDescription('<html><body><div id="app"></div></body></html>');
    expect(description).toBeNull();
    expect(note).toContain("JavaScript");
  });

  test("extracts and cleans real text content", () => {
    const paragraph =
      "We are looking for a great engineer with strong fundamentals and a genuine passion for building things people love, working closely with product and design every single day, on problems that matter to millions of users across the platform.";
    const html = `<html><body><script>evil()</script><h1>Software Engineer</h1><p>${paragraph}</p></body></html>`;
    const { description } = parseGenericDescription(html);
    expect(description).toContain("Software Engineer");
    expect(description).not.toContain("evil()");
  });
});
