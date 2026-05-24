/**
 * browser-click-minimized.test.ts — E2E for the minimized-window click guard.
 *
 * Repro of the dogfood bug: a CDP target Chrome that is MINIMIZED reports
 * window.screenX/screenY === -32000 (the Windows parking marker) while the page
 * layout stays valid, so browser_click's viewport→screen conversion yields an
 * off-screen-negative point the OS clamps to (0,0). The resulting top-left click
 * trips the failsafe dwell and kills the server (Connection closed).
 *
 * We reproduce the exact signal headless by overriding window.screenX/screenY to
 * -32000 (a real minimize is not observable in --headless=new), then assert BOTH
 * click paths STOP with code:'BrowserTargetMinimized' BEFORE any OS click — so the
 * test itself never moves the cursor to (0,0) and never trips the failsafe. The
 * fill path is exempt (it writes via a CDP eval, no OS click) and must still work.
 *
 * Own Chrome instance + port so the screenX override never leaks into other suites.
 *
 * @see src/tools/browser.ts  browserMinimizedFailure / handleBrowserClickByAxis
 * @see src/engine/cdp-bridge.ts  isOffscreenMinimized
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { launchChrome, tryFindChrome, type ChromeInstance } from "./helpers/chrome-launcher.js";
import { sleep } from "./helpers/wait.js";
import { evaluateInTab, disconnectAll } from "../../src/engine/cdp-bridge.js";
import { browserClickElementHandler, browserFillInputHandler } from "../../src/tools/browser.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(__dirname, "fixtures", "resolver-gsc-like.html");
const TEST_PORT = 9232; // distinct from other browser suites (9224–9231)
const FIXTURE_URL = `file:///${FIXTURE_PATH.replace(/\\/g, "/")}`;
const CHROME_AVAILABLE = tryFindChrome() !== null;

let chrome: ChromeInstance;
let overrideApplied: unknown = false;

beforeAll(async () => {
  if (!CHROME_AVAILABLE) return;
  chrome = await launchChrome(TEST_PORT, true /* headless */, FIXTURE_URL);
  const deadline = Date.now() + 15_000;
  let laidOut = false;
  while (Date.now() < deadline) {
    try {
      const ready = await evaluateInTab(
        `document.readyState === 'complete' && document.querySelector('#bound-btn') !== null && ` +
        `document.querySelector('#bound-btn').getBoundingClientRect().width > 0`,
        null, TEST_PORT);
      if (ready === true) { laidOut = true; break; }
    } catch { /* ignore */ }
    await sleep(250);
  }
  if (!laidOut) throw new Error("Fixture did not lay out within 15s");

  // Reproduce the minimized signal: shadow window.screenX/screenY with the
  // Windows -32000 parking value. This is what a real minimized window reports;
  // both the by-axis gather eval and getElementScreenCoords read window.screenX,
  // so this drives both click paths through the guard. Persists on the page's
  // window object across CDP evals (no navigation in this fixture).
  overrideApplied = await evaluateInTab(
    `(function(){
       try {
         Object.defineProperty(window, 'screenX', { configurable: true, get: function(){ return -32000; } });
         Object.defineProperty(window, 'screenY', { configurable: true, get: function(){ return -32000; } });
         return window.screenX === -32000 && window.screenY === -32000;
       } catch (e) { return 'ERR:' + (e && e.message ? e.message : String(e)); }
     })()`,
    null, TEST_PORT);
}, 20_000);

afterAll(() => {
  disconnectAll(TEST_PORT);
  chrome?.kill();
});

function payload(r: { content: Array<{ type: string; text?: string }> }): Record<string, unknown> {
  const text = r.content[0]?.type === "text" ? r.content[0].text ?? "{}" : "{}";
  return JSON.parse(text) as Record<string, unknown>;
}

async function click(args: Record<string, unknown>) {
  return payload(await browserClickElementHandler({ port: TEST_PORT, ...args } as Parameters<typeof browserClickElementHandler>[0]));
}
async function fill(args: Record<string, unknown>) {
  return payload(await browserFillInputHandler({ value: "", includeContext: false, port: TEST_PORT, ...args } as Parameters<typeof browserFillInputHandler>[0]));
}

describe.skipIf(!CHROME_AVAILABLE)("browser_click — minimized-window guard (headless)", () => {
  it("the screenX/screenY override took effect (sanity)", () => {
    expect(overrideApplied, `override result: ${JSON.stringify(overrideApplied)}`).toBe(true);
  });

  it("by-axis click on a minimized window STOPS with BrowserTargetMinimized (no OS click)", async () => {
    await evaluateInTab("document.getElementById('bound-out').textContent = ''", null, TEST_PORT);
    const r = await click({ by: "text", pattern: "Bound Action" });
    expect(r.ok, JSON.stringify(r)).toBe(false);
    expect(r.code).toBe("BrowserTargetMinimized");
    expect(Array.isArray(r.suggest)).toBe(true);
    // The onclick side effect proves whether an OS click was actually delivered.
    const out = await evaluateInTab("document.getElementById('bound-out').textContent", null, TEST_PORT);
    expect(out).toBe(""); // guard fired before the click — nothing happened
  });

  it("selector click on a minimized window STOPS with BrowserTargetMinimized", async () => {
    // #real-settings is at the top of the fixture → always in-viewport, so it
    // passes the inViewport gate and reaches the minimized guard (which a
    // minimized window does NOT escape via inViewport — the layout is intact).
    const r = await click({ selector: "#real-settings" });
    expect(r.ok, JSON.stringify(r)).toBe(false);
    expect(r.code).toBe("BrowserTargetMinimized");
  });

  it("browser_fill is EXEMPT — it writes via CDP eval, so a minimized window still fills", async () => {
    await evaluateInTab("document.querySelector('#email-input').value = ''", null, TEST_PORT);
    const r = await fill({ by: "ariaLabel", pattern: "Email address", value: "minimized-ok" });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    const domVal = await evaluateInTab("document.querySelector('#email-input').value", null, TEST_PORT);
    expect(domVal).toBe("minimized-ok");
  });
});
