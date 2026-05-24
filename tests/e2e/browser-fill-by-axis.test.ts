/**
 * browser-fill-by-axis.test.ts — E2E for ADR-023 Phase 1 PR4 browser_fill({by}).
 *
 * by-axis fill is fully headless-testable end to end: BOTH the resolve gather and
 * the act (focus + native-setter value + dispatch) run via CDP eval — no physical
 * mouse — so the resolved-fill success path is covered here against real Chrome,
 * along with the ambiguous / not-fillable / no-actionable / error stops.
 *
 * @see src/tools/browser.ts  handleBrowserFillByAxis
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { launchChrome, tryFindChrome, type ChromeInstance } from "./helpers/chrome-launcher.js";
import { sleep } from "./helpers/wait.js";
import { evaluateInTab, disconnectAll } from "../../src/engine/cdp-bridge.js";
import { browserFillInputHandler } from "../../src/tools/browser.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(__dirname, "fixtures", "resolver-gsc-like.html");
const TEST_PORT = 9231;
const FIXTURE_URL = `file:///${FIXTURE_PATH.replace(/\\/g, "/")}`;
const CHROME_AVAILABLE = tryFindChrome() !== null;

let chrome: ChromeInstance;

beforeAll(async () => {
  if (!CHROME_AVAILABLE) return;
  chrome = await launchChrome(TEST_PORT, true /* headless */, FIXTURE_URL);
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const ready = await evaluateInTab(
        `document.readyState === 'complete' && document.querySelector('#email-input') !== null && ` +
        `document.querySelector('#email-input').getBoundingClientRect().width > 0`,
        null, TEST_PORT);
      if (ready === true) return;
    } catch { /* ignore */ }
    await sleep(250);
  }
  throw new Error("Fixture did not lay out within 15s");
}, 20_000);

afterAll(() => {
  disconnectAll(TEST_PORT);
  chrome?.kill();
});

function payload(r: { content: Array<{ type: string; text?: string }> }): Record<string, unknown> {
  const text = r.content[0]?.type === "text" ? r.content[0].text ?? "{}" : "{}";
  return JSON.parse(text) as Record<string, unknown>;
}

async function fill(args: Record<string, unknown>) {
  return payload(await browserFillInputHandler({
    value: "", includeContext: false, port: TEST_PORT, ...args,
  } as Parameters<typeof browserFillInputHandler>[0]));
}

describe.skipIf(!CHROME_AVAILABLE)("browser_fill by-axis — resolved fill (AC-4, headless)", () => {
  it("resolves an input by aria-label and fills it (value lands in the DOM)", async () => {
    await evaluateInTab("document.querySelector('#email-input').value = ''", null, TEST_PORT);
    const r = await fill({ by: "ariaLabel", pattern: "Email address", value: "user@example.com" });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(r.actual).toBe("user@example.com");
    const domVal = await evaluateInTab("document.querySelector('#email-input').value", null, TEST_PORT);
    expect(domVal).toBe("user@example.com");
  });

  it("overwrites an existing value (select-all + native setter)", async () => {
    await evaluateInTab("document.querySelector('#email-input').value = 'old text'", null, TEST_PORT);
    const r = await fill({ by: "ariaLabel", pattern: "Email address", value: "fresh" });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    const domVal = await evaluateInTab("document.querySelector('#email-input').value", null, TEST_PORT);
    expect(domVal).toBe("fresh");
  });
});

describe.skipIf(!CHROME_AVAILABLE)("browser_fill by-axis — stops (headless)", () => {
  it("ambiguous match → BrowserAmbiguousTarget (no fill)", async () => {
    const r = await fill({ by: "text", pattern: "Save", value: "x" });
    expect(r.ok, JSON.stringify(r)).toBe(false);
    expect(r.code).toBe("BrowserAmbiguousTarget");
  });

  it("resolves uniquely to a non-fillable element → BrowserNoActionableTarget (act-stage gate)", async () => {
    // "Compose Email" matches the inner span; resolves (climbs) to the <button>,
    // which is not fillable → the act eval returns not_fillable.
    const r = await fill({ by: "text", pattern: "Compose Email", value: "x" });
    expect(r.ok, JSON.stringify(r)).toBe(false);
    expect(r.code).toBe("BrowserNoActionableTarget");
  });

  it("matched text with no strong clickable → BrowserNoActionableTarget (resolve-stage)", async () => {
    const r = await fill({ by: "text", pattern: "Just a label Foobar", value: "x" });
    expect(r.ok, JSON.stringify(r)).toBe(false);
    expect(r.code).toBe("BrowserNoActionableTarget");
  });

  it("invalid scope → ScopeNotFound", async () => {
    const r = await fill({ by: "ariaLabel", pattern: "Email address", scope: "#no-such-scope", value: "x" });
    expect(r.ok, JSON.stringify(r)).toBe(false);
    expect(r.code).toBe("ScopeNotFound");
  });
});
