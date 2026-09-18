import { describe, test, expect } from "bun:test";
import { runCLI, parseJSON } from "./helpers";

// Live smoke test against the real GitHub-hosted file. Network-dependent;
// keep this file's request count minimal (one search call).
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
