/**
 * tests/unit/window-cache-snapshot.test.ts
 *
 * Unit pin for the homing snapshot cache (saveSnapshot / getSnapshot) added in
 * PR #444 (issue #443). The snapshot cache preserves the screenshot-time window
 * position so mouse_click's homing delta survives focus_window / window_dock
 * mutating the main window cache between screenshot and click.
 *
 * Contract pinned here:
 *   - round-trips a saved region by case-insensitive title
 *   - decouples the stored region from the caller's input object (copy on save)
 *   - returns null for an unknown title
 *   - expires entries older than the 90s snapshot TTL
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { saveSnapshot, getSnapshot } from "../../src/engine/window-cache.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("window-cache snapshot (homing screenshot-time position)", () => {
  it("round-trips a saved region by case-insensitive title", () => {
    saveSnapshot("MyApp", { x: 10, y: 20, width: 800, height: 600 });
    expect(getSnapshot("myapp")).toEqual({ x: 10, y: 20, width: 800, height: 600 });
  });

  it("stores a copy — later mutation of the caller's object does not leak in", () => {
    const region = { x: 1, y: 2, width: 3, height: 4 };
    saveSnapshot("CopyApp", region);
    region.x = 999;
    expect(getSnapshot("CopyApp")).toEqual({ x: 1, y: 2, width: 3, height: 4 });
  });

  it("returns null for a title that was never saved", () => {
    expect(getSnapshot("never-saved-window-xyz")).toBeNull();
  });

  it("expires entries older than the 90s snapshot TTL", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    saveSnapshot("TtlApp", { x: 5, y: 5, width: 100, height: 100 });

    // 89s later — still fresh
    vi.setSystemTime(89_000);
    expect(getSnapshot("TtlApp")).not.toBeNull();

    // 91s later — expired
    vi.setSystemTime(91_000);
    expect(getSnapshot("TtlApp")).toBeNull();
  });
});
