import { describe, expect, test } from "bun:test";
import { runCLI } from "./helpers";

function parsedStderr(stderr: string): { error?: string; code?: string } {
  try {
    return JSON.parse(stderr);
  } catch {
    return {};
  }
}

describe("zapplyjobs-canada CLI flag validation", () => {
  test("no args prints help and exits 1", async () => {
    const result = await runCLI([]);
    expect(result.exitCode).toBe(1);
  });

  test("search --help exits 0 and prints usage", async () => {
    const result = await runCLI(["search", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("USAGE");
  });

  test("detail with no id exits 1 with NO_ID", async () => {
    const result = await runCLI(["detail"]);
    expect(result.exitCode).toBe(1);
    expect(parsedStderr(result.stderr).code).toBe("NO_ID");
  });

  test("unknown command exits 1 with BAD_CMD", async () => {
    const result = await runCLI(["bogus-command"]);
    expect(result.exitCode).toBe(1);
    expect(parsedStderr(result.stderr).code).toBe("BAD_CMD");
  });

  for (const name of ["jobage", "page", "limit"]) {
    test(`--${name} 0 exits 1 with BAD_ARG`, async () => {
      const result = await runCLI(["search", `--${name}`, "0"]);
      expect(result.exitCode).toBe(1);
      const err = parsedStderr(result.stderr);
      expect(err.code).toBe("BAD_ARG");
      expect(err.error).toMatch(new RegExp(name));
    });

    test(`--${name} 1.5 exits 1 with BAD_ARG (fractional rejected, not truncated)`, async () => {
      const result = await runCLI(["search", `--${name}`, "1.5"]);
      expect(result.exitCode).toBe(1);
      expect(parsedStderr(result.stderr).code).toBe("BAD_ARG");
    });

    test(`--${name} foo exits 1 with BAD_ARG`, async () => {
      const result = await runCLI(["search", `--${name}`, "foo"]);
      expect(result.exitCode).toBe(1);
      expect(parsedStderr(result.stderr).code).toBe("BAD_ARG");
    });
  }
});

describe("unknown flag rejection", () => {
  test("a bogus --flag exits 1 with UNKNOWN_FLAG", async () => {
    const result = await runCLI(["search", "-q", "test", "--bogus-flag", "xyz"]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    const error = parsedStderr(result.stderr);
    expect(error.code).toBe("UNKNOWN_FLAG");
    expect(error.error).toContain("--bogus-flag");
  });

  test("an undeclared short flag exits 1 with UNKNOWN_FLAG", async () => {
    const result = await runCLI(["search", "-z", "bogus"]);
    expect(result.exitCode).toBe(1);
    expect(parsedStderr(result.stderr).code).toBe("UNKNOWN_FLAG");
  });

  test("the declared short -q survives the guard", async () => {
    const result = await runCLI(["search", "-q", "test", "--bogus-flag", "xyz"]);
    const error = parsedStderr(result.stderr);
    expect(error.error).toContain("--bogus-flag");
    expect(error.error).not.toContain("-q ");
  });

  test("-h still prints help rather than being rejected as unknown", async () => {
    const result = await runCLI(["search", "-h"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
  });
});
