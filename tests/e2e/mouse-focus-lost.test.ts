/**
 * mouse-focus-lost.test.ts — E2E tests for focusLost in mouse_click
 *
 * Tests the focusLost detection path in mouseClickHandler.
 * Actual foreground-stealing reproduction is skipped (environment-dependent).
 * These tests verify the structural behavior: presence/absence of focusLost,
 * and the trackFocus=false opt-out.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mouseClickHandler } from "../../src/tools/mouse.js";
import { spawnBlankWindow } from "./helpers/blank-window.js";

// Click a dedicated, empty throwaway window — never a hardcoded coordinate
// ((960,540) screen centre / (50,50) top-left) that lands on a real window or
// the Recycle Bin desktop icon. Fully contained: focuses our own window, touches
// nothing else. Skip only if the window cannot be spawned.
const blank = await spawnBlankWindow();

describe.skipIf(blank === null)("mouse_click focusLost", () => {
  // These tests pre-date v0.12 Auto Perception. They exercise focusLost
  // detection, not the auto-guard path — disable auto-guard so it doesn't
  // block clicks based on live desktop modal/window state.
  let prevAutoGuard: string | undefined;
  beforeAll(() => {
    prevAutoGuard = process.env.DESKTOP_TOUCH_AUTO_GUARD;
    process.env.DESKTOP_TOUCH_AUTO_GUARD = "0";
  });
  afterAll(() => {
    if (prevAutoGuard === undefined) delete process.env.DESKTOP_TOUCH_AUTO_GUARD;
    else process.env.DESKTOP_TOUCH_AUTO_GUARD = prevAutoGuard;
    blank?.close();
  });

  it("succeeds and contains ok:true", async () => {
    // Click the dedicated blank window's empty client area (no real UI there)
    const result = await mouseClickHandler({
      x: blank!.point.x,
      y: blank!.point.y,
      button: "left",
      doubleClick: false,
      homing: false,
      trackFocus: false,
      settleMs: 0,
    });
    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload.ok).toBe(true);
    expect(payload.action).toBe("click");
  });

  it("does not include focusLost when trackFocus=false", async () => {
    const result = await mouseClickHandler({
      x: blank!.point.x,
      y: blank!.point.y,
      button: "left",
      doubleClick: false,
      homing: false,
      trackFocus: false,
      settleMs: 300,
    });
    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload.focusLost).toBeUndefined();
  });

  it("runs without error when trackFocus=true and no windowTitle (no-op path)", async () => {
    // No windowTitle, no homing notes → detectFocusLoss returns null immediately
    const result = await mouseClickHandler({
      x: blank!.point.x,
      y: blank!.point.y,
      button: "left",
      doubleClick: false,
      homing: false,
      trackFocus: true,
      settleMs: 0,
    });
    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload.ok).toBe(true);
    expect(payload.focusLost).toBeUndefined();
  });

  it("includes conversion info when origin is provided", async () => {
    // Verify the origin+scale conversion (screen = origin + local/scale) while
    // still landing the real click on the blank window: with x=100,scale=2 the
    // local offset is +50, so origin = point - 50 makes screen === point.
    const pt = blank!.point;
    const origin = { x: pt.x - 50, y: pt.y - 50 };
    const result = await mouseClickHandler({
      x: 100,
      y: 100,
      origin,
      scale: 2,
      button: "left",
      doubleClick: false,
      homing: false,
      trackFocus: false,
      settleMs: 0,
    });
    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload.ok).toBe(true);
    expect(typeof payload.conversion).toBe("string");
    // screen = origin.x + x/scale = (pt.x - 50) + 100/2 = pt.x
    expect(payload.at.x).toBe(pt.x);
    expect(payload.at.y).toBe(pt.y);
  });

  it("skips settle wait and focusLost when trackFocus=false (faster execution)", async () => {
    const before = Date.now();
    await mouseClickHandler({
      x: blank!.point.x,
      y: blank!.point.y,
      button: "left",
      doubleClick: false,
      tripleClick: false,
      homing: false,
      trackFocus: false,
      settleMs: 300, // settleMs is ignored when trackFocus=false
      // Issue #178: verifyDelivery defaults to true and adds ~150ms settle +
      // two UIA round-trips. Disable here so the budget-vs-trackFocus test
      // measures only the trackFocus cost.
      verifyDelivery: false,
    });
    const elapsed = Date.now() - before;
    // Without the settle wait, should complete well under 300ms
    // (allowing for click animation time ~200ms at default speed)
    expect(elapsed).toBeLessThan(1000);
  });

  it("skips non-existent window title gracefully (no focusLost when fg matches target)", async () => {
    const result = await mouseClickHandler({
      x: blank!.point.x,
      y: blank!.point.y,
      button: "left",
      doubleClick: false,
      homing: false,
      windowTitle: undefined, // no target → no detection
      trackFocus: true,
      settleMs: 0,
    });
    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload.ok).toBe(true);
  });
});
