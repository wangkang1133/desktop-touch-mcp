/**
 * e2e-stop-sentinel.test.ts — unit coverage for the e2e emergency-stop sentinel
 * helpers (tests/e2e/helpers/stop-sentinel.ts). Exercised against a TEMP path so
 * the real repo-root `.e2e-stop` is never touched (touching it could abort a
 * concurrent e2e run).
 */
import { describe, it, expect, afterEach } from "vitest";
import { existsSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  isStopRequested,
  requestStop,
  clearStop,
  STOP_SENTINEL_PATH,
} from "../e2e/helpers/stop-sentinel.js";

const tmp = mkdtempSync(join(tmpdir(), "e2e-stop-"));
const SENTINEL = join(tmp, ".e2e-stop");

afterEach(() => clearStop(SENTINEL));

describe("e2e stop sentinel", () => {
  it("round-trips request → detected → cleared", () => {
    expect(isStopRequested(SENTINEL)).toBe(false);
    requestStop(SENTINEL);
    expect(isStopRequested(SENTINEL)).toBe(true);
    expect(existsSync(SENTINEL)).toBe(true);
    clearStop(SENTINEL);
    expect(isStopRequested(SENTINEL)).toBe(false);
  });

  it("clearStop is idempotent and never throws when the sentinel is absent", () => {
    expect(() => {
      clearStop(SENTINEL);
      clearStop(SENTINEL);
    }).not.toThrow();
    expect(isStopRequested(SENTINEL)).toBe(false);
  });

  it("the default sentinel lives at the repo root as .e2e-stop", () => {
    expect(STOP_SENTINEL_PATH.replace(/\\/g, "/").endsWith("/.e2e-stop")).toBe(true);
  });
});

// One-time cleanup of the temp dir when the process exits.
process.on("exit", () => {
  try {
    rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});
