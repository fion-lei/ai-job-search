import { describe, test, expect } from "bun:test";
import { runCLI, parseJSON } from "./helpers";

// Live smoke test against the real GitHub-hosted README. Network-dependent;
// keep this file's request count minimal (one search call). Intentionally no
// --location filter: this is a small, live, moment-in-time list, and a
// combined query+city filter can legitimately have zero matches on a given
// day (e.g. "software engineer" + "Calgary" did on 2026-09-15) without that
// being a parsing bug - narrowing this test to query-only keeps it stable.
describe("live search", () => {
  test("search returns real results with non-null id/title/url", async () => {
    const result = await runCLI(["search", "-q", "software engineer", "--limit", "5"]);
    expect(result.exitCode).toBe(0);
    const body = parseJSON<{ meta: { count: number }; results: any[] }>(result);
    expect(body.results.length).toBeGreaterThan(0);
    for (const job of body.results) {
      expect(job.id).toBeTruthy();
      expect(job.title).toBeTruthy();
      expect(job.url).toMatch(/^https?:\/\//);
    }
  }, 30000);
});
