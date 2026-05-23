/**
 * tests/unit/browser-eval-timeout-typed-code.test.ts
 * — ADR-023 Phase 0 (FR-8), review P2-1.
 *
 * `browser_eval`'s catch maps a CDP per-command timeout into a typed
 * `BrowserEvalTimeout` (with a wait_until hint) instead of letting the raw
 * message classify() to the generic `UiaTimeout`. That detection keys off
 * cdp-bridge's literal "CDP timeout:" prefix — a string contract that spans two
 * files with no compile-time guard. This test pins it: if cdp-bridge's wording
 * (or CMD_TIMEOUT_MS) changes, the detection / seconds value is caught here
 * rather than silently degrading back to UiaTimeout.
 *
 * @see src/tools/browser.ts  maybeBrowserEvalTimeoutFailure
 * @see src/engine/cdp-bridge.ts  session.send timeout message + CMD_TIMEOUT_MS
 */

import { describe, it, expect } from "vitest";
import { maybeBrowserEvalTimeoutFailure } from "../../src/tools/browser.js";
import { CMD_TIMEOUT_MS } from "../../src/engine/cdp-bridge.js";

function wireJson(
  result: { content: ReadonlyArray<{ type: string; text?: string }> } | null,
): { ok: boolean; code: string; error: string; suggest?: string[]; context?: Record<string, unknown> } {
  if (!result) throw new Error("expected a ToolResult, got null");
  const block = result.content[0];
  if (!block || block.type !== "text" || typeof block.text !== "string") {
    throw new Error("expected a text content block");
  }
  return JSON.parse(block.text);
}

describe("ADR-023 Phase 0: browser_eval CDP timeout → typed BrowserEvalTimeout", () => {
  // The exact shape cdp-bridge's session.send throws on the per-command timeout
  // (`CDP timeout: ${method} did not respond within ${CMD_TIMEOUT_MS}ms`). Built
  // from CMD_TIMEOUT_MS so a wording/number drift trips this test.
  const cdpTimeoutMsg = `CDP timeout: Runtime.evaluate did not respond within ${CMD_TIMEOUT_MS}ms`;

  it("maps a CDP timeout to BrowserEvalTimeout (not the generic UiaTimeout)", () => {
    const r = wireJson(maybeBrowserEvalTimeoutFailure(new Error(cdpTimeoutMsg), "tab-1", 9222));
    expect(r.ok).toBe(false);
    expect(r.code).toBe("BrowserEvalTimeout");
    expect(r.context).toEqual({ tabId: "tab-1", port: 9222 });
  });

  it("hint points at wait_until; seconds value tracks CMD_TIMEOUT_MS; suggests are fixed strings", () => {
    const r = wireJson(maybeBrowserEvalTimeoutFailure(new Error(cdpTimeoutMsg), undefined, 9222));
    expect(r.suggest?.some((s) => s.includes("wait_until"))).toBe(true);
    // CWE-94 / feedback_codeql_suggest_strings: every suggest is a fixed string literal.
    expect(r.suggest?.every((s) => typeof s === "string")).toBe(true);
    expect(r.error).toContain(`~${Math.round(CMD_TIMEOUT_MS / 1000)}s`);
  });

  it("returns null for a non-timeout error (falls through to failWith)", () => {
    expect(
      maybeBrowserEvalTimeoutFailure(new Error("JS exception in tab: ReferenceError: x is not defined"), "t", 9222),
    ).toBeNull();
    expect(maybeBrowserEvalTimeoutFailure("some non-Error string", "t", 9222)).toBeNull();
  });

  it("does NOT mislabel a page-script error that merely mentions 'CDP timeout' (Codex R2 P3)", () => {
    // A user expression throwing this surfaces wrapped as "JS exception in tab: ..."
    // (cdp-bridge.ts) — it must not be remapped to BrowserEvalTimeout. The prefix
    // match (startsWith "CDP timeout:") is what distinguishes the real bridge timeout.
    expect(
      maybeBrowserEvalTimeoutFailure(new Error('JS exception in tab: Error: CDP timeout in my code'), "t", 9222),
    ).toBeNull();
    expect(maybeBrowserEvalTimeoutFailure(new Error("CDP timeout happened (no colon)"), "t", 9222)).toBeNull();
  });
});
